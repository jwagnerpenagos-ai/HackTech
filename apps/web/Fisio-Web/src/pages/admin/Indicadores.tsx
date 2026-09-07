import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Wallet, Activity, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, Metric, BarRow } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { indicadores as indicadoresFallback } from "@/lib/data";
import { api, leerToken, ApiError, type IndicadoresAdminApi } from "@/lib/api";
import { formatCOP } from "@/lib/utils";

function delta(actual: number, prev: number): string {
  if (prev === 0) return "—";
  const p = Math.round(((actual - prev) / prev) * 100);
  return `${p >= 0 ? "+" : ""}${p}% vs. periodo anterior`;
}

export default function AdminIndicadoresPage() {
  const [k, setK] = useState<IndicadoresAdminApi>(indicadoresFallback);
  const [cargando, setCargando] = useState(true);
  const [enVivo, setEnVivo] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!leerToken()) {
      navigate("/admin/login");
      return;
    }
    let vivo = true;
    (async () => {
      try {
        setCargando(true);
        const data = await api.indicadoresAdmin();
        if (vivo) {
          setK(data);
          setEnVivo(true);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          navigate("/admin/login");
          return;
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [navigate]);

  const maxServ = Math.max(1, ...k.citasPorServicio.map((s) => s.valor));
  const maxCanal = Math.max(1, ...k.reservasPorCanal.map((s) => s.valor));
  const maxDia = Math.max(1, ...k.citasPorDia.map((s) => s.valor));

  return (
    <AdminShell>
      <PageHeader
        title="Indicadores"
        subtitle={
          cargando
            ? "Cargando indicadores desde la API núcleo..."
            : enVivo
              ? "Calculado en vivo desde reservas y pagos. Falta conectar Google Sheets para el reporte histórico."
              : "No se pudo conectar con la API núcleo — mostrando datos de ejemplo."
        }
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
            {k.citasPorServicio.length === 0 && (
              <p className="text-xs text-ink-600">Sin citas registradas en los últimos 30 días.</p>
            )}
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
            {k.reservasPorCanal.length === 0 && (
              <p className="text-xs text-ink-600">Sin reservas registradas en los últimos 30 días.</p>
            )}
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
