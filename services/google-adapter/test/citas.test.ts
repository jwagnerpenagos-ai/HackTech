import { describe, it, expect } from "vitest";
import { crearDbFalsa } from "./fakeDb.js";
import { obtenerCita } from "../src/dominio/citas.js";

describe("dominio/citas", () => {
  it("obtenerCita mapea la fila de agenda.v_cita", async () => {
    const { db, llamadas } = crearDbFalsa([
      [
        {
          reserva_id: 5,
          estado: "confirmada",
          inicia_en: "2026-09-05T15:00:00-05:00",
          termina_en: "2026-09-05T15:40:00-05:00",
          sede_nombre: "Tunja",
          google_calendar_id: "cal@tunja",
          servicio_nombre: "Punción Seca",
          paciente_nombre: "Laura Gómez",
        },
      ],
    ]);
    const r = await obtenerCita(db, 5);
    expect(r).toEqual({
      reservaId: 5,
      estado: "confirmada",
      iniciaEn: "2026-09-05T15:00:00-05:00",
      terminaEn: "2026-09-05T15:40:00-05:00",
      sedeNombre: "Tunja",
      googleCalendarId: "cal@tunja",
      servicioNombre: "Punción Seca",
      pacienteNombre: "Laura Gómez",
    });
    expect(llamadas[0]?.valores).toEqual([5]);
  });

  it("obtenerCita devuelve null si la reserva no existe", async () => {
    const { db } = crearDbFalsa([[]]);
    const r = await obtenerCita(db, 999);
    expect(r).toBeNull();
  });
});
