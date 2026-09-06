import { motion } from "framer-motion";
import { CountUp } from "@/components/site/count-up";
import { cn } from "@/lib/utils";

// Piezas compartidas del panel administrativo.

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Metric({
  label,
  value,
  icon,
  hint,
  index = 0,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
  index?: number;
}) {
  // Números que cuentan hacia arriba al entrar en pantalla, igual que en
  // el sitio público -- casi todos los valores del panel son string/number
  // formateados (formatCOP, porcentajes); solo un ReactNode ya compuesto
  // (poco común) se muestra tal cual.
  const canCount = typeof value === "string" || typeof value === "number";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-brand-900/5"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-deep-600">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-3xl font-bold text-ink-900">
        {canCount ? <CountUp value={String(value)} /> : value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-600">{hint}</p>}
    </motion.div>
  );
}

export type Tono = "azul" | "ambar" | "rojo" | "verde" | "gris";

const tonos: Record<Tono, string> = {
  azul: "bg-sky-100 text-deep-600",
  ambar: "bg-amber-100 text-amber-700",
  rojo: "bg-red-100 text-red-700",
  verde: "bg-emerald-100 text-emerald-700",
  gris: "bg-slate-100 text-slate-600",
};
const puntos: Record<Tono, string> = {
  azul: "bg-deep-600",
  ambar: "bg-amber-500",
  rojo: "bg-red-500",
  verde: "bg-emerald-500",
  gris: "bg-slate-400",
};

export function Badge({
  tono = "gris",
  children,
  dot = true,
}: {
  tono?: Tono;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        tonos[tono]
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", puntos[tono])} />}
      {children}
    </span>
  );
}

export function BarRow({
  label,
  value,
  max,
  suffix,
  index = 0,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  index?: number;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-sm text-ink-600" title={label}>
        {label}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-sky-100">
        <motion.span
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="block h-full rounded-full gradient-bg"
        />
      </span>
      <span className="w-12 shrink-0 text-right text-sm font-medium text-ink-900">
        {value}
        {suffix}
      </span>
    </div>
  );
}

export function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-brand-900/5">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-semibold">{children}</th>;
}
