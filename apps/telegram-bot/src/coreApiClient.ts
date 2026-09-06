import { z } from "zod";
import type { Config } from "./config.js";

/**
 * Cliente directo a core-api SOLO para las operaciones de pago (reportar
 * comprobante y verificación por el staff). No son intenciones del modelo,
 * por eso no pasan por n8n. Auth: la misma X-Internal-Key.
 */

const PagoPendiente = z.object({
  pagoId: z.number(),
  valor: z.number(),
  referencia: z.string().nullable(),
  comprobanteRef: z.string().nullable(),
  reportadoEn: z.string(),
  reservaId: z.number(),
  iniciaEn: z.string(),
  servicio: z.string().nullable(),
  sede: z.string().nullable(),
  paciente: z.string(),
});
export type PagoPendiente = z.infer<typeof PagoPendiente>;

const ReservaConfirmada = z.object({
  reservaId: z.number(),
  servicio: z.string().nullable(),
  iniciaEn: z.string(),
  chatId: z.string().nullable(),
});
export type ReservaConfirmada = z.infer<typeof ReservaConfirmada>;

const CitaPorAsistir = z.object({
  reservaId: z.number(),
  iniciaEn: z.string(),
  servicio: z.string().nullable(),
  sede: z.string().nullable(),
  paciente: z.string(),
});
export type CitaPorAsistir = z.infer<typeof CitaPorAsistir>;

const DatosPagoWeb = z.object({
  encontrada: z.boolean(),
  estado: z.string(),
  reservaId: z.number(),
  compraId: z.number().nullable(),
  monto: z.number().nullable(),
  moneda: z.string().nullable(),
  servicio: z.string().nullable(),
  iniciaEn: z.string(),
});
export type DatosPagoWeb = z.infer<typeof DatosPagoWeb>;

const AsistenciaRegistrada = z.object({
  reservaId: z.number(),
  estado: z.string(),
  servicio: z.string().nullable(),
  iniciaEn: z.string(),
  chatId: z.string().nullable(),
});
export type AsistenciaRegistrada = z.infer<typeof AsistenciaRegistrada>;

const RespuestaOk = z.object({ ok: z.literal(true), datos: z.unknown() });

export type ResultadoCoreApi<T> = { ok: true; datos: T } | { ok: false; motivo: "red" | "http" | "respuesta_invalida" };

async function pedir(cfg: Config, ruta: string, cuerpo?: unknown): Promise<ResultadoCoreApi<unknown>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.INTERNAL_API_KEY !== undefined) headers["x-internal-key"] = cfg.INTERNAL_API_KEY;
  let resp: Response;
  try {
    resp = await fetch(new URL(ruta, cfg.CORE_API_URL), {
      method: cuerpo === undefined ? "GET" : "POST",
      headers,
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
      signal: AbortSignal.timeout(cfg.BOT_CORE_API_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, motivo: "red" };
  }
  const json: unknown = await resp.json().catch(() => null);
  if (!resp.ok) return { ok: false, motivo: "http" };
  const parsed = RespuestaOk.safeParse(json);
  if (!parsed.success) return { ok: false, motivo: "respuesta_invalida" };
  return { ok: true, datos: parsed.data.datos };
}

export interface ClienteCoreApi {
  registrarPago(
    cfg: Config,
    p: { compraId: number; valor: number; referencia?: string | null; comprobanteRef?: string | null; creadoPor: string },
  ): Promise<ResultadoCoreApi<{ pagoId: number }>>;
  pagosPendientes(cfg: Config): Promise<ResultadoCoreApi<{ pagos: PagoPendiente[] }>>;
  verificarPago(
    cfg: Config,
    p: { pagoId: number; por: string },
  ): Promise<ResultadoCoreApi<{ reservasConfirmadas: ReservaConfirmada[] }>>;
  rechazarPago(
    cfg: Config,
    p: { pagoId: number; por: string; motivo?: string },
  ): Promise<ResultadoCoreApi<{ reservaId: number | null; servicio: string | null; iniciaEn: string | null; chatId: string | null }>>;
  citasPorAsistir(cfg: Config): Promise<ResultadoCoreApi<{ citas: CitaPorAsistir[] }>>;
  registrarAsistencia(
    cfg: Config,
    p: { reservaId: number; asistio: boolean; por: string },
  ): Promise<ResultadoCoreApi<AsistenciaRegistrada>>;
  iniciarPagoWeb(
    cfg: Config,
    p: { reservaUuid: string; chatId: number },
  ): Promise<ResultadoCoreApi<DatosPagoWeb>>;
}

export const coreApi: ClienteCoreApi = {
  async registrarPago(cfg, p) {
    const r = await pedir(cfg, "/pagos", {
      compra_id: p.compraId,
      valor: p.valor,
      referencia: p.referencia ?? null,
      comprobante_ref: p.comprobanteRef ?? null,
      creado_por: p.creadoPor,
    });
    if (!r.ok) return r;
    const d = z.object({ pagoId: z.number() }).safeParse(r.datos);
    return d.success ? { ok: true, datos: d.data } : { ok: false, motivo: "respuesta_invalida" };
  },
  async pagosPendientes(cfg) {
    const r = await pedir(cfg, "/pagos/pendientes");
    if (!r.ok) return r;
    const d = z.object({ pagos: z.array(PagoPendiente) }).safeParse(r.datos);
    return d.success ? { ok: true, datos: d.data } : { ok: false, motivo: "respuesta_invalida" };
  },
  async verificarPago(cfg, p) {
    const r = await pedir(cfg, "/pagos/verificar", { pago_id: p.pagoId, por: p.por });
    if (!r.ok) return r;
    const d = z.object({ reservasConfirmadas: z.array(ReservaConfirmada) }).safeParse(r.datos);
    return d.success ? { ok: true, datos: d.data } : { ok: false, motivo: "respuesta_invalida" };
  },
  async rechazarPago(cfg, p) {
    const r = await pedir(cfg, "/pagos/rechazar", { pago_id: p.pagoId, por: p.por, motivo: p.motivo ?? null });
    if (!r.ok) return r;
    const d = z
      .object({
        reservaId: z.number().nullable(),
        servicio: z.string().nullable(),
        iniciaEn: z.string().nullable(),
        chatId: z.string().nullable(),
      })
      .safeParse(r.datos);
    return d.success ? { ok: true, datos: d.data } : { ok: false, motivo: "respuesta_invalida" };
  },
  async citasPorAsistir(cfg) {
    const r = await pedir(cfg, "/citas/por-asistir");
    if (!r.ok) return r;
    const d = z.object({ citas: z.array(CitaPorAsistir) }).safeParse(r.datos);
    return d.success ? { ok: true, datos: d.data } : { ok: false, motivo: "respuesta_invalida" };
  },
  async registrarAsistencia(cfg, p) {
    const r = await pedir(cfg, "/asistencia", { reserva_id: p.reservaId, asistio: p.asistio, por: p.por });
    if (!r.ok) return r;
    const d = AsistenciaRegistrada.safeParse(r.datos);
    return d.success ? { ok: true, datos: d.data } : { ok: false, motivo: "respuesta_invalida" };
  },
  async iniciarPagoWeb(cfg, p) {
    const r = await pedir(cfg, "/pagos/web/iniciar", { reserva_uuid: p.reservaUuid, chat_id: p.chatId });
    if (!r.ok) return r;
    const d = DatosPagoWeb.safeParse(r.datos);
    return d.success ? { ok: true, datos: d.data } : { ok: false, motivo: "respuesta_invalida" };
  },
};
