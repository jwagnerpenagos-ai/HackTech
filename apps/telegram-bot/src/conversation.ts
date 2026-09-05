import type { Config } from "./config.js";
import { INTENCIONES_RESTRINGIDAS } from "./auth.js";
import { esSensible } from "./sensitive.js";
import { interpretar, type IntencionNlu, type ResultadoNlu } from "./nluClient.js";
import { sanearMensaje } from "./sanitize.js";
import { noAutorizado } from "./commands.js";

/** Estado conversacional que se guarda por chat mientras faltan datos. */
export interface EstadoConversacion {
  intencion: string | null;
  entidades: Record<string, string | number>;
  faltantes: string[];
  esperandoConfirmacion: boolean;
  /**
   * Tras un `crear_sesion` exitoso hecho por el propio paciente (fase 3), se
   * le pregunta si quiere sincronizar con su Google Calendar personal —
   * opcional, nunca bloquea la reserva ya confirmada. Sí/no se resuelve con
   * `resolverOfertaCalendar`, igual patrón que `esperandoConfirmacion`.
   */
  ofertaCalendarPendiente: { reservaId: number; pacienteId: number } | null;
}

export function estadoInicial(): EstadoConversacion {
  return {
    intencion: null,
    entidades: {},
    faltantes: [],
    esperandoConfirmacion: false,
    ofertaCalendarPendiente: null,
  };
}

function entidadesTexto(e: Record<string, unknown>): Record<string, string | number> {
  const pares = Object.entries(e).filter(
    (par): par is [string, string | number] =>
      (typeof par[1] === "string" && par[1].length > 0) ||
      (typeof par[1] === "number" && Number.isFinite(par[1])),
  );
  return Object.fromEntries(pares);
}

export type Accion =
  | { tipo: "responder"; texto: string }
  | { tipo: "pedir_dato"; texto: string }
  | { tipo: "pedir_confirmacion"; texto: string; intencion: string }
  | { tipo: "ejecutar"; texto: string; intencion: string; entidades: Record<string, string | number> }
  // El usuario preguntó algo de solo lectura (catálogo, agenda, disponibilidad)
  // en medio de un flujo de datos: bot.ts resuelve la consulta, muestra el
  // resultado y luego responde `rePrompt` para retomar el dato que faltaba.
  | {
      tipo: "consulta_y_retomar";
      intencion: string;
      entidades: Record<string, string | number>;
      rePrompt: string;
    };

export interface Procesado {
  estado: EstadoConversacion;
  accion: Accion;
}

const ETIQUETA_DATO = new Map<string, string>([
  ["cliente", "el nombre del paciente"],
  ["servicio", "el servicio"],
  ["sede", "la sede"],
  ["fecha", "la fecha (por ejemplo, 2026-09-15)"],
  ["hora", "la hora (por ejemplo, 15:00)"],
  ["sesion_id", "el número de la cita"],
  ["destinatario", "el destinatario"],
  ["asunto", "el asunto"],
  ["texto", "el contenido"],
  ["carpeta", "el nombre de la carpeta"],
  ["consulta", "qué desea buscar"],
  ["telefono", "su número de teléfono"],
  ["email", "su correo"],
]);

function resumen(intencion: string, entidades: Record<string, string | number>): string {
  const partes = Object.entries(entidades).map(([k, v]) => `${k}: ${String(v)}`);
  return partes.length > 0 ? `${intencion} — ${partes.join(", ")}` : intencion;
}

function textoPedirDato(slot: string): string {
  const etiqueta = ETIQUETA_DATO.get(slot) ?? slot;
  return `Para continuar necesito ${etiqueta}.`;
}

const PALABRAS_PREGUNTA =
  /(^|\s)(qu[eé]|cu[aá]l(es)?|cu[aá]nto?s?|c[oó]mo|d[oó]nde|cu[aá]ndo|qui[eé]n|hay|tienen|ten[eé]s|ofrecen|ofreces|puedo|pod[eé]s|podr[ií]a|sirve|explic|cu[eé]nt|cont[aá]|mostr|dec[ií]|dime)/i;

/**
 * Heurística barata para decidir, cuando estamos rellenando un dato, si el
 * mensaje es la respuesta al dato (corto y sin forma de pregunta) o es otra
 * cosa (una pregunta, un cambio de tema) que conviene reinterpretar con el NLU.
 */
export function pareceValorDirecto(texto: string): boolean {
  const t = texto.trim();
  if (t.includes("?") || t.includes("¿")) return false;
  if (PALABRAS_PREGUNTA.test(t)) return false;
  return t.split(/\s+/).filter(Boolean).length <= 6;
}

/** Intenciones de solo lectura que se pueden resolver "de paso" sin abandonar un flujo. */
const SOLO_LECTURA = new Set(["consultar_catalogo", "consultar_agenda", "consultar_disponibilidad"]);

/** Confianza mínima para que una intención nueva interrumpa un flujo en curso. */
const UMBRAL_CAMBIO_TEMA = 0.8;

