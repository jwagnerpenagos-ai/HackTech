import type { Db } from "../db.js";
import { ErrorDominio, normalizarErrorDb } from "../errores.js";
import { profesionalPorDefecto } from "./catalogo.js";

/**
 * Capa fina sobre las funciones de negocio de `agenda.*` en
 * `db/migrations/schema.sql`. A propósito NO reimplementa reglas (duración,
 * buffers, ventana de cancelación, anti-solapamiento): todo eso ya vive en
 * el motor. Esta capa solo traduce nombres en español ↔ parámetros SQL y
 * homogeneiza errores con `normalizarErrorDb`.
 */

export interface Cita {
  reservaId: number;
  reservaUuid: string;
  estado: string;
  iniciaEn: string;
  terminaEn: string;
  sede: string;
  servicio: string | null;
  paciente: string | null;
}

interface FilaCita {
  reserva_id: number;
  reserva_uuid: string;
  estado: string;
  inicia_en: string;
  termina_en: string;
  sede_nombre: string;
  servicio_nombre: string | null;
  paciente_nombre: string | null;
}

function filaACita(f: FilaCita): Cita {
  return {
    reservaId: f.reserva_id,
    reservaUuid: f.reserva_uuid,
    estado: f.estado,
    iniciaEn: f.inicia_en,
    terminaEn: f.termina_en,
    sede: f.sede_nombre,
    servicio: f.servicio_nombre,
    paciente: f.paciente_nombre,
  };
}

export async function consultarAgenda(
  db: Db,
  opts: { desdeIso: string; hastaIso: string; sedeNombre?: string | null; pacienteId?: number | null },
): Promise<Cita[]> {
  const r = await db.query<FilaCita>(
    `SELECT reserva_id, reserva_uuid, estado, inicia_en, termina_en, sede_nombre, servicio_nombre, paciente_nombre
       FROM agenda.v_cita
      WHERE inicia_en >= $1 AND inicia_en < $2
        AND ($3::text IS NULL OR sede_nombre ILIKE $3)
        AND ($4::bigint IS NULL OR paciente_id = $4)
        AND estado NOT IN ('rechazada', 'expirada')
      ORDER BY inicia_en`,
    [opts.desdeIso, opts.hastaIso, opts.sedeNombre ? `%${opts.sedeNombre}%` : null, opts.pacienteId ?? null],
  );
  return r.rows.map(filaACita);
}

