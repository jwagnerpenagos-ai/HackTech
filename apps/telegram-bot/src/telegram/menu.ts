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
import { fechaLarga, formatearResultado, horaCorta } from "../resultados.js";
import { InlineKeyboard } from "grammy";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import { citasCancelablesDeResultado } from "./parsers.js";
import { formatearMonto, LLAVE_NEQUI } from "./formato.js";
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
    // Deep-link desde el sitio web: /start pago_<uuid de la reserva>. El
    // paciente viene a enviar el comprobante de una cita reservada en la web.
    const m = /^pago_([0-9a-fA-F-]{36})$/.exec(ctx.match);
    if (m?.[1]) {
      const r = await deps.cApi.iniciarPagoWeb(deps.cfg, { reservaUuid: m[1], chatId: ctx.chat.id });
      if (!r.ok) {
        await ctx.reply("No pude encontrar esa reserva. Si el enlace es viejo, vuelva a reservar en el sitio.");
        return;
      }
      const d = r.datos;
      if (d.estado !== "pendiente_pago" || d.compraId === null || d.monto === null) {
        const txt =
          d.estado === "confirmada"
            ? "Esa cita ya está confirmada. ✅"
            : `Esa reserva está en estado "${d.estado}", no tiene un pago pendiente.`;
        ctx.session = estadoInicial();
        await ctx.reply(txt);
        return;
      }
      ctx.session = {
        ...estadoInicial(),
        esperandoComprobante: { reservaId: d.reservaId, compraId: d.compraId, monto: d.monto },
      };
      await ctx.reply(
        [
          `Reserva recibida: ${d.servicio ?? "su cita"} — ${fechaLarga(d.iniciaEn.slice(0, 10))} · ${horaCorta(d.iniciaEn)}.`,
          "",
          `Para confirmarla, transfiera ${formatearMonto(d.monto)} a la Llave Nequi ${LLAVE_NEQUI}`,
          "y envíeme aquí la foto del comprobante.",
        ].join("\n"),
      );
      return;
    }

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
