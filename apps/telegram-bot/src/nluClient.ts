import { z } from "zod";
import type { Config } from "./config.js";

/**
 * Cliente del servicio NLU. El bot no confía en la respuesta: la vuelve a
 * validar contra una forma mínima del contrato antes de usarla.
 *
 * Contrato canónico: contracts/intents.schema.json
 * (aquí solo se valida lo que el bot necesita para la UX).
 */

const INTENCIONES = [
  "charla_general",
  "consultar_catalogo",
  "consultar_agenda",
  "consultar_disponibilidad",
  "crear_sesion",
  "modificar_sesion",
  "cancelar_sesion",
  "buscar_cliente",
  "enviar_correo",
  "crear_carpeta",
  "buscar_archivo",
  "bloquear_horario",
  "desconocida",
] as const;

const NOMBRES_ENTIDAD = [
  "cliente",
  "servicio",
  "sede",
  "fecha",
  "hora",
  "sesion_id",
  "destinatario",
  "asunto",
  "texto",
  "carpeta",
  "consulta",
  "telefono",
  "email",
] as const;

const RespuestaNlu = z
  .object({
    intencion: z.enum(INTENCIONES),
    entidades: z.record(z.string(), z.unknown()).default({}),
    confianza: z.number().min(0).max(1),
    faltantes: z.array(z.enum(NOMBRES_ENTIDAD)).default([]),
    // Solo relevante para intencion="charla_general" — ver conversation.ts.
    respuesta: z.string().nullable().optional(),
  })
  .passthrough();

export interface IntencionNlu {
  intencion: (typeof INTENCIONES)[number];
  entidades: Record<string, unknown>;
  confianza: number;
  faltantes: (typeof NOMBRES_ENTIDAD)[number][];
  respuesta?: string | null;
}

export type ResultadoNlu =
  | { ok: true; intencion: IntencionNlu }
  | { ok: false; motivo: "timeout" | "red" | "http" | "respuesta_invalida" };

export async function interpretar(
  cfg: Config,
  mensaje: string,
): Promise<ResultadoNlu> {
  const url = new URL("/interpretar", cfg.NLU_URL);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.INTERNAL_API_KEY !== undefined) headers["x-internal-key"] = cfg.INTERNAL_API_KEY;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ mensaje }),
      signal: AbortSignal.timeout(cfg.BOT_NLU_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { ok: false, motivo: "timeout" };
    }
    return { ok: false, motivo: "red" };
  }

  if (!resp.ok) return { ok: false, motivo: "http" };

  const cuerpo: unknown = await resp.json().catch(() => null);
  const parsed = RespuestaNlu.safeParse(cuerpo);
  if (!parsed.success) return { ok: false, motivo: "respuesta_invalida" };

  return {
    ok: true,
    intencion: {
      intencion: parsed.data.intencion,
      entidades: parsed.data.entidades,
      confianza: parsed.data.confianza,
      faltantes: parsed.data.faltantes,
      ...(parsed.data.respuesta !== undefined ? { respuesta: parsed.data.respuesta } : {}),
    },
  };
}
