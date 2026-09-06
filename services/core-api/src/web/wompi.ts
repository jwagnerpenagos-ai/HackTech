import { createHash } from "node:crypto";
import type { Config } from "../config.js";

/**
 * Adaptador de la pasarela de pago Wompi (Colombia). Solo lo que necesita el
 * flujo web: armar la URL del Web Checkout (con la firma de integridad
 * calculada en el servidor) y consultar el estado de una transacción.
 *
 * El webhook firmado `transaction.updated` es el camino de producción; acá
 * se usa la consulta de estado al volver del checkout, más simple y sin
 * túnel. Ver contracts/web-api.md.
 */

export interface Wompi {
  /** Hay pasarela (real o simulada): el sitio debe redirigir a `checkoutUrl`. */
  habilitado: boolean;
  /** Checkout simulado por el propio sitio, sin cuenta de Wompi (demo). */
  mock: boolean;
  publicKey: string;
  integritySecret: string;
  apiBase: string;
  checkoutBase: string;
  redirectBase: string;
}

export function wompiDeConfig(cfg: Config): Wompi {
  const mock = cfg.WOMPI_ENV === "mock";
  const conLlaves = cfg.WOMPI_PUBLIC_KEY.length > 0 && cfg.WOMPI_INTEGRITY_SECRET.length > 0;
  const sitio = cfg.WEB_PUBLIC_URL.replace(/\/$/, "");
  const apiBase =
    cfg.WOMPI_ENV === "production" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
  return {
    habilitado: mock || conLlaves,
    mock,
    publicKey: cfg.WOMPI_PUBLIC_KEY,
    integritySecret: cfg.WOMPI_INTEGRITY_SECRET,
    apiBase,
    checkoutBase: mock ? `${sitio}/reservar/pago-simulado` : "https://checkout.wompi.co/p/",
    redirectBase: `${sitio}/reservar/resultado`,
  };
}

/** SHA256(referencia + montoEnCentavos + moneda + secretoDeIntegridad). */
export function firmaIntegridad(
  referencia: string,
  montoCents: number,
  moneda: string,
  integritySecret: string,
): string {
  return createHash("sha256")
    .update(`${referencia}${String(montoCents)}${moneda}${integritySecret}`)
    .digest("hex");
}

export function urlCheckout(
  w: Wompi,
  opts: {
    referencia: string;
    montoCents: number;
    moneda: string;
    email?: string | null;
    nombre?: string | null;
    telefono?: string | null;
  },
): string {
  if (w.mock) {
    const q = new URLSearchParams({
      ref: opts.referencia,
      monto: String(opts.montoCents),
      moneda: opts.moneda,
    });
    return `${w.checkoutBase}?${q.toString()}`;
  }
  const q = new URLSearchParams({
    "public-key": w.publicKey,
    currency: opts.moneda,
    "amount-in-cents": String(opts.montoCents),
    reference: opts.referencia,
    "redirect-url": `${w.redirectBase}?ref=${encodeURIComponent(opts.referencia)}`,
    "signature:integrity": firmaIntegridad(opts.referencia, opts.montoCents, opts.moneda, w.integritySecret),
  });
  if (opts.email) q.set("customer-data:email", opts.email);
  if (opts.nombre) q.set("customer-data:full-name", opts.nombre);
  if (opts.telefono) q.set("customer-data:phone-number", opts.telefono);
  return `${w.checkoutBase}?${q.toString()}`;
}

export type EstadoWompi = "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "PENDING" | "DESCONOCIDO";

interface TransaccionWompi {
  estado: EstadoWompi;
  referencia: string | null;
  montoCents: number | null;
}

interface FilaTxWompi {
  status?: string;
  reference?: string;
  amount_in_cents?: number;
}

const ESTADOS_WOMPI: readonly string[] = ["APPROVED", "DECLINED", "VOIDED", "ERROR", "PENDING"];

function aTransaccion(t: FilaTxWompi | undefined): TransaccionWompi | null {
  if (!t) return null;
  const s = (t.status ?? "").toUpperCase();
  const estado: EstadoWompi = ESTADOS_WOMPI.includes(s) ? (s as EstadoWompi) : "DESCONOCIDO";
  return {
    estado,
    referencia: t.reference ?? null,
    montoCents: typeof t.amount_in_cents === "number" ? t.amount_in_cents : null,
  };
}

async function pedirWompi<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function consultarPorReferencia(w: Wompi, referencia: string): Promise<TransaccionWompi | null> {
  const resp = await pedirWompi<{ data?: FilaTxWompi[] }>(
    `${w.apiBase}/transactions?reference=${encodeURIComponent(referencia)}`,
  );
  const filas = resp?.data ?? [];
  // La más reciente que corresponda a esa referencia.
  return aTransaccion(filas[filas.length - 1]);
}

export async function consultarPorId(w: Wompi, transactionId: string): Promise<TransaccionWompi | null> {
  const resp = await pedirWompi<{ data?: FilaTxWompi }>(
    `${w.apiBase}/transactions/${encodeURIComponent(transactionId)}`,
  );
  return aTransaccion(resp?.data);
}
