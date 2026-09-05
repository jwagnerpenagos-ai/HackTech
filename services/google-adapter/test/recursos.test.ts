import { describe, it, expect } from "vitest";
import { crearDbFalsa } from "./fakeDb.js";
import {
  buscarEventoCalendarNegocio,
  guardarEventoCalendarNegocio,
  eliminarEventoCalendarNegocio,
} from "../src/dominio/recursos.js";

describe("dominio/recursos", () => {
  it("buscarEventoCalendarNegocio devuelve el recurso_id si existe", async () => {
    const { db, llamadas } = crearDbFalsa([[{ recurso_id: "evt123" }]]);
    const r = await buscarEventoCalendarNegocio(db, 5);
    expect(r).toBe("evt123");
    expect(llamadas[0]?.valores).toEqual(["reserva", 5]);
  });

  it("buscarEventoCalendarNegocio devuelve null si no hay mapeo", async () => {
    const { db } = crearDbFalsa([[]]);
    const r = await buscarEventoCalendarNegocio(db, 5);
    expect(r).toBeNull();
  });

  it("guardarEventoCalendarNegocio hace upsert con ON CONFLICT", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    await guardarEventoCalendarNegocio(db, 5, { eventoId: "evt123", calendarId: "cal@x" });
    expect(llamadas[0]?.texto).toContain("ON CONFLICT");
    expect(llamadas[0]?.valores).toEqual(["reserva", 5, "cal@x", "evt123"]);
  });

  it("eliminarEventoCalendarNegocio borra el mapeo", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    await eliminarEventoCalendarNegocio(db, 5);
    expect(llamadas[0]?.valores).toEqual(["reserva", 5]);
  });
});