function armarDesdeIntencion(intn: IntencionNlu): EstadoConversacion {
  return {
    intencion: intn.intencion,
    entidades: entidadesTexto(intn.entidades),
    faltantes: [...intn.faltantes],
    esperandoConfirmacion: false,
    ofertaCalendarPendiente: null,
  };
}

function siguientePaso(estado: EstadoConversacion): Procesado {
  const primeroFaltante = estado.faltantes[0];
  if (primeroFaltante !== undefined) {
    return {
      estado,
      accion: { tipo: "pedir_dato", texto: textoPedirDato(primeroFaltante) },
    };
  }
  const intencion = estado.intencion ?? "desconocida";
  if (esSensible(intencion)) {
    return {
      estado: { ...estado, esperandoConfirmacion: true },
      accion: {
        tipo: "pedir_confirmacion",
        intencion,
        texto: `Va a: ${resumen(intencion, estado.entidades)}.\n¿Confirma? (sí / no)`,
      },
    };
  }
  return {
    estado: estadoInicial(),
    accion: {
      tipo: "ejecutar",
      intencion,
      entidades: estado.entidades,
      texto: `Ejecutando: ${resumen(intencion, estado.entidades)}\n(pendiente conectar la API núcleo)`,
    },
  };
}

/**
 * Núcleo del manejo de texto libre, sin dependencias de grammY para poder
 * probarlo aislado. `nlu` se inyecta en las pruebas. `autorizado` decide si
 * ESTE chat puede ejecutar una intención administrativa
 * (`INTENCIONES_RESTRINGIDAS`); por defecto `true` para no romper llamadas
 * existentes (pruebas, y cualquier canal sin ese concepto) — `bot.ts` sí lo
 * pasa siempre explícito, calculado con `esAutorizado(cfg, chatId)`.
 */
export async function procesarTexto(
  cfg: Config,
  estadoPrevio: EstadoConversacion,
  entrada: string,
  nlu: (cfg: Config, mensaje: string) => Promise<ResultadoNlu> = interpretar,
  autorizado = true,
): Promise<Procesado> {
  const { texto } = sanearMensaje(entrada);
  if (texto.length === 0) {
    return { estado: estadoPrevio, accion: { tipo: "responder", texto: "No recibí ningún texto." } };
  }

  // Si veníamos rellenando datos, este mensaje suele ser el valor del primer
  // faltante — pero puede ser una pregunta o un cambio de tema. Ver
  // `manejarMensajeEnFlujo`.
  if (estadoPrevio.intencion !== null && estadoPrevio.faltantes.length > 0) {
    return manejarMensajeEnFlujo(cfg, estadoPrevio, texto, nlu, autorizado);
  }

  // Mensaje nuevo: se interpreta con el NLU.
  const r = await nlu(cfg, texto);
  if (!r.ok) {
    return {
      estado: estadoPrevio,
      accion: {
        tipo: "responder",
        texto: "No pude procesar su mensaje en este momento. Intente de nuevo o use /help.",
      },
    };
  }

  return manejarIntencionNueva(cfg, r.intencion, autorizado);
}

/** Llena el primer faltante con `valor` y avanza el flujo. */
function llenarFaltante(estado: EstadoConversacion, valor: string): Procesado {
  const [slot, ...resto] = estado.faltantes;
  return siguientePaso({
    ...estado,
    entidades: { ...estado.entidades, ...(slot !== undefined ? { [slot]: valor } : {}) },
    faltantes: resto,
  });
}

/**
 * Mensaje recibido mientras se rellenan datos de un flujo (p. ej. `crear_sesion`
 * pidiendo servicio/fecha/hora). Si parece un valor, lo usa como respuesta al
 * dato. Si parece una pregunta o un cambio de tema, lo reinterpreta:
 *  - charla / info → responde y retoma el mismo dato.
 *  - consulta de solo lectura → la resuelve "de paso" y retoma (bot.ts).
 *  - otra acción con confianza alta → abandona el flujo y atiende lo nuevo.
 *  - nada claro → lo toma igual como valor del dato.
 */
async function manejarMensajeEnFlujo(
  cfg: Config,
  estadoPrevio: EstadoConversacion,
  texto: string,
  nlu: (cfg: Config, mensaje: string) => Promise<ResultadoNlu>,
  autorizado: boolean,
): Promise<Procesado> {
  const slot = estadoPrevio.faltantes[0];

  if (pareceValorDirecto(texto)) return llenarFaltante(estadoPrevio, texto);

  const r = await nlu(cfg, texto);
  if (r.ok) {
    const otra = r.intencion;
    const rePrompt = slot !== undefined ? `Sigamos con su cita. ${textoPedirDato(slot)}` : "";

    if (otra.intencion === "charla_general") {
      const resp = otra.respuesta?.trim();
      const cuerpo = resp !== undefined && resp.length > 0 ? resp : "Con gusto.";
      return {
        estado: estadoPrevio,
        accion: { tipo: "responder", texto: rePrompt.length > 0 ? `${cuerpo}\n\n${rePrompt}` : cuerpo },
      };
    }

    if (SOLO_LECTURA.has(otra.intencion) && otra.confianza >= cfg.BOT_CONFIANZA_MINIMA) {
      return {
        estado: estadoPrevio,
        accion: {
          tipo: "consulta_y_retomar",
          intencion: otra.intencion,
          entidades: entidadesTexto(otra.entidades),
          rePrompt,
        },
      };
    }

    if (
      otra.intencion !== "desconocida" &&
      otra.intencion !== estadoPrevio.intencion &&
      otra.confianza >= UMBRAL_CAMBIO_TEMA
    ) {
      return manejarIntencionNueva(cfg, otra, autorizado);
    }
  }

  // No se pudo reinterpretar o no era nada claro: se toma como valor del dato.
  return llenarFaltante(estadoPrevio, texto);
}

