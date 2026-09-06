import type { Config } from "../config.js";

/**
 * Capa de pasarela de pago para el flujo web. Tres modos (`PASARELA_MODO`):
 *  - `manual`      — sin pasarela: la reserva queda pendiente_pago y Lina la
 *                    confirma desde el panel (transferencia Nequi).
 *  - `mock`        — checkout simulado servido por el propio sitio, para
 *                    demostrar el flujo automatizado sin cuenta de pasarela.
 *  - `mercadopago` — Checkout Pro real. Necesita `MP_ACCESS_TOKEN` (usar el
 *                    token de PRUEBA `TEST-…` del panel de desarrolladores).
 *
 * El webhook (`notification_url`) es el camino robusto de producción; acá se
 * consulta el estado del pago al volver del checkout — más simple, sin túnel.
 */

export type ModoPasarela = "manual" | "mock" | "mercadopago";

export interface Pasarela {
  modo: ModoPasarela;
  /** true si hay que redirigir a un checkout (mock o mercadopago). */
  activa: boolean;
  accessToken: string;
  sitioUrl: string;
}

export function pasarelaDeConfig(cfg: Config): Pasarela {
  let modo = cfg.PASARELA_MODO;
  if (modo === "mercadopago" && cfg.MP_ACCESS_TOKEN.length === 0) modo = "manual";
  return {
    modo,
    activa: modo === "mock" || modo === "mercadopago",
    accessToken: cfg.MP_ACCESS_TOKEN,
    sitioUrl: cfg.WEB_PUBLIC_URL.replace(/\/$/, ""),
  };
}

export type EstadoTx = "aprobado" | "rechazado" | "pendiente" | null;

interface CheckoutOpts {
  referencia: string;
  monto: number;
  moneda: string;
  descripcion: string;
  email?: string | null;
}

/** Devuelve la URL a la que el sitio debe mandar al paciente para pagar. */
export async function crearCheckout(p: Pasarela, opts: CheckoutOpts): Promise<string | null> {
  if (p.modo === "mock") {
    const q = new URLSearchParams({
      ref: opts.referencia,
      monto: String(Math.round(opts.monto)),
      moneda: opts.moneda,
    });
    return `${p.sitioUrl}/reservar/pago-simulado?${q.toString()}`;
  }
  if (p.modo === "mercadopago") {
    return crearPreferenciaMercadoPago(p, opts);
  }
  return null;
}

// --- Mercado Pago (Checkout Pro) ----------------------------------------

interface PreferenciaResp {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

async function crearPreferenciaMercadoPago(p: Pasarela, opts: CheckoutOpts): Promise<string | null> {
  const retorno = `${p.sitioUrl}/reservar/resultado?ref=${encodeURIComponent(opts.referencia)}`;
  const body = {
    items: [
      {
        title: opts.descripcion,
        quantity: 1,
        unit_price: Math.round(opts.monto),
        currency_id: opts.moneda,
      },
    ],
    back_urls: { success: retorno, pending: retorno, failure: retorno },
    auto_return: "approved",
    external_reference: opts.referencia,
    ...(opts.email ? { payer: { email: opts.email } } : {}),
  };
  try {
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${p.accessToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as PreferenciaResp;
    return d.sandbox_init_point ?? d.init_point ?? null;
  } catch {
    return null;
  }
}

const MAPA_MP: Record<string, EstadoTx> = {
  approved: "aprobado",
  authorized: "aprobado",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "rechazado",
  charged_back: "rechazado",
  pending: "pendiente",
  in_process: "pendiente",
  in_mediation: "pendiente",
};

async function pedirMp<T>(p: Pasarela, url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { authorization: `Bearer ${p.accessToken}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Estado del pago en la pasarela, por id de pago o por nuestra referencia. */
export async function estadoTransaccion(
  p: Pasarela,
  opts: { referencia?: string | undefined; paymentId?: string | undefined },
): Promise<EstadoTx> {
  if (p.modo !== "mercadopago") return null;

  if (opts.paymentId) {
    const d = await pedirMp<{ status?: string }>(p, `https://api.mercadopago.com/v1/payments/${opts.paymentId}`);
    if (d?.status) return MAPA_MP[d.status] ?? "pendiente";
  }
  if (opts.referencia) {
    const d = await pedirMp<{ results?: { status?: string; date_created?: string }[] }>(
      p,
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(opts.referencia)}&sort=date_created&criteria=desc`,
    );
    const ultimo = d?.results?.[0];
    if (ultimo?.status) return MAPA_MP[ultimo.status] ?? "pendiente";
  }
  return "pendiente";
}
