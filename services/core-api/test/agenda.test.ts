import { describe, it, expect } from "vitest";
import { crearDbFalsa, crearDbFalsaConError } from "./fakeDb.js";
import * as agenda from "../src/dominio/agenda.js";
import { ErrorDominio } from "../src/errores.js";

describe("dominio/agenda", () => {
  it("consultarAgenda sin pacienteId filtra solo por rango y sede", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    await agenda.consultarAgenda(db, { desdeIso: "2026-09-05T00:00:00-05:00", hastaIso: "2026-09-06T00:00:00-05:00" });
    expect(llamadas[0]?.valores).toEqual([
      "2026-09-05T00:00:00-05:00",
      "2026-09-06T00:00:00-05:00",
      null,
      null,
    ]);
  });

  it("consultarAgenda con pacienteId lo pasa como cuarto parámetro", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    await agenda.consultarAgenda(db, {
      desdeIso: "2026-09-05T00:00:00-05:00",
      hastaIso: "2026-09-06T00:00:00-05:00",
      pacienteId: 5,
    });
    expect(llamadas[0]?.valores).toEqual([
      "2026-09-05T00:00:00-05:00",
      "2026-09-06T00:00:00-05:00",
      null,
      5,
    ]);
  });

  it("consultarDisponibilidad llama a agenda.slots_disponibles con los parámetros dados", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ slot_inicio: "2026-09-05T15:00:00-05:00", slot_fin: "2026-09-05T15:40:00-05:00" }],
    ]);

    const slots = await agenda.consultarDisponibilidad(db, { servicioId: 3, sedeId: 1, fecha: "2026-09-05" });

    expect(slots).toEqual([{ inicio: "2026-09-05T15:00:00-05:00", fin: "2026-09-05T15:40:00-05:00" }]);
    expect(llamadas[0]?.texto).toContain("agenda.slots_disponibles");
    expect(llamadas[0]?.valores).toEqual([3, 1, "2026-09-05", null]);
  });

  it("consultarDisponibilidad traduce un error de Postgres a ErrorDominio", async () => {
    const { db } = crearDbFalsaConError([], 0, { code: "P0002", message: "El servicio 3 no existe." });
    await expect(agenda.consultarDisponibilidad(db, { servicioId: 3, sedeId: 1, fecha: "2026-09-05" })).rejects.toMatchObject(
      { codigo: "no_encontrado", status: 404 },
    );
  });

  it("crearSesion devuelve el id que retorna agenda.crear_reserva", async () => {
    const { db, llamadas } = crearDbFalsa([[{ crear_reserva: 77 }]]);

    const resultado = await agenda.crearSesion(db, {
      pacienteId: 5,
      servicioId: 3,
      sedeId: 1,
      iniciaEnIso: "2026-09-05T15:00:00-05:00",
      creadoPor: "bot-telegram",
    });

    expect(resultado).toEqual({ reservaId: 77 });
    expect(llamadas[0]?.texto).toContain("agenda.crear_reserva");
  });

  it("crearSesion propaga el conflicto de doble reserva como 409", async () => {
    const { db } = crearDbFalsaConError([], 0, {
      code: "23505",
      message: "El horario ya fue tomado. Consulte nuevamente la disponibilidad.",
    });

    await expect(
      agenda.crearSesion(db, {
        pacienteId: 5,
        servicioId: 3,
        sedeId: 1,
        iniciaEnIso: "2026-09-05T15:00:00-05:00",
      }),
    ).rejects.toMatchObject({ codigo: "conflicto", status: 409 });
  });

  it("cancelarSesion devuelve el nuevo estado", async () => {
    const { db } = crearDbFalsa([[{ estado: "cancelada_a_tiempo" }]]);
    const resultado = await agenda.cancelarSesion(db, { reservaId: 9, motivo: "Ya no puede asistir" });
    expect(resultado).toEqual({ estado: "cancelada_a_tiempo" });
  });

  it("modificarSesion sin compra: cancela y crea una nueva en una transacción", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ paciente_id: 5, servicio_id: 3, sede_id: 1, estado: "pendiente_pago", compra_id: null }],
      [{ estado: "cancelada_a_tiempo" }], // cancelar_reserva
      [{ crear_reserva: 88 }], // crear_reserva
    ]);
    const r = await agenda.modificarSesion(db, {
      reservaId: 9,
      nuevaIniciaEnIso: "2026-09-06T10:00:00-05:00",
      motivo: "x",
    });
    expect(r).toEqual({ reservaId: 88, estado: "pendiente_pago", compraId: null, montoTotal: null });
    expect(llamadas).toHaveLength(3);
  });

  it("modificarSesion de una cita PAGADA: mueve la compra y la nueva nace confirmada", async () => {
    const { db } = crearDbFalsa([
      [{ paciente_id: 5, servicio_id: 3, sede_id: 1, estado: "confirmada", compra_id: 20 }],
      [{ estado: "cancelada_a_tiempo" }], // cancelar_reserva
      [{ crear_reserva: 88 }], // crear_reserva
      [], // UPDATE participante viejo -> compra_id NULL
      [], // UPDATE participante nuevo -> compra_id 20
      [], // UPDATE reserva nueva -> confirmada
      [{ valor_total: "150000.00" }], // SELECT valor_total
    ]);
    const r = await agenda.modificarSesion(db, {
      reservaId: 9,
      nuevaIniciaEnIso: "2026-09-06T10:00:00-05:00",
      motivo: "x",
    });
    expect(r).toEqual({ reservaId: 88, estado: "confirmada", compraId: 20, montoTotal: 150000 });
  });

  it("modificarSesion lanza no_encontrado si la reserva no existe", async () => {
    const { db } = crearDbFalsa([[]]);
    await expect(
      agenda.modificarSesion(db, { reservaId: 999, nuevaIniciaEnIso: "2026-09-06T10:00:00-05:00", motivo: "x" }),
    ).rejects.toMatchObject({ codigo: "no_encontrado", status: 404 });
  });

  it("bloquearHorario inserta una reserva tipo bloqueo usando el profesional dado", async () => {
    const { db, llamadas } = crearDbFalsa([[{ id: 55 }]]);
    const resultado = await agenda.bloquearHorario(db, {
      sedeId: 1,
      profesionalId: 2,
      iniciaEnIso: "2026-12-24T00:00:00-05:00",
      duracionMinutos: 1440,
      motivo: "Festivo",
    });
    expect(resultado).toEqual({ reservaId: 55 });
    expect(llamadas[0]?.texto).toContain("'bloqueo'");
  });

  it("bloquearHorario falla si no hay profesional activo ni se especifica uno", async () => {
    const { db } = crearDbFalsa([[]]); // profesionalPorDefecto no encuentra ninguno
    await expect(
      agenda.bloquearHorario(db, {
        sedeId: 1,
        iniciaEnIso: "2026-12-24T00:00:00-05:00",
        duracionMinutos: 60,
        motivo: "Festivo",
      }),
    ).rejects.toBeInstanceOf(ErrorDominio);
  });
});