/**
 * Rutea una intención recién interpretada por el NLU (mensaje nuevo o cambio
 * de tema): charla, allowlist admin, umbral de confianza, o arranque de flujo.
 */
function manejarIntencionNueva(cfg: Config, intn: IntencionNlu, autorizado: boolean): Procesado {
  if (intn.intencion === "desconocida") {
    return {
      estado: estadoInicial(),
      accion: { tipo: "responder", texto: "No entendí su solicitud. Escriba /help para ver qué puedo hacer." },
    };
  }

  // Saludo, "¿quién sos?", preguntas generales del consultorio: se responde
  // directo con lo que armó el NLU (grounded en services/nlu/conocimiento/),
  // sin pasar por la allowlist admin ni el umbral de confianza — nunca llega a
  // n8n/core-api, es puro texto informativo.
  if (intn.intencion === "charla_general") {
    const respuesta = intn.respuesta?.trim();
    return {
      estado: estadoInicial(),
      accion: {
        tipo: "responder",
        texto:
          respuesta !== undefined && respuesta.length > 0
            ? respuesta
            : "Hola. ¿En qué le puedo ayudar?",
      },
    };
  }

  if (INTENCIONES_RESTRINGIDAS.has(intn.intencion) && !autorizado) {
    return {
      estado: estadoInicial(),
      accion: { tipo: "responder", texto: noAutorizado() },
    };
  }

  if (intn.confianza < cfg.BOT_CONFIANZA_MINIMA) {
    return {
      estado: estadoInicial(),
      accion: {
        tipo: "responder",
        texto: "No entendí bien. ¿Puede decirlo de otra forma? Con /help ve lo que puedo hacer.",
      },
    };
  }

  return siguientePaso(armarDesdeIntencion(intn));
}

/** Arranca el flujo de "quiero agendar una cita" desde un botón del menú. */
export function iniciarAgendamiento(): Procesado {
  return siguientePaso({
    intencion: "crear_sesion",
    entidades: {},
    faltantes: ["servicio", "fecha", "hora"],
    esperandoConfirmacion: false,
    ofertaCalendarPendiente: null,
  });
}

/**
 * `crear_sesion` puede volver de core-api con `registro_requerido`: el chat
 * es primera cita y faltan datos de registro (nombre/teléfono). En vez de
 * un mensaje final, esto reentra al mismo bucle de "pedir_dato" que ya
 * maneja `procesarTexto`, para completar esos campos y reintentar.
 */
export function pedirDatosDeRegistro(
  entidadesActuales: Record<string, string | number>,
  camposFaltantes: string[],
): Procesado {
  return siguientePaso({
    intencion: "crear_sesion",
    entidades: entidadesActuales,
    faltantes: camposFaltantes,
    esperandoConfirmacion: false,
    ofertaCalendarPendiente: null,
  });
}

/** Resolución de la confirmación pendiente. */
export function resolverConfirmacion(
  estado: EstadoConversacion,
  respuesta: "si" | "no",
): Procesado {
  if (!estado.esperandoConfirmacion || estado.intencion === null) {
    return {
      estado: estadoInicial(),
      accion: { tipo: "responder", texto: "No hay nada pendiente de confirmar." },
    };
  }
  if (respuesta === "no") {
    return {
      estado: estadoInicial(),
      accion: { tipo: "responder", texto: "Cancelado. No se hizo ningún cambio." },
    };
  }
  return {
    estado: estadoInicial(),
    accion: {
      tipo: "ejecutar",
      intencion: estado.intencion,
      entidades: estado.entidades,
      texto: `Confirmado: ${resumen(estado.intencion, estado.entidades)}\n(pendiente conectar la API núcleo)`,
    },
  };
}

export type ResultadoOfertaCalendar =
  | { estado: EstadoConversacion; tipo: "sin_pendiente" | "declinado" }
  | { estado: EstadoConversacion; tipo: "aceptado"; reservaId: number; pacienteId: number };

/** Resolución del sí/no de "¿agrego la cita a tu Google Calendar?" (fase 3, opcional). */
export function resolverOfertaCalendar(
  estado: EstadoConversacion,
  respuesta: "si" | "no",
): ResultadoOfertaCalendar {
  const oferta = estado.ofertaCalendarPendiente;
  if (!oferta) return { estado: estadoInicial(), tipo: "sin_pendiente" };
  if (respuesta === "no") return { estado: estadoInicial(), tipo: "declinado" };
  return { estado: estadoInicial(), tipo: "aceptado", reservaId: oferta.reservaId, pacienteId: oferta.pacienteId };
}
