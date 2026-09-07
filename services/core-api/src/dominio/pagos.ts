import type { Db } from "../db.js";
import { ErrorDominio, normalizarErrorDb } from "../errores.js";
import * as integraciones from "./integraciones.js";

/** Fecha/hora de Bogotá en texto, para el correo de confirmación. */
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
 * Pagos anticipados de las citas creadas por el bot. Modelo de la base:
 * cada cita del bot nace ligada a una `comercial.compra` de 1 sesión en
 * `pendiente_pago` (ver `agenda.crearSesion`). El paciente reporta el pago
 * (comprobante) -> fila en `comercial.pago` estado `registrado`. El staff
 * lo verifica -> `comercial.verificar_pago()` marca el pago y, si el saldo
 * de la compra llega a 0, confirma en bloque las reservas ligadas.
 *
 * Medio de pago 1 = Nequi / Llave (catalogo.medio_pago).
 */

const MEDIO_PAGO_NEQUI = 1;

export interface PagoReportado {
  pagoId: number;
  valor: number;
  referencia: string | null;
  comprobanteRef: string | null;
  reportadoEn: string;
  reservaId: number;
  iniciaEn: string;
  servicio: string | null;
  sede: string | null;
  paciente: string;
}

export interface ReservaConfirmada {
  reservaId: number;
  servicio: string | null;
  iniciaEn: string;
  chatId: string | null;
}

