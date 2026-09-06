import type { Bot } from "grammy";
import { nivelDeAcceso } from "../auth.js";
import {
  AYUDA,
  CANCELADO,
  INFO_ACCIONES,
  INFO_CITA,
  INFO_HORARIOS,
  INFO_PAGO,
  INFO_QUIENES,
  MENU_ACCIONES,
  PONG,
  inicio,
  miId,
} from "../commands.js";
import { estadoInicial } from "../conversation.js";
import { formatearResultado } from "../resultados.js";
import { InlineKeyboard } from "grammy";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import { citasCancelablesDeResultado } from "./parsers.js";
import { tecladoDe } from "./teclados.js";
import { iniciarReservaGuiada } from "./flujoReserva.js";
import { iniciarCancelarGuiado } from "./flujoCancelar.js";

const INFO_TEXTOS: Record<string, string> = {
  "info:horarios": INFO_HORARIOS,
  "info:quienes": INFO_QUIENES,
  "info:pago": INFO_PAGO,
  "info:cita": INFO_CITA,
};

/**
 * Menú principal: comandos nativos de Telegram y los botones equivalentes de
 * `/start` (`menu:*`) y del submenú de información (`info:*`). Las tres acciones
 * de consulta (`verCatalogo` / `verMisCitas` / `verInfo`) las comparten comando
 * y botón, por eso viven como closures aquí.
 */
export function registrarMenu(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  const { cfg, n8n } = deps;

  const verCatalogo = async (ctx: MiContexto): Promise<void> => {
    await ctx.reply(
      formatearResultado("consultar_catalogo", await n8n(cfg, "consultar_catalogo", {}, String(ctx.chat?.id ?? ""))),
    );
  };
  const verMisCitas = async (ctx: MiContexto): Promise<void> => {
    const resultado = await n8n(cfg, "consultar_agenda", {}, String(ctx.chat?.id ?? ""));
    const cancelables = citasCancelablesDeResultado(resultado);
    await ctx.reply(formatearResultado("consultar_agenda", resultado), {
      ...(cancelables.length > 0
        ? { reply_markup: new InlineKeyboard().text("✕ Cancelar una cita", "cxl:start") }
        : {}),
    });
  };
  const verInfo = async (ctx: MiContexto): Promise<void> => {
    await ctx.reply("¿Sobre qué desea información?", { reply_markup: tecladoDe(INFO_ACCIONES) });
  };

  bot.command("start", async (ctx) => {
    ctx.session = estadoInicial();
    await ctx.reply(inicio(nivelDeAcceso(cfg, ctx.chat.id)), { reply_markup: tecladoDe(MENU_ACCIONES) });
  });
  bot.command(["agendar", "cita", "citas"], async (ctx) => {
    await iniciarReservaGuiada(ctx, deps, {});
  });
  bot.command(["miscitas", "mis_citas"], verMisCitas);
  bot.command(["cancelarcita", "cancelar_cita"], async (ctx) => {
    await iniciarCancelarGuiado(ctx, deps);
  });
  bot.command(["servicios", "precios"], verCatalogo);
  bot.command("info", verInfo);
  bot.command(["help", "ayuda"], async (ctx) => {
    await ctx.reply(AYUDA);
  });
  bot.command("cancelar", async (ctx) => {
    ctx.session = estadoInicial();
    await ctx.reply(CANCELADO);
  });
  bot.command("id", async (ctx) => {
    await ctx.reply(miId(ctx.chat.id));
  });
  bot.command("ping", async (ctx) => {
    await ctx.reply(PONG);
  });

  bot.callbackQuery("menu:catalogo", async (ctx) => {
    await ctx.answerCallbackQuery();
    await verCatalogo(ctx);
  });
  bot.callbackQuery("menu:agenda", async (ctx) => {
    await ctx.answerCallbackQuery();
    await verMisCitas(ctx);
  });
  bot.callbackQuery("menu:agendar", async (ctx) => {
    await ctx.answerCallbackQuery();
    await iniciarReservaGuiada(ctx, deps, {});
  });
  bot.callbackQuery("menu:info", async (ctx) => {
    await ctx.answerCallbackQuery();
    await verInfo(ctx);
  });
  bot.callbackQuery(/^info:(horarios|quienes|pago|cita)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const texto = INFO_TEXTOS[ctx.callbackQuery.data];
    if (texto !== undefined) await ctx.reply(texto);
  });
}
