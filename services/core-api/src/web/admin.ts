import type { Db } from "../db.js";
import { ErrorDominio } from "../errores.js";
import * as agenda from "../dominio/agenda.js";
import * as asistencia from "../dominio/asistencia.js";

/**
 * Lógica del panel de Lina. La autenticación (token) se resuelve en las
 * rutas; acá solo van las operaciones ya autorizadas.
 */

export interface CitaAdmin {
  reservaId: number;
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
    estado: string;
    inicia_en: string;
    termina_en: string;
    servicio_nombre: string | null;
    sede_nombre: string;
    paciente_nombre: string | null;
    paciente_telefono: string | null;
    canal_origen: string;
  }>(
    `SELECT reserva_id, estado, inicia_en, termina_en, servicio_nombre, sede_nombre,
            paciente_nombre, paciente_telefono, canal_origen
       FROM agenda.v_cita
      WHERE inicia_en >= $1 AND inicia_en < $2
        AND ($3::text IS NULL OR sede_nombre ILIKE $3)
      ORDER BY inicia_en`,
    [opts.desdeIso, opts.hastaIso, opts.sedeNombre ? `%${opts.sedeNombre}%` : null],
  );
  return r.rows.map((f) => ({
    reservaId: Number(f.reserva_id),
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
