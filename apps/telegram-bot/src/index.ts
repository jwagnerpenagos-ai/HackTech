import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { crearBot } from "./bot.js";

function main(): void {
  const cfg = loadConfig();
  const bot = crearBot(cfg);

  if (cfg.allowedChatIds.size === 0) {
    logger.warn(
      "TELEGRAM_ALLOWED_CHAT_IDS está vacío: nadie tiene acceso administrativo (agenda completa, bloquear horario, etc.). Configúralo con tu /id.",
    );
  }

  for (const señal of ["SIGINT", "SIGTERM"] as const) {
    process.once(señal, () => {
      logger.info(`${señal} recibido, deteniendo el bot…`);
      void bot.stop();
    });
  }

  // Menú nativo de Telegram (botón "/"). Solo lo que le sirve al paciente;
  // /id y /ping siguen funcionando pero no se listan.
  void bot.api
    .setMyCommands([
      { command: "start", description: "Menú principal" },
      { command: "agendar", description: "Pedir una cita" },
      { command: "miscitas", description: "Ver mis citas" },
      { command: "cancelarcita", description: "Cancelar una cita" },
      { command: "servicios", description: "Servicios y precios" },
      { command: "info", description: "Información del consultorio" },
      { command: "cancelar", description: "Cancelar lo que estemos haciendo" },
      { command: "ayuda", description: "Cómo funciona" },
    ])
    .catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : "desconocido" },
        "no se pudo registrar el menú de comandos",
      );
    });

  logger.info(
    { entorno: cfg.TELEGRAM_ENTORNO, autorizados: cfg.allowedChatIds.size },
    "arrancando bot en long polling",
  );

  // allowed_updates acota lo que Telegram entrega: nada de canal ni ediciones.
  void bot.start({
    allowed_updates: ["message", "callback_query"],
    onStart: (info) => {
      logger.info({ usuario: info.username }, "bot conectado");
    },
  });
}

main();
