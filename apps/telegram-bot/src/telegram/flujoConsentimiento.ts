import { type Bot, InlineKeyboard } from "grammy";
import { esAutorizado } from "../auth.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import { enviarMenuPrincipal } from "./menu.js";

/**
 * Aviso de tratamiento de datos personales (Ley 1581 de 2012 — Habeas Data,
 * Colombia): dato de salud es "dato sensible" y exige autorización previa,
 * expresa e informada, no implícita. Un chat de paciente (no admin) no ve
 * nada más del bot — ni el menú, ni el catálogo, nada — hasta responder
 * esto. Se guarda solo en memoria del proceso (por chat_id): es la
 * compuerta de UX; el registro real y persistente del consentimiento queda
 * en personas.consentimiento cuando el paciente se registra de verdad (ver
 * dominio/pacientes.ts en core-api), porque esa tabla exige un paciente_id
 * que todavía no existe en este punto de la conversación.
 */

const consentidos = new Set<number>();

export function tieneConsentimiento(chatId: number): boolean {
  return consentidos.has(chatId);
}

/** Solo para pruebas: da por otorgado el consentimiento de un chat, sin pasar por el aviso. */
export function otorgarConsentimientoParaPruebas(chatId: number): void {
  consentidos.add(chatId);
}

const AVISO_DATOS = [
  "🔒 Antes de continuar",
  "",
  "Para agendarle su cita y darle seguimiento a su atención, La Fisioterapeuta Li (Lina Murillo) necesita tratar sus datos personales — incluidos datos de salud — conforme a la Ley 1581 de 2012 de Colombia sobre protección de datos personales.",
  "",
  "• Finalidad: agendar y confirmar citas, llevar su historia clínica y contactarlo sobre su atención.",
  "• Sus derechos: conocer, actualizar, rectificar o eliminar sus datos, y revocar esta autorización cuando quiera — escribiendo por este chat o al 311 398 1422.",
  "• Sus datos no se comparten con terceros fuera de su atención.",
  "",
  "¿Autoriza el tratamiento de sus datos personales, incluidos los de salud?",
].join("\n");

const AVISO_RECHAZO = [
  "Entendido, sin problema.",
  "",
  "Sin esa autorización no podemos agendarle por este medio. Puede escribirnos o llamarnos directo al 311 398 1422.",
  "",
  "Si cambia de opinión, escríbanos por aquí cuando quiera.",
].join("\n");

const TECLADO_CONSENTIMIENTO = new InlineKeyboard()
  .text("✅ Sí, acepto", "consentimiento:si")
  .row()
  .text("❌ No acepto", "consentimiento:no");

export async function pedirConsentimiento(ctx: MiContexto): Promise<void> {
  await ctx.reply(AVISO_DATOS, { reply_markup: TECLADO_CONSENTIMIENTO });
}

export function registrarFlujoConsentimiento(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  bot.callbackQuery("consentimiento:si", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    consentidos.add(chatId);
    await enviarMenuPrincipal(ctx, deps.cfg);
  });

  bot.callbackQuery("consentimiento:no", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(AVISO_RECHAZO);
  });
}

/**
 * Middleware: un chat de paciente (no admin) sin consentimiento no avanza a
 * ningún otro handler — ni el menú, ni el catálogo, ni nada — hasta que
 * responda el aviso de arriba. Va antes de registrar cualquier otro flujo.
 */
export function medianteConsentimiento(cfg: FlujoDeps["cfg"]) {
  return async (ctx: MiContexto, next: () => Promise<void>): Promise<void> => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined || esAutorizado(cfg, chatId) || tieneConsentimiento(chatId)) {
      await next();
      return;
    }
    if (ctx.callbackQuery?.data?.startsWith("consentimiento:")) {
      await next();
      return;
    }
    await pedirConsentimiento(ctx);
  };
}
