import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { construirServidor } from "./server.js";
import { cerrarDb, construirDb } from "./db.js";

/** Cada 5 min libera los cupos de reservas que nunca se pagaron. */
const INTERVALO_EXPIRACION_MS = 5 * 60_000;

async function main(): Promise<void> {
  const cfg = loadConfig();
  const db = construirDb(cfg);
  const app = construirServidor(cfg, db);

  const expiracion = setInterval(() => {
    void db
      .query<{ expirar_reservas_vencidas: number }>("SELECT agenda.expirar_reservas_vencidas()")
      .then((r) => {
        const n = r.rows[0]?.expirar_reservas_vencidas ?? 0;
        if (n > 0) logger.info({ liberadas: n }, "reservas expiradas por falta de pago");
      })
      .catch((err: unknown) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, "no se pudo correr la expiración");
      });
  }, INTERVALO_EXPIRACION_MS);
  expiracion.unref();

  if (!cfg.INTERNAL_API_KEY) {
    logger.warn(
      "INTERNAL_API_KEY no está definido: /comandos queda SIN autenticación. Solo aceptable en desarrollo local.",
    );
  }

  await app.listen({ port: cfg.CORE_API_PORT, host: cfg.CORE_API_HOST });
  logger.info(`core-api escuchando en http://${cfg.CORE_API_HOST}:${cfg.CORE_API_PORT}`);

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
