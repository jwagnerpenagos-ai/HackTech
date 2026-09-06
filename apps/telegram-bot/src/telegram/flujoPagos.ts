import { type Bot, InlineKeyboard } from "grammy";
import { esAutorizado } from "../auth.js";
import { fechaLarga, horaCorta } from "../resultados.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import { editarOResponder, formatearMonto } from "./formato.js";

/**
 * Verificación de pagos por el personal del consultorio. `/pagos` lista los
 * comprobantes `registrado` (con la foto que mandó el paciente) y cada uno
 * trae `[✓ Verificar]` / `[✗ Rechazar]`. Al verificar, core-api confirma la(s)
 * reserva(s) ligadas y el bot le avisa al paciente por su chat_id.
 *
 * Ojo: estos endpoints van DIRECTO a core-api (`deps.cApi`), no por n8n — no
 * son intenciones del modelo, son operaciones internas de staff.
 */
export function registrarFlujoPagos(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  bot.command("pagos", async (ctx) => {
    if (!esAutorizado(deps.cfg, ctx.chat.id)) {
      await ctx.reply("Este comando es solo para el personal del consultorio.");
      return;
    }
    const r = await deps.cApi.pagosPendientes(deps.cfg);
    if (!r.ok) {
      await ctx.reply("No pude consultar los pagos en este momento.");
      return;
    }
    if (r.datos.pagos.length === 0) {
      await ctx.reply("No hay comprobantes por verificar.");
      return;
    }
    for (const p of r.datos.pagos) {
      const caption = [
        `Pago #${p.pagoId} · ${formatearMonto(p.valor)}`,
        p.paciente,
        `${p.servicio ?? "?"} · ${fechaLarga(p.iniciaEn.slice(0, 10))} · ${horaCorta(p.iniciaEn)}`,
        p.referencia ? `Ref.: ${p.referencia}` : "",
      ]
        .filter((l) => l.length > 0)
        .join("\n");
      const teclado = new InlineKeyboard()
        .text("✓ Verificar", `pago:ok:${p.pagoId}`)
        .text("✗ Rechazar", `pago:no:${p.pagoId}`);
      if (p.comprobanteRef) {
        await ctx.replyWithPhoto(p.comprobanteRef, { caption, reply_markup: teclado });
      } else {
        await ctx.reply(`${caption}\n(sin imagen adjunta)`, { reply_markup: teclado });
      }
    }
  });

  bot.callbackQuery(/^pago:(ok|no):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!esAutorizado(deps.cfg, ctx.chat?.id ?? 0)) return;
    const pagoId = Number(ctx.match[2]);
    const staff = String(ctx.chat?.id ?? "");

    if (ctx.match[1] === "ok") {
      const r = await deps.cApi.verificarPago(deps.cfg, { pagoId, por: staff });
      if (!r.ok) {
        await ctx.reply(`No pude verificar el pago #${pagoId} (¿ya estaba procesado?).`);
        return;
      }
      await editarOResponder(ctx, `Pago #${pagoId} verificado. ✓`);
      for (const rc of r.datos.reservasConfirmadas) {
        if (rc.chatId !== null) {
          await bot.api.sendMessage(
            rc.chatId,
            `¡Su cita quedó confirmada! ✅\n${rc.servicio ?? "Su cita"} · ${horaCorta(rc.iniciaEn)}\n¡Le esperamos!`,
          );
        }
      }
      return;
    }

    const r = await deps.cApi.rechazarPago(deps.cfg, { pagoId, por: staff });
    if (!r.ok) {
      await ctx.reply(`No pude rechazar el pago #${pagoId} (¿ya estaba procesado?).`);
      return;
    }
    await editarOResponder(ctx, `Pago #${pagoId} rechazado. ✗`);
    if (r.datos.chatId !== null) {
      await bot.api.sendMessage(
        r.datos.chatId,
        "No pudimos confirmar el pago de su cita. Si ya pagó, reenvíe el comprobante o escríbanos al 311 398 1422.",
      );
    }
  });
}
