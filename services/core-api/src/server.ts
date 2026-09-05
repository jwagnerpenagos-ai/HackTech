import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { loadConfig, type Config } from "./config.js";
import { opcionesLog } from "./logger.js";
import { construirDb, type Db } from "./db.js";
import { ComandoSchema } from "./contract/comando.js";
import { ejecutarComando } from "./comandos.js";

/** Comparación de tiempo constante entre el header y el secreto esperado. */
function claveValida(recibida: string | undefined, esperada: string): boolean {
  if (typeof recibida !== "string" || recibida.length === 0) return false;
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * `db` es inyectable para pruebas (una base falsa en memoria); en
 * producción `index.ts` la deja en su valor por defecto, que abre el pool
 * real de PostgreSQL.
 */
export function construirServidor(cfg: Config = loadConfig(), db: Db = construirDb(cfg)): FastifyInstance {
  const app: FastifyInstance = Fastify({
    logger: opcionesLog(),
    bodyLimit: cfg.CORE_API_MAX_BODY_BYTES,
    trustProxy: false,
  });

  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health" || req.url === "/") return;
    if (!cfg.INTERNAL_API_KEY) return; // solo permitido fuera de producción
    const header = req.headers["x-internal-key"];
    const valor = Array.isArray(header) ? header[0] : header;
    if (!claveValida(valor, cfg.INTERNAL_API_KEY)) {
      await reply.code(401).send({ error: "no_autorizado" });
    }
  });

  void app.register(rateLimit, {
    max: cfg.CORE_API_RATE_LIMIT_MAX,
    timeWindow: cfg.CORE_API_RATE_LIMIT_WINDOW,
  });

  app.get("/health", async (_req, reply) => {
    try {
      await db.query("SELECT 1");
      return { servicio: "core-api", ok: true, db: { ok: true } };
    } catch (err) {
      app.log.error({ err: err instanceof Error ? err.message : String(err) }, "health: base no responde");
      return reply.code(503).send({ servicio: "core-api", ok: false, db: { ok: false } });
    }
  });

  // Único punto de ejecución de intenciones ya interpretadas y (si eran
  // sensibles) confirmadas. n8n llama aquí; el modelo de lenguaje nunca.
  app.post("/comandos", async (req, reply) => {
    const cuerpo = ComandoSchema.safeParse(req.body);
    if (!cuerpo.success) {
      return reply.code(422).send({ ok: false, error: "cuerpo_invalido" });
    }

    const chatId = Number(cuerpo.data.creado_por);
    const esAdmin = Number.isSafeInteger(chatId) && cfg.adminChatIds.has(chatId);
    const resultado = await ejecutarComando(db, cuerpo.data.intencion, cuerpo.data.entidades, {
      creadoPor: cuerpo.data.creado_por ?? null,
      esAdmin,
    });

    req.log.info(
      { intencion: cuerpo.data.intencion, ok: resultado.ok, codigo_error: resultado.error?.codigo },
      "comando ejecutado",
    );

    if (!resultado.ok) {
      // `ok: false` explícito: n8n reenvía este cuerpo tal cual al bot, que
      // decide qué mostrar según ese campo, no según el status HTTP.
      return reply.code(resultado.error?.status ?? 500).send({
        ok: false,
        error: resultado.error?.codigo ?? "error_interno",
        mensaje: resultado.error?.mensaje,
        datos: resultado.datos,
      });
    }
    return reply.code(200).send({ ok: true, datos: resultado.datos });
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    req.log.error({ err: err.message, code: err.code }, "error no controlado");
    const status =
      typeof err.statusCode === "number" && err.statusCode >= 400 ? err.statusCode : 500;
    void reply.code(status).send({ error: status === 500 ? "error_interno" : "solicitud_invalida" });
  });

  app.setNotFoundHandler((_req, reply) => {
    void reply.code(404).send({ error: "no_encontrado" });
  });

  return app;
}