export async function consultarDisponibilidad(
  db: Db,
  opts: { servicioId: number; sedeId: number; fecha: string; profesionalId?: number | null },
): Promise<{ inicio: string; fin: string }[]> {
  try {
    const r = await db.query<{ slot_inicio: string; slot_fin: string }>(
      `SELECT slot_inicio, slot_fin FROM agenda.slots_disponibles($1, $2, $3, $4)`,
      [opts.servicioId, opts.sedeId, opts.fecha, opts.profesionalId ?? null],
    );
    return r.rows.map((f) => ({ inicio: f.slot_inicio, fin: f.slot_fin }));
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

export async function crearSesion(
  db: Db,
  opts: {
    pacienteId: number;
    servicioId: number;
    sedeId: number;
    iniciaEnIso: string;
    creadoPor?: string | null;
  },
): Promise<{ reservaId: number }> {
  try {
    const r = await db.query<{ crear_reserva: number }>(
      `SELECT agenda.crear_reserva(
         p_paciente_id  := $1,
         p_servicio_id  := $2,
         p_sede_id      := $3,
         p_inicia_en    := $4,
         p_canal        := 'telegram',
         p_creado_por   := $5
       ) AS crear_reserva`,
      [opts.pacienteId, opts.servicioId, opts.sedeId, opts.iniciaEnIso, opts.creadoPor ?? null],
    );
    return { reservaId: (r.rows[0] as { crear_reserva: number }).crear_reserva };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

export async function cancelarSesion(
  db: Db,
  opts: { reservaId: number; motivo: string; por?: string | null },
): Promise<{ estado: string }> {
  try {
    const r = await db.query<{ estado: string }>(
      `SELECT agenda.cancelar_reserva($1, $2, $3) AS estado`,
      [opts.reservaId, opts.motivo, opts.por ?? null],
    );
    return { estado: (r.rows[0] as { estado: string }).estado };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

/**
 * Reprograma una cita. `schema.sql` todavía no tiene una función atómica
 * `agenda.modificar_reserva`: se compone cancelando la reserva original y
 * creando una nueva con la misma paciente/servicio/sede, dentro de una sola
 * transacción para no perder la cita si el nuevo horario ya no está libre.
 *
 * GAP CONOCIDO (para coordinar con Simón / db/): esto pierde el historial
 * de la reserva original como "la misma cita reprogramada" — queda como
 * "cancelada_a_tiempo" + una reserva nueva, en vez de un solo registro
 * actualizado. Suficiente para el MVP; una función SQL dedicada sería la
 * forma correcta de resolverlo.
 */
export async function modificarSesion(
  db: Db,
  opts: { reservaId: number; nuevaIniciaEnIso: string; motivo: string; por?: string | null },
): Promise<{ reservaId: number }> {
  const actual = await db.query<{
    paciente_id: number;
    servicio_id: number | null;
    sede_id: number;
  }>(
    `SELECT rp.paciente_id, r.servicio_id, r.sede_id
       FROM agenda.reserva r
       JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
      WHERE r.id = $1
      LIMIT 1`,
    [opts.reservaId],
  );
  const fila = actual.rows[0];
  if (fila === undefined) {
    throw new ErrorDominio("La sesión no existe.", "no_encontrado", 404);
  }
  if (fila.servicio_id === null) {
    throw new ErrorDominio("La sesión no tiene un servicio asociado.", "no_encontrado", 404);
  }
  // Variables locales (no accesos a propiedad) para que la reducción de
  // null/undefined siga siendo válida dentro del closure de `db.tx`.
  const { paciente_id: pacienteId, servicio_id: servicioId, sede_id: sedeId } = fila;

  return db.tx(async (tx) => {
    await cancelarSesion(tx, { reservaId: opts.reservaId, motivo: opts.motivo, por: opts.por ?? null });
    return crearSesion(tx, {
      pacienteId,
      servicioId,
      sedeId,
      iniciaEnIso: opts.nuevaIniciaEnIso,
      creadoPor: opts.por ?? null,
    });
  });
}

export async function bloquearHorario(
  db: Db,
  opts: {
    sedeId: number;
    profesionalId?: number | null;
    iniciaEnIso: string;
    duracionMinutos: number;
    motivo: string;
    creadoPor?: string | null;
  },
): Promise<{ reservaId: number }> {
  try {
    const profesionalId = opts.profesionalId ?? (await profesionalPorDefecto(db));
    if (profesionalId === null) {
      throw new ErrorDominio("No hay ningún profesional activo registrado.", "no_encontrado", 404);
    }
    const r = await db.query<{ id: number }>(
      `INSERT INTO agenda.reserva (
         tipo, estado, profesional_id, sede_id,
         franja_clinica, franja_bloqueo,
         motivo_bloqueo, canal_origen, creado_por
       ) VALUES (
         'bloqueo', 'confirmada', $1, $2,
         tstzrange($3::timestamptz, $3::timestamptz + make_interval(mins => $4::integer), '[)'),
         tstzrange($3::timestamptz, $3::timestamptz + make_interval(mins => $4::integer), '[)'),
         $5, 'admin', $6
       )
       RETURNING id`,
      [profesionalId, opts.sedeId, opts.iniciaEnIso, opts.duracionMinutos, opts.motivo, opts.creadoPor ?? null],
    );
    return { reservaId: (r.rows[0] as { id: number }).id };
  } catch (err) {
    if (err instanceof ErrorDominio) throw err;
    throw normalizarErrorDb(err);
  }
}
