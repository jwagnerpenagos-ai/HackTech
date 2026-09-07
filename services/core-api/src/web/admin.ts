import type { Db } from "../db.js";
import type { Config } from "../config.js";
import { ErrorDominio, normalizarErrorDb } from "../errores.js";
import * as agenda from "../dominio/agenda.js";
import * as asistencia from "../dominio/asistencia.js";
import * as integraciones from "../dominio/integraciones.js";

/**
 * Lógica del panel de Lina. La autenticación (token) se resuelve en las
 * rutas; acá solo van las operaciones ya autorizadas.
 */

export interface CitaAdmin {
  reservaId: number;
  pacienteId: number | null;
  estado: string;
  iniciaEn: string;
  terminaEn: string;
  servicio: string | null;
  sede: string;
  paciente: string | null;
  telefono: string | null;
  canal: string;
}

export async function listarCitasAdmin(
  db: Db,
  opts: { desdeIso: string; hastaIso: string; sedeNombre?: string | null },
): Promise<CitaAdmin[]> {
  const r = await db.query<{
    reserva_id: number | string;
    paciente_id: number | string | null;
    estado: string;
    inicia_en: string;
    termina_en: string;
    servicio_nombre: string | null;
    sede_nombre: string;
    paciente_nombre: string | null;
    paciente_telefono: string | null;
    canal_origen: string;
  }>(
    `SELECT reserva_id, paciente_id, estado, inicia_en, termina_en, servicio_nombre, sede_nombre,
            paciente_nombre, paciente_telefono, canal_origen
       FROM agenda.v_cita
      WHERE inicia_en >= $1 AND inicia_en < $2
        AND ($3::text IS NULL OR sede_nombre ILIKE $3)
      ORDER BY inicia_en`,
    [opts.desdeIso, opts.hastaIso, opts.sedeNombre ? `%${opts.sedeNombre}%` : null],
  );
  return r.rows.map((f) => ({
    reservaId: Number(f.reserva_id),
    pacienteId: f.paciente_id !== null ? Number(f.paciente_id) : null,
    estado: f.estado,
    iniciaEn: f.inicia_en,
    terminaEn: f.termina_en,
    servicio: f.servicio_nombre,
    sede: f.sede_nombre,
    paciente: f.paciente_nombre,
    telefono: f.paciente_telefono,
    canal: f.canal_origen,
  }));
}

/** "Confirmar" desde el panel = Lina dio el pago por bueno. */
export async function confirmarCita(db: Db, reservaId: number): Promise<{ reservaId: number; estado: string }> {
  return db.tx(async (tx) => {
    const upd = await tx.query<{ id: number }>(
      `UPDATE agenda.reserva
          SET estado = 'confirmada', reserva_expira_en = NULL
        WHERE id = $1 AND tipo = 'cita' AND estado IN ('pendiente_pago', 'propuesta')
      RETURNING id`,
      [reservaId],
    );
    if (upd.rows.length === 0) {
      throw new ErrorDominio("La cita no existe o no está pendiente de confirmación.", "no_encontrado", 404);
    }
    await tx.query(
      `UPDATE comercial.compra SET estado = 'activa'
        WHERE id IN (SELECT compra_id FROM agenda.reserva_participante WHERE reserva_id = $1 AND compra_id IS NOT NULL)
          AND estado = 'pendiente_pago'`,
      [reservaId],
    );
    await integraciones.sincronizarEstadoReservaEnSheet(tx, reservaId, "confirmada");
    return { reservaId, estado: "confirmada" };
  });
}

export async function cancelarCita(
  db: Db,
  opts: { reservaId: number; motivo?: string | null },
): Promise<{ reservaId: number; estado: string }> {
  const motivo = opts.motivo && opts.motivo.trim().length > 0 ? opts.motivo : "Cancelada desde el panel";
  const r = await agenda.cancelarSesion(db, {
    reservaId: opts.reservaId,
    motivo,
    por: "panel",
  });
  return { reservaId: opts.reservaId, estado: r.estado };
}

export async function asistenciaCita(
  db: Db,
  opts: { reservaId: number; asistio: boolean },
): Promise<{ reservaId: number; estado: string }> {
  const r = await asistencia.registrarAsistencia(db, {
    reservaId: opts.reservaId,
    asistio: opts.asistio,
    por: "panel",
  });
  return { reservaId: r.reservaId, estado: r.estado };
}

// --- Catálogo (servicios y tarifas), para el panel ------------------------

export interface OpcionTarifaAdmin {
  id: number;
  label: string;
  precio: number;
  porSesion: number | null;
}

