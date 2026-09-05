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
  | { tipo: "ejecutar"; texto: string; intencion: string; entidades: Record<string, string | number> };

export interface Procesado {
  estado: EstadoConversacion;
  accion: Accion;
}

const ETIQUETA_DATO = new Map<string, string>([
  ["cliente", "el nombre del paciente"],
  ["servicio", "el servicio"],
  ["sede", "la sede"],
  ["fecha", "la fecha (YYYY-MM-DD)"],
  ["hora", "la hora (HH:MM)"],
  ["sesion_id", "el número de la cita"],
  ["destinatario", "el destinatario"],
  ["asunto", "el asunto"],
  ["texto", "el contenido"],
  ["carpeta", "el nombre de la carpeta"],
  ["consulta", "qué quieres buscar"],
  ["telefono", "tu número de teléfono"],
  ["email", "tu correo"],
]);

function resumen(intencion: string, entidades: Record<string, string | number>): string {
  const partes = Object.entries(entidades).map(([k, v]) => `${k}: ${String(v)}`);
  return partes.length > 0 ? `${intencion} — ${partes.join(", ")}` : intencion;
}

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
    const etiqueta = ETIQUETA_DATO.get(primeroFaltante) ?? primeroFaltante;
    return {
      estado,
      accion: { tipo: "pedir_dato", texto: `Para continuar necesito ${etiqueta}.` },
    };
  }
  const intencion = estado.intencion ?? "desconocida";
  if (esSensible(intencion)) {
    return {
      estado: { ...estado, esperandoConfirmacion: true },
      accion: {
        tipo: "pedir_confirmacion",
        intencion,
        texto: `Vas a: ${resumen(intencion, estado.entidades)}.\n¿Confirmas? (sí / no)`,
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
    return { estado: estadoPrevio, accion: { tipo: "responder", texto: "No recibí texto." } };
  }

  // Si veníamos rellenando datos, este mensaje es el valor del primer faltante.
  if (estadoPrevio.intencion !== null && estadoPrevio.faltantes.length > 0) {
    const [slot, ...resto] = estadoPrevio.faltantes;
    const estado: EstadoConversacion = {
      ...estadoPrevio,
      entidades: { ...estadoPrevio.entidades, ...(slot !== undefined ? { [slot]: texto } : {}) },
      faltantes: resto,
    };
    return siguientePaso(estado);
  }

  // Mensaje nuevo: se interpreta con el NLU.
  const r = await nlu(cfg, texto);
  if (!r.ok) {
    return {
      estado: estadoPrevio,
      accion: {
        tipo: "responder",
        texto:
          "No pude interpretar el mensaje ahora mismo. Usá /help para ver los comandos disponibles.",
      },
    };
  }

  const intn = r.intencion;
  if (intn.intencion === "desconocida") {
    return {
      estado: estadoInicial(),
      accion: {
        tipo: "responder",
        texto: "No entendí la solicitud. Probá con /help o reformulá.",
      },
    };
  }

  // Saludo, "¿quién sos?", preguntas generales del consultorio: se responde
  // directo con lo que armó el NLU (grounded en services/nlu/conocimiento/),
  // sin pasar por la allowlist admin ni el umbral de confianza — nunca
  // llega a n8n/core-api, es puro texto informativo.
  if (intn.intencion === "charla_general") {
    const respuesta = intn.respuesta?.trim();
    return {
      estado: estadoInicial(),
      accion: {
        tipo: "responder",
        texto:
          respuesta !== undefined && respuesta.length > 0
            ? respuesta
            : "¡Hola! ¿En qué te puedo ayudar? Escribí /help para ver ejemplos.",
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
        texto: `Creo que querés "${intn.intencion}" pero no estoy seguro. ¿Podés decirlo de otra forma?`,
      },
    };
  }

  return siguientePaso(armarDesdeIntencion(intn));
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
