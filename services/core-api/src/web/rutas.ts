import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { ErrorDominio } from "../errores.js";
import { firmarToken, verificarToken, secretoEfimero } from "./token.js";
import * as publico from "./publico.js";
import * as admin from "./admin.js";
import * as clinico from "./clinico.js";
import * as checkout from "./checkout.js";

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
  codigoReferido: z.string().trim().max(20).nullish(),
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
      const res = await publico.crearReservaWeb(db, {
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

  // --- Checkout de pago del sitio (ver web/checkout.ts) ------------------
  const RefQuery = z.object({ ref: z.string().uuid() });

  app.get("/api/pagos/checkout", async (req, reply) => {
    const q = RefQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "ref_invalido" });
    return conDominio(reply, () => checkout.datosCheckout(db, q.data.ref));
  });

  app.post("/api/pagos/simular", async (req, reply) => {
    const b = z.object({ ref: z.string().uuid() }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () => checkout.simularPago(db, b.data.ref));
  });

  app.get("/api/pagos/estado", async (req, reply) => {
    const q = RefQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "ref_invalido" });
    return conDominio(reply, () => checkout.estadoPagoWeb(db, q.data.ref));
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

  const IdParam = z.object({ id: z.coerce.number().int().positive() });

  app.get("/api/admin/servicios", { preHandler: exigeAdmin }, async () => admin.listarCatalogoAdmin(db));

  app.get("/api/admin/categorias", { preHandler: exigeAdmin }, async () => ({
    categorias: await admin.listarCategoriasAdmin(db),
  }));

  const TarifaInicialSchema = z.object({
    nombre: z.string().trim().min(1).max(120),
    sesionesIncluidas: z.number().int().min(1),
    cupoPersonas: z.number().int().min(1),
    valorTotal: z.number().min(0),
  });

  const CrearServicioSchema = z.object({
    categoriaId: z.number().int().positive(),
    nombre: z.string().trim().min(2).max(160),
    descripcion: z.string().trim().max(2000).nullable().optional(),
    duracionMinMinutos: z.number().int().min(1).max(600),
    duracionMaxMinutos: z.number().int().min(1).max(600),
    bufferPosteriorMinutos: z.number().int().min(0).max(180),
    tarifaInicial: TarifaInicialSchema.nullable().optional(),
  });

  app.post("/api/admin/servicios", { preHandler: exigeAdmin }, async (req, reply) => {
    const b = CrearServicioSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () => admin.crearServicioAdmin(db, b.data));
  });

  const ActualizarServicioSchema = z.object({
    categoriaId: z.number().int().positive().optional(),
    nombre: z.string().trim().min(2).max(160).optional(),
    descripcion: z.string().trim().max(2000).nullable().optional(),
    duracionMinMinutos: z.number().int().min(1).max(600).optional(),
    duracionMaxMinutos: z.number().int().min(1).max(600).optional(),
    bufferPosteriorMinutos: z.number().int().min(0).max(180).optional(),
  });

  app.patch("/api/admin/servicios/:id", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = ActualizarServicioSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, async () => {
      await admin.actualizarServicioAdmin(db, p.data.id, b.data);
      return { ok: true };
    });
  });

  app.delete("/api/admin/servicios/:id", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    return conDominio(reply, async () => {
      await admin.desactivarServicioAdmin(db, p.data.id);
      return { ok: true };
    });
  });

  app.post("/api/admin/servicios/:id/tarifas", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = TarifaInicialSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () => admin.agregarTarifaAdmin(db, p.data.id, b.data));
  });

  const ActualizarTarifaSchema = z.object({
    nombre: z.string().trim().min(1).max(120).optional(),
    valorTotal: z.number().min(0).optional(),
  });

  app.patch("/api/admin/tarifas/:id", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = ActualizarTarifaSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, async () => {
      await admin.actualizarTarifaAdmin(db, p.data.id, b.data);
      return { ok: true };
    });
  });

  app.delete("/api/admin/tarifas/:id", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    return conDominio(reply, async () => {
      await admin.desactivarTarifaAdmin(db, p.data.id);
      return { ok: true };
    });
  });

  app.get("/api/admin/pacientes", { preHandler: exigeAdmin }, async () => ({
    pacientes: await admin.listarPacientesAdmin(db),
  }));

  const ActualizarPacienteSchema = z.object({
    nombre: z.string().trim().min(1).max(160).optional(),
    telefono: z.string().trim().max(40).nullable().optional(),
    email: z.string().trim().max(160).nullable().optional(),
    ciudad: z.string().trim().max(120).nullable().optional(),
    eps: z.string().trim().max(120).nullable().optional(),
    ocupacion: z.string().trim().max(120).nullable().optional(),
    referido: z.string().trim().max(160).nullable().optional(),
    contactoEmergencia: z.string().trim().max(200).nullable().optional(),
  });

  app.patch("/api/admin/pacientes/:id", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = ActualizarPacienteSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () => admin.actualizarPacienteAdmin(db, p.data.id, b.data));
  });

  app.get("/api/admin/indicadores", { preHandler: exigeAdmin }, async () => admin.listarIndicadoresAdmin(db));

  app.get("/api/admin/historial", { preHandler: exigeAdmin }, async () => ({
    eventos: await admin.listarHistorialAdmin(db),
  }));

  app.get("/api/admin/integraciones", { preHandler: exigeAdmin }, async () => ({
    integraciones: await admin.listarIntegracionesAdmin(cfg),
  }));

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

  // --- Historia clínica --------------------------------------------------
  // El "autor" de un registro clínico es siempre la única cuenta del panel.
  const autorClinico = () => cfg.WEB_ADMIN_USUARIO || "panel";

  app.get("/api/admin/catalogos-clinicos", { preHandler: exigeAdmin }, async () =>
    clinico.obtenerCatalogosClinicos(db),
  );

  app.get("/api/admin/pacientes/:id/citas", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    return conDominio(reply, async () => ({ citas: await clinico.listarCitasDePaciente(db, p.data.id) }));
  });

  const AgendarSchema = z.object({
    servicioId: z.number().int().positive(),
    sedeId: z.number().int().positive(),
    iniciaEnIso: z.string().min(1),
  });
  app.post("/api/admin/pacientes/:id/agendar", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = AgendarSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () =>
      clinico.agendarProximaCitaAdmin(db, { pacienteId: p.data.id, ...b.data, creadoPor: autorClinico() }),
    );
  });

  app.get("/api/admin/pacientes/:id/antecedentes", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    return conDominio(reply, async () => ({
      antecedentes: await clinico.listarAntecedentesPaciente(db, p.data.id),
    }));
  });

  const AntecedentesSchema = z.object({
    items: z.array(z.object({ antecedenteId: z.number().int().positive(), detalle: z.string().max(300).nullish() })),
  });
  app.put("/api/admin/pacientes/:id/antecedentes", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = AntecedentesSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, async () => {
      await clinico.actualizarAntecedentesPaciente(db, p.data.id, b.data.items, autorClinico());
      return { ok: true };
    });
  });

  app.get("/api/admin/pacientes/:id/anamnesis", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    return conDominio(reply, async () => ({ anamnesis: await clinico.listarAnamnesis(db, p.data.id) }));
  });

  const AnamnesisSchema = z.object({
    reservaId: z.number().int().positive().nullish(),
    motivoConsultaId: z.number().int().positive().nullish(),
    motivoDetalle: z.string().max(500).nullish(),
    descripcionPaciente: z.string().max(2000).nullish(),
    enfermedadActual: z.string().max(2000).nullish(),
    inicioSintomas: z.string().regex(FECHA_RE).nullish(),
    causaAparente: z.string().max(500).nullish(),
    tratamientosPrevios: z.string().max(2000).nullish(),
    respuestaTratamientos: z.string().max(2000).nullish(),
    objetivosTerapeuticos: z.string().max(2000).nullish(),
    anulaAId: z.number().int().positive().nullish(),
    motivoCorreccion: z.string().max(500).nullish(),
  });
  app.post("/api/admin/pacientes/:id/anamnesis", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = AnamnesisSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () => clinico.crearAnamnesis(db, p.data.id, b.data, autorClinico()));
  });

  app.get("/api/admin/pacientes/:id/signos-vitales", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    return conDominio(reply, async () => ({ signosVitales: await clinico.listarSignosVitales(db, p.data.id) }));
  });

  const SignosVitalesSchema = z.object({
    reservaId: z.number().int().positive().nullish(),
    sistolica: z.number().int().min(40).max(300).nullish(),
    diastolica: z.number().int().min(20).max(200).nullish(),
    frecuenciaCardiaca: z.number().int().min(20).max(250).nullish(),
    frecuenciaRespiratoria: z.number().int().min(4).max(80).nullish(),
    saturacionO2: z.number().int().min(50).max(100).nullish(),
    pesoKg: z.number().min(2).max(400).nullish(),
    tallaCm: z.number().min(30).max(260).nullish(),
  });
  app.post("/api/admin/pacientes/:id/signos-vitales", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = SignosVitalesSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () => clinico.crearSignosVitales(db, p.data.id, b.data, autorClinico()));
  });

  app.get("/api/admin/pacientes/:id/dolor", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    return conDominio(reply, async () => ({ evaluaciones: await clinico.listarEvaluacionesDolor(db, p.data.id) }));
  });

  const EvaluacionDolorSchema = z.object({
    reservaId: z.number().int().positive().nullish(),
    intensidad: z.number().int().min(0).max(10),
    comportamiento: z
      .enum(["continuo", "intermitente", "aumenta_con_movimiento", "aumenta_en_reposo", "nocturno"])
      .nullish(),
    localizacion: z.string().max(300).nullish(),
    zonaId: z.number().int().positive().nullish(),
    tiposDolorIds: z.array(z.number().int().positive()).optional(),
  });
  app.post("/api/admin/pacientes/:id/dolor", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = EvaluacionDolorSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () => clinico.crearEvaluacionDolor(db, p.data.id, b.data, autorClinico()));
  });

  app.get("/api/admin/pacientes/:id/evolucion", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    return conDominio(reply, async () => ({ evoluciones: await clinico.listarEvoluciones(db, p.data.id) }));
  });

  const EvolucionSchema = z.object({
    reservaId: z.number().int().positive(),
    subjetivo: z.string().max(2000).nullish(),
    objetivo: z.string().max(2000).nullish(),
    analisis: z.string().max(2000).nullish(),
    plan: z.string().max(2000).nullish(),
    tecnicasAplicadas: z.string().max(1000).nullish(),
    anulaAId: z.number().int().positive().nullish(),
    motivoCorreccion: z.string().max(500).nullish(),
  });
  app.post("/api/admin/pacientes/:id/evolucion", { preHandler: exigeAdmin }, async (req, reply) => {
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "id_invalido" });
    const b = EvolucionSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "cuerpo_invalido" });
    return conDominio(reply, () => clinico.crearEvolucion(db, p.data.id, b.data, autorClinico()));
  });
}
