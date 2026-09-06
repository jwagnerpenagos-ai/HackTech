import type { Db } from "../db.js";
import { ErrorDominio, normalizarErrorDb } from "../errores.js";

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
      }>(
        `SELECT r.id AS reserva_id, s.nombre AS servicio, lower(r.franja_clinica) AS inicia_en,
                vt.chat_id::text AS chat_id
           FROM comercial.pago p
           JOIN agenda.reserva_participante rp ON rp.compra_id = p.compra_id
           JOIN agenda.reserva r ON r.id = rp.reserva_id AND r.estado = 'confirmada'
           LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
           LEFT JOIN personas.vinculo_telegram vt ON vt.paciente_id = rp.paciente_id
          WHERE p.id = $1`,
        [opts.pagoId],
      );
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

/**
 * Entrada del flujo "pagar por Telegram" que arranca desde el sitio web: el
 * paciente abre t.me/<bot>?start=pago_<uuid>. Se busca la reserva por su
 * uuid público, se vincula el chat al paciente (si aún no lo está) y se
 * devuelven los datos que el bot necesita para pedir el comprobante. El
 * comprobante en sí lo registra `registrarPago` cuando llega la foto.
 */
export interface DatosPagoWeb {
  encontrada: boolean;
  estado: string;
  reservaId: number;
  compraId: number | null;
  monto: number | null;
  moneda: string | null;
  servicio: string | null;
  iniciaEn: string;
}

export async function iniciarPagoWeb(
  db: Db,
  opts: { reservaUuid: string; chatId: number },
): Promise<DatosPagoWeb> {
  const r = await db.query<{
    id: number | string;
    estado: string;
    compra_id: number | string | null;
    paciente_id: number | string | null;
    valor_total: string | null;
    moneda: string | null;
    servicio: string | null;
    inicia_en: string;
  }>(
    `SELECT r.id, r.estado, rp.compra_id, rp.paciente_id,
            c.valor_total, c.moneda, s.nombre AS servicio,
            lower(r.franja_clinica) AS inicia_en
       FROM agenda.reserva r
       LEFT JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
       LEFT JOIN comercial.compra c ON c.id = rp.compra_id
       LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
      WHERE r.uuid = $1 AND r.tipo = 'cita'
      LIMIT 1`,
    [opts.reservaUuid],
  );
  const f = r.rows[0];
  if (!f) throw new ErrorDominio("No se encontró esa reserva.", "no_encontrado", 404);

  if (f.paciente_id !== null) {
    await db.query(
      `INSERT INTO personas.vinculo_telegram (chat_id, paciente_id, verificado_en)
       VALUES ($1, $2, now())
       ON CONFLICT (chat_id) DO NOTHING`,
      [opts.chatId, Number(f.paciente_id)],
    );
  }

  return {
    encontrada: true,
    estado: f.estado,
    reservaId: Number(f.id),
    compraId: f.compra_id === null ? null : Number(f.compra_id),
    monto: f.valor_total === null ? null : Number(f.valor_total),
    moneda: f.moneda,
    servicio: f.servicio,
    iniciaEn: f.inicia_en,
  };
}
