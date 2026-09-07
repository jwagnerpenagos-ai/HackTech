import type { Db } from "../db.js";

/**
 * `integracion.google_recurso` mapea una entidad local a un recurso real de
 * Google (aquí, un evento de Calendar). `entidad_tipo='reserva'` es la
 * convención que ya usa `agenda.v_cita` (ver su LEFT JOIN en schema.sql)
 * para el calendario DEL NEGOCIO. El Calendar personal de un paciente (fase
 * 3) usa un `entidad_tipo` distinto a propósito: la restricción UNIQUE
 * (entidad_tipo, entidad_id, servicio) solo permite un mapeo de Calendar por
 * fila, y una misma reserva puede tener un evento en el calendario de la
 * sede Y otro en el del paciente.
 */

const ENTIDAD_TIPO_NEGOCIO = "reserva";

export async function buscarEventoCalendarNegocio(db: Db, reservaId: number): Promise<string | null> {
  const r = await db.query<{ recurso_id: string }>(
    `SELECT recurso_id FROM integracion.google_recurso
      WHERE entidad_tipo = $1 AND entidad_id = $2 AND servicio = 'calendar'`,
    [ENTIDAD_TIPO_NEGOCIO, reservaId],
  );
  return r.rows[0]?.recurso_id ?? null;
}

export async function guardarEventoCalendarNegocio(
  db: Db,
  reservaId: number,
  opts: { eventoId: string; calendarId: string },
): Promise<void> {
  await db.query(
    `INSERT INTO integracion.google_recurso (entidad_tipo, entidad_id, servicio, contenedor_id, recurso_id)
     VALUES ($1, $2, 'calendar', $3, $4)
     ON CONFLICT (entidad_tipo, entidad_id, servicio)
     DO UPDATE SET contenedor_id = EXCLUDED.contenedor_id, recurso_id = EXCLUDED.recurso_id, sincronizado_en = now()`,
    [ENTIDAD_TIPO_NEGOCIO, reservaId, opts.calendarId, opts.eventoId],
  );
}

export async function eliminarEventoCalendarNegocio(db: Db, reservaId: number): Promise<void> {
  await db.query(
    `DELETE FROM integracion.google_recurso WHERE entidad_tipo = $1 AND entidad_id = $2 AND servicio = 'calendar'`,
    [ENTIDAD_TIPO_NEGOCIO, reservaId],
  );
}

/**
 * Fila del respaldo en Sheets de una reserva (servicio='sheets'). `recurso_id`
 * guarda el número de fila como texto y `contenedor_id` el nombre de la
 * pestaña, para poder sobreescribir esa fila cuando cambia el estado en vez
 * de agregar una fila nueva por cada cambio.
 */
export async function buscarFilaSheetReserva(
  db: Db,
  reservaId: number,
): Promise<{ hoja: string; fila: number } | null> {
  const r = await db.query<{ recurso_id: string; contenedor_id: string | null }>(
    `SELECT recurso_id, contenedor_id FROM integracion.google_recurso
      WHERE entidad_tipo = $1 AND entidad_id = $2 AND servicio = 'sheets'`,
    [ENTIDAD_TIPO_NEGOCIO, reservaId],
  );
  const f = r.rows[0];
  if (!f) return null;
  return { hoja: f.contenedor_id ?? "Reservas", fila: Number(f.recurso_id) };
}

export async function guardarFilaSheetReserva(
  db: Db,
  reservaId: number,
  opts: { hoja: string; fila: number },
): Promise<void> {
  await db.query(
    `INSERT INTO integracion.google_recurso (entidad_tipo, entidad_id, servicio, contenedor_id, recurso_id)
     VALUES ($1, $2, 'sheets', $3, $4)
     ON CONFLICT (entidad_tipo, entidad_id, servicio)
     DO UPDATE SET contenedor_id = EXCLUDED.contenedor_id, recurso_id = EXCLUDED.recurso_id, sincronizado_en = now()`,
    [ENTIDAD_TIPO_NEGOCIO, reservaId, opts.hoja, String(opts.fila)],
  );
}

const ENTIDAD_TIPO_PACIENTE = "reserva_paciente";

/** Evento en el Calendar PERSONAL del paciente (fase 3) — entidad_tipo distinto, ver comentario arriba. */
export async function guardarEventoCalendarPaciente(
  db: Db,
  reservaId: number,
  opts: { eventoId: string },
): Promise<void> {
  await db.query(
    `INSERT INTO integracion.google_recurso (entidad_tipo, entidad_id, servicio, contenedor_id, recurso_id)
     VALUES ($1, $2, 'calendar', 'primary', $3)
     ON CONFLICT (entidad_tipo, entidad_id, servicio)
     DO UPDATE SET recurso_id = EXCLUDED.recurso_id, sincronizado_en = now()`,
    [ENTIDAD_TIPO_PACIENTE, reservaId, opts.eventoId],
  );
}
