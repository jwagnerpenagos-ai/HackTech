import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Calendar, MapPin, Stethoscope, Landmark, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Container } from "@/components/ui/container";
import { api, ApiError } from "@/lib/api";

/**
 * Checkout del sitio: resumen de la reserva (estilo carrito) + instrucciones
 * de pago por transferencia. Al confirmar se registra la intención de pago y
 * Lina la verifica desde Telegram — el mecanismo es el mismo que antes, solo
 * cambió la presentación (sin rótulos de "modo demo").
 */

function fechaLegible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
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
    hour12: true,
  }).format(d);
  return `${f} · ${h}`;
}

function montoLegible(monto: number | null, moneda: string | null): string {
  if (monto == null) return "el valor de la cita";
  return `$${monto.toLocaleString("es-CO")} ${moneda ?? "COP"}`;
}

export default function PagoSimuladoPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ref = params.get("ref") ?? "";

  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["checkout", ref],
    queryFn: () => api.checkout(ref),
    enabled: ref.length > 0,
    retry: false,
  });

  async function pagar() {
    setError("");
    setPagando(true);
    try {
      await api.simularPago(ref);
      navigate(`/reservar/resultado?ref=${encodeURIComponent(ref)}`);
    } catch (e) {
      const codigo = e instanceof ApiError ? e.codigo : "error";
      setError(
        codigo === "no_pendiente"
          ? "Esta cita ya no está pendiente de pago."
          : "No pudimos iniciar el pago. Intenta de nuevo en un momento.",
      );
      setPagando(false);
    }
  }

  const faltaRef = ref.length === 0;
  const yaPagada = data?.estado === "confirmada";

  return (
    <>
      <Navbar />
      <main className="relative flex-1 overflow-hidden bg-slate-50 py-14 sm:py-20">
        <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-64" />
        <Container className="relative max-w-3xl pb-16">
          <h1 className="font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">Confirmar tu reserva</h1>
          <p className="mt-1.5 text-sm text-ink-600">Revisa los detalles antes de continuar.</p>

          {faltaRef && (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              Enlace de pago incompleto. Vuelve a reservar desde el sitio.
            </p>
          )}

          {!faltaRef && isLoading && (
            <p className="mt-10 py-8 text-center text-sm text-ink-600">Cargando el detalle de tu cita…</p>
          )}

          {!faltaRef && isError && (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              No encontramos esa reserva. Si el enlace es viejo, vuelve a reservar en el sitio.
            </p>
          )}

          {data && (
            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
              {/* Columna izquierda: resumen tipo carrito */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tu reserva</p>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="flex items-start gap-3.5 px-6 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <Stethoscope size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-900">{data.servicio ?? "Cita"}</p>
                      <p className="text-xs text-ink-500">Servicio</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-ink-900">
                      {montoLegible(data.monto, data.moneda)}
                    </span>
                  </div>

                  <div className="flex items-start gap-3.5 px-6 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Calendar size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{fechaLegible(data.iniciaEn)}</p>
                      <p className="text-xs text-ink-500">Fecha y hora</p>
                    </div>
                  </div>

                  {data.sede && (
                    <div className="flex items-start gap-3.5 px-6 py-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                        <MapPin size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-900">{data.sede}</p>
                        <p className="text-xs text-ink-500">Sede</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                  <span className="text-sm font-semibold text-ink-700">Total</span>
                  <span className="font-display text-xl font-extrabold text-brand-800">
                    {montoLegible(data.monto, data.moneda)}
                  </span>
                </div>
              </div>

              {/* Columna derecha: pago */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Forma de pago</p>
                </div>
                <div className="space-y-4 px-6 py-5">
                  <div className="flex items-start gap-3 rounded-xl bg-brand-50/60 p-3.5">
                    <Landmark size={18} className="mt-0.5 shrink-0 text-brand-700" />
                    <div className="text-xs leading-relaxed text-ink-700">
                      Transfiere el total a la Llave Nequi
                      <p className="mt-0.5 font-mono text-sm font-bold text-ink-900">{data.nequi ?? "311 398 1422"}</p>
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                      {error}
                    </p>
                  )}

                  {yaPagada ? (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-700">
                      Esta cita ya está confirmada. ✅
                    </p>
                  ) : (
                    <motion.button
                      type="button"
                      onClick={pagar}
                      disabled={pagando}
                      whileTap={{ scale: 0.98 }}
                      className="w-full rounded-xl bg-brand-800 px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-brand-800/20 transition hover:bg-brand-900 disabled:opacity-60"
                    >
                      {pagando ? "Procesando…" : "Ya transferí, confirmar"}
                    </motion.button>
                  )}

                  <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-500">
                    <ShieldCheck size={13} className="mt-0.5 shrink-0 text-brand-600" />
                    Verificamos tu pago y te confirmamos la cita por correo en unos minutos.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <a href="/" className="text-xs font-semibold text-ink-500 hover:text-brand-800">
              Cancelar y volver al inicio
            </a>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
