import type { Db } from "../db.js";
import { ErrorDominio, normalizarErrorDb } from "../errores.js";
import * as catalogo from "../dominio/catalogo.js";
import * as pacientes from "../dominio/pacientes.js";
import * as agenda from "../dominio/agenda.js";
import { codigoDeSlug, slugDeCodigo } from "./slugs.js";

/** fecha (YYYY-MM-DD) + hora (HH:MM) → timestamptz con offset fijo de Bogotá. */
function tsBogota(fecha: string, hora: string): string {
  return `${fecha}T${hora}:00-05:00`;
}

const RE_VALORACION = /valoraci[oó]n\s+inicial/i;

// ---------------------------------------------------------------------------
// GET /api/servicios
// ---------------------------------------------------------------------------
export interface ServicioWeb {
  slug: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  duracionMin: number;
  precio: number | null;
  moneda: string | null;
}

export async function listarServiciosWeb(db: Db): Promise<ServicioWeb[]> {
  const filas = await db.query<{
    codigo: string;
    nombre: string;
    descripcion: string | null;
    duracion_min_minutos: number;
    valor_total: string | null;
    moneda: string | null;
  }>(
    `SELECT s.codigo, s.nombre, s.descripcion, s.duracion_min_minutos,
            t.valor_total, t.moneda
       FROM catalogo.servicio s
       LEFT JOIN LATERAL (
         SELECT valor_total, moneda
           FROM catalogo.tarifa
          WHERE servicio_id = s.id AND activo
            AND sesiones_incluidas = 1 AND cupo_personas = 1
            AND vigencia @> CURRENT_DATE
          ORDER BY id LIMIT 1
       ) t ON true
      WHERE s.activo AND t.valor_total IS NOT NULL
      ORDER BY s.id`,
  );
  return filas.rows.map((f) => ({
    slug: slugDeCodigo(f.codigo),
    codigo: f.codigo,
    nombre: f.nombre,
    descripcion: f.descripcion,
    duracionMin: f.duracion_min_minutos,
    precio: f.valor_total !== null ? Number(f.valor_total) : null,
    moneda: f.moneda,
  }));
}

// ---------------------------------------------------------------------------
// GET /api/sedes
// ---------------------------------------------------------------------------
export interface SedeWeb {
  id: number;
  codigo: string;
  nombre: string;
  ciudad: string;
  departamento: string;
  dias: number[];
  nota: string;
}

// La regla Tunja L-V / Turmequé S-D vive en agenda.horario_atencion; acá se
// expone en la convención de Date.getDay() que usa el sitio.
const REGLA_SEDE: Record<string, { dias: number[]; nota: string }> = {
  TUNJA: { dias: [1, 2, 3, 4, 5], nota: "Atención entre semana (lunes a viernes)" },
  TURMEQUE: { dias: [0, 6], nota: "Atención fines de semana (sábados y domingos)" },
};

export async function listarSedesWeb(db: Db): Promise<SedeWeb[]> {
  const r = await db.query<{ id: number; codigo: string; nombre: string; ciudad: string; departamento: string }>(
    `SELECT id, codigo, nombre, ciudad, departamento FROM catalogo.sede WHERE activo ORDER BY id`,
  );
  return r.rows.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    nombre: f.nombre,
    ciudad: f.ciudad,
    departamento: f.departamento,
    dias: REGLA_SEDE[f.codigo]?.dias ?? [],
    nota: REGLA_SEDE[f.codigo]?.nota ?? "",
  }));
}

// ---------------------------------------------------------------------------
// GET /api/disponibilidad
// ---------------------------------------------------------------------------
export async function disponibilidadWeb(
  db: Db,
  opts: { slug: string; sedeCodigo: string; fecha: string },
): Promise<string[]> {
  const codigo = codigoDeSlug(opts.slug);
  const servicio = await catalogo.resolverServicio(db, codigo ?? opts.slug);
  if (!servicio) throw new ErrorDominio("Servicio no encontrado.", "no_encontrado", 404);
  const sede = await catalogo.resolverSede(db, opts.sedeCodigo);
  if (!sede) throw new ErrorDominio("Sede no encontrada.", "no_encontrado", 404);

  const slots = await agenda.consultarDisponibilidad(db, {
    servicioId: servicio.id,
    sedeId: sede.id,
    fecha: opts.fecha,
  });
  const limite24h = Date.now() + 24 * 60 * 60 * 1000;
  return slots
    .filter((s) => new Date(s.inicio).getTime() >= limite24h)
    .map((s) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(s.inicio)),
    );
}

// ---------------------------------------------------------------------------
// POST /api/reservas
// ---------------------------------------------------------------------------
const GENERO: Record<string, string> = {
  femenino: "femenino",
  masculino: "masculino",
  otro: "otro",
  "prefiero no decir": "no_declara",
  "no declara": "no_declara",
};

export interface PacienteWebInput {
  nombre: string;
  documento?: string | null | undefined;
  tipoDocumento?: string | null | undefined;
  fechaNacimiento?: string | null | undefined;
  genero?: string | null | undefined;
  telefono?: string | null | undefined;
  email?: string | null | undefined;
  /** Código de referido de quien la invitó (personas.paciente.codigo_referido). Solo aplica al crear paciente nuevo. */
  codigoReferido?: string | null | undefined;
}

export interface ReservaWebResultado {
  reservaId: number;
  /** id público de la reserva; el sitio lo usa como `ref` del checkout. */
  reservaUuid: string;
  referencia: string;
  estado: string;
  monto: number | null;
  moneda: string | null;
}

