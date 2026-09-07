import { describe, it, expect } from "vitest";
import { crearDbFalsa } from "./fakeDb.js";
import { listarCitasPorAsistir, registrarAsistencia } from "../src/dominio/asistencia.js";

describe("listarCitasPorAsistir", () => {
  it("mapea las filas al shape del bot", async () => {
    const { db } = crearDbFalsa([
      [
        {
          reserva_id: 20,
          inicia_en: "2026-11-20T20:00:00.000Z",
          servicio: "Valoración inicial",
          sede: "Sede Tunja",
          paciente: "Ana Ríos",
        },
      ],
    ]);
    const r = await listarCitasPorAsistir(db);
    expect(r).toEqual([
      {
        reservaId: 20,
        iniciaEn: "2026-11-20T20:00:00.000Z",
        servicio: "Valoración inicial",
        sede: "Sede Tunja",
        paciente: "Ana Ríos",
      },
    ]);
  });
});

describe("registrarAsistencia", () => {
  it("marca la cita como atendida y el participante como asistió", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 20 }], // UPDATE reserva ... RETURNING id
      [], // UPDATE reserva_participante
      [{ paciente: "Ana Ríos", servicio: "Valoración inicial", sede: "Sede Tunja", inicia_en: "2026-11-20T20:00:00.000Z" }], // SELECT para sincronizarEstadoReservaEnSheet
      [], // INSERT integracion.outbox
      [{ estado: "atendida", servicio: "Valoración inicial", inicia_en: "2026-11-20T20:00:00.000Z", chat_id: "500" }],
    ]);
    const r = await registrarAsistencia(db, { reservaId: 20, asistio: true, por: "111" });
    expect(r).toMatchObject({ reservaId: 20, estado: "atendida", chatId: "500" });
    expect(llamadas[0]?.valores).toEqual([20, "atendida"]);
    expect(llamadas[1]?.valores).toEqual([20, "asistio"]);
  });

  it("una cita sin confirmar (o ya cerrada) no se toca y da 404", async () => {
    const { db } = crearDbFalsa([
      [], // UPDATE reserva no afecta filas
    ]);
    await expect(registrarAsistencia(db, { reservaId: 99, asistio: true })).rejects.toMatchObject({
      codigo: "no_encontrado",
      status: 404,
    });
  });

  it("asistio=false marca no_asistio", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 20 }],
      [],
      [{ paciente: "Ana Ríos", servicio: "Valoración inicial", sede: "Sede Tunja", inicia_en: "2026-11-20T20:00:00.000Z" }],
      [],
      [{ estado: "no_asistio", servicio: "Valoración inicial", inicia_en: "2026-11-20T20:00:00.000Z", chat_id: null }],
    ]);
    const r = await registrarAsistencia(db, { reservaId: 20, asistio: false });
    expect(r.estado).toBe("no_asistio");
    expect(llamadas[0]?.valores).toEqual([20, "no_asistio"]);
    expect(llamadas[1]?.valores).toEqual([20, "no_asistio"]);
  });
});
