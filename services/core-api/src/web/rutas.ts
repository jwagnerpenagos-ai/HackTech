import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { ErrorDominio } from "../errores.js";
import { firmarToken, verificarToken, secretoEfimero } from "./token.js";
import { wompiDeConfig } from "./wompi.js";
import * as publico from "./publico.js";
import * as admin from "./admin.js";

/**
 * API que consume el navegador (`apps/web`). Vive bajo `/api/*`, fuera del
 * guard `X-Internal-Key` (ese protege `/comandos` y compañía, para n8n/bot).
 * En desarrollo el proxy de Vite deja navegador y API en el mismo origen.
 */

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;

const PacienteSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  documento: z.string().trim().max(40).nullish(),
  tipoDocumento: z.string().trim().max(40).nullish(),
  fechaNacimiento: z.string().regex(FECHA_RE).nullish(),
  genero: z.string().trim().max(40).nullish(),
  telefono: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().max(160).nullish(),
});

const ReservaSchema = z.object({
  servicio: z.string().trim().min(1).max(80),
  sede: z.string().trim().min(1).max(40),
  fecha: z.string().regex(FECHA_RE),
  hora: z.string().regex(HORA_RE),
  paciente: PacienteSchema,
});

const LoginSchema = z.object({
  usuario: z.string().min(1).max(120),
  clave: z.string().min(1).max(200),
});

export function registrarRutasWeb(app: FastifyInstance, db: Db, cfg: Config): void {
  const secreto = cfg.WEB_SESSION_SECRET ?? secretoEfimero();
  const ttlSeg = cfg.WEB_TOKEN_TTL_MIN * 60;
  const wompi = wompiDeConfig(cfg);

  async function conDominio(reply: FastifyReply, fn: () => Promise<unknown>): Promise<unknown> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ErrorDominio) {
        const codigo = err.codigo === "conflicto" ? "cupo_ocupado" : err.codigo;
        return reply.code(err.status).send({ error: codigo, mensaje: err.message });
      }
      throw err;
    }
  }

  // --- Público -------------------------------------------------------------

  app.get("/api/servicios", async () => ({ servicios: await publico.listarServiciosWeb(db) }));

  app.get("/api/sedes", async () => ({ sedes: await publico.listarSedesWeb(db) }));

  app.get("/api/disponibilidad", async (req, reply) => {
    const q = z
      .object({ servicio: z.string().min(1), sede: z.string().min(1), fecha: z.string().regex(FECHA_RE) })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "parametros_invalidos" });
    return conDominio(reply, async () => ({
      servicio: q.data.servicio,
      sede: q.data.sede,
      fecha: q.data.fecha,
      slots: await publico.disponibilidadWeb(db, {
        slug: q.data.servicio,
        sedeCodigo: q.data.sede,
        fecha: q.data.fecha,
      }),
    }));
  });

  app.post("/api/reservas", async (req, reply) => {
    const body = ReservaSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    const rawKey = req.headers["idempotency-key"];
    const key = (Array.isArray(rawKey) ? rawKey[0] : rawKey)?.trim();
    if (!key || key.length < 8 || key.length > 100) {
      return reply.code(400).send({ error: "idempotency_key_requerida" });
    }
    try {
      const res = await publico.crearReservaWeb(db, wompi, {
        slug: body.data.servicio,
        sedeCodigo: body.data.sede,
        fecha: body.data.fecha,
        hora: body.data.hora,
        paciente: body.data.paciente,
        idempotencyKey: key,
      });
      return await reply.code(201).send({ ...res, nequi: "3113981422" });
    } catch (err) {
      if (err instanceof ErrorDominio) {
        const codigo = err.codigo === "conflicto" ? "cupo_ocupado" : err.codigo;
        return reply.code(err.status).send({ error: codigo, mensaje: err.message });
      }
      throw err;
    }
  });

  // Estado del pago al volver del checkout de la pasarela. `ref` = nuestra
  // referencia; `id` = id de transacción de Wompi (uno de los dos).
  app.get("/api/pagos/estado", async (req, reply) => {
    const q = z
      .object({ ref: z.string().min(1).max(120).optional(), id: z.string().min(1).max(120).optional() })
      .safeParse(req.query);
    if (!q.success || (!q.data.ref && !q.data.id)) {
      return reply.code(400).send({ error: "parametros_invalidos" });
    }
    return conDominio(reply, () =>
      publico.estadoPagoWeb(db, wompi, { referencia: q.data.ref, transaccionId: q.data.id }),
    );
  });

  // --- Admin (sesión de Lina) -------------------------------------------

  app.post("/api/admin/login", async (req, reply) => {
    const b = LoginSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    if (!cfg.WEB_ADMIN_USUARIO || !cfg.WEB_ADMIN_CLAVE) {
      return reply.code(503).send({ error: "panel_deshabilitado" });
    }
    if (b.data.usuario !== cfg.WEB_ADMIN_USUARIO || b.data.clave !== cfg.WEB_ADMIN_CLAVE) {
      return reply.code(401).send({ error: "credenciales_invalidas" });
    }
    return firmarToken(secreto, "admin", ttlSeg);
  });

  const exigeAdmin = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = req.headers.authorization ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (token.length === 0 || verificarToken(secreto, token) === null) {
      await reply.code(401).send({ error: "no_autorizado" });
    }
  };

  app.get("/api/admin/citas", { preHandler: exigeAdmin }, async (req, reply) => {
    const q = z
      .object({ desde: z.string().regex(FECHA_RE).optional(), hasta: z.string().regex(FECHA_RE).optional(), sede: z.string().optional() })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "parametros_invalidos" });
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const desde = q.data.desde ?? hoy;
    const hastaBase = q.data.hasta ? new Date(`${q.data.hasta}T00:00:00-05:00`) : new Date(`${desde}T00:00:00-05:00`);
    if (!q.data.hasta) hastaBase.setDate(hastaBase.getDate() + 7);
    return conDominio(reply, async () => ({
      citas: await admin.listarCitasAdmin(db, {
        desdeIso: `${desde}T00:00:00-05:00`,
        hastaIso: hastaBase.toISOString(),
        sedeNombre: q.data.sede ?? null,
      }),
    }));
  });

  const IdParam = z.object({ id: z.coerce.number().int().positive() });

  app.patch("/api/admin/citas/:id/confirmar", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    return conDominio(reply, () => admin.confirmarCita(db, p.data.id));
  });

  app.patch("/api/admin/citas/:id/cancelar", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = z.object({ motivo: z.string().max(300).optional() }).safeParse(req.body ?? {});
    return conDominio(reply, () =>
      admin.cancelarCita(db, { reservaId: p.data.id, motivo: b.success ? b.data.motivo ?? null : null }),
    );
  });

  app.patch("/api/admin/citas/:id/asistencia", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = z.object({ asistio: z.boolean() }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () => admin.asistenciaCita(db, { reservaId: p.data.id, asistio: b.data.asistio }));
  });
}
