import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";
import {
  emparejarServicio,
  estadoInicial,
  iniciarAgendamiento,
  pareceValorDirecto,
  parsearFechaSimple,
  procesarTexto,
  resolverConfirmacion,
  resolverOfertaCalendar,
  type Accion,
} from "../src/conversation.js";
import type { ResultadoNlu } from "../src/nluClient.js";

const cfg = loadConfig();

/** Texto visible de una acción, sea cual sea su variante. */
function textoDe(accion: Accion): string {
  if (accion.tipo === "consulta_y_retomar") return accion.rePrompt;
  if (accion.tipo === "iniciar_reserva_guiada" || accion.tipo === "iniciar_cancelar_guiado") return "";
  return accion.texto;
}

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
      reservaFlujo: null,
      esperandoComprobante: null,
      cancelarFlujo: null,
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
    expect(textoDe(r.accion)).toContain("/help");
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
    expect(textoDe(r.accion)).toBe("¡Hola! Soy el asistente de La Fisioterapeuta Li.");
    expect(r.estado).toEqual(estadoInicial());
  });

  it("'charla_general' sin 'respuesta' del modelo cae a un saludo genérico", async () => {
    const r = await procesarTexto(cfg, estadoInicial(), "hola", nluFijo(ok("charla_general")));
    expect(r.accion.tipo).toBe("responder");
    expect(textoDe(r.accion)).toContain("¿En qué le puedo ayudar?");
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
    expect(textoDe(r.accion)).toBe("¡Hola!");
  });
});

describe("pareceValorDirecto", () => {
  it("acepta respuestas cortas sin forma de pregunta", () => {
    expect(pareceValorDirecto("punción seca")).toBe(true);
    expect(pareceValorDirecto("2026-09-10")).toBe(true);
    expect(pareceValorDirecto("Ana Ríos")).toBe(true);
  });
  it("rechaza preguntas y frases largas", () => {
    expect(pareceValorDirecto("¿qué servicios ofrecen?")).toBe(false);
    expect(pareceValorDirecto("que servicios hay")).toBe(false);
    expect(pareceValorDirecto("mejor contame primero todo lo que tienen disponible por favor")).toBe(false);
  });
});

describe("procesarTexto en medio de un flujo de datos", () => {
  const enFlujo = () => ({
    intencion: "crear_sesion",
    entidades: {} as Record<string, string | number>,
    faltantes: ["servicio", "fecha", "hora"],
    esperandoConfirmacion: false,
    ofertaCalendarPendiente: null,
      reservaFlujo: null,
      esperandoComprobante: null,
      cancelarFlujo: null,
  });

  it("un valor corto llena el dato sin reinterpretar", async () => {
    let nluLlamado = false;
    const nlu = () => {
      nluLlamado = true;
      return Promise.resolve(ok("desconocida"));
    };
    const r = await procesarTexto(cfg, enFlujo(), "punción seca", nlu);
    expect(nluLlamado).toBe(false);
    expect(r.estado.entidades["servicio"]).toBe("punción seca");
    expect(r.accion.tipo).toBe("pedir_dato");
  });

  it("una pregunta de charla se responde y se retoma el dato pendiente", async () => {
    const r = await procesarTexto(
      cfg,
      enFlujo(),
      "¿me contás de ustedes?",
      nluFijo(ok("charla_general", { respuesta: "Somos el consultorio de Lina Murillo." })),
    );
    expect(r.accion.tipo).toBe("responder");
    expect(textoDe(r.accion)).toContain("Somos el consultorio");
    expect(textoDe(r.accion)).toContain("Sigamos con su cita");
    expect(r.estado.intencion).toBe("crear_sesion");
    expect(r.estado.faltantes).toEqual(["servicio", "fecha", "hora"]);
  });

  it("una consulta de solo lectura se resuelve de paso y se retoma", async () => {
    const r = await procesarTexto(
      cfg,
      enFlujo(),
      "¿qué servicios ofrecen?",
      nluFijo(ok("consultar_catalogo", { confianza: 0.95 })),
    );
    expect(r.accion.tipo).toBe("consulta_y_retomar");
    if (r.accion.tipo === "consulta_y_retomar") {
      expect(r.accion.intencion).toBe("consultar_catalogo");
      expect(r.accion.rePrompt).toContain("servicio");
    }
    expect(r.estado.faltantes).toEqual(["servicio", "fecha", "hora"]);
  });

  it("un cambio de tema claro abandona el flujo anterior", async () => {
    const r = await procesarTexto(
      cfg,
      enFlujo(),
      "mejor quiero cancelar mi cita número cinco por favor",
      nluFijo(ok("cancelar_sesion", { entidades: { sesion_id: 5 }, confianza: 0.9 })),
    );
    expect(r.accion.tipo).toBe("pedir_confirmacion");
    expect(r.estado.intencion).toBe("cancelar_sesion");
  });

  it("si no se puede reinterpretar, la frase larga se toma igual como valor", async () => {
    const r = await procesarTexto(
      cfg,
      enFlujo(),
      "no sé, lo que sea que tengas libre esta semana",
      nluFijo(ok("desconocida")),
    );
    expect(r.estado.entidades["servicio"]).toContain("no sé");
    expect(r.accion.tipo).toBe("pedir_dato");
  });
});

