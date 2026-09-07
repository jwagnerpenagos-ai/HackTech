import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, XCircle, Mail, Copy, Check, Gift } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * Pantalla de "tu pago está en proceso". Consulta el estado cada pocos
 * segundos hasta que Lina confirma (o rechaza) el pago desde su Telegram.
 * Al confirmarse, también sale un correo de "cita confirmada" al que dejó
 * el paciente (lo maneja core-api).
 */

export default function ResultadoPagoPage() {
  const [params] = useSearchParams();
  const ref = params.get("ref") ?? "";

  const { data } = useQuery({
    queryKey: ["estado-pago", ref],
    queryFn: () => api.estadoPago(ref),
    enabled: ref.length > 0,
    retry: false,
    // Sigue consultando mientras el pago no esté resuelto.
    refetchInterval: (q) => {
      const e = q.state.data?.estado;
      return e === "aprobado" || e === "rechazado" ? false : 3000;
    },
  });

  const estado = data?.estado ?? "en_proceso";

  return (
    <>
      <Navbar />
      <main className="relative flex-1 overflow-hidden bg-white py-14 sm:py-20">
        <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-64" />
        <Container className="relative max-w-lg pb-16">
          <div className="card overflow-hidden p-8 text-center shadow-md sm:p-10">
            {estado === "aprobado" ? (
              <>
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 16 }}
                  className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
                >
                  <CheckCircle2 size={44} />
                </motion.div>
                <h1 className="mt-5 font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">
                  ¡Pago confirmado!
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-600">
                  Tu cita quedó <strong className="text-ink-900">agendada</strong>. Te enviamos la
                  confirmación al correo que registraste.
                </p>
                <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-sky-100 px-4 py-1.5 text-xs font-semibold text-deep-600">
                  <Mail size={14} /> Revisa tu bandeja de entrada
                </p>

                {data?.codigoReferido && <CodigoReferido codigo={data.codigoReferido} />}

                <div className="mt-8">
                  <Button href="/" variant="secondary">
                    Volver al inicio
                  </Button>
                </div>
              </>
            ) : estado === "rechazado" ? (
              <>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <XCircle size={44} />
                </div>
                <h1 className="mt-5 font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">
                  No pudimos confirmar el pago
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-600">
                  Si ya hiciste la transferencia, escríbenos al{" "}
                  <strong className="text-ink-900">311 398 1422</strong> con el comprobante y lo
                  revisamos.
                </p>
                <div className="mt-8">
                  <Button href="/" variant="secondary">
                    Volver al inicio
                  </Button>
                </div>
              </>
            ) : (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
                  className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-600"
                >
                  <Loader2 size={44} />
                </motion.div>
                <h1 className="mt-5 font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">
                  Tu pago está en proceso
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-600">
                  Estamos verificando la transferencia. Cuando se confirme te avisamos por correo y
                  esta página se actualiza sola.
                </p>
                <div className="mt-6 flex items-center justify-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-2 w-2 rounded-full bg-fuchsia-400"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                    />
                  ))}
                </div>
                <p className="mt-6 text-[11px] text-ink-500">
                  Puedes cerrar esta pestaña: la confirmación te llega igual al correo.
                </p>
              </>
            )}
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}

function CodigoReferido({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el código ya está visible para copiar a mano.
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50/50 p-5 text-left">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
        <Gift size={14} /> Tu código de referido
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-600">
        Compártelo con alguien más: cuando reserve su primera cita y ponga tu código, sumas hacia tu
        10% de descuento.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex-1 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-center font-mono text-lg font-extrabold tracking-widest text-brand-800">
          {codigo}
        </span>
        <button
          type="button"
          onClick={copiar}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-700 transition hover:bg-brand-50"
          title="Copiar código"
        >
          {copiado ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
        </button>
      </div>
    </div>
  );
}
