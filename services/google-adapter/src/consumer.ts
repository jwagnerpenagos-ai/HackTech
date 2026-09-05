import { z } from "zod";
import type { Db } from "./db.js";
import type { CalendarClient, EventoCalendar, GmailClient } from "./googleClients.js";
import * as outbox from "./dominio/outbox.js";
import type { EventoOutbox } from "./dominio/outbox.js";
import * as citas from "./dominio/citas.js";
import * as recursos from "./dominio/recursos.js";

export interface ClientesGoogle {
  gmail: GmailClient;
  calendar: CalendarClient;
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