export interface ServicioCatalogoAdmin {
  id: number;
  slug: string;
  nombre: string;
  duracion: string;
  duracionMin: number;
  duracionMaxMin: number;
  bufferPosteriorMinutos: number;
  descripcion: string | null;
  opciones: OpcionTarifaAdmin[];
  reservableIndividualmente: boolean;
}

export interface CategoriaCatalogoAdmin {
  id: number;
  nombre: string;
  servicios: ServicioCatalogoAdmin[];
}

function slugificar(codigo: string): string {
  return codigo.toLowerCase().replace(/_/g, "-");
}

function describirDuracion(minMin: number, maxMin: number): string {
  const aHoras = (m: number) => (m % 60 === 0 ? `${m / 60} hora${m === 60 ? "" : "s"}` : `${m} min`);
  return minMin === maxMin ? aHoras(minMin) : `${aHoras(minMin)} a ${aHoras(maxMin)}`;
}

interface FilaCatalogoAdmin {
  categoria_id: string;
  categoria: string;
  categoria_orden: number;
  servicio_id: number;
  servicio_codigo: string;
  servicio_nombre: string;
  descripcion: string | null;
  duracion_min_minutos: number;
  duracion_max_minutos: number;
  buffer_posterior_minutos: number;
  tarifa_id: number | null;
  tarifa_nombre: string | null;
  sesiones_incluidas: number | null;
  cupo_personas: number | null;
  valor_total: string | null;
}

export async function listarCatalogoAdmin(
  db: Db,
): Promise<{ catalogo: CategoriaCatalogoAdmin[]; bufferPorServicio: Record<string, number> }> {
  const r = await db.query<FilaCatalogoAdmin>(
    `SELECT c.id::text AS categoria_id, c.nombre AS categoria, c.orden AS categoria_orden,
            s.id AS servicio_id, s.codigo AS servicio_codigo, s.nombre AS servicio_nombre, s.descripcion,
            s.duracion_min_minutos, s.duracion_max_minutos, s.buffer_posterior_minutos,
            t.id AS tarifa_id, t.nombre AS tarifa_nombre, t.sesiones_incluidas, t.cupo_personas, t.valor_total
       FROM catalogo.servicio s
       JOIN catalogo.categoria_servicio c ON c.id = s.categoria_id
       LEFT JOIN catalogo.tarifa t
              ON t.servicio_id = s.id AND t.activo AND t.vigencia @> CURRENT_DATE
      WHERE s.activo
      ORDER BY c.orden, s.nombre, t.cupo_personas NULLS LAST, t.sesiones_incluidas NULLS LAST`,
  );

  const categorias = new Map<string, CategoriaCatalogoAdmin>();
  const servicios = new Map<number, ServicioCatalogoAdmin>();
  const bufferPorServicio: Record<string, number> = {};

  for (const f of r.rows) {
    let cat = categorias.get(f.categoria_id);
    if (!cat) {
      cat = { id: Number(f.categoria_id), nombre: f.categoria, servicios: [] };
      categorias.set(f.categoria_id, cat);
    }
    let serv = servicios.get(f.servicio_id);
    if (!serv) {
      serv = {
        id: f.servicio_id,
        slug: slugificar(f.servicio_codigo),
        nombre: f.servicio_nombre,
        duracion: describirDuracion(f.duracion_min_minutos, f.duracion_max_minutos),
        duracionMin: f.duracion_min_minutos,
        duracionMaxMin: f.duracion_max_minutos,
        bufferPosteriorMinutos: f.buffer_posterior_minutos,
        descripcion: f.descripcion,
        opciones: [],
        reservableIndividualmente: false,
      };
      servicios.set(f.servicio_id, serv);
      cat.servicios.push(serv);
      bufferPorServicio[serv.slug] = f.buffer_posterior_minutos;
    }
    if (f.tarifa_id !== null && f.tarifa_nombre !== null && f.valor_total !== null && f.sesiones_incluidas !== null) {
      const precio = Number(f.valor_total);
      const porSesion = f.sesiones_incluidas > 1 ? Math.round(precio / f.sesiones_incluidas) : null;
      serv.opciones.push({ id: f.tarifa_id, label: f.tarifa_nombre, precio, porSesion });
      if (f.cupo_personas === 1) serv.reservableIndividualmente = true;
    }
  }

  return { catalogo: Array.from(categorias.values()), bufferPorServicio };
}

// --- Pacientes, para el panel ----------------------------------------------

export interface PacienteAdmin {
  id: number;
  nombre: string;
  documento: string;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  eps: string | null;
  ocupacion: string | null;
  contactoEmergencia: string | null;
  referido: string | null;
  referidosEfectivos: number;
  ultimaSesion: string | null;
}

