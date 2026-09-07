import { z } from "zod";
import type { Db } from "./db.js";
import type { CalendarClient, EventoCalendar, GmailClient, SheetsClient } from "./googleClients.js";
import * as outbox from "./dominio/outbox.js";
import type { EventoOutbox } from "./dominio/outbox.js";
import * as citas from "./dominio/citas.js";
import * as recursos from "./dominio/recursos.js";

export interface ClientesGoogle {
  gmail: GmailClient;
  calendar: CalendarClient;
  sheets?: SheetsClient | undefined;
  sheetsSpreadsheetId?: string | undefined;
}

const PayloadCorreoSchema = z.object({
  destinatario: z.string(),
  asunto: z.string(),
  texto: z.string(),
});

const PayloadCalendarSchema = z.object({
  reserva_id: z.number(),
  accion: z.enum(["upsert", "eliminar"]),
});

const PayloadSheetsSchema = z.object({
  fecha: z.string(),
  paciente: z.string(),
  servicio: z.string(),
  sede: z.string(),
  estado: z.string(),
});

async function procesarGmail(gmail: GmailClient, evento: EventoOutbox): Promise<void> {
  const payload = PayloadCorreoSchema.parse(evento.payload);
  await gmail.enviarCorreo(payload);
}

/**
 * `accion: "eliminar"` cubre cancelaciones/expiraciones: si nunca hubo un
 * evento sincronizado (sede sin `google_calendar_id` en ese momento, por
 * ejemplo) no hay nada que borrar y se considera éxito igual.
 *
 * `accion: "upsert"` sin `google_calendar_id` en la sede tampoco es un
 * error: simplemente esa sede todavía no tiene Calendar provisionado.
 */
async function procesarCalendar(
  db: Db,
  calendar: CalendarClient,
  evento: EventoOutbox,
  zonaHoraria: string,
): Promise<void> {
  const payload = PayloadCalendarSchema.parse(evento.payload);

  if (payload.accion === "eliminar") {
    const eventoIdExistente = await recursos.buscarEventoCalendarNegocio(db, payload.reserva_id);
    if (!eventoIdExistente) return;
    const cita = await citas.obtenerCita(db, payload.reserva_id);
    if (cita?.googleCalendarId) {
      await calendar.eliminarEvento(cita.googleCalendarId, eventoIdExistente);
    }
    await recursos.eliminarEventoCalendarNegocio(db, payload.reserva_id);
    return;
  }

  const cita = await citas.obtenerCita(db, payload.reserva_id);
  if (!cita) {
    throw new Error(`No se encontró la reserva ${String(payload.reserva_id)} para sincronizar con Calendar.`);
  }
  if (!cita.googleCalendarId) return;

  const eventoCalendar: EventoCalendar = {
    resumen: `${cita.servicioNombre ?? "Cita"} — ${cita.pacienteNombre ?? "paciente"}`,
    descripcion: `Sede: ${cita.sedeNombre}\nEstado: ${cita.estado}`,
    inicioIso: cita.iniciaEn,
    finIso: cita.terminaEn,
    zonaHoraria,
  };

  const eventoIdExistente = await recursos.buscarEventoCalendarNegocio(db, payload.reserva_id);
  if (eventoIdExistente) {
    await calendar.actualizarEvento(cita.googleCalendarId, eventoIdExistente, eventoCalendar);
    return;
  }
  const creado = await calendar.crearEvento(cita.googleCalendarId, eventoCalendar);
  await recursos.guardarEventoCalendarNegocio(db, payload.reserva_id, {
    eventoId: creado.id,
    calendarId: cita.googleCalendarId,
  });
}

const HOJA_RESERVAS = "Reservas";

/**
 * Sin GOOGLE_SHEETS_SPREADSHEET_ID configurado, estos eventos se reintentan
 * hasta agotar sus intentos y quedar `fallido` — no bloquean Gmail/Calendar.
 *
 * Una reserva tiene UNA fila que se sobreescribe en cada cambio de estado
 * (confirmada, cancelada, atendida...), en vez de acumular una fila por
 * evento: `integracion.google_recurso` recuerda en qué fila quedó cada
 * reserva la primera vez que se escribió.
 */
async function procesarSheets(db: Db, clientes: ClientesGoogle, evento: EventoOutbox): Promise<void> {
  if (!clientes.sheets || !clientes.sheetsSpreadsheetId) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID no está configurado: no se puede respaldar en Sheets.");
  }
  const payload = PayloadSheetsSchema.parse(evento.payload);
  const valores: (string | number)[] = [payload.fecha, payload.paciente, payload.servicio, payload.sede, payload.estado];

  const existente = await recursos.buscarFilaSheetReserva(db, evento.agregadoId);
  if (existente) {
    await clientes.sheets.actualizarFila(clientes.sheetsSpreadsheetId, existente.hoja, existente.fila, valores);
    return;
  }
  const { fila } = await clientes.sheets.agregarFila(clientes.sheetsSpreadsheetId, HOJA_RESERVAS, valores);
  await recursos.guardarFilaSheetReserva(db, evento.agregadoId, { hoja: HOJA_RESERVAS, fila });
}

async function procesarUnEvento(
  db: Db,
  clientes: ClientesGoogle,
  evento: EventoOutbox,
  zonaHoraria: string,
): Promise<void> {
  // `destino` es una columna de texto libre en la base, no una unión
  // cerrada de literales: if/else en vez de switch para no fingir
  // exhaustividad sobre valores que en realidad vienen del outbox en runtime.
  if (evento.destino === "gmail") {
    await procesarGmail(clientes.gmail, evento);
  } else if (evento.destino === "calendar") {
    await procesarCalendar(db, clientes.calendar, evento, zonaHoraria);
  } else if (evento.destino === "sheets") {
    await procesarSheets(db, clientes, evento);
  } else {
    throw new Error(
      `Este consumidor no maneja destino="${evento.destino ?? "null"}" (tipo_evento="${evento.tipoEvento}").`,
    );
  }
}

export interface ResultadoLote {
  tomados: number;
  procesados: number;
  fallidos: number;
}

/** Un ciclo: toma hasta `limite` eventos pendientes y los procesa uno por uno. */
export async function procesarPendientes(
  db: Db,
  clientes: ClientesGoogle,
  limite: number,
  zonaHoraria: string,
): Promise<ResultadoLote> {
  const eventos = await outbox.tomarPendientes(db, limite);
  let procesados = 0;
  let fallidos = 0;

  for (const evento of eventos) {
    try {
      await procesarUnEvento(db, clientes, evento, zonaHoraria);
      await outbox.marcarCompletado(db, evento.id);
      procesados += 1;
    } catch (err) {
      await outbox.marcarFallido(db, evento, err instanceof Error ? err.message : String(err));
      fallidos += 1;
    }
  }

  return { tomados: eventos.length, procesados, fallidos };
}
