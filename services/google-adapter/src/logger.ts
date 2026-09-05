import { pino, type LoggerOptions } from "pino";
import { loadConfig } from "./config.js";

const cfg = loadConfig();

export function opcionesLog(): LoggerOptions {
  const base: LoggerOptions = {
    level: cfg.LOG_LEVEL,
    // Nunca serializar tokens OAuth ni la cadena de conexión por accidente.
    redact: {
      paths: [
        "access_token",
        "refresh_token",
        "*.access_token",
        "*.refresh_token",
        "databaseUrl",
      ],
      censor: "«oculto»",
    },
  };
  if (!cfg.isProd) {
    base.transport = {
      target: "pino-pretty",
      options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
    };
  }
  return base;
}

export const logger = pino(opcionesLog());