interface FilaPacienteAdmin {
  id: number | string;
  nombre_completo: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  eps: string | null;
  ocupacion: string | null;
  referido_texto_libre: string | null;
  referido_por_nombre: string | null;
  contacto_nombre: string | null;
  contacto_parentesco: string | null;
  contacto_telefono: string | null;
  ultima_sesion: string | null;
  referidos_efectivos: string | number;
}

function formatearDocumento(tipo: string | null, numero: string | null): string {
  if (!numero) return "Sin documento";
  return tipo ? `${tipo} ${numero}` : numero;
}

export async function listarPacientesAdmin(db: Db): Promise<PacienteAdmin[]> {
  const r = await db.query<FilaPacienteAdmin>(
    `SELECT p.id, p.nombre_completo, p.tipo_documento, p.numero_documento, p.telefono, p.email,
            p.ciudad, p.eps, p.ocupacion,
            raw.referido_texto_libre, ref_pac.nombre_completo AS referido_por_nombre,
            ce.nombre AS contacto_nombre, ce.parentesco AS contacto_parentesco, ce.telefono AS contacto_telefono,
            ultima.inicia_en AS ultima_sesion,
            coalesce(refs.referidos_efectivos, 0) AS referidos_efectivos
       FROM personas.v_paciente p
       JOIN personas.paciente raw ON raw.id = p.id
       LEFT JOIN personas.v_paciente ref_pac ON ref_pac.id = p.referido_por_paciente_id
       LEFT JOIN personas.contacto_emergencia ce ON ce.paciente_id = p.id AND ce.principal
       LEFT JOIN LATERAL (
         SELECT max(v.inicia_en) AS inicia_en
           FROM agenda.v_cita v
          WHERE v.paciente_id = p.id AND v.estado IN ('atendida', 'confirmada', 'en_curso')
       ) ultima ON true
       LEFT JOIN comercial.v_referidos_elegibles refs ON refs.paciente_referente_id = p.id
      WHERE p.activo
      ORDER BY p.nombre_completo`,
  );
  return r.rows.map((f) => ({
    id: Number(f.id),
    nombre: f.nombre_completo,
    documento: formatearDocumento(f.tipo_documento, f.numero_documento),
    telefono: f.telefono,
    email: f.email,
    ciudad: f.ciudad,
    eps: f.eps,
    ocupacion: f.ocupacion,
    contactoEmergencia:
      f.contacto_nombre !== null
        ? `${f.contacto_nombre} (${f.contacto_parentesco}) · ${f.contacto_telefono}`
        : null,
    referido: f.referido_por_nombre ?? f.referido_texto_libre,
    referidosEfectivos: Number(f.referidos_efectivos),
    ultimaSesion: f.ultima_sesion,
  }));
}

export interface ActualizarPacienteInput {
  nombre?: string | undefined;
  telefono?: string | null | undefined;
  email?: string | null | undefined;
  ciudad?: string | null | undefined;
  eps?: string | null | undefined;
  ocupacion?: string | null | undefined;
  referido?: string | null | undefined;
  contactoEmergencia?: string | null | undefined;
}

/** Contacto de emergencia combinado tal como lo muestra el panel: "Nombre (Parentesco) · Teléfono". */
const RE_CONTACTO = /^(.+?)\s*\((.+?)\)\s*·\s*(.+)$/;

