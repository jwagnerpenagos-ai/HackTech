import type { InlineKeyboard } from "grammy";
import { horaCorta } from "../resultados.js";
import type { MiContexto } from "./contexto.js";

/** Llave Nequi del consultorio a la que el paciente transfiere el anticipo. */
export const LLAVE_NEQUI = "3113981422 (Lina Murillo)";

/** 1234000 -> "$1.234.000" (formato colombiano). */
export function formatearMonto(n: number): string {
  return `$${n.toLocaleString("es-CO")}`;
}

/** Fecha de hoy en Bogotá como AAAA-MM-DD. */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Fecha mínima reservable (AAAA-MM-DD, Bogotá): hoy + 24 h. */
export function fechaMinimaReserva(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

/** "2026-09-10T19:00:00Z" -> "mié 10/09 · 14:00" (hora de Bogotá). */
export function etiquetaSlot(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(d);
  const g = (t: string): string => p.find((x) => x.type === t)?.value ?? "";
  return `${g("weekday")} ${g("day")}/${g("month")} · ${horaCorta(iso)}`;
}

/** Interpreta una respuesta libre de sí/no. `null` si no es ninguna. */
export function interpretarSiNo(texto: string): "si" | "no" | null {
  const t = texto.trim().toLowerCase();
  if (["si", "sí", "s", "yes", "ok", "dale", "confirmo"].includes(t)) return "si";
  if (["no", "n", "cancelar", "cancela"].includes(t)) return "no";
  return null;
}

/** Edita el mensaje del callback; si Telegram no deja (mensaje viejo), responde uno nuevo. */
export async function editarOResponder(
  ctx: MiContexto,
  texto: string,
  teclado?: InlineKeyboard,
): Promise<void> {
  const opts = teclado ? { reply_markup: teclado } : {};
  try {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(texto, opts);
      return;
    }
  } catch {
    // cae al reply
  }
  await ctx.reply(texto, opts);
}
