import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, CreditCard } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { api, type EstadoPagoApi } from "@/lib/api";

const NEQUI = "3113981422";

/**
 * Pantalla de retorno del checkout. Mercado Pago vuelve con `payment_id` y
 * `status`; nosotros pasamos `ref` en las back_urls. Se consulta el estado
 * del pago unas cuantas veces (la confirmación puede tardar unos segundos) y
 * se muestra el resultado. Sin pasarela configurada el backend responde `manual`.
 */
export default function ResultadoPagoPage() {
  const [params] = useSearchParams();
  const ref = params.get("ref") ?? undefined;
  const paymentId = params.get("payment_id") ?? undefined;

  const [estado, setEstado] = useState<EstadoPagoApi["estado"] | "consultando" | "error">("consultando");
  const [reservaId, setReservaId] = useState<number | null>(null);
  const intentos = useRef(0);

  useEffect(() => {
    if (!ref) {
      setEstado("error");
      return;
    }
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;

    const consultar = async () => {
      try {
        const r = await api.estadoPago({ ref, paymentId });
        if (!vivo) return;
        setReservaId(r.reservaId);
        if (r.estado === "pendiente" && intentos.current < 6) {
          intentos.current += 1;
          timer = setTimeout(consultar, 2500);
          return;
        }
        setEstado(r.estado);
      } catch {
        if (!vivo) return;
        setEstado("error");
      }
    };
    void consultar();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [ref, paymentId]);

  return (
    <>
      <Navbar />
      <main className="relative flex-1 bg-white py-16 sm:py-24">
        <Container className="max-w-xl">
          <div className="card p-8 text-center shadow-md">
            {(estado === "consultando" || estado === "pendiente") && (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-deep-600">
                  <Loader2 size={34} className="animate-spin" />
                </div>
                <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Confirmando tu pago…</h1>
                <p className="mt-2 text-sm text-ink-600">
                  Esto puede tomar unos segundos. No cierres esta página.
                </p>
              </>
            )}

            {estado === "aprobado" && (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={38} />
                </div>
                <h1 className="mt-4 font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                  ¡Cita confirmada!
                </h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
                  Recibimos tu pago y tu cita quedó confirmada.
                  {reservaId != null && (
                    <>
                      {" "}
                      Reserva #{reservaId}.
                    </>
                  )}
                </p>
              </>
            )}

            {(estado === "rechazado" || estado === "error") && (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <XCircle size={38} />
                </div>
                <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">No pudimos confirmar el pago</h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
                  El cupo de tu cita sigue reservado por un tiempo. Puedes intentar el pago otra vez desde la
                  reserva, o escribirnos al {NEQUI}.
                </p>
              </>
            )}

            {estado === "manual" && (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-deep-600">
                  <CreditCard size={34} />
                </div>
                <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Tu solicitud quedó registrada</h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
                  Completa el pago por Nequi al <strong className="text-ink-900">{NEQUI}</strong> y envía el
                  comprobante por WhatsApp al mismo número. Confirmamos tu cita apenas lo verifiquemos.
                </p>
              </>
            )}

            <div className="mt-8">
              <Button href="/" variant="secondary">
                Volver al inicio
              </Button>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
