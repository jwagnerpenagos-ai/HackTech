import { Bot, session } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { Config } from "./config.js";
import { logger } from "./logger.js";
import { RateLimiter } from "./ratelimit.js";
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
import { registrarFlujoAsistencia } from "./telegram/flujoAsistencia.js";
import { registrarFlujoHoy } from "./telegram/flujoHoy.js";
import { registrarFlujoHistoria } from "./telegram/flujoHistoria.js";
import { registrarDispatcher } from "./telegram/dispatcher.js";

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

  registrarMenu(bot, flujoDeps);
  registrarFlujoPagos(bot, flujoDeps);
  registrarFlujoAsistencia(bot, flujoDeps);
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
