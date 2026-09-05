import { loadConfig } from "./config.js";
import {
  IntencionSchema,
  NOMBRES_ENTIDAD,
  desconocida,
  type Intencion,
} from "./contract/intents.js";
import { ollamaChat, OllamaError } from "./ollama.js";

type ChatFn = typeof ollamaChat;
import { construirSystemPrompt, PREFIJO_USUARIO } from "./prompt.js";
import { sanearMensaje } from "./sanitize.js";
import { buscarContexto } from "./conocimiento.js";

export type MotivoFallback =
  | "mensaje_vacio"
  | "json_invalido"
  | "esquema_invalido"
  | "ollama_timeout"
  | "ollama_error";

export interface InterpretarOpts {
  /** Fecha de referencia YYYY-MM-DD (zona de negocio). Por defecto, hoy. */
  hoy?: string;
  /** Inyección del cliente de chat para pruebas. */
  chat?: ChatFn;
}

export interface Interpretacion {
  intencion: Intencion;
  usoFallback: boolean;
  motivoFallback: MotivoFallback | null;
  modelo: string;
  latenciaMs: number;
  recorteEntrada: boolean;
}

function hoyEnZona(tz: string): string {
  // en-CA da formato YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Extrae el primer objeto JSON de un texto que podría traer ruido alrededor. */
function extraerJson(texto: string): unknown {
  const t = texto.trim();
  try {
    return JSON.parse(t);
  } catch {
    const ini = t.indexOf("{");
    const fin = t.lastIndexOf("}");
    if (ini === -1 || fin <= ini) throw new SyntaxError("sin objeto JSON");
    return JSON.parse(t.slice(ini, fin + 1));
  }
}

const NOMBRES_ENTIDAD_SET = new Set<string>(NOMBRES_ENTIDAD);

/**
 * Limpieza tolerante del objeto crudo del modelo ANTES de validar:
 * descarta claves de entidad desconocidas y filtra/deduplica `faltantes`
 * contra la misma lista blanca (un modelo de 3B a veces alucina un nombre
 * que no existe, p.ej. "nombre" — se descarta en vez de tumbar toda la
 * interpretación). Lo que quede se valida con Zod de forma estricta; si no
 * pasa, es fallback.
 */
function prelimpiar(crudo: unknown): unknown {
  if (typeof crudo !== "object" || crudo === null) return crudo;
  const obj = crudo as Record<string, unknown>;

  const entidadesRaw = obj["entidades"];
  const entidadesIn =
    typeof entidadesRaw === "object" && entidadesRaw !== null ? entidadesRaw : {};

  // Solo se conservan claves de la lista blanca; el acceso es por Reflect.get
  // (clave de un tuple `const`, no un índice dinámico controlable).
  const entidades = Object.fromEntries(
    NOMBRES_ENTIDAD.map((clave) => [clave, Reflect.get(entidadesIn, clave)] as const)
      .filter(([, v]) => v !== undefined)
      .map(([clave, v]) => [clave, typeof v === "string" ? v.normalize("NFC").trim() : v]),
  );

  const faltantesRaw = obj["faltantes"];
  const faltantesIn = Array.isArray(faltantesRaw) ? faltantesRaw : [];
  const faltantes = [
    ...new Set(faltantesIn.filter((x): x is string => typeof x === "string" && NOMBRES_ENTIDAD_SET.has(x))),
  ];

  const respuestaRaw = obj["respuesta"];
  const respuesta = typeof respuestaRaw === "string" ? respuestaRaw.normalize("NFC").trim() : respuestaRaw;

  return {
    intencion: obj["intencion"],
    entidades,
    confianza: obj["confianza"],
    faltantes,
    respuesta,
  };
}

export async function interpretar(
  mensajeCrudo: unknown,
  opts: InterpretarOpts = {},
): Promise<Interpretacion> {
  const cfg = loadConfig();
  const chat = opts.chat ?? ollamaChat;
  const { texto, recortado } = sanearMensaje(mensajeCrudo);

  const base: Omit<Interpretacion, "intencion" | "usoFallback" | "motivoFallback"> = {
    modelo: cfg.OLLAMA_MODEL,
    latenciaMs: 0,
    recorteEntrada: recortado,
  };

  if (texto.length === 0) {
    return {
      ...base,
      intencion: desconocida(),
      usoFallback: true,
      motivoFallback: "mensaje_vacio",
    };
  }

  const hoy = opts.hoy ?? hoyEnZona(cfg.TIMEZONE);
  const contexto = buscarContexto(texto);
  const system = construirSystemPrompt(hoy, cfg.TIMEZONE, contexto);

  let contenido: string;
  let modeloReal = cfg.OLLAMA_MODEL;
  let latenciaMs = 0;
  try {
    const r = await chat({
      model: cfg.OLLAMA_MODEL,
      host: cfg.OLLAMA_HOST,
      timeoutMs: cfg.NLU_OLLAMA_TIMEOUT_MS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `${PREFIJO_USUARIO}\n${texto}` },
      ],
    });
    contenido = r.content;
    modeloReal = r.model;
    latenciaMs = r.latenciaMs;
  } catch (err) {
    const motivo: MotivoFallback =
      err instanceof OllamaError && err.causa === "timeout"
        ? "ollama_timeout"
        : "ollama_error";
    return {
      ...base,
      intencion: desconocida(),
      usoFallback: true,
      motivoFallback: motivo,
    };
  }

  let crudo: unknown;
  try {
    crudo = extraerJson(contenido);
  } catch {
    return {
      ...base,
      modelo: modeloReal,
      latenciaMs,
      intencion: desconocida(),
      usoFallback: true,
      motivoFallback: "json_invalido",
    };
  }

  const validado = IntencionSchema.safeParse(prelimpiar(crudo));
  if (!validado.success) {
    return {
      ...base,
      modelo: modeloReal,
      latenciaMs,
      intencion: desconocida(),
      usoFallback: true,
      motivoFallback: "esquema_invalido",
    };
  }

  return {
    ...base,
    modelo: modeloReal,
    latenciaMs,
    intencion: validado.data,
    usoFallback: false,
    motivoFallback: null,
  };
}
