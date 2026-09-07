import type { Db } from "../db.js";
import { normalizarErrorDb } from "../errores.js";
import * as integraciones from "./integraciones.js";

/**
 * Recordatorios de cita. `integracion.notificacion` ya estaba en el schema
 * (con 'recordatorio_24h' previsto en el comentario de `plantilla`) pero
 * nunca se usó. El bot reclama recordatorios con `reclamarRecordatorios24h`
 * (inserción atómica: el índice único evita que dos barridos manden el
 * mismo recordatorio dos veces) y decide el canal según si la paciente
 * tiene el chat de Telegram vinculado; si no, pide el envío por correo con
 * `enviarRecordatorioPorEmail`.
 */

const PLANTILLA_24H = "recordatorio_24h";

export interface RecordatorioPendiente {
  reservaId: number;
  pacienteId: number;
  paciente: string;
  servicio: string | null;
  sede: string | null;
  iniciaEn: string;
  chatId: string | null;
  pacienteEmail: string | null;
}

/**
 * Indicaciones previas por tipo de servicio (contenido real de Lina, ver
 * services/nlu/conocimiento/primera-cita.md). Duplicado de pagos.ts a
 * propósito (mismo patrón que fechaHoraBogota en este archivo): son módulos
 * independientes y el texto es chico.
 */
function indicacionesPara(servicio: string | null): string {
  const s = (servicio ?? "").toLowerCase();
  if (/punci[oó]n|neural|prp|plasma|suero/.test(s)) {
    return "Venga con ropa holgada y cómoda que dé acceso fácil a la zona a tratar, y le pedimos puntualidad estricta.";
  }
  if (/descarga|modulaci[oó]n/.test(s)) {
    return "Venga con ropa cómoda que permita trabajar la zona a tratar. Si gusta, traiga hidratación y una toalla, y llegue con un poco de anticipación.";
  }
  return "Venga con ropa cómoda o deportiva y calzado adecuado para ejercicio. Si gusta, traiga hidratación y una toalla, y por favor llegue de 5 a 10 minutos antes.";
}