export async function actualizarPacienteAdmin(
  db: Db,
  pacienteId: number,
  input: ActualizarPacienteInput,
): Promise<PacienteAdmin> {
  await db.tx(async (tx) => {
    const sets: string[] = [];
    const valores: unknown[] = [];
    let i = 1;

    if (input.nombre !== undefined) {
      const partes = input.nombre.trim().split(/\s+/);
      const nombres = partes[0] ?? input.nombre;
      const apellidos = partes.slice(1).join(" ") || nombres;
      sets.push(`nombres = $${i++}`, `apellidos = $${i++}`);
      valores.push(nombres, apellidos);
    }
    if (input.telefono !== undefined) {
      sets.push(`telefono = $${i++}`);
      valores.push(input.telefono);
    }
    if (input.email !== undefined) {
      sets.push(`email = $${i++}`);
      valores.push(input.email);
    }
    if (input.ciudad !== undefined) {
      sets.push(`ciudad_id = NULL`, `ciudad_otro = $${i++}`);
      valores.push(input.ciudad);
    }
    if (input.eps !== undefined) {
      sets.push(`eps_id = NULL`, `eps_otro = $${i++}`);
      valores.push(input.eps);
    }
    if (input.ocupacion !== undefined) {
      sets.push(`ocupacion_id = NULL`, `ocupacion_otro = $${i++}`);
      valores.push(input.ocupacion);
    }
    if (input.referido !== undefined) {
      sets.push(`referido_texto_libre = $${i++}`);
      valores.push(input.referido);
    }

    if (sets.length > 0) {
      sets.push(`actualizado_en = now()`);
      valores.push(pacienteId);
      const r = await tx.query<{ id: number }>(
        `UPDATE personas.paciente SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
        valores,
      );
      if (r.rows.length === 0) throw new ErrorDominio("Paciente no encontrado.", "no_encontrado", 404);
    }

    if (input.contactoEmergencia !== undefined) {
      const m = input.contactoEmergencia !== null ? RE_CONTACTO.exec(input.contactoEmergencia) : null;
      if (input.contactoEmergencia === null) {
        await tx.query(`DELETE FROM personas.contacto_emergencia WHERE paciente_id = $1 AND principal`, [
          pacienteId,
        ]);
      } else if (m) {
        const [, nombre, parentesco, telefono] = m;
        await tx.query(
          `INSERT INTO personas.contacto_emergencia (paciente_id, nombre, parentesco, telefono, principal)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (paciente_id) WHERE principal
           DO UPDATE SET nombre = excluded.nombre, parentesco = excluded.parentesco, telefono = excluded.telefono`,
          [pacienteId, nombre, parentesco, telefono],
        );
      }
    }
  });

  const actualizado = (await listarPacientesAdmin(db)).find((p) => p.id === pacienteId);
  if (!actualizado) throw new ErrorDominio("Paciente no encontrado.", "no_encontrado", 404);
  return actualizado;
}

// --- Indicadores del negocio, para el panel --------------------------------

export interface IndicadoresAdmin {
  citasSemana: number;
  citasSemanaPrev: number;
  ingresosMes: number;
  ingresosMesPrev: number;
  ocupacion: number;
  ocupacionPrev: number;
  nuevosPacientes: number;
  nuevosPacientesPrev: number;
  citasPorServicio: { servicio: string; valor: number }[];
  reservasPorCanal: { canal: string; valor: number }[];
  citasPorDia: { dia: string; valor: number }[];
}

const ESTADOS_CONTABLES = ["confirmada", "en_curso", "atendida", "no_asistio", "cancelada_tarde", "cancelada_a_tiempo"];

function bogotaHoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}
function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function inicioSemana(fechaIso: string): string {
  const dow = new Date(`${fechaIso}T00:00:00Z`).getUTCDay();
  return sumarDias(fechaIso, dow === 0 ? -6 : 1 - dow);
}
function sumarMeses(fechaIso: string, meses: number): string {
  const [anio, mes] = fechaIso.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(anio, mes - 1 + meses, 1)).toISOString().slice(0, 10);
}
function tsBogota(fechaIso: string): string {
  return `${fechaIso}T00:00:00-05:00`;
}

const DIAS_ISO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export async function listarIndicadoresAdmin(db: Db): Promise<IndicadoresAdmin> {
  const hoy = bogotaHoy();
  const inicioSem = inicioSemana(hoy);
  const finSem = sumarDias(inicioSem, 7);
  const inicioSemPrev = sumarDias(inicioSem, -7);
  const inicioMesActual = `${hoy.slice(0, 7)}-01`;
  const inicioMesSiguiente = sumarMeses(inicioMesActual, 1);
  const inicioMesPrev = sumarMeses(inicioMesActual, -1);
  const hace30 = sumarDias(hoy, -30);
  const manana = sumarDias(hoy, 1);

  async function contarCitas(desde: string, hasta: string): Promise<number> {
    const r = await db.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM agenda.v_cita
        WHERE inicia_en >= $1 AND inicia_en < $2 AND estado::text = ANY($3::text[])`,
      [tsBogota(desde), tsBogota(hasta), ESTADOS_CONTABLES],
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async function sumarIngresos(desde: string, hasta: string): Promise<number> {
    const r = await db.query<{ total: string }>(
      `SELECT coalesce(sum(valor), 0) AS total FROM comercial.pago
        WHERE estado = 'verificado' AND verificado_en >= $1 AND verificado_en < $2`,
      [tsBogota(desde), tsBogota(hasta)],
    );
    return Number(r.rows[0]?.total ?? 0);
  }

  async function horasOcupadas(desde: string, hasta: string): Promise<number> {
    const r = await db.query<{ horas: string }>(
      `SELECT coalesce(sum(extract(epoch FROM duracion) / 3600), 0) AS horas
         FROM agenda.v_cita
        WHERE inicia_en >= $1 AND inicia_en < $2 AND estado IN ('confirmada', 'en_curso', 'atendida')`,
      [tsBogota(desde), tsBogota(hasta)],
    );
    return Number(r.rows[0]?.horas ?? 0);
  }

  async function contarNuevosPacientes(desde: string, hasta: string): Promise<number> {
    const r = await db.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM personas.paciente WHERE creado_en >= $1 AND creado_en < $2`,
      [tsBogota(desde), tsBogota(hasta)],
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  const [
    citasSemana,
    citasSemanaPrev,
    ingresosMes,
    ingresosMesPrev,
    horasSemana,
    horasSemanaPrev,
    horasDisponiblesR,
    nuevosPacientes,
    nuevosPacientesPrev,
    porServicioR,
    porCanalR,
    porDiaR,
  ] = await Promise.all([
    contarCitas(inicioSem, finSem),
    contarCitas(inicioSemPrev, inicioSem),
    sumarIngresos(inicioMesActual, inicioMesSiguiente),
    sumarIngresos(inicioMesPrev, inicioMesActual),
    horasOcupadas(inicioSem, finSem),
    horasOcupadas(inicioSemPrev, inicioSem),
    db.query<{ horas: string }>(
      `SELECT coalesce(sum(extract(epoch FROM (hora_fin - hora_inicio)) / 3600), 0) AS horas
         FROM agenda.horario_atencion
        WHERE vigente_desde <= CURRENT_DATE AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)`,
    ),
    contarNuevosPacientes(inicioSem, finSem),
    contarNuevosPacientes(inicioSemPrev, inicioSem),
    db.query<{ servicio: string; valor: string }>(
      `SELECT servicio_nombre AS servicio, count(*)::int AS valor
         FROM agenda.v_cita
        WHERE inicia_en >= $1 AND inicia_en < $2 AND estado::text = ANY($3::text[]) AND servicio_nombre IS NOT NULL
        GROUP BY servicio_nombre ORDER BY count(*) DESC LIMIT 8`,
      [tsBogota(hace30), tsBogota(manana), ESTADOS_CONTABLES],
    ),
    db.query<{ canal: string; valor: string }>(
      `SELECT canal_origen AS canal, count(*)::int AS valor
         FROM agenda.v_cita
        WHERE inicia_en >= $1 AND inicia_en < $2 AND estado::text = ANY($3::text[])
        GROUP BY canal_origen ORDER BY count(*) DESC`,
      [tsBogota(hace30), tsBogota(manana), ESTADOS_CONTABLES],
    ),
    db.query<{ dow: string; valor: string }>(
      `SELECT to_char(inicia_en AT TIME ZONE 'America/Bogota', 'ID') AS dow, count(*)::int AS valor
         FROM agenda.v_cita
        WHERE inicia_en >= $1 AND inicia_en < $2 AND estado::text = ANY($3::text[])
        GROUP BY dow`,
      [tsBogota(inicioSem), tsBogota(finSem), ESTADOS_CONTABLES],
    ),
  ]);

  const horasDisponibles = Number(horasDisponiblesR.rows[0]?.horas ?? 0);
  const ocupacion = horasDisponibles > 0 ? Math.min(1, horasSemana / horasDisponibles) : 0;
  const ocupacionPrev = horasDisponibles > 0 ? Math.min(1, horasSemanaPrev / horasDisponibles) : 0;

  const porDiaMap = new Map(porDiaR.rows.map((f) => [Number(f.dow), Number(f.valor)]));
  const citasPorDia = DIAS_ISO.map((dia, i) => ({ dia, valor: porDiaMap.get(i + 1) ?? 0 }));

  return {
    citasSemana,
    citasSemanaPrev,
    ingresosMes,
    ingresosMesPrev,
    ocupacion,
    ocupacionPrev,
    nuevosPacientes,
    nuevosPacientesPrev,
    citasPorServicio: porServicioR.rows.map((f) => ({ servicio: f.servicio, valor: Number(f.valor) })),
    reservasPorCanal: porCanalR.rows.map((f) => ({ canal: f.canal, valor: Number(f.valor) })),
    citasPorDia,
  };
}

// --- Historial de actividad reciente, para el panel ------------------------
//
// El schema real (`db/migrations/schema.sql`) no tiene una tabla
// `operacion_log` como la que describe el README aspiracional: por ahora
// esto es un feed sintetizado a partir de eventos que sí quedan registrados
// con fecha (reservas creadas/canceladas, pagos registrados/verificados),
// no una bitácora completa de auditoría.

export interface EventoHistorialAdmin {
  id: string;
  fechaHora: string;
  actor: string;
  canal: string;
  accion: string;
  detalle: string;
  resultado: "ok" | "error" | "pendiente";
}

interface FilaEventoHistorial {
  fecha_hora: string;
  actor: string;
  canal: string;
  accion: string;
  detalle: string;
  resultado: "ok" | "error" | "pendiente";
}

export async function listarHistorialAdmin(db: Db, opts: { limite?: number } = {}): Promise<EventoHistorialAdmin[]> {
  const limite = opts.limite ?? 150;
  const r = await db.query<FilaEventoHistorial>(
    `(
       SELECT v.creado_en AS fecha_hora,
              coalesce(v.paciente_nombre, 'Paciente sin identificar') AS actor,
              initcap(v.canal_origen::text) AS canal,
              'Reserva creada' AS accion,
              coalesce(v.servicio_nombre, 'Servicio') || ' · ' || v.sede_nombre
                || ' · ' || to_char(v.inicia_en AT TIME ZONE 'America/Bogota', 'DD Mon HH24:MI') AS detalle,
              'ok'::text AS resultado
         FROM agenda.v_cita v
     )
     UNION ALL
     (
       SELECT r.cancelada_en AS fecha_hora,
              coalesce(pa.nombres || ' ' || pa.apellidos, 'Paciente sin identificar') AS actor,
              CASE
                WHEN r.cancelada_por = 'panel' THEN 'Panel'
                WHEN r.cancelada_por ~ '^[0-9]+$' THEN 'Telegram'
                ELSE coalesce(r.cancelada_por, 'Sistema')
              END AS canal,
              'Reserva cancelada' AS accion,
              coalesce(r.motivo_cancelacion, 'Sin motivo registrado') AS detalle,
              'error'::text AS resultado
         FROM agenda.reserva r
         LEFT JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
         LEFT JOIN personas.paciente pa ON pa.id = rp.paciente_id
        WHERE r.tipo = 'cita' AND r.cancelada_en IS NOT NULL
     )
     UNION ALL
     (
       SELECT p.pagado_en AS fecha_hora,
              coalesce(pa.nombres || ' ' || pa.apellidos, 'Paciente sin identificar') AS actor,
              'Panel' AS canal,
              'Comprobante de pago registrado' AS accion,
              mp.nombre || ' · $' || to_char(p.valor, 'FM999,999,999') AS detalle,
              'pendiente'::text AS resultado
         FROM comercial.pago p
         JOIN comercial.compra c ON c.id = p.compra_id
         JOIN personas.paciente pa ON pa.id = c.paciente_id
         JOIN catalogo.medio_pago mp ON mp.id = p.medio_pago_id
     )
     UNION ALL
     (
       SELECT p.verificado_en AS fecha_hora,
              coalesce(p.verificado_por, 'Lina Murillo') AS actor,
              'Panel' AS canal,
              CASE WHEN p.estado = 'rechazado' THEN 'Pago rechazado' ELSE 'Pago verificado' END AS accion,
              '$' || to_char(p.valor, 'FM999,999,999') || ' · ' || coalesce(pa.nombres || ' ' || pa.apellidos, 'Paciente') AS detalle,
              CASE WHEN p.estado = 'rechazado' THEN 'error' ELSE 'ok' END::text AS resultado
         FROM comercial.pago p
         JOIN comercial.compra c ON c.id = p.compra_id
         JOIN personas.paciente pa ON pa.id = c.paciente_id
        WHERE p.verificado_en IS NOT NULL
     )
     ORDER BY fecha_hora DESC
     LIMIT $1`,
    [limite],
  );
  return r.rows.map((f, i) => ({
    id: `${new Date(f.fecha_hora).getTime()}-${i}`,
    fechaHora: f.fecha_hora,
    actor: f.actor,
    canal: f.canal,
    accion: f.accion,
    detalle: f.detalle,
    resultado: f.resultado,
  }));
}

// --- Estado de integraciones, para el panel --------------------------------
//
// core-api no habla con estos servicios en ninguna ruta del dominio; esto
// es un chequeo de salud de solo lectura, exclusivamente para que Lina vea
// en el panel si algo dejó de responder.

export type EstadoIntegracion = "conectado" | "requiere_atencion" | "no_verificable";

export interface IntegracionAdmin {
  id: string;
  nombre: string;
  descripcion: string;
  estado: EstadoIntegracion;
  detalle: string;
}

async function ping(url: string, timeoutMs = 2500): Promise<{ ok: boolean; cuerpo: unknown }> {
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    const cuerpo: unknown = await resp.json().catch(() => null);
    return { ok: resp.ok, cuerpo };
  } catch {
    return { ok: false, cuerpo: null };
  } finally {
    clearTimeout(temporizador);
  }
}

export async function listarIntegracionesAdmin(cfg: Config): Promise<IntegracionAdmin[]> {
  const [n8n, adaptador, ollama] = await Promise.all([
    ping(new URL("/healthz", cfg.N8N_URL).toString()),
    ping(new URL("/health", cfg.GOOGLE_ADAPTER_URL).toString()),
    ping(new URL("/api/tags", cfg.OLLAMA_URL).toString()),
  ]);

  const modelos = ollama.cuerpo as { models?: { name: string }[] } | null;
  const nombresModelos = modelos?.models?.map((m) => m.name).join(", ") ?? null;

  return [
    {
      id: "postgres",
      nombre: "PostgreSQL",
      descripcion: "Base de datos — única fuente de verdad",
      estado: "conectado",
      detalle: "Si el panel cargó, la API núcleo ya la consultó.",
    },
    {
      id: "n8n",
      nombre: "n8n",
      descripcion: "Orquestación del webhook /comandos (bot → n8n → API núcleo)",
      estado: n8n.ok ? "conectado" : "requiere_atencion",
      detalle: n8n.ok ? `Responde en ${cfg.N8N_URL}` : `No responde en ${cfg.N8N_URL}`,
    },
    {
      id: "google-adapter",
      nombre: "Adaptador de Google",
      descripcion: "Calendar y Gmail — único servicio con credenciales OAuth",
      estado: adaptador.ok ? "conectado" : "requiere_atencion",
      detalle: adaptador.ok
        ? `Responde en ${cfg.GOOGLE_ADAPTER_URL}`
        : `No responde en ${cfg.GOOGLE_ADAPTER_URL} — el correo de confirmación se queda en cola hasta que vuelva.`,
    },
    {
      id: "ollama",
      nombre: "Modelo de IA local (Ollama)",
      descripcion: "Interpretación de lenguaje natural para el bot",
      estado: ollama.ok ? "conectado" : "requiere_atencion",
      detalle: ollama.ok ? `Modelos cargados: ${nombresModelos ?? "sin información"}` : `No responde en ${cfg.OLLAMA_URL}`,
    },
    {
      id: "telegram",
      nombre: "Bot de Telegram",
      descripcion: "Canal conversacional (long polling, sin webhook)",
      estado: "no_verificable",
      detalle: "Corre como proceso aparte; la API núcleo no tiene forma de comprobar su estado desde aquí.",
    },
  ];
}

// --- CRUD de catálogo (servicios y tarifas), para el panel -----------------
//
// "Eliminar" nunca es un DELETE real: ya hay reservas y compras que
// referencian el servicio/la tarifa, y borrarlas destruiría ese historial
// (comercial.compra ya guarda una copia congelada del precio pactado, así
// que esto no afecta lo ya vendido). Lo que hace el botón "Eliminar" del
// panel es desactivar (`activo = false`): deja de ofrecerse para reservar,
// pero el histórico queda intacto. El bot y el sitio web leen esta misma
// tabla en vivo, así que un cambio aquí se refleja solo en ambos canales.

export interface CategoriaAdmin {
  id: number;
  nombre: string;
}

export async function listarCategoriasAdmin(db: Db): Promise<CategoriaAdmin[]> {
  const r = await db.query<{ id: number; nombre: string }>(
    `SELECT id, nombre FROM catalogo.categoria_servicio ORDER BY orden, nombre`,
  );
  return r.rows;
}

function generarCodigoBase(nombre: string): string {
  const base = nombre
    .toUpperCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base.length > 0 ? base : "SERVICIO";
}

export interface TarifaInicialInput {
  nombre: string;
  sesionesIncluidas: number;
  cupoPersonas: number;
  valorTotal: number;
}

export interface CrearServicioInput {
  categoriaId: number;
  nombre: string;
  descripcion?: string | null | undefined;
  duracionMinMinutos: number;
  duracionMaxMinutos: number;
  bufferPosteriorMinutos: number;
  tarifaInicial?: TarifaInicialInput | null | undefined;
}

export async function crearServicioAdmin(db: Db, input: CrearServicioInput): Promise<{ id: number }> {
  try {
    return await db.tx(async (tx) => {
      const base = generarCodigoBase(input.nombre);
      let codigo = base;
      let intento = 1;
      for (;;) {
        const existe = await tx.query<{ existe: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM catalogo.servicio WHERE codigo = $1) AS existe`,
          [codigo],
        );
        if (existe.rows[0]?.existe !== true) break;
        intento += 1;
        codigo = `${base}_${intento}`;
      }

      const r = await tx.query<{ id: number }>(
        `INSERT INTO catalogo.servicio
           (categoria_id, codigo, nombre, descripcion, duracion_min_minutos, duracion_max_minutos, buffer_posterior_minutos)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          input.categoriaId,
          codigo,
          input.nombre,
          input.descripcion ?? null,
          input.duracionMinMinutos,
          input.duracionMaxMinutos,
          input.bufferPosteriorMinutos,
        ],
      );
      const servicioId = r.rows[0]!.id;

      if (input.tarifaInicial) {
        await tx.query(
          `INSERT INTO catalogo.tarifa (servicio_id, nombre, sesiones_incluidas, cupo_personas, valor_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            servicioId,
            input.tarifaInicial.nombre,
            input.tarifaInicial.sesionesIncluidas,
            input.tarifaInicial.cupoPersonas,
            input.tarifaInicial.valorTotal,
          ],
        );
      }

      return { id: servicioId };
    });
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

