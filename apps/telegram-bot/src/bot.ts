import { Bot, type Context, InlineKeyboard, session, type SessionFlavor } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { Config } from "./config.js";
import { logger } from "./logger.js";
import { esAutorizado, nivelDeAcceso } from "./auth.js";
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
} from "./commands.js";
import { RateLimiter } from "./ratelimit.js";
import {
  estadoInicial,
  iniciarAgendamiento,
  pedirDatosDeRegistro,
  procesarTexto,
  resolverConfirmacion,
  resolverOfertaCalendar,
  type Accion,
  type EstadoConversacion,
} from "./conversation.js";
import { interpretar } from "./nluClient.js";
import type { ResultadoNlu } from "./nluClient.js";
import { ejecutarComando } from "./n8nClient.js";
import type { ResultadoEjecucion } from "./n8nClient.js";
import { formatearResultado } from "./resultados.js";

type MiContexto = Context & SessionFlavor<EstadoConversacion>;

type ClienteN8n = (
  cfg: Config,
  intencion: string,
  entidades: Record<string, string | number>,
  creadoPor: string,
) => Promise<ResultadoEjecucion>;

export interface DepsBot {
  /** Evita la llamada a getMe (útil en pruebas). */
  botInfo?: UserFromGetMe;
  /** Cliente NLU inyectable. */
  nlu?: (cfg: Config, mensaje: string) => Promise<ResultadoNlu>;
  /** Cliente del webhook de n8n inyectable. */
  n8n?: ClienteN8n;
  /** Reloj inyectable para el rate limiter. */
  ahora?: () => number;
}

function textoDeAccion(accion: Accion): string {
  return accion.tipo === "consulta_y_retomar" ? accion.rePrompt : accion.texto;
}

/** Arma un teclado inline de 2 botones por fila. */
function tecladoDe(acciones: readonly { texto: string; data: string }[]): InlineKeyboard {
  const teclado = new InlineKeyboard();
  acciones.forEach((accion, i) => {
    teclado.text(accion.texto, accion.data);
    if (i % 2 === 1) teclado.row();
  });
  return teclado;
}

const INFO_TEXTOS: Record<string, string> = {
  "info:horarios": INFO_HORARIOS,
  "info:quienes": INFO_QUIENES,
  "info:pago": INFO_PAGO,
  "info:cita": INFO_CITA,
};

/**
 * Cuando la acción es "ejecutar", el texto de `conversation.ts` es solo un
 * resumen para logs: la respuesta real al usuario sale de llamar a n8n (que
 * reenvía a core-api) y formatear lo que responda. Cualquier otra acción se
 * responde con su propio texto, sin tocar la red.
 */
async function responderAccion(
  ctx: MiContexto,
  cfg: Config,
  n8n: ClienteN8n,
  chatId: number,
  accion: Accion,
): Promise<void> {
  // El usuario preguntó algo de solo lectura en medio de un flujo: se resuelve
  // la consulta y se le recuerda el dato que faltaba (la sesión sigue en el flujo).
  if (accion.tipo === "consulta_y_retomar") {
    const resultado = await n8n(cfg, accion.intencion, accion.entidades, String(chatId));
    await ctx.reply(formatearResultado(accion.intencion, resultado));
    if (accion.rePrompt.length > 0) await ctx.reply(accion.rePrompt);
    return;
  }

  if (accion.tipo !== "ejecutar") {
    await ctx.reply(textoDeAccion(accion));
    return;
  }
  logger.info(
    { chatId, intencion: accion.intencion, entidades: Object.keys(accion.entidades) },
    "accion a ejecutar",
  );
  const resultado = await n8n(cfg, accion.intencion, accion.entidades, String(chatId));

  // core-api pide datos que faltan antes de poder reservar (nombre/teléfono en
  // la primera cita, o algún campo que el NLU no capturó). En vez de un mensaje
  // final, se reentra al bucle de "pedir_dato" para completarlos y reintentar.
  if (
    accion.intencion === "crear_sesion" &&
    resultado.tipo === "error_negocio" &&
    (resultado.codigo === "registro_requerido" || resultado.codigo === "datos_incompletos")
  ) {
    const camposFaltantes = camposFaltantesDeRegistro(resultado.datos);
    if (camposFaltantes !== null && camposFaltantes.length > 0) {
      const r = pedirDatosDeRegistro(accion.entidades, camposFaltantes);
      ctx.session = r.estado;
      await ctx.reply(textoDeAccion(r.accion));
      return;
    }
  }

  await ctx.reply(formatearResultado(accion.intencion, resultado));

  // Fase 3, opcional: core-api solo manda `pacienteId` cuando quien reservó
  // fue el propio paciente por chat (no cuando Lina/admin reserva por otro)
  // — ver comandos.ts. Ahí sí tiene sentido ofrecerle a ESTE chat sincronizar
  // con SU Calendar personal.
  if (accion.intencion === "crear_sesion" && resultado.tipo === "ok") {
    const oferta = datosOfertaCalendar(resultado.datos);
    if (oferta) {
      ctx.session = { ...ctx.session, ofertaCalendarPendiente: oferta };
      await ctx.reply("¿Desea que agregue esta cita a su Google Calendar? (sí/no)");
    }
  }
}

/** `resultado.datos` es `unknown` (viene de un JSON externo): se valida antes de usarlo. */
function camposFaltantesDeRegistro(datos: unknown): string[] | null {
  if (typeof datos !== "object" || datos === null || !("camposFaltantes" in datos)) return null;
  const campos = datos.camposFaltantes;
  if (!Array.isArray(campos) || !campos.every((c) => typeof c === "string")) return null;
  return campos;
}

