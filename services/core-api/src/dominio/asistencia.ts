import type { Db } from "../db.js";
import { ErrorDominio, normalizarErrorDb } from "../errores.js";
import * as integraciones from "./integraciones.js";

/**
 * Registro de asistencia a la cita por parte del personal del consultorio.
 * Es lo que "cierra" una cita: `confirmada`/`en_curso` -> `atendida` (o
 * `no_asistio`). Importa porque la primera valoración debe quedar ATENDIDA
 * para que el paciente pueda reservar los demás servicios (ver
 * `pacientes.tieneValoracionAtendida`).
 *
 * Va fuera de `/comandos`: no es una intención del modelo, es una operación
 * interna de staff, igual que la verificación de pagos.
 */

export interface CitaPorAsistir {
  reservaId: number;
  iniciaEn: string;
  servicio: string | null;
  sede: string | null;
  paciente: string;
}

/**
 * Citas confirmadas todavía sin cerrar (asistió / no asistió). No se filtra
 * por hora: el personal puede necesitar cerrar la del momento o dejar
 * lista la del día. Orden cronológico, las más próximas primero.
 */
export async function listarCitasPorAsistir(db: Db): Promise<CitaPorAsistir[]> {
  const r = await db.query<{
    reserva_id: number | string;
    inicia_en: string;
    servicio: string | null;
    sede: string | null;
    paciente: string;
  }>(
    `SELECT r.id AS reserva_id, lower(r.franja_clinica) AS inicia_en,
            s.nombre AS servicio, se.nombre AS sede,
            (pa.nombres || ' ' || pa.apellidos) AS paciente
       FROM agenda.reserva r
       JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
       JOIN personas.paciente pa ON pa.id = rp.paciente_id
       LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
       LEFT JOIN catalogo.sede se ON se.id = r.sede_id
      WHERE r.tipo = 'cita'
        AND r.estado IN ('confirmada', 'en_curso')
      ORDER BY lower(r.franja_clinica) ASC
      LIMIT 30`,
  );
  return r.rows.map((f) => ({
    reservaId: Number(f.reserva_id),
    iniciaEn: f.inicia_en,
    servicio: f.servicio,
    sede: f.sede,
    paciente: f.paciente,
  }));
}

export interface AsistenciaRegistrada {
  reservaId: number;
  estado: string;
  servicio: string | null;
  iniciaEn: string;
  chatId: string | null;
}

/**
 * Marca la cita como `atendida` (asistió) o `no_asistio`. Solo aplica sobre
 * citas `confirmada`/`en_curso`: una cita sin pagar o ya cerrada no se toca.
 */
export async function registrarAsistencia(
  db: Db,
  opts: { reservaId: number; asistio: boolean; por?: string | null },
): Promise<AsistenciaRegistrada> {
  const nuevoEstado = opts.asistio ? "atendida" : "no_asistio";
  const nuevaAsistencia = opts.asistio ? "asistio" : "no_asistio";
  try {
    return await db.tx(async (tx) => {
      const upd = await tx.query<{ id: number | string }>(
        `UPDATE agenda.reserva
            SET estado = $2
          WHERE id = $1 AND tipo = 'cita' AND estado IN ('confirmada', 'en_curso')
        RETURNING id`,
        [opts.reservaId, nuevoEstado],
      );
      if (upd.rows.length === 0) {
        throw new ErrorDominio(
          "La cita no existe o no está en un estado que permita registrar asistencia (debe estar confirmada).",
          "no_encontrado",
          404,
        );
      }
      await tx.query(
        `UPDATE agenda.reserva_participante
            SET asistencia = $2
          WHERE reserva_id = $1 AND asistencia = 'pendiente'`,
        [opts.reservaId, nuevaAsistencia],
      );
      await integraciones.sincronizarEstadoReservaEnSheet(tx, opts.reservaId, nuevoEstado);
      const r = await tx.query<{
        estado: string;
        servicio: string | null;
        inicia_en: string;
        chat_id: string | null;
      }>(
        `SELECT r.estado, s.nombre AS servicio, lower(r.franja_clinica) AS inicia_en,
                vt.chat_id::text AS chat_id
           FROM agenda.reserva r
           LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
           LEFT JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
           LEFT JOIN personas.vinculo_telegram vt ON vt.paciente_id = rp.paciente_id
          WHERE r.id = $1
          LIMIT 1`,
        [opts.reservaId],
      );
      const f = r.rows[0];
      return {
        reservaId: opts.reservaId,
        estado: f?.estado ?? nuevoEstado,
        servicio: f?.servicio ?? null,
        iniciaEn: f?.inicia_en ?? "",
        chatId: f?.chat_id ?? null,
      };
    });
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}
