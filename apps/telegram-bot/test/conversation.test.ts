import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";
import {
  estadoInicial,
  procesarTexto,
  resolverConfirmacion,
  resolverOfertaCalendar,
} from "../src/conversation.js";
import type { ResultadoNlu } from "../src/nluClient.js";

const cfg = loadConfig();

function nluFijo(r: ResultadoNlu): () => Promise<ResultadoNlu> {
  return () => Promise.resolve(r);
}

const ok = (
  intencion: string,
  extra: Partial<{
    entidades: Record<string, unknown>;
    confianza: number;
    faltantes: string[];
    respuesta: string | null;
  }> = {},
): ResultadoNlu => ({
  ok: true,
  intencion: {
    intencion: intencion as never,
    entidades: extra.entidades ?? {},
    confianza: extra.confianza ?? 0.9,
    faltantes: (extra.faltantes ?? []) as never,
    ...(extra.respuesta !== undefined ? { respuesta: extra.respuesta } : {}),
  },
});

describe("procesarTexto", () => {
  it("intención no sensible y completa -> ejecutar", async () => {
    const r = await procesarTexto(
      cfg,
      estadoInicial(),
      "que tengo hoy",
      nluFijo(ok("consultar_agenda", { entidades: { fecha: "2026-09-01" } })),
    );
    expect(r.accion.tipo).toBe("ejecutar");
  });

  it("faltan datos -> pedir_dato y guardar estado", async () => {
    const r = await procesarTexto(
      cfg,
      estadoInicial(),
      "agenda a Laura",
      nluFijo(ok("crear_sesion", { entidades: { cliente: "Laura" }, faltantes: ["servicio", "fecha", "hora"] })),
    );
    expect(r.accion.tipo).toBe("pedir_dato");
    expect(r.estado.intencion).toBe("crear_sesion");
    expect(r.estado.faltantes).toEqual(["servicio", "fecha", "hora"]);
  });

  it("el siguiente mensaje rellena el primer faltante", async () => {
    const previo = {
      intencion: "crear_sesion",
      entidades: { cliente: "Laura" },
      faltantes: ["servicio", "fecha"],
      esperandoConfirmacion: false,
      ofertaCalendarPendiente: null,
    };
    const r = await procesarTexto(cfg, previo, "rehabilitación", nluFijo(ok("desconocida")));
    expect(r.estado.entidades["servicio"]).toBe("rehabilitación");
    expect(r.estado.faltantes).toEqual(["fecha"]);
    expect(r.accion.tipo).toBe("pedir_dato");
  });

  it("intención sensible y completa -> pedir_confirmacion", async () => {
    const r = await procesarTexto(
      cfg,
      estadoInicial(),
      "cancela la cita 5",
      nluFijo(ok("cancelar_sesion", { entidades: { sesion_id: 5 } })),
    );
    expect(r.accion.tipo).toBe("pedir_confirmacion");
    expect(r.estado.esperandoConfirmacion).toBe(true);
  });

  it("confianza baja -> no actúa, repregunta", async () => {
    const r = await procesarTexto(
      cfg,
      estadoInicial(),
      "mmm no sé",
      nluFijo(ok("crear_sesion", { confianza: 0.2 })),
    );
    expect(r.accion.tipo).toBe("responder");
    expect(r.estado).toEqual(estadoInicial());
  });

  it("NLU caído -> respuesta estructurada, sin romperse", async () => {
    const r = await procesarTexto(
      cfg,
      estadoInicial(),
      "lo que sea",
      nluFijo({ ok: false, motivo: "timeout" }),
    );
    expect(r.accion.tipo).toBe("responder");
    expect(r.accion.texto).toContain("/help");
  });

  it("intención 'desconocida' -> respuesta neutra", async () => {
    const r = await procesarTexto(cfg, estadoInicial(), "hola bot", nluFijo(ok("desconocida")));
    expect(r.accion.tipo).toBe("responder");
  });

  it("'charla_general' responde con lo que armó el NLU, sin pasar por n8n", async () => {
    const r = await procesarTexto(
      cfg,
      estadoInicial(),
      "hola",
      nluFijo(ok("charla_general", { respuesta: "¡Hola! Soy el asistente de La Fisioterapeuta Li." })),
    );
    expect(r.accion.tipo).toBe("responder");
    expect(r.accion.texto).toBe("¡Hola! Soy el asistente de La Fisioterapeuta Li.");
    expect(r.estado).toEqual(estadoInicial());
  });

  it("'charla_general' sin 'respuesta' del modelo cae a un saludo genérico", async () => {
    const r = await procesarTexto(cfg, estadoInicial(), "hola", nluFijo(ok("charla_general")));
    expect(r.accion.tipo).toBe("responder");
    expect(r.accion.texto).toContain("¿En qué te puedo ayudar?");
  });

  it("'charla_general' no requiere autorización ni pasa el umbral de confianza", async () => {
    const r = await procesarTexto(
      cfg,
      estadoInicial(),
      "hola",
      nluFijo(ok("charla_general", { confianza: 0.1, respuesta: "¡Hola!" })),
      false,
    );
    expect(r.accion.tipo).toBe("responder");
    expect(r.accion.texto).toBe("¡Hola!");
  });
});

describe("resolverConfirmacion", () => {
  const pendiente = {
    intencion: "cancelar_sesion",
    entidades: { sesion_id: 5 },
    faltantes: [],
    esperandoConfirmacion: true,
    ofertaCalendarPendiente: null,
  };

  it("'si' -> ejecutar", () => {
    const r = resolverConfirmacion(pendiente, "si");
    expect(r.accion.tipo).toBe("ejecutar");
    expect(r.estado.esperandoConfirmacion).toBe(false);
  });

  it("'no' -> cancelar sin cambios", () => {
    const r = resolverConfirmacion(pendiente, "no");
    expect(r.accion.tipo).toBe("responder");
    expect(r.accion.texto).toContain("Cancelado");
  });

  it("sin confirmación pendiente -> mensaje neutro", () => {
    const r = resolverConfirmacion(estadoInicial(), "si");
    expect(r.accion.texto).toContain("nada pendiente");
  });
});

describe("resolverOfertaCalendar", () => {
  const conOferta = { ...estadoInicial(), ofertaCalendarPendiente: { reservaId: 77, pacienteId: 5 } };

  it("'si' -> aceptado, con reservaId y pacienteId", () => {
    const r = resolverOfertaCalendar(conOferta, "si");
    expect(r).toMatchObject({ tipo: "aceptado", reservaId: 77, pacienteId: 5 });
  });

  it("'no' -> declinado", () => {
    const r = resolverOfertaCalendar(conOferta, "no");
    expect(r.tipo).toBe("declinado");
  });

  it("sin oferta pendiente -> sin_pendiente", () => {
    const r = resolverOfertaCalendar(estadoInicial(), "si");
    expect(r.tipo).toBe("sin_pendiente");
  });
});
