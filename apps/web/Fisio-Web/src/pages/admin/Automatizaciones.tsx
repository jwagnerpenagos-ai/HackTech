import { useState } from "react";
import { Zap, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, Metric } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { automatizacionesEjemplo } from "@/lib/data";

export default function AdminAutomatizacionesPage() {
  const [flujos, setFlujos] = useState(automatizacionesEjemplo);

  const activas = flujos.filter((f) => f.activa).length;
  const ejec7d = flujos.reduce((n, f) => n + f.ejecuciones7d, 0);
  const fallos7d = flujos.reduce((n, f) => n + f.fallos7d, 0);

  function toggle(id: string) {
    setFlujos((prev) =>
      prev.map((f) => (f.id === id ? { ...f, activa: !f.activa } : f))
    );
  }

  return (
    <AdminShell>
      <PageHeader
        title="Automatizaciones"
        subtitle="Workflows de n8n que orquestan correos, recordatorios y reportes."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric index={0} label="Flujos activos" value={`${activas} / ${flujos.length}`} icon={<Zap size={18} />} />
        <Metric index={1} label="Ejecuciones (7 días)" value={ejec7d} />
        <Metric
          index={2}
          label="Fallos (7 días)"
          value={fallos7d}
          icon={fallos7d > 0 ? <AlertTriangle size={18} /> : undefined}
        />
      </div>

      <div className="mt-8 grid gap-4">
        {flujos.map((f, i) => (
          <Reveal key={f.id} delayMs={i * 60}>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-brand-900/5">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{f.nombre}</p>
                <p className="mt-0.5 text-sm text-ink-600">{f.descripcion}</p>
                <p className="mt-2 text-xs text-ink-600">
                  Disparador: <span className="font-medium">{f.disparador}</span> ·
                  última ejecución {f.ultimaEjecucion} · {f.ejecuciones7d} ejec. / 7 d
                  {f.fallos7d > 0 && (
                    <span className="ml-1 font-medium text-red-600">
                      · {f.fallos7d} con error
                    </span>
                  )}
                </p>
              </div>

              <motion.button
                role="switch"
                aria-checked={f.activa}
                whileTap={{ scale: 0.92 }}
                onClick={() => toggle(f.id)}
                animate={{ backgroundColor: f.activa ? "#015da7" : "#7cc8fc" }}
                transition={{ duration: 0.2 }}
                className="relative h-6 w-11 shrink-0 rounded-full"
              >
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
                  style={{ left: f.activa ? 22 : 2 }}
                />
              </motion.button>
            </div>
          </Reveal>
        ))}
      </div>

      <p className="mt-8 rounded-xl border border-sky-100 p-4 text-xs text-ink-600">
        Los interruptores son una previsualización de la interfaz. La activación
        real de cada workflow se hará contra n8n a través de la API núcleo.
      </p>
    </AdminShell>
  );
}
