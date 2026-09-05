import { describe, it, expect, vi } from "vitest";
import { crearDbFalsa } from "./fakeDb.js";
import { procesarPendientes } from "../src/consumer.js";
import type { CalendarClient, GmailClient } from "../src/googleClients.js";

function clientesFalsos(overrides: Partial<{ gmail: Partial<GmailClient>; calendar: Partial<CalendarClient> }> = {}) {
  const gmail: GmailClient = {
    enviarCorreo: vi.fn().mockResolvedValue(undefined),
    ...overrides.gmail,
  };
  const calendar: CalendarClient = {
    crearEvento: vi.fn().mockResolvedValue({ id: "evt-nuevo" }),
    actualizarEvento: vi.fn().mockResolvedValue(undefined),
    eliminarEvento: vi.fn().mockResolvedValue(undefined),
    ...overrides.calendar,
  };
  return { gmail, calendar };
}

function filaOutbox(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 1,
    agregado_tipo: "reserva",
    agregado_id: 5,
    tipo_evento: "reserva.creada",
    destino: "calendar",
    payload: { reserva_id: 5, accion: "upsert" },
    intentos: 1,
    max_intentos: 5,
    ...overrides,
  };
}

const CITA_TUNJA = {
  reserva_id: 5,
  estado: "confirmada",
  inicia_en: "2026-09-05T15:00:00-05:00",
  termina_en: "2026-09-05T15:40:00-05:00",
  sede_nombre: "Tunja",
  google_calendar_id: "cal@tunja",
  servicio_nombre: "Punción Seca",
  paciente_nombre: "Laura Gómez",
};

describe("consumer/procesarPendientes", () => {
  it("gmail: envía el correo y marca completado", async () => {
    const { db, llamadas } = crearDbFalsa([
      [filaOutbox({ destino: "gmail", tipo_evento: "correo.enviar", payload: { destinatario: "a@b.com", asunto: "Hola", texto: "Mensaje" } })],
      [], // marcarCompletado
    ]);
    const clientes = clientesFalsos();
    const r = await procesarPendientes(db, clientes, 20, "America/Bogota");
    expect(r).toEqual({ tomados: 1, procesados: 1, fallidos: 0 });
    expect(clientes.gmail.enviarCorreo).toHaveBeenCalledWith({ destinatario: "a@b.com", asunto: "Hola", texto: "Mensaje" });
    expect(llamadas[1]?.texto).toContain("'completado'");
  });

  it("calendar upsert: sin mapeo previo, crea el evento y guarda el recurso", async () => {
    const { db } = crearDbFalsa([
      [filaOutbox({})], // tomarPendientes
      [CITA_TUNJA], // obtenerCita
      [], // buscarEventoCalendarNegocio -> sin mapeo
      [], // guardarEventoCalendarNegocio
      [], // marcarCompletado
    ]);
    const clientes = clientesFalsos();
    const r = await procesarPendientes(db, clientes, 20, "America/Bogota");
    expect(r).toEqual({ tomados: 1, procesados: 1, fallidos: 0 });
    expect(clientes.calendar.crearEvento).toHaveBeenCalledWith(
      "cal@tunja",
      expect.objectContaining({ resumen: "Punción Seca — Laura Gómez" }),
    );
    expect(clientes.calendar.actualizarEvento).not.toHaveBeenCalled();
  });

  it("calendar upsert: con mapeo previo, actualiza en vez de crear", async () => {
    const { db } = crearDbFalsa([
      [filaOutbox({})],
      [CITA_TUNJA],
      [{ recurso_id: "evt-viejo" }], // buscarEventoCalendarNegocio -> ya existía
      [], // marcarCompletado
    ]);
    const clientes = clientesFalsos();
    const r = await procesarPendientes(db, clientes, 20, "America/Bogota");
    expect(r).toEqual({ tomados: 1, procesados: 1, fallidos: 0 });
    expect(clientes.calendar.actualizarEvento).toHaveBeenCalledWith("cal@tunja", "evt-viejo", expect.any(Object));
    expect(clientes.calendar.crearEvento).not.toHaveBeenCalled();
  });

  it("calendar upsert: sede sin google_calendar_id no es un error, solo no hace nada", async () => {
    const { db } = crearDbFalsa([
      [filaOutbox({})],
      [{ ...CITA_TUNJA, google_calendar_id: null }],
      [], // marcarCompletado
    ]);
    const clientes = clientesFalsos();
    const r = await procesarPendientes(db, clientes, 20, "America/Bogota");
    expect(r).toEqual({ tomados: 1, procesados: 1, fallidos: 0 });
    expect(clientes.calendar.crearEvento).not.toHaveBeenCalled();
  });

  it("calendar eliminar: con mapeo existente, borra el evento y el recurso", async () => {
    const { db } = crearDbFalsa([
      [filaOutbox({ payload: { reserva_id: 5, accion: "eliminar" } })],
      [{ recurso_id: "evt-viejo" }], // buscarEventoCalendarNegocio
      [CITA_TUNJA], // obtenerCita (para saber en qué calendario borrar)
      [], // eliminarEventoCalendarNegocio
      [], // marcarCompletado
    ]);
    const clientes = clientesFalsos();
    const r = await procesarPendientes(db, clientes, 20, "America/Bogota");
    expect(r).toEqual({ tomados: 1, procesados: 1, fallidos: 0 });
    expect(clientes.calendar.eliminarEvento).toHaveBeenCalledWith("cal@tunja", "evt-viejo");
  });

  it("calendar eliminar: sin mapeo previo, no hace nada y marca completado", async () => {
    const { db } = crearDbFalsa([
      [filaOutbox({ payload: { reserva_id: 5, accion: "eliminar" } })],
      [], // buscarEventoCalendarNegocio -> nada que borrar
      [], // marcarCompletado
    ]);
    const clientes = clientesFalsos();
    const r = await procesarPendientes(db, clientes, 20, "America/Bogota");
    expect(r).toEqual({ tomados: 1, procesados: 1, fallidos: 0 });
    expect(clientes.calendar.eliminarEvento).not.toHaveBeenCalled();
  });

  it("destino no soportado (drive): marca fallido en vez de quedar atascado", async () => {
    const { db, llamadas } = crearDbFalsa([
      [filaOutbox({ destino: "drive", tipo_evento: "drive.crear_carpeta", payload: { carpeta: "x" } })],
      [], // marcarFallido
    ]);
    const clientes = clientesFalsos();
    const r = await procesarPendientes(db, clientes, 20, "America/Bogota");
    expect(r).toEqual({ tomados: 1, procesados: 0, fallidos: 1 });
    expect(llamadas[1]?.valores[1]).toBe("fallido");
  });

  it("payload inválido para gmail: marca fallido sin llegar a enviar", async () => {
    const { db, llamadas } = crearDbFalsa([
      [filaOutbox({ destino: "gmail", payload: { asunto: "sin destinatario" } })],
      [], // marcarFallido
    ]);
    const clientes = clientesFalsos();
    const r = await procesarPendientes(db, clientes, 20, "America/Bogota");
    expect(r).toEqual({ tomados: 1, procesados: 0, fallidos: 1 });
    expect(clientes.gmail.enviarCorreo).not.toHaveBeenCalled();
    expect(llamadas[1]?.valores[1]).toBe("fallido");
  });

  it("sin eventos pendientes, no hace nada", async () => {
    const { db } = crearDbFalsa([[]]);
    const clientes = clientesFalsos();
    const r = await procesarPendientes(db, clientes, 20, "America/Bogota");
    expect(r).toEqual({ tomados: 0, procesados: 0, fallidos: 0 });
  });
});