describe("parsearFechaSimple", () => {
  const hoy = "2026-09-05"; // sábado

  it("acepta AAAA-MM-DD, D/M/AAAA y D-M.AAAA, dentro de una frase", () => {
    expect(parsearFechaSimple("2026-11-18", hoy)).toBe("2026-11-18");
    expect(parsearFechaSimple("el 18/11/2026", hoy)).toBe("2026-11-18");
    expect(parsearFechaSimple("puede ser el 18-11-2026?", hoy)).toBe("2026-11-18");
  });
  it("sin año, si la fecha ya pasó asume el próximo año", () => {
    expect(parsearFechaSimple("18/11", hoy)).toBe("2026-11-18");
    expect(parsearFechaSimple("dale, 3/1", hoy)).toBe("2027-01-03");
  });
  it("entiende frases informales con hoy / mañana / pasado mañana", () => {
    expect(parsearFechaSimple("hoy mismo si se puede", hoy)).toBe("2026-09-05");
    expect(parsearFechaSimple("puede ser mañana?", hoy)).toBe("2026-09-06");
    expect(parsearFechaSimple("mejor pasado mañana", hoy)).toBe("2026-09-07");
    expect(parsearFechaSimple("me sirve el 3 de diciembre", hoy)).toBe("2026-12-03");
  });
  it("resuelve días de la semana (próxima ocurrencia)", () => {
    // hoy es sábado 2026-09-05
    expect(parsearFechaSimple("el lunes", hoy)).toBe("2026-09-07");
    expect(parsearFechaSimple("este viernes", hoy)).toBe("2026-09-11");
    expect(parsearFechaSimple("el sábado", hoy)).toBe("2026-09-12"); // el próximo, no hoy
    expect(parsearFechaSimple("el lunes que viene", hoy)).toBe("2026-09-14");
  });
  it("devuelve null para lo que no reconoce", () => {
    expect(parsearFechaSimple("cuando puedas", hoy)).toBeNull();
    expect(parsearFechaSimple("el 40 de marzo", hoy)).toBeNull();
  });
});

describe("emparejarServicio", () => {
  const servicios = [{ nombre: "Punción seca" }, { nombre: "Terapia neural" }, { nombre: "Sueroterapia" }];
  it("empareja por nombre exacto o parcial, sin distinguir mayúsculas", () => {
    expect(emparejarServicio(servicios, "sueroterapia")?.nombre).toBe("Sueroterapia");
    expect(emparejarServicio(servicios, "punción")?.nombre).toBe("Punción seca");
  });
  it("no empareja texto muy corto o ajeno", () => {
    expect(emparejarServicio(servicios, "xy")).toBeNull();
    expect(emparejarServicio(servicios, "masaje relajante")).toBeNull();
  });
});

describe("iniciarAgendamiento", () => {
  it("arranca el flujo de crear_sesion pidiendo el servicio", () => {
    const r = iniciarAgendamiento();
    expect(r.accion.tipo).toBe("pedir_dato");
    expect(textoDe(r.accion).toLowerCase()).toContain("servicio");
    expect(r.estado.intencion).toBe("crear_sesion");
    expect(r.estado.faltantes).toEqual(["servicio", "fecha", "hora"]);
  });
});

describe("resolverConfirmacion", () => {
  const pendiente = {
    intencion: "cancelar_sesion",
    entidades: { sesion_id: 5 },
    faltantes: [],
    esperandoConfirmacion: true,
    ofertaCalendarPendiente: null,
      reservaFlujo: null,
      esperandoComprobante: null,
      cancelarFlujo: null,
  };

  it("'si' -> ejecutar", () => {
    const r = resolverConfirmacion(pendiente, "si");
    expect(r.accion.tipo).toBe("ejecutar");
    expect(r.estado.esperandoConfirmacion).toBe(false);
  });

  it("'no' -> cancelar sin cambios", () => {
    const r = resolverConfirmacion(pendiente, "no");
    expect(r.accion.tipo).toBe("responder");
    expect(textoDe(r.accion)).toContain("Cancelado");
  });

  it("sin confirmación pendiente -> mensaje neutro", () => {
    const r = resolverConfirmacion(estadoInicial(), "si");
    expect(textoDe(r.accion)).toContain("nada pendiente");
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
