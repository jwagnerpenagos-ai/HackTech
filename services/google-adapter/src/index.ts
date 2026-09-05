import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { construirDb, cerrarDb } from "./db.js";
import { construirServidor } from "./server.js";
import { construirOAuth2Client, construirGmailClient, construirCalendarClient } from "./googleClients.js";
import { procesarPendientes } from "./consumer.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const db = construirDb(cfg);
  const app = construirServidor(db, cfg);

  await app.listen({ port: cfg.GOOGLE_ADAPTER_PORT, host: cfg.GOOGLE_ADAPTER_HOST });
  logger.info(`google-adapter escuchando en http://${cfg.GOOGLE_ADAPTER_HOST}:${cfg.GOOGLE_ADAPTER_PORT}`);

  let detener = false;

  if (!cfg.GOOGLE_CLIENT_ID || !cfg.GOOGLE_CLIENT_SECRET || !cfg.GOOGLE_REFRESH_TOKEN) {
    logger.warn(
      "Faltan credenciales de Google (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN): el consumidor de integracion.outbox queda apagado. Corré 'npm run setup-oauth' — ver README.md.",
    );
  } else {
    const auth = construirOAuth2Client(cfg, cfg.GOOGLE_REFRESH_TOKEN);
    const clientes = { gmail: construirGmailClient(auth), calendar: construirCalendarClient(auth) };

    let enCurso = false;
    const tick = (): void => {
      if (enCurso || detener) return;
      enCurso = true;
      procesarPendientes(db, clientes, cfg.OUTBOX_LOTE, cfg.TIMEZONE)
        .then((r) => {
          if (r.tomados > 0) {
            logger.info(r, "lote de outbox procesado");
          }
        })
        .catch((err: unknown) => {
          logger.error({ err: err instanceof Error ? err.message : String(err) }, "fallo procesando el outbox");
        })
        .finally(() => {
          enCurso = false;
        });
    };
    const intervalo = setInterval(tick, cfg.OUTBOX_POLL_INTERVAL_MS);
    tick();
    logger.info(`consumidor de integracion.outbox activo cada ${cfg.OUTBOX_POLL_INTERVAL_MS}ms`);

    for (const señal of ["SIGINT", "SIGTERM"] as const) {
      process.once(señal, () => {
        detener = true;
        clearInterval(intervalo);
      });
    }
  }

  for (const señal of ["SIGINT", "SIGTERM"] as const) {
    process.once(señal, () => {
      logger.info(`${señal} recibido, cerrando…`);
      app
        .close()
        .then(() => cerrarDb())
        .then(
          () => process.exit(0),
          () => process.exit(1),
        );
    });
  }
}

main().catch((err: unknown) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "no se pudo arrancar");
  process.exit(1);
});
