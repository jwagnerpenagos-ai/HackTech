import { type Bot, InlineKeyboard } from "grammy";
import { esAutorizado } from "../auth.js";
import type { PagoPendiente } from "../coreApiClient.js";
import { fechaLarga, horaCorta } from "../resultados.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import { editarOResponder, formatearMonto } from "./formato.js";

/**
 * Indicaciones previas por tipo de servicio (contenido real de Lina, ver
 * services/nlu/conocimiento/primera-cita.md). Duplicado a propósito en
 * core-api y en el bot (mismo patrón que otros textos pequeños de este
 * proyecto que viven en más de un servicio).
 */
function indicacionesPara(servicio: string | null): string {
  const s = (servicio ?? "").toLowerCase();
  if (/punci[oó]n|neural|prp|plasma|suero/.test(s)) {
    return "Venga con ropa holgada y cómoda que dé acceso fácil a la zona a tratar, y le pedimos puntualidad estricta.";
  }
  if (/descarga|modulaci[oó]n/.test(s)) {
    return "Venga con ropa cómoda que permita trabajar la zona a tratar. Si gusta, traiga hidratación y una toalla, y llegue con un poco de anticipación.";
  }
  return "Venga con ropa cómoda o deportiva y calzado adecuado para ejercicio. Si gusta, traiga hidratación y una toalla, y por favor llegue de 5 a 10 minutos antes.";
}

/**
 * Tarjeta de un comprobante por verificar: el texto y los botones
 * `[✓ Verificar]` / `[✗ Rechazar]`. La usan tanto `/pagos` (a pedido) como la
 * vigilancia que le avisa a Lina cuando entra un pago desde la web.
 */
export function tarjetaPago(p: PagoPendiente): {
  caption: string;
  teclado: InlineKeyboard;
  comprobanteRef: string | null;
} {
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
  return { caption, teclado, comprobanteRef: p.comprobanteRef };
}

/**
 * Verificación de pagos por el personal del consultorio. `/pagos` lista los
 * comprobantes `registrado` (con la foto que mandó el paciente) y cada uno
 * trae `[✓ Verificar]` / `[✗ Rechazar]`. Al verificar, core-api confirma la(s)
 * reserva(s) ligadas y el bot le avisa al paciente por su chat_id.
 *
 * Ojo: estos endpoints van DIRECTO a core-api (`deps.cApi`), no por n8n — no
 * son intenciones del modelo, son operaciones internas de staff.
 */
/** Reutilizable por el comando `/pagos` y el botón "💳 Pagos pendientes" del menú de personal. */
async function mostrarPagosPendientes(ctx: MiContexto, deps: FlujoDeps): Promise<void> {
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
    const { caption, teclado, comprobanteRef } = tarjetaPago(p);
    if (comprobanteRef) {
      await ctx.replyWithPhoto(comprobanteRef, { caption, reply_markup: teclado });
    } else {
      await ctx.reply(`${caption}\n(pago desde la web — sin comprobante adjunto)`, { reply_markup: teclado });
    }
  }
}

export function registrarFlujoPagos(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  bot.command("pagos", async (ctx) => {
    if (!esAutorizado(deps.cfg, ctx.chat.id)) {
      await ctx.reply("Este comando es solo para el personal del consultorio.");
      return;
    }
    await mostrarPagosPendientes(ctx, deps);
  });

  bot.callbackQuery("admin:pagos", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!esAutorizado(deps.cfg, ctx.chat?.id ?? 0)) return;
    await mostrarPagosPendientes(ctx, deps);
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
            [
              "¡Su cita quedó confirmada! ✅",
              `${rc.servicio ?? "Su cita"} · ${horaCorta(rc.iniciaEn)}`,
              "",
              indicacionesPara(rc.servicio),
              "",
              "¡Le esperamos! 💛",
            ].join("\n"),
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
