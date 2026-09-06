import { CalendarDays, Wallet, Activity, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, Metric, BarRow } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { indicadores as k } from "@/lib/data";
import { formatCOP } from "@/lib/utils";

function delta(actual: number, prev: number): string {
  if (prev === 0) return "—";
  const p = Math.round(((actual - prev) / prev) * 100);
  return `${p >= 0 ? "+" : ""}${p}% vs. periodo anterior`;
}

export default function AdminIndicadoresPage() {
  const maxServ = Math.max(...k.citasPorServicio.map((s) => s.valor));
  const maxCanal = Math.max(...k.reservasPorCanal.map((s) => s.valor));
  const maxDia = Math.max(...k.citasPorDia.map((s) => s.valor));

  return (
    <AdminShell>
      <PageHeader
        title="Indicadores"
        subtitle="Resumen del negocio. Datos de ejemplo hasta conectar Google Sheets y la API."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          index={0}
          label="Citas esta semana"
          value={k.citasSemana}
          icon={<CalendarDays size={18} />}
          hint={delta(k.citasSemana, k.citasSemanaPrev)}
        />
        <Metric
          index={1}
          label="Ingresos del mes"
          value={formatCOP(k.ingresosMes)}
          icon={<Wallet size={18} />}
          hint={delta(k.ingresosMes, k.ingresosMesPrev)}
        />
        <Metric
          index={2}
          label="Ocupación de agenda"
          value={`${Math.round(k.ocupacion * 100)}%`}
          icon={<Activity size={18} />}
          hint={delta(k.ocupacion, k.ocupacionPrev)}
        />
        <Metric
          index={3}
          label="Pacientes nuevos"
          value={k.nuevosPacientes}
          icon={<UserPlus size={18} />}
          hint={delta(k.nuevosPacientes, k.nuevosPacientesPrev)}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Reveal variant="left">
          <Panel titulo="Citas por servicio (30 días)">
            {k.citasPorServicio.map((s, i) => (
              <BarRow
                key={s.servicio}
                index={i}
                label={s.servicio}
                value={s.valor}
                max={maxServ}
              />
            ))}
          </Panel>
        </Reveal>

        <Reveal variant="right">
          <Panel titulo="Reservas por canal (30 días)">
            {k.reservasPorCanal.map((s, i) => (
              <BarRow key={s.canal} index={i} label={s.canal} value={s.valor} max={maxCanal} />
            ))}
          </Panel>
        </Reveal>
      </div>

      <Reveal delayMs={100} className="mt-6">
        <Panel titulo="Citas por día (semana actual)">
          <div className="flex items-end gap-3 pt-2">
            {k.citasPorDia.map((d, i) => (
              <div key={d.dia} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-ink-900">{d.valor}</span>
                <motion.span
                  initial={{ height: 0 }}
                  whileInView={{ height: `${(d.valor / maxDia) * 120 + 8}px` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full rounded-t-md gradient-bg"
                />
                <span className="text-xs text-ink-600">{d.dia}</span>
              </div>
            ))}
          </div>
        </Panel>
      </Reveal>
    </AdminShell>
  );
}

function Panel({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-brand-900/5">
      <p className="font-display text-sm font-bold text-ink-900">{titulo}</p>
      <div className="mt-4 space-y-2.5">{children}</div>
    </div>
  );
}