/** Busca al paciente por documento; si no está, lo crea con los datos de la ficha del sitio. */
async function buscarOCrearPaciente(db: Db, p: PacienteWebInput): Promise<{ id: number }> {
  const docTrim = p.documento?.trim() ?? "";
  const doc = docTrim.length > 0 ? docTrim : null;
  if (doc !== null) {
    const existente = await db.query<{ id: number | string }>(
      `SELECT id FROM personas.paciente WHERE numero_documento = $1 AND activo LIMIT 1`,
      [doc],
    );
    if (existente.rows[0]) return { id: Number(existente.rows[0].id) };
  }

  const partes = p.nombre.trim().split(/\s+/);
  const nombres = partes[0] ?? p.nombre;
  const apellidos = partes.length > 1 ? partes.slice(1).join(" ") : nombres;
  const generoNorm = p.genero ? (GENERO[p.genero.trim().toLowerCase()] ?? null) : null;
  const docCodigo = p.tipoDocumento ? p.tipoDocumento.replace(/[.\s]/g, "").toUpperCase() : null;

  // Código de quien lo invitó: si no matchea a nadie, se ignora en silencio
  // (un typo en un campo opcional no debe tumbar la reserva).
  let referenteId: number | null = null;
  const codigoTrim = p.codigoReferido?.trim();
  if (codigoTrim) {
    const ref = await db.query<{ id: number | string }>(
      `SELECT id FROM personas.paciente WHERE codigo_referido = $1 AND activo LIMIT 1`,
      [codigoTrim.toUpperCase()],
    );
    referenteId = ref.rows[0] ? Number(ref.rows[0].id) : null;
  }

  const r = await db.query<{ id: number | string }>(
    `INSERT INTO personas.paciente
       (nombres, apellidos, telefono, email, numero_documento, fecha_nacimiento, genero, tipo_documento_id,
        referido_por_paciente_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             (SELECT id FROM catalogo.tipo_documento WHERE codigo = $8),
             $9)
     RETURNING id`,
    [
      nombres,
      apellidos,
      p.telefono ?? null,
      p.email ?? null,
      doc,
      p.fechaNacimiento ?? null,
      generoNorm,
      docCodigo,
      referenteId,
    ],
  );
  return { id: Number((r.rows[0] as { id: number | string }).id) };
}

export async function crearReservaWeb(
  db: Db,
  opts: { slug: string; sedeCodigo: string; fecha: string; hora: string; paciente: PacienteWebInput; idempotencyKey: string },
): Promise<ReservaWebResultado> {
  const creadoPor = `web:${opts.idempotencyKey}`;

  // Idempotencia sin tabla nueva: la clave se guarda en reserva.creado_por.
  const previa = await db.query<{ id: number | string; uuid: string; estado: string }>(
    `SELECT id, uuid, estado FROM agenda.reserva WHERE creado_por = $1 LIMIT 1`,
    [creadoPor],
  );
  if (previa.rows[0]) {
    const id = Number(previa.rows[0].id);
    const compra = await db.query<{ valor_total: string; moneda: string }>(
      `SELECT c.valor_total, c.moneda
         FROM agenda.reserva_participante rp
         JOIN comercial.compra c ON c.id = rp.compra_id
        WHERE rp.reserva_id = $1 LIMIT 1`,
      [id],
    );
    const c = compra.rows[0];
    return {
      reservaId: id,
      reservaUuid: previa.rows[0].uuid,
      referencia: `FISIO-${id.toString(36).toUpperCase()}`,
      estado: previa.rows[0].estado,
      monto: c ? Number(c.valor_total) : null,
      moneda: c?.moneda ?? null,
    };
  }

  const codigo = codigoDeSlug(opts.slug);
  const servicio = await catalogo.resolverServicio(db, codigo ?? opts.slug);
  if (!servicio) throw new ErrorDominio("Servicio no encontrado.", "no_encontrado", 404);
  const sede = await catalogo.resolverSede(db, opts.sedeCodigo);
  if (!sede) throw new ErrorDominio("Sede no encontrada.", "no_encontrado", 404);

  const iniciaEnIso = tsBogota(opts.fecha, opts.hora);
  if ((new Date(iniciaEnIso).getTime() - Date.now()) / 3_600_000 < 24) {
    throw new ErrorDominio(
      "Las citas se reservan con al menos 24 horas de anticipación.",
      "anticipacion_insuficiente",
      422,
    );
  }

  const tarifa = await catalogo.resolverTarifaIndividual(db, servicio.id);
  if (!tarifa) throw new ErrorDominio("Ese servicio no se puede reservar en línea.", "no_reservable", 422);

  const paciente = await buscarOCrearPaciente(db, opts.paciente);

  if (
    !RE_VALORACION.test(servicio.nombre) &&
    !(await pacientes.tieneValoracionAtendida(db, paciente.id))
  ) {
    throw new ErrorDominio(
      "Para su primera cita agendamos una Valoración inicial. Después de esa consulta podrá reservar los demás servicios.",
      "valoracion_requerida",
      422,
    );
  }

  try {
    const creada = await agenda.crearSesion(db, {
      pacienteId: paciente.id,
      servicioId: servicio.id,
      sedeId: sede.id,
      iniciaEnIso,
      creadoPor,
      tarifa,
    });
    const uuidRow = await db.query<{ uuid: string }>(`SELECT uuid FROM agenda.reserva WHERE id = $1`, [
      creada.reservaId,
    ]);
    const reservaUuid = uuidRow.rows[0]?.uuid ?? "";
    return {
      reservaId: creada.reservaId,
      reservaUuid,
      referencia: `FISIO-${creada.reservaId.toString(36).toUpperCase()}`,
      estado: "pendiente_pago",
      monto: creada.montoTotal ?? tarifa.valorTotal,
      moneda: creada.moneda ?? tarifa.moneda,
    };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}
