import { Bot, session } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { Config } from "./config.js";
import { logger } from "./logger.js";
import { RateLimiter } from "./ratelimit.js";
import { esAutorizado } from "./auth.js";
import { estadoInicial, type EstadoConversacion } from "./conversation.js";
import { interpretar } from "./nluClient.js";
import type { ResultadoNlu } from "./nluClient.js";
import { ejecutarComando } from "./n8nClient.js";
import { coreApi, type ClienteCoreApi } from "./coreApiClient.js";
import type { ClienteN8n, FlujoDeps, MiContexto } from "./telegram/contexto.js";
import { registrarMenu } from "./telegram/menu.js";
import { registrarFlujoReserva } from "./telegram/flujoReserva.js";
import { registrarFlujoCancelar } from "./telegram/flujoCancelar.js";
import { registrarFlujoPagos } from "./telegram/flujoPagos.js";
import { registrarFlujoHoy } from "./telegram/flujoHoy.js";
import { registrarFlujoHistoria } from "./telegram/flujoHistoria.js";
import { registrarFlujoConsentimiento, medianteConsentimiento } from "./telegram/flujoConsentimiento.js";
import { registrarDispatcher } from "./telegram/dispatcher.js";

// Atajos de "modo paciente" (menú de /start y comandos equivalentes) que un
// chat administrativo NO debe ver ni usar — sí sigue pudiendo escribir en
// lenguaje natural ("agenda a Laura...", "cancela la cita 9", "¿qué tengo
// hoy?"): eso es una herramienta real de personal (comandos.ts ya le da
// alcance distinto vía esAdmin) y bloquearlo rompería esas funciones.
const COMANDOS_PACIENTE = new Set([
  "agendar",
  "cita",
  "citas",
  "miscitas",
  "mis_citas",
  "cancelarcita",
  "cancelar_cita",
  "servicios",
  "precios",
  "info",
]);
const CALLBACKS_PACIENTE_PREFIJOS = ["menu:", "info:", "rsv:", "cxl:"];
const AVISO_SOLO_ADMIN = "Este número es de uso administrativo. Use /hoy, /pagos o /historia <documento>.";

export interface DepsBot {
  /** Evita la llamada a getMe (útil en pruebas). */
  botInfo?: UserFromGetMe;
  /** Cliente NLU inyectable. */
  nlu?: (cfg: Config, mensaje: string) => Promise<ResultadoNlu>;
  /** Cliente del webhook de n8n inyectable. */
  n8n?: ClienteN8n;
  /** Cliente directo a core-api para las operaciones de pago. */
  coreApi?: ClienteCoreApi;
  /** Reloj inyectable para el rate limiter. */
  ahora?: () => number;
}

/**
 * Raíz de composición del bot. Resuelve las dependencias (defaults o mocks de
 * prueba), monta los middlewares transversales (sesión, traza, rate limit) y
 * delega cada área a su módulo en `telegram/`:
 *  - `menu`            — comandos nativos + botones de `/start` e info
 *  - `flujoReserva`    — reservar / reprogramar (callbacks `rsv:*`)
 *  - `flujoCancelar`   — cancelar / "pasar a otro día" (callbacks `cxl:*`)
 *  - `flujoPagos`      — verificación de comprobantes por el staff
 *  - `dispatcher`      — mensajes libres (texto según estado, foto = comprobante)
 */
export function crearBot(cfg: Config, deps: DepsBot = {}): Bot<MiContexto> {
  const bot = new Bot<MiContexto>(cfg.token, deps.botInfo !== undefined ? { botInfo: deps.botInfo } : {});
  const flujoDeps: FlujoDeps = {
    cfg,
    n8n: deps.n8n ?? ejecutarComando,
    nlu: deps.nlu ?? interpretar,
    cApi: deps.coreApi ?? coreApi,
  };
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

  // Un chat administrativo no ve ni usa los atajos "de paciente" (botones
  // del menú normal, /agendar, /miscitas, etc.) — pero el texto libre sigue
  // abierto, porque ahí es donde vive la herramienta real de personal
  // (agendar/cancelar a nombre de alguien, ver la agenda completa).
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined || !esAutorizado(cfg, chatId)) {
      await next();
      return;
    }
    if (ctx.callbackQuery) {
      const data = ctx.callbackQuery.data ?? "";
      if (CALLBACKS_PACIENTE_PREFIJOS.some((prefijo) => data.startsWith(prefijo))) {
        await ctx.answerCallbackQuery();
        return;
      }
      await next();
      return;
    }
    const texto = ctx.message?.text ?? "";
    const comando = texto.startsWith("/") ? (texto.slice(1).split(/[\s@]/)[0] ?? "") : null;
    if (comando !== null && COMANDOS_PACIENTE.has(comando)) {
      await ctx.reply(AVISO_SOLO_ADMIN);
      return;
    }
    await next();
  });

  // Un chat de paciente (no admin) sin el consentimiento de datos ya dado
  // no ve nada más del bot hasta responder el aviso — ver
  // flujoConsentimiento.ts. Va antes de cualquier flujo de paciente.
  bot.use(medianteConsentimiento(cfg));

  registrarMenu(bot, flujoDeps);
  registrarFlujoConsentimiento(bot, flujoDeps);
  registrarFlujoPagos(bot, flujoDeps);
  registrarFlujoHoy(bot, flujoDeps);
  registrarFlujoHistoria(bot, flujoDeps);
  registrarFlujoReserva(bot, flujoDeps);
  registrarFlujoCancelar(bot, flujoDeps);
  registrarDispatcher(bot, flujoDeps);

  bot.catch((err) => {
    logger.error({ err: err.error instanceof Error ? err.error.message : "desconocido" }, "error en bot");
  });

  return bot;
}
