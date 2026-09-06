import { describe, it, expect } from "vitest";
import { formatearResultado } from "../src/resultados.js";
import type { ResultadoEjecucion } from "../src/n8nClient.js";

describe("formatearResultado", () => {
  it("crear_sesion exitoso incluye el número de reserva", () => {
    const r: ResultadoEjecucion = { tipo: "ok", datos: { reservaId: 77 } };
    expect(formatearResultado("crear_sesion", r)).toContain("77");
  });

  it("consultar_agenda con citas las lista", () => {
    const r: ResultadoEjecucion = {
      tipo: "ok",
      datos: {
        citas: [
          {
            reservaId: 1,
            iniciaEn: "2026-09-05T15:00:00-05:00",
            sede: "Tunja",
            servicio: "Punción Seca",
            paciente: "Laura Gómez",
            estado: "confirmada",
          },
        ],
      },
    };
    const texto = formatearResultado("consultar_agenda", r);
    expect(texto).toContain("Laura Gómez");
    expect(texto).toContain("05/09 15:00");
  });

  it("consultar_agenda sin citas avisa que no hay nada", () => {
    const r: ResultadoEjecucion = { tipo: "ok", datos: { citas: [] } };
    expect(formatearResultado("consultar_agenda", r)).toBe("No tiene citas programadas.");
  });

  it("buscar_cliente sin candidatos avisa que no encontró a nadie", () => {
    const r: ResultadoEjecucion = { tipo: "ok", datos: { candidatos: [] } };
    expect(formatearResultado("buscar_cliente", r)).toBe("No encontré ningún paciente con ese nombre.");
  });

  it("error de negocio muestra el mensaje tal cual", () => {
    const r: ResultadoEjecucion = {
      tipo: "error_negocio",
      codigo: "no_encontrado",
      mensaje: "No se encontró esa sede.",
    };
    expect(formatearResultado("bloquear_horario", r)).toBe("No se encontró esa sede.");
  });

  it("cliente ambiguo lista los candidatos junto con el mensaje", () => {
    const r: ResultadoEjecucion = {
      tipo: "error_negocio",
      codigo: "cliente_ambiguo",
      mensaje: "Hay más de un paciente con ese nombre.",
      datos: { candidatos: [{ nombreCompleto: "Laura Gómez" }, { nombreCompleto: "Laura Pérez" }] },
    };
    const texto = formatearResultado("crear_sesion", r);
    expect(texto).toContain("Laura Gómez");
    expect(texto).toContain("Laura Pérez");
  });

  it("error de transporte da un mensaje genérico, sin filtrar detalles técnicos", () => {
    const r: ResultadoEjecucion = { tipo: "error_transporte", motivo: "timeout" };
    expect(formatearResultado("crear_sesion", r)).toContain("No pude completar la acción");
  });
});
