import { describe, it, expect } from "vitest";
import { crearDbFalsa } from "./fakeDb.js";
import { tomarPendientes, marcarCompletado, marcarFallido } from "../src/dominio/outbox.js";

describe("dominio/outbox", () => {
  it("tomarPendientes llama a integracion.tomar_pendientes con el límite dado", async () => {
    const { db, llamadas } = crearDbFalsa([
      [
        {
          id: 1,
          agregado_tipo: "reserva",
          agregado_id: 5,
          tipo_evento: "reserva.creada",
          destino: "calendar",
          payload: { reserva_id: 5, accion: "upsert" },
          intentos: 1,
          max_intentos: 5,
        },
      ],
    ]);
    const eventos = await tomarPendientes(db, 20);
    expect(eventos).toEqual([
      {
        id: 1,
        agregadoTipo: "reserva",
        agregadoId: 5,
        tipoEvento: "reserva.creada",
        destino: "calendar",
        payload: { reserva_id: 5, accion: "upsert" },
        intentos: 1,
        maxIntentos: 5,
      },
    ]);
    expect(llamadas[0]?.texto).toContain("integracion.tomar_pendientes");
    expect(llamadas[0]?.valores).toEqual([20]);
  });

  it("marcarCompletado actualiza estado y procesado_en", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    await marcarCompletado(db, 1);
    expect(llamadas[0]?.texto).toContain("'completado'");
    expect(llamadas[0]?.valores).toEqual([1]);
  });

  it("marcarFallido reintenta si no agotó los intentos", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    await marcarFallido(db, { id: 3, intentos: 2, maxIntentos: 5 }, "boom");
    expect(llamadas[0]?.valores).toEqual([3, "fallido", "boom", 60]);
  });

  it("marcarFallido descarta si ya agotó los intentos", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    await marcarFallido(db, { id: 3, intentos: 5, maxIntentos: 5 }, "boom");
    expect(llamadas[0]?.valores).toEqual([3, "descartado", "boom", 150]);
  });
});
