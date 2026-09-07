import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Terminal, ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, Badge, TableCard, Th } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { operacionesEjemplo } from "@/lib/data";
import { api, leerToken, ApiError, type EventoHistorialApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const tonoResultado: Record<EventoHistorialApi["resultado"], "verde" | "rojo" | "ambar"> = {
  ok: "verde",
  error: "rojo",
  pendiente: "ambar",
};

const normalizarTexto = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[.,-]/g, "");

function fmt(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Fallback fuera de línea: la ficha de ejemplo trae canales cerrados
// ("Sitio web", "Telegram"...); acá se muestran tal cual.
const eventosFallback: EventoHistorialApi[] = operacionesEjemplo.map((o) => ({
  id: o.id,
  fechaHora: o.fechaHora,
  actor: o.actor,
  canal: o.canal,
  accion: o.accion,
  detalle: o.detalle,
  resultado: o.resultado,
}));

export default function AdminHistorialPage() {
  const [canal, setCanal] = useState<string>("todos");
  const [q, setQ] = useState("");
  const [eventos, setEventos] = useState<EventoHistorialApi[]>([]);
  const [cargando, setCargando] = useState(true);
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
        const data = await api.historialAdmin();
        if (vivo) setEventos(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          navigate("/admin/login");
          return;
        }
        if (vivo) setEventos(eventosFallback);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [navigate]);

  const canales = useMemo(() => ["todos", ...Array.from(new Set(eventos.map((e) => e.canal)))], [eventos]);

  const filtradas = useMemo(() => {
    const term = normalizarTexto(q.trim());

    return [...eventos]
      .filter((o) => {
        const coincideCanal = canal === "todos" || o.canal === canal;
        if (!coincideCanal) return false;
        if (!term) return true;

        return (
          normalizarTexto(o.actor).includes(term) ||
          normalizarTexto(o.accion).includes(term) ||
          normalizarTexto(o.detalle).includes(term)
        );
      })
      .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
  }, [canal, q, eventos]);

  return (
    <AdminShell>
      <PageHeader
        title="Historial de operaciones"
        subtitle="Actividad reciente reconstruida desde la base de datos: reservas creadas o canceladas, y pagos registrados o verificados."
        action={
          <div className="relative w-full sm:w-72">
            <Search
              size={14}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por actor, acción o detalle..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-4 text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-brand-800 focus:outline-none focus:ring-4 focus:ring-brand-800/10 shadow-xs transition-all"
            />
          </div>
        }
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {canales.map((c) => (
          <motion.button
            key={c}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCanal(c)}
            className={cn(
              "rounded-full border px-3.5 py-1 text-xs font-medium transition-all capitalize cursor-pointer",
              canal === c
                ? "border-brand-800 bg-brand-800 text-white shadow-xs"
                : "border-slate-200/80 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            {c}
          </motion.button>
        ))}
      </div>

      <Reveal className="mt-6">
        <TableCard>
          <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <Th>Fecha y hora</Th>
              <Th>Actor</Th>
              <Th>Canal</Th>
              <Th>Acción</Th>
              <Th>Detalle</Th>
              <Th>Resultado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-normal text-slate-700">
            {cargando ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-xs text-slate-400">
                  Cargando actividad reciente...
                </td>
              </tr>
            ) : (
              filtradas.map((o) => (
                <tr
                  key={o.id}
                  className="transition-colors hover:bg-slate-50/80"
                >
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[11px] text-slate-500">
                    {fmt(o.fechaHora)}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-900 whitespace-nowrap">
                    {o.actor}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 border border-slate-200/60 capitalize">
                      <Terminal size={11} className="text-slate-400" />
                      {o.canal}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-slate-800">
                    {o.accion}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 leading-relaxed max-w-md">
                    {o.detalle}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <Badge tono={tonoResultado[o.resultado]}>
                      {o.resultado}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
            {!cargando && filtradas.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-12 text-center text-xs text-slate-400"
                >
                  No se encontraron operaciones registradas con este criterio.
                </td>
              </tr>
            )}
          </tbody>
        </TableCard>
      </Reveal>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-500 font-normal flex items-center gap-2">
        <ShieldAlert size={14} className="text-slate-400 shrink-0" />
        <span>
          Reconstruido a partir de las tablas de reservas y pagos. No hay una bitácora de auditoría independiente todavía.
        </span>
      </div>
    </AdminShell>
  );
}
