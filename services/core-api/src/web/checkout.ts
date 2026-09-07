import type { Db } from "../db.js";
import { ErrorDominio } from "../errores.js";
import * as pagos from "../dominio/pagos.js";

/**
 * Checkout de pago del sitio web. NO es una pasarela real: el paciente hace
 * clic en "Pagar", se registra un `comercial.pago` `registrado` (sin
 * comprobante), y Lina lo verifica desde su Telegram — igual que un pago
 * reportado por el bot. La pantalla del sitio queda en "pago en proceso"
 * consultando el estado hasta que Lina confirma (o rechaza).
 *
 * La reserva se identifica por su `uuid` público (el `ref` que viaja en la URL).
 */

interface FilaReserva {
  id: number | string;
  estado: string;
  compra_id: number | string | null;
  valor_total: string | null;
  moneda: string | null;
  servicio: string | null;
  sede: string | null;
  paciente: string;
  inicia_en: string;
  codigo_referido: string | null;
}

async function buscarReserva(db: Db, uuid: string): Promise<FilaReserva> {
  const r = await db.query<FilaReserva>(
    `SELECT r.id, r.estado, rp.compra_id,
            c.valor_total, c.moneda,
            s.nombre AS servicio, se.nombre AS sede,
            (pa.nombres || ' ' || pa.apellidos) AS paciente,
            lower(r.franja_clinica) AS inicia_en,
            pa.codigo_referido
       FROM agenda.reserva r
       LEFT JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
       LEFT JOIN comercial.compra c ON c.id = rp.compra_id
       LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
       LEFT JOIN catalogo.sede se ON se.id = r.sede_id
       LEFT JOIN personas.paciente pa ON pa.id = rp.paciente_id
      WHERE r.uuid = $1 AND r.tipo = 'cita'
      LIMIT 1`,
    [uuid],
  );
  const f = r.rows[0];
  if (!f) throw new ErrorDominio("No se encontró esa reserva.", "no_encontrado", 404);
  return f;
}

export interface DatosCheckout {
  reservaId: number;
  estado: string;
  servicio: string | null;
  sede: string | null;
  paciente: string;
  iniciaEn: string;
  monto: number | null;
  moneda: string | null;
  nequi: string;
  codigoReferido: string | null;
}

export async function datosCheckout(db: Db, uuid: string): Promise<DatosCheckout> {
  const f = await buscarReserva(db, uuid);
  return {
    reservaId: Number(f.id),
    estado: f.estado,
    servicio: f.servicio,
    sede: f.sede,
    paciente: f.paciente,
    iniciaEn: f.inicia_en,
    monto: f.valor_total === null ? null : Number(f.valor_total),
    moneda: f.moneda,
    nequi: "3113981422",
    codigoReferido: f.codigo_referido,
  };
}

/** "Pagar": abre el pago (si no hay uno ya) para que Lina lo verifique. */
export async function simularPago(db: Db, uuid: string): Promise<{ pagoId: number; estado: string }> {
  const f = await buscarReserva(db, uuid);
  if (f.compra_id === null || f.valor_total === null) {
    throw new ErrorDominio("Esa reserva no tiene un pago pendiente.", "sin_pago", 422);
  }
  if (f.estado !== "pendiente_pago") {
    throw new ErrorDominio(`Esa cita ya está "${f.estado}".`, "no_pendiente", 422);
  }

  const compraId = Number(f.compra_id);
  const ya = await db.query<{ id: number | string; estado: string }>(
    `SELECT id, estado FROM comercial.pago
      WHERE compra_id = $1 AND estado IN ('registrado', 'verificado')
      ORDER BY id DESC LIMIT 1`,
    [compraId],
  );
  if (ya.rows[0]) return { pagoId: Number(ya.rows[0].id), estado: ya.rows[0].estado };

  const { pagoId } = await pagos.registrarPago(db, {
    compraId,
    valor: Number(f.valor_total),
    comprobanteRef: null,
    creadoPor: "pago-simulado-web",
  });
  return { pagoId, estado: "registrado" };
}

export interface EstadoPagoWeb {
  estado: "sin_pago" | "en_proceso" | "aprobado" | "rechazado";
  reservaId: number;
  codigoReferido: string | null;
  servicio: string | null;
}

export async function estadoPagoWeb(db: Db, uuid: string): Promise<EstadoPagoWeb> {
  const f = await buscarReserva(db, uuid);
  const reservaId = Number(f.id);
  const codigoReferido = f.codigo_referido;
  const servicio = f.servicio;
  if (f.estado === "confirmada") return { estado: "aprobado", reservaId, codigoReferido, servicio };
  if (f.compra_id === null) return { estado: "sin_pago", reservaId, codigoReferido, servicio };

  const p = await db.query<{ estado: string }>(
    `SELECT estado FROM comercial.pago WHERE compra_id = $1 ORDER BY id DESC LIMIT 1`,
    [Number(f.compra_id)],
  );
  const e = p.rows[0]?.estado;
  if (e === "verificado") return { estado: "aprobado", reservaId, codigoReferido, servicio };
  if (e === "rechazado") return { estado: "rechazado", reservaId, codigoReferido, servicio };
  if (e === "registrado") return { estado: "en_proceso", reservaId, codigoReferido, servicio };
  return { estado: "sin_pago", reservaId, codigoReferido, servicio };
}