export interface ActualizarServicioInput {
  categoriaId?: number | undefined;
  nombre?: string | undefined;
  descripcion?: string | null | undefined;
  duracionMinMinutos?: number | undefined;
  duracionMaxMinutos?: number | undefined;
  bufferPosteriorMinutos?: number | undefined;
}

export async function actualizarServicioAdmin(db: Db, id: number, input: ActualizarServicioInput): Promise<void> {
  const sets: string[] = [];
  const valores: unknown[] = [];
  let i = 1;
  if (input.categoriaId !== undefined) {
    sets.push(`categoria_id = $${i++}`);
    valores.push(input.categoriaId);
  }
  if (input.nombre !== undefined) {
    sets.push(`nombre = $${i++}`);
    valores.push(input.nombre);
  }
  if (input.descripcion !== undefined) {
    sets.push(`descripcion = $${i++}`);
    valores.push(input.descripcion);
  }
  if (input.duracionMinMinutos !== undefined) {
    sets.push(`duracion_min_minutos = $${i++}`);
    valores.push(input.duracionMinMinutos);
  }
  if (input.duracionMaxMinutos !== undefined) {
    sets.push(`duracion_max_minutos = $${i++}`);
    valores.push(input.duracionMaxMinutos);
  }
  if (input.bufferPosteriorMinutos !== undefined) {
    sets.push(`buffer_posterior_minutos = $${i++}`);
    valores.push(input.bufferPosteriorMinutos);
  }
  if (sets.length === 0) return;

  valores.push(id);
  try {
    const r = await db.query<{ id: number }>(
      `UPDATE catalogo.servicio SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
      valores,
    );
    if (r.rows.length === 0) throw new ErrorDominio("Servicio no encontrado.", "no_encontrado", 404);
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

export async function desactivarServicioAdmin(db: Db, id: number): Promise<void> {
  const r = await db.query<{ id: number }>(
    `UPDATE catalogo.servicio SET activo = false WHERE id = $1 RETURNING id`,
    [id],
  );
  if (r.rows.length === 0) throw new ErrorDominio("Servicio no encontrado.", "no_encontrado", 404);
}

export interface CrearTarifaInput {
  nombre: string;
  sesionesIncluidas: number;
  cupoPersonas: number;
  valorTotal: number;
}

export async function agregarTarifaAdmin(
  db: Db,
  servicioId: number,
  input: CrearTarifaInput,
): Promise<{ id: number }> {
  try {
    const r = await db.query<{ id: number }>(
      `INSERT INTO catalogo.tarifa (servicio_id, nombre, sesiones_incluidas, cupo_personas, valor_total)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [servicioId, input.nombre, input.sesionesIncluidas, input.cupoPersonas, input.valorTotal],
    );
    return { id: r.rows[0]!.id };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

export interface ActualizarTarifaInput {
  nombre?: string | undefined;
  valorTotal?: number | undefined;
}

export async function actualizarTarifaAdmin(db: Db, id: number, input: ActualizarTarifaInput): Promise<void> {
  const sets: string[] = [];
  const valores: unknown[] = [];
  let i = 1;
  if (input.nombre !== undefined) {
    sets.push(`nombre = $${i++}`);
    valores.push(input.nombre);
  }
  if (input.valorTotal !== undefined) {
    sets.push(`valor_total = $${i++}`);
    valores.push(input.valorTotal);
  }
  if (sets.length === 0) return;

  valores.push(id);
  const r = await db.query<{ id: number }>(
    `UPDATE catalogo.tarifa SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
    valores,
  );
  if (r.rows.length === 0) throw new ErrorDominio("Tarifa no encontrada.", "no_encontrado", 404);
}

export async function desactivarTarifaAdmin(db: Db, id: number): Promise<void> {
  const r = await db.query<{ id: number }>(
    `UPDATE catalogo.tarifa SET activo = false WHERE id = $1 RETURNING id`,
    [id],
  );
  if (r.rows.length === 0) throw new ErrorDominio("Tarifa no encontrada.", "no_encontrado", 404);
}
