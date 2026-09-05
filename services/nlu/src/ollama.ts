import { z } from "zod";
import { loadConfig } from "./config.js";

/**
 * Cliente mínimo de Ollama. Solo usa /api/chat en modo no-streaming con
 * salida forzada a JSON. Sin reintentos: un reintento ciego sobre una
 * interpretación es una fuente de duplicados aguas abajo.
 */

export interface OllamaMensaje {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatOpts {
  model: string;
  messages: OllamaMensaje[];
  /** Milisegundos hasta abortar la petición. */
  timeoutMs: number;
  /** Host base de Ollama, ej. http://127.0.0.1:11434 */
  host: string;
}

export interface OllamaChatResult {
  /** Contenido textual devuelto por el modelo (se espera JSON). */
  content: string;
  /** Modelo que respondió, tal como lo reporta Ollama. */
  model: string;
  latenciaMs: number;
}

export class OllamaError extends Error {
  constructor(
    message: string,
    readonly causa: "timeout" | "red" | "http" | "respuesta_invalida",
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

const ChatResponseSchema = z.object({
  message: z.object({ content: z.string() }),
  model: z.string().optional(),
});

const TagsResponseSchema = z.object({
  models: z.array(z.object({ name: z.string().optional() })).optional(),
});

export async function ollamaChat(opts: OllamaChatOpts): Promise<OllamaChatResult> {
  const url = new URL("/api/chat", opts.host);
  const inicio = performance.now();

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: false,
        format: "json",
        // Mantener el modelo residente entre mensajes: el cold-load de un 7B
        // puede pasarse del timeout y romper el primer mensaje tras un rato
        // de inactividad (Ollama lo descarga a los 5 min por defecto).
        keep_alive: "30m",
        // num_ctx holgado: el system prompt lleva reglas + descripciones +
        // few-shot + el corpus completo de conocimiento/. Si se desborda,
        // Ollama trunca por el principio (¡el system!), así que sobra margen.
        options: { temperature: 0, num_ctx: 8192 },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new OllamaError(`Ollama no respondió en ${opts.timeoutMs} ms`, "timeout");
    }
    throw new OllamaError(
      `no se pudo contactar a Ollama en ${opts.host}`,
      "red",
    );
  }

  if (!resp.ok) {
    throw new OllamaError(`Ollama respondió HTTP ${resp.status}`, "http");
  }

  const cuerpo: unknown = await resp.json();
  const parsed = ChatResponseSchema.safeParse(cuerpo);
  if (!parsed.success || parsed.data.message.content.length === 0) {
    throw new OllamaError("Ollama no devolvió contenido de texto", "respuesta_invalida");
  }

  return {
    content: parsed.data.message.content,
    model: parsed.data.model ?? opts.model,
    latenciaMs: Math.round(performance.now() - inicio),
  };
}

/** Comprueba que Ollama esté vivo y con el modelo configurado disponible. */
export async function ollamaSalud(): Promise<{ ok: boolean; detalle: string }> {
  const cfg = loadConfig();
  try {
    const resp = await fetch(new URL("/api/tags", cfg.OLLAMA_HOST), {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return { ok: false, detalle: `HTTP ${resp.status}` };
    const body = TagsResponseSchema.safeParse(await resp.json());
    const nombres = (body.success ? (body.data.models ?? []) : []).map((m) => m.name ?? "");
    const tiene = nombres.some(
      (n) => n === cfg.OLLAMA_MODEL || n.startsWith(`${cfg.OLLAMA_MODEL}:`),
    );
    return tiene
      ? { ok: true, detalle: `modelo ${cfg.OLLAMA_MODEL} disponible` }
      : { ok: false, detalle: `falta el modelo ${cfg.OLLAMA_MODEL} (ollama pull)` };
  } catch {
    return { ok: false, detalle: "Ollama inalcanzable" };
  }
}