/** El paciente reportó un pago: se registra sin verificar. `comprobanteRef` = id del archivo (Telegram hoy, Drive luego). */
export async function registrarPago(
  db: Db,
  opts: { compraId: number; valor: number; referencia?: string | null; comprobanteRef?: string | null; creadoPor?: string | null },
): Promise<{ pagoId: number }> {
  try {
    const r = await db.query<{ id: number }>(
      `INSERT INTO comercial.pago
         (compra_id, medio_pago_id, valor, estado, referencia, google_drive_file_id, notas)
       VALUES ($1, $2, $3, 'registrado', $4, $5, $6)
       RETURNING id`,
      [
        opts.compraId,
        MEDIO_PAGO_NEQUI,
        opts.valor,
        opts.referencia ?? null,
        opts.comprobanteRef ?? null,
        opts.creadoPor ? `reportado por chat ${opts.creadoPor}` : null,
      ],
    );
    return { pagoId: Number((r.rows[0] as { id: number | string }).id) };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

/** Pagos `registrado` a la espera de verificación, con datos de la cita y el paciente. */
export async function listarPagosPendientes(db: Db): Promise<PagoReportado[]> {
  const r = await db.query<{
    pago_id: number | string;
    valor: string;
    referencia: string | null;
    comprobante_ref: string | null;
    reportado_en: string;
    reserva_id: number | string;
    inicia_en: string;
    servicio: string | null;
    sede: string | null;
    paciente: string;
  }>(
    `SELECT p.id AS pago_id, p.valor, p.referencia,
            p.google_drive_file_id AS comprobante_ref, p.pagado_en AS reportado_en,
            r.id AS reserva_id, lower(r.franja_clinica) AS inicia_en,
            s.nombre AS servicio, se.nombre AS sede,
            (pa.nombres || ' ' || pa.apellidos) AS paciente
       FROM comercial.pago p
       JOIN agenda.reserva_participante rp ON rp.compra_id = p.compra_id
       JOIN agenda.reserva r ON r.id = rp.reserva_id
       LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
       LEFT JOIN catalogo.sede se ON se.id = r.sede_id
       JOIN personas.paciente pa ON pa.id = rp.paciente_id
      WHERE p.estado = 'registrado'
      ORDER BY p.pagado_en ASC`,
  );
  return r.rows.map((f) => ({
    pagoId: Number(f.pago_id),
    valor: Number(f.valor),
    referencia: f.referencia,
    comprobanteRef: f.comprobante_ref,
    reportadoEn: f.reportado_en,
    reservaId: Number(f.reserva_id),
    iniciaEn: f.inicia_en,
    servicio: f.servicio,
    sede: f.sede,
    paciente: f.paciente,
  }));
}

/** Verifica el pago (función SQL) y devuelve las reservas que quedaron confirmadas, con su chat para avisar. */
export async function verificarPago(
  db: Db,
  opts: { pagoId: number; por?: string | null },
): Promise<{ reservasConfirmadas: ReservaConfirmada[] }> {
  try {
    return await db.tx(async (tx) => {
      await tx.query(`SELECT comercial.verificar_pago($1, $2)`, [opts.pagoId, opts.por ?? null]);
      const r = await tx.query<{
        reserva_id: number | string;
        servicio: string | null;
        inicia_en: string;
        chat_id: string | null;
        paciente_email: string | null;
        sede: string | null;
      }>(
        `SELECT r.id AS reserva_id, s.nombre AS servicio, lower(r.franja_clinica) AS inicia_en,
                vt.chat_id::text AS chat_id, pa.email AS paciente_email, se.nombre AS sede
           FROM comercial.pago p
           JOIN agenda.reserva_participante rp ON rp.compra_id = p.compra_id
           JOIN agenda.reserva r ON r.id = rp.reserva_id AND r.estado = 'confirmada'
           LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
           LEFT JOIN catalogo.sede se ON se.id = r.sede_id
           JOIN personas.paciente pa ON pa.id = rp.paciente_id
           LEFT JOIN personas.vinculo_telegram vt ON vt.paciente_id = rp.paciente_id
          WHERE p.id = $1`,
        [opts.pagoId],
      );

      // Correo "su cita quedó confirmada" a quien dejó un email.
      for (const f of r.rows) {
        if (!f.paciente_email) continue;
        const servicio = f.servicio ?? "su cita";
        await integraciones.enviarCorreo(tx, {
          destinatario: f.paciente_email,
          asunto: `Cita confirmada — ${servicio}`,
          texto: [
            `Su cita de ${servicio} quedó confirmada.`,
            "",
            `Cuándo: ${fechaHoraBogota(f.inicia_en)}`,
            f.sede ? `Dónde: ${f.sede}` : "",
            "",
            "Recibimos su pago. La esperamos. Si necesita reprogramar, escríbanos al 311 398 1422.",
            "",
            "La Fisioterapeuta Li",
          ]
            .filter((l) => l.length > 0)
            .join("\n"),
        });
      }

      return {
        reservasConfirmadas: r.rows.map((f) => ({
          reservaId: Number(f.reserva_id),
          servicio: f.servicio,
          iniciaEn: f.inicia_en,
          chatId: f.chat_id,
        })),
      };
    });
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

/** Rechaza un pago reportado. La cita sigue `pendiente_pago` (podrá reintentar o expirar). */
export async function rechazarPago(
  db: Db,
  opts: { pagoId: number; por?: string | null; motivo?: string | null },
): Promise<{ reservaId: number | null; servicio: string | null; iniciaEn: string | null; chatId: string | null }> {
  try {
    const upd = await db.query<{ compra_id: number | null }>(
      `UPDATE comercial.pago
          SET estado = 'rechazado', verificado_en = now(), verificado_por = $2,
              notas = concat_ws(' | ', notas, $3)
        WHERE id = $1 AND estado = 'registrado'
      RETURNING compra_id`,
      [opts.pagoId, opts.por ?? null, opts.motivo ? `rechazado: ${opts.motivo}` : "rechazado"],
    );
    if (upd.rows.length === 0) {
      throw new ErrorDominio("El pago no existe o ya fue procesado.", "no_encontrado", 404);
    }
    const r = await db.query<{
      reserva_id: number | string;
      servicio: string | null;
      inicia_en: string;
      chat_id: string | null;
    }>(
      `SELECT r.id AS reserva_id, s.nombre AS servicio, lower(r.franja_clinica) AS inicia_en,
              vt.chat_id::text AS chat_id
         FROM comercial.pago p
         JOIN agenda.reserva_participante rp ON rp.compra_id = p.compra_id
         JOIN agenda.reserva r ON r.id = rp.reserva_id
         LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
         LEFT JOIN personas.vinculo_telegram vt ON vt.paciente_id = rp.paciente_id
        WHERE p.id = $1
        LIMIT 1`,
      [opts.pagoId],
    );
    const f = r.rows[0];
    return {
      reservaId: f?.reserva_id === undefined ? null : Number(f.reserva_id),
      servicio: f?.servicio ?? null,
      iniciaEn: f?.inicia_en ?? null,
      chatId: f?.chat_id ?? null,
    };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}
