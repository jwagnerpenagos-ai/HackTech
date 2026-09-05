import type { Db } from "../db.js";

/**
 * Detalle de una cita para armar el evento de Calendar / el correo de
 * confirmación. Reutiliza `agenda.v_cita` (misma vista que ya usa core-api),
 * incluyendo el calendario de Google de la sede — cada sede tiene el suyo
 * (`catalogo.sede.google_calendar_id`), no hay un calendario único del
 * negocio.
 */
export interface DetalleCita {
  reservaId: number;
  estado: string;
  iniciaEn: string;
  terminaEn: string;
  sedeNombre: string;
  googleCalendarId: string | null;
  servicioNombre: string | null;
  pacienteNombre: string | null;
}

interface FilaCita {
  reserva_id: number;
  estado: string;
  inicia_en: string;
  termina_en: string;
  sede_nombre: string;
  google_calendar_id: string | null;
  servicio_nombre: string | null;
  paciente_nombre: string | null;
}

export async function obtenerCita(db: Db, reservaId: number): Promise<DetalleCita | null> {
  const r = await db.query<FilaCita>(
    `SELECT reserva_id, estado, inicia_en, termina_en, sede_nombre, google_calendar_id, servicio_nombre, paciente_nombre
       FROM agenda.v_cita
      WHERE reserva_id = $1`,
    [reservaId],
  );
  const f = r.rows[0];
  if (!f) return null;
  return {
    reservaId: f.reserva_id,
    estado: f.estado,
    iniciaEn: f.inicia_en,
    terminaEn: f.termina_en,
    sedeNombre: f.sede_nombre,
    googleCalendarId: f.google_calendar_id,
    servicioNombre: f.servicio_nombre,
    pacienteNombre: f.paciente_nombre,
  };
}