function fechaHoraBogota(iso: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  const h = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${f}, ${h}`;
}

/**
 * Reclama (inserta como 'pendiente') los recordatorios de citas confirmadas
 * que empiezan entre 23 y 25 horas desde ahora y que todavía no tienen un
 * recordatorio registrado. Un INSERT ... SELECT con ON CONFLICT DO NOTHING
 * sobre el índice único: si dos barridos se solapan, el segundo simplemente
 * no reclama nada para las citas que el primero ya tomó.
 */
export async function reclamarRecordatorios24h(db: Db): Promise<RecordatorioPendiente[]> {
  try {
    const r = await db.query<{
      reserva_id: number | string;
      paciente_id: number | string;
      paciente: string;
      servicio: string | null;
      sede: string | null;
      inicia_en: string;
      chat_id: string | null;
      paciente_email: string | null;
    }>(
      `WITH candidatas AS (
         SELECT r.id AS reserva_id, pa.id AS paciente_id,
                (pa.nombres || ' ' || pa.apellidos) AS paciente,
                s.nombre AS servicio, se.nombre AS sede,
                lower(r.franja_clinica) AS inicia_en,
                vt.chat_id::text AS chat_id, pa.email AS paciente_email
           FROM agenda.reserva r
           JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
           JOIN personas.paciente pa ON pa.id = rp.paciente_id
           LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
           LEFT JOIN catalogo.sede se ON se.id = r.sede_id
           LEFT JOIN personas.vinculo_telegram vt ON vt.paciente_id = rp.paciente_id
          WHERE r.estado = 'confirmada'
            AND lower(r.franja_clinica) BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
       ),
       reclamadas AS (
         INSERT INTO integracion.notificacion (paciente_id, reserva_id, plantilla, canal, destinatario, estado)
         SELECT paciente_id, reserva_id, $1,
                (CASE WHEN chat_id IS NOT NULL THEN 'telegram' ELSE 'email' END)::agenda.canal_origen,
                coalesce(chat_id, paciente_email, 'sin_contacto'),
                'pendiente'
           FROM candidatas
         ON CONFLICT (reserva_id, paciente_id, plantilla) WHERE reserva_id IS NOT NULL AND paciente_id IS NOT NULL
         DO NOTHING
         RETURNING reserva_id, paciente_id
       )
       SELECT c.*
         FROM candidatas c
         JOIN reclamadas rec ON rec.reserva_id = c.reserva_id AND rec.paciente_id = c.paciente_id`,
      [PLANTILLA_24H],
    );
    return r.rows.map((f) => ({
      reservaId: Number(f.reserva_id),
      pacienteId: Number(f.paciente_id),
      paciente: f.paciente,
      servicio: f.servicio,
      sede: f.sede,
      iniciaEn: f.inicia_en,
      chatId: f.chat_id,
      pacienteEmail: f.paciente_email,
    }));
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

/**
 * Marca el resultado de un recordatorio que el bot mandó él mismo (canal
 * Telegram: no pasa por el outbox de google-adapter, así que nadie más
 * actualiza esta fila).
 */
export async function marcarRecordatorioResultado(
  db: Db,
  opts: { reservaId: number; pacienteId: number; ok: boolean; error?: string | null },
): Promise<void> {
  try {
    await db.query(
      `UPDATE integracion.notificacion
          SET estado = CASE WHEN $4 THEN 'enviada' ELSE 'fallida' END::integracion.estado_notificacion,
              enviada_en = CASE WHEN $4 THEN now() ELSE NULL END,
              error = $5
        WHERE reserva_id = $1 AND paciente_id = $2 AND plantilla = $3 AND estado = 'pendiente'`,
      [opts.reservaId, opts.pacienteId, PLANTILLA_24H, opts.ok, opts.error ?? null],
    );
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

/**
 * Compone y encola (vía integracion.outbox, igual que el correo de "cita
 * confirmada") el recordatorio por correo para una paciente sin Telegram
 * vinculado, y marca la notificación ya reclamada como enviada.
 */
export async function enviarRecordatorioPorEmail(
  db: Db,
  opts: { reservaId: number; pacienteId: number },
): Promise<{ enviado: boolean }> {
  try {
    return await db.tx(async (tx) => {
      const r = await tx.query<{
        paciente_email: string | null;
        servicio: string | null;
        sede: string | null;
        inicia_en: string;
      }>(
        `SELECT pa.email AS paciente_email, s.nombre AS servicio, se.nombre AS sede,
                lower(r.franja_clinica) AS inicia_en
           FROM agenda.reserva r
           JOIN personas.paciente pa ON pa.id = $2
           LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
           LEFT JOIN catalogo.sede se ON se.id = r.sede_id
          WHERE r.id = $1`,
        [opts.reservaId, opts.pacienteId],
      );
      const f = r.rows[0];
      if (!f?.paciente_email) {
        await marcarRecordatorioResultado(tx, {
          reservaId: opts.reservaId,
          pacienteId: opts.pacienteId,
          ok: false,
          error: "sin correo registrado",
        });
        return { enviado: false };
      }

      const servicio = f.servicio ?? "su cita";
      await integraciones.enviarCorreo(tx, {
        destinatario: f.paciente_email,
        asunto: `Recordatorio — ${servicio} mañana`,
        texto: [
          `Le recordamos su cita de ${servicio} mañana.`,
          "",
          `Cuándo: ${fechaHoraBogota(f.inicia_en)}`,
          f.sede ? `Dónde: ${f.sede}` : "",
          "",
          indicacionesPara(f.servicio),
          "",
          "Si necesita cancelar o reprogramar, escríbanos al 311 398 1422.",
          "",
          "La Fisioterapeuta Li",
        ]
          .filter((l) => l.length > 0)
          .join("\n"),
      });
      await tx.query(
        `UPDATE integracion.notificacion
            SET estado = 'enviada', enviada_en = now()
          WHERE reserva_id = $1 AND paciente_id = $2 AND plantilla = $3 AND estado = 'pendiente'`,
        [opts.reservaId, opts.pacienteId, PLANTILLA_24H],
      );
      return { enviado: true };
    });
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}
