import { type Bot, InlineKeyboard } from "grammy";
import { esAutorizado } from "../auth.js";
import { fechaLarga, horaCorta } from "../resultados.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import { editarOResponder } from "./formato.js";

/**
 * Registro de asistencia por el personal del consultorio. `/asistencia` lista
 * las citas confirmadas cuya hora ya llegó y cada una trae `[✓ Asistió]` /
 * `[✗ No asistió]`. Marcar "asistió" cierra la cita como `atendida`; para la
 * valoración inicial, es lo que habilita al paciente a reservar los demás
 * servicios.
 *
 * Igual que `/pagos`: va DIRECTO a core-api (`deps.cApi`), no por n8n, y es
 * solo para chats en la allowlist administrativa.
 */
export function registrarFlujoAsistencia(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  bot.command("asistencia", async (ctx) => {
    if (!esAutorizado(deps.cfg, ctx.chat.id)) {
      await ctx.reply("Este comando es solo para el personal del consultorio.");
      return;
    }
    const r = await deps.cApi.citasPorAsistir(deps.cfg);
    if (!r.ok) {
      await ctx.reply("No pude consultar las citas en este momento.");
      return;
    }
    if (r.datos.citas.length === 0) {
      await ctx.reply("No hay citas pendientes de registrar asistencia.");
      return;
    }
    for (const c of r.datos.citas) {
      const texto = [
        `Reserva #${c.reservaId} · ${c.paciente}`,
        `${c.servicio ?? "?"} · ${fechaLarga(c.iniciaEn.slice(0, 10))} · ${horaCorta(c.iniciaEn)}`,
        c.sede ?? "",
      ]
        .filter((l) => l.length > 0)
        .join("\n");
      const teclado = new InlineKeyboard()
        .text("✓ Asistió", `asis:ok:${c.reservaId}`)
        .text("✗ No asistió", `asis:no:${c.reservaId}`);
      await ctx.reply(texto, { reply_markup: teclado });
    }
  });

  bot.callbackQuery(/^asis:(ok|no):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!esAutorizado(deps.cfg, ctx.chat?.id ?? 0)) return;
    const reservaId = Number(ctx.match[2]);
    const asistio = ctx.match[1] === "ok";
    const staff = String(ctx.chat?.id ?? "");

    const r = await deps.cApi.registrarAsistencia(deps.cfg, { reservaId, asistio, por: staff });
    if (!r.ok) {
      await ctx.reply(`No pude registrar la asistencia de la reserva #${reservaId} (¿ya estaba cerrada?).`);
      return;
    }
    await editarOResponder(
      ctx,
      asistio
        ? `Reserva #${reservaId}: asistencia registrada. ✓ (cita atendida)`
        : `Reserva #${reservaId}: marcada como inasistencia. ✗`,
    );
  });
}
