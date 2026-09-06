import { RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, Badge } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { integracionesEjemplo, type Integracion } from "@/lib/data";

const meta: Record<
  Integracion["estado"],
  { tono: "verde" | "ambar" | "gris"; texto: string }
> = {
  conectado: { tono: "verde", texto: "Conectado" },
  requiere_atencion: { tono: "ambar", texto: "Requiere atención" },
  no_configurado: { tono: "gris", texto: "No configurado" },
};

export default function AdminIntegracionesPage() {
  const conectadas = integracionesEjemplo.filter(
    (i) => i.estado === "conectado"
  ).length;

  return (
    <AdminShell>
      <PageHeader
        title="Integraciones"
        subtitle={`${conectadas} de ${integracionesEjemplo.length} servicios conectados.`}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {integracionesEjemplo.map((i, idx) => {
          const m = meta[i.estado];
          return (
            <Reveal key={i.id} delayMs={idx * 60}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-brand-900/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink-900">{i.nombre}</p>
                    <p className="mt-0.5 text-sm text-ink-600">{i.descripcion}</p>
                  </div>
                  <Badge tono={m.tono}>{m.texto}</Badge>
                </div>

                <p className="mt-3 text-sm text-ink-600">{i.detalle}</p>

                <div className="mt-4 flex items-center justify-between border-t border-sky-100 pt-3 text-xs text-ink-600">
                  <span>
                    {i.ultimoEvento ? `Último evento: ${i.ultimoEvento}` : "Sin actividad"}
                  </span>
                  <motion.button
                    whileTap={{ rotate: 180 }}
                    transition={{ duration: 0.3 }}
                    className="inline-flex items-center gap-1.5 font-medium text-deep-600 hover:text-deep-700"
                    type="button"
                  >
                    <RefreshCw size={13} />
                    {i.estado === "requiere_atencion" ? "Reconectar" : "Probar"}
                  </motion.button>
                </div>
              </motion.div>
            </Reveal>
          );
        })}
      </div>

      <p className="mt-8 rounded-xl border border-sky-100 p-4 text-xs text-ink-600">
        El estado en vivo vendrá de <code>GET /health</code> de la API núcleo. La
        IA local nunca recibe credenciales de Google: interpreta, el sistema
        valida, n8n orquesta y la API ejecuta.
      </p>
    </AdminShell>
  );
}
