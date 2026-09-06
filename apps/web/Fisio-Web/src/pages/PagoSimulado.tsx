import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Container } from "@/components/ui/container";
import { api } from "@/lib/api";

/**
 * Checkout simulado — solo cuando el backend corre con PASARELA_MODO=mock (demo
 * sin cuenta de pasarela). Imita el paso de pago: muestra el monto y dos
 * botones. La decisión va a POST /api/pagos/mock y luego se redirige a
 * /reservar/resultado, igual que volvería de Mercado Pago.
 */
export default function PagoSimuladoPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ref = params.get("ref") ?? "";
  const montoPesos = Number(params.get("monto") ?? "0");
  const [procesando, setProcesando] = useState<"" | "aprobar" | "rechazar">("");

  const monto = montoPesos.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

  const decidir = async (aprobar: boolean) => {
    if (!ref || procesando) return;
    setProcesando(aprobar ? "aprobar" : "rechazar");
    try {
      await api.pagoMock(ref, aprobar);
    } catch {
      /* el resultado igual consulta el estado */
    }
    navigate(`/reservar/resultado?ref=${encodeURIComponent(ref)}`);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 py-16">
      <Container className="max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <ShieldCheck size={15} /> Pasarela de pago (simulada)
          </div>
          <p className="mt-4 text-sm text-slate-500">Pago de tu cita</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-slate-900">{monto}</p>
          <p className="mt-1 text-xs text-slate-400">Ref: {ref}</p>

          <div className="mt-8 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Este es un checkout de demostración. En producción esto es Mercado Pago (Nequi, PSE, tarjeta).
          </div>

          <div className="mt-6 grid gap-3">
            <button
              onClick={() => decidir(true)}
              disabled={procesando !== ""}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {procesando === "aprobar" ? <Loader2 size={16} className="animate-spin" /> : null}
              Aprobar pago
            </button>
            <button
              onClick={() => decidir(false)}
              disabled={procesando !== ""}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {procesando === "rechazar" ? <Loader2 size={16} className="animate-spin" /> : null}
              Rechazar
            </button>
          </div>
        </div>
      </Container>
    </main>
  );
}
