import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ShieldCheck, Lock } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Container } from "@/components/ui/container";
import { api, ApiError } from "@/lib/api";

/**
 * Checkout de pago SIMULADO. No es Nequi ni ninguna pasarela real: al pulsar
 * "Pagar" se registra la intención de pago y Lina la confirma manualmente
 * desde Telegram. La estética evoca una billetera digital, pero la pantalla
 * está rotulada como demo para que nadie la confunda con la marca real.
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
      <main className="relative flex-1 overflow-hidden bg-white py-14 sm:py-20">
        <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-64" />
        <Container className="relative max-w-lg pb-16">
          {/* Aviso de que es una simulación */}
          <div className="mb-4 flex items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Modo demostración · Pago simulado
          </div>

          <div className="overflow-hidden rounded-3xl border border-fuchsia-200 shadow-xl">
            {/* Cabecera tipo billetera (color propio, sin marca real) */}
            <div className="bg-gradient-to-br from-fuchsia-600 to-purple-700 px-6 py-7 text-white">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                Pasarela de pago (simulada)
              </p>
              <p className="mt-1 font-display text-2xl font-extrabold">La Fisioterapeuta Li</p>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-white/80">
                <Lock size={13} /> Transferencia a la Llave Nequi {data?.nequi ?? "311 398 1422"}
              </p>
            </div>

            <div className="space-y-5 bg-white px-6 py-7">
              {faltaRef && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  Enlace de pago incompleto. Vuelve a reservar desde el sitio.
                </p>
              )}

              {!faltaRef && isLoading && (
                <p className="py-8 text-center text-sm text-ink-600">Cargando el detalle de tu cita…</p>
              )}

              {!faltaRef && isError && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  No encontramos esa reserva. Si el enlace es viejo, vuelve a reservar en el sitio.
                </p>
              )}

              {data && (
                <>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-ink-600">Servicio</dt>
                      <dd className="text-right font-semibold text-ink-900">{data.servicio ?? "Cita"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-ink-600">Paciente</dt>
                      <dd className="text-right font-semibold text-ink-900">{data.paciente}</dd>
                    </div>
                    {data.sede && (
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-ink-600">Sede</dt>
                        <dd className="text-right font-semibold text-ink-900">{data.sede}</dd>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-ink-600">Fecha</dt>
                      <dd className="text-right font-semibold text-ink-900">{fechaLegible(data.iniciaEn)}</dd>
                    </div>
                  </dl>

                  <div className="flex items-center justify-between border-t border-dashed border-fuchsia-200 pt-4">
                    <span className="text-sm font-semibold text-ink-600">Total a pagar</span>
                    <span className="font-display text-2xl font-extrabold text-fuchsia-700">
                      {montoLegible(data.monto, data.moneda)}
                    </span>
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
                      className="w-full rounded-full bg-gradient-to-br from-fuchsia-600 to-purple-700 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-fuchsia-700/25 transition hover:brightness-110 disabled:opacity-60"
                    >
                      {pagando ? "Procesando…" : `Pagar ${montoLegible(data.monto, data.moneda)}`}
                    </motion.button>
                  )}

                  <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-500">
                    <ShieldCheck size={13} className="text-fuchsia-600" />
                    Simulación para la demo. No se mueve dinero real.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 text-center">
            <a href="/" className="text-xs font-semibold text-ink-500 hover:text-fuchsia-700">
              Cancelar y volver al inicio
            </a>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