function datosOfertaCalendar(datos: unknown): { reservaId: number; pacienteId: number } | null {
  if (typeof datos !== "object" || datos === null || !("reservaId" in datos) || !("pacienteId" in datos)) {
    return null;
  }
  const { reservaId, pacienteId } = datos;
  if (typeof reservaId !== "number" || typeof pacienteId !== "number") return null;
  return { reservaId, pacienteId };
}

function urlAutorizacionCalendar(cfg: Config, oferta: { reservaId: number; pacienteId: number }): string {
  const url = new URL("/oauth/paciente/iniciar", cfg.GOOGLE_ADAPTER_URL);
  url.searchParams.set("reserva_id", String(oferta.reservaId));
  url.searchParams.set("paciente_id", String(oferta.pacienteId));
  return url.toString();
}

function interpretarSiNo(texto: string): "si" | "no" | null {
  const t = texto.trim().toLowerCase();
  if (["si", "sí", "s", "yes", "ok", "dale", "confirmo"].includes(t)) return "si";
  if (["no", "n", "cancelar", "cancela"].includes(t)) return "no";
  return null;
}

export function crearBot(cfg: Config, deps: DepsBot = {}): Bot<MiContexto> {
  const bot = new Bot<MiContexto>(
    cfg.token,
    deps.botInfo !== undefined ? { botInfo: deps.botInfo } : {},
  );
  const nlu = deps.nlu ?? interpretar;
  const n8n = deps.n8n ?? ejecutarComando;
  const limiter = new RateLimiter(cfg.BOT_RATE_LIMIT_POR_MINUTO, deps.ahora);

  bot.use(session<EstadoConversacion, MiContexto>({ initial: estadoInicial }));

  // Traza mínima de cada update entrante (sin el contenido del mensaje).
  bot.use(async (ctx, next) => {
    const texto = ctx.message?.text;
    logger.info(
      {
        chatId: ctx.chat?.id,
        tipo: ctx.message !== undefined ? "message" : ctx.callbackQuery !== undefined ? "callback" : "otro",
        esComando: texto?.startsWith("/") ?? false,
        largo: texto?.length ?? 0,
      },
      "update recibido",
    );
    await next();
  });

  // Rate limit por chat.
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId !== undefined && !limiter.permitir(chatId)) {
      logger.warn({ chatId }, "rate limit alcanzado");
      return;
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    ctx.session = estadoInicial();
    await ctx.reply(inicio(nivelDeAcceso(cfg, ctx.chat.id)), { reply_markup: tecladoDe(MENU_ACCIONES) });
  });
  bot.command("help", async (ctx) => {
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

  // Botones del menú de /start.
  bot.callbackQuery("menu:catalogo", async (ctx) => {
    await ctx.answerCallbackQuery();
    const resultado = await n8n(cfg, "consultar_catalogo", {}, String(ctx.chat?.id ?? ""));
    await ctx.reply(formatearResultado("consultar_catalogo", resultado));
  });
  bot.callbackQuery("menu:agenda", async (ctx) => {
    await ctx.answerCallbackQuery();
    const resultado = await n8n(cfg, "consultar_agenda", {}, String(ctx.chat?.id ?? ""));
    await ctx.reply(formatearResultado("consultar_agenda", resultado));
  });
  bot.callbackQuery("menu:agendar", async (ctx) => {
    await ctx.answerCallbackQuery();
    const r = iniciarAgendamiento();
    ctx.session = r.estado;
    await ctx.reply(textoDeAccion(r.accion));
  });
  bot.callbackQuery("menu:info", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("¿Sobre qué desea información?", { reply_markup: tecladoDe(INFO_ACCIONES) });
  });
  bot.callbackQuery(/^info:(horarios|quienes|pago|cita)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const texto = INFO_TEXTOS[ctx.callbackQuery.data];
    if (texto !== undefined) await ctx.reply(texto);
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;

    // ¿Estamos esperando el sí/no de "¿agrego esto a tu Calendar?" (fase 3)?
    if (ctx.session.ofertaCalendarPendiente) {
      const sn = interpretarSiNo(ctx.message.text);
      if (sn === null) {
        await ctx.reply('Por favor responda "sí" o "no".');
        return;
      }
      const r = resolverOfertaCalendar(ctx.session, sn);
      ctx.session = r.estado;
      if (r.tipo === "aceptado") {
        await ctx.reply(`Abra este enlace para autorizar el acceso, con su propia cuenta de Google:\n${urlAutorizacionCalendar(cfg, r)}`);
      } else {
        await ctx.reply("Listo, no la agrego al calendario.");
      }
      return;
    }

    // ¿Estamos esperando un sí/no de confirmación?
    if (ctx.session.esperandoConfirmacion) {
      const sn = interpretarSiNo(ctx.message.text);
      if (sn === null) {
        await ctx.reply('Responda "sí" o "no" para confirmar o cancelar.');
        return;
      }
      const r = resolverConfirmacion(ctx.session, sn);
      ctx.session = r.estado;
      await responderAccion(ctx, cfg, n8n, chatId, r.accion);
      return;
    }

    const r = await procesarTexto(cfg, ctx.session, ctx.message.text, nlu, esAutorizado(cfg, chatId));
    ctx.session = r.estado;
    await responderAccion(ctx, cfg, n8n, chatId, r.accion);
  });

  // Cualquier otro tipo de mensaje (fotos, stickers, etc.): respuesta breve.
  bot.on("message", async (ctx) => {
    await ctx.reply("Por ahora solo puedo leer mensajes de texto. Use /help.");
  });

  bot.catch((err) => {
    logger.error({ err: err.error instanceof Error ? err.error.message : "desconocido" }, "error en bot");
  });

  return bot;
}
