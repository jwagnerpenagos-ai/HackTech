import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, TableCard } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { api, leerToken, ApiError, type CitaAdminApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const normalizarTexto = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");

// Estilo por estado real de `agenda.estado_reserva` (contracts/web-api.md).
function obtenerEstiloEstado(estado: string): string {
  if (estado === "confirmada" || estado === "en_curso" || estado === "atendida") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200/80";
  }
  if (estado === "propuesta" || estado === "pendiente_pago") {
    return "bg-amber-50 text-amber-700 border-amber-200/80";
  }
  return "bg-rose-50 text-rose-700 border-rose-200/80";
}

function formatoEstado(estado: string): string {
  return estado.replace(/_/g, " ");
}

function fechaBogota(fmt: Intl.DateTimeFormatOptions, iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", ...fmt }).format(new Date(iso));
}

function isoHaceDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
}

export default function AdminReservasPage() {
  const [estado, setEstado] = useState<string>("todas");
  const [q, setQ] = useState("");
  const [citas, setCitas] = useState<CitaAdminApi[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        setError(null);
        const data = await api.citas(isoHaceDias(-30), isoHaceDias(30));
        if (vivo) setCitas(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          navigate("/admin/login");
          return;
        }
        if (vivo) setError("No se pudo cargar la agenda desde la API núcleo.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [navigate]);

  const estados = useMemo(() => {
    const presentes = Array.from(new Set(citas.map((c) => c.estado)));
    return ["todas", ...presentes];
  }, [citas]);

  const filtradas = useMemo(() => {
    const term = normalizarTexto(q.trim());
    return citas
      .filter((c) => estado === "todas" || c.estado === estado)
      .filter((c) => {
        if (!term) return true;
        return (
          normalizarTexto(c.paciente ?? "").includes(term) ||
          normalizarTexto(c.servicio ?? "").includes(term) ||
          normalizarTexto(c.sede).includes(term) ||
          normalizarTexto(c.telefono ?? "").includes(term)
        );
      })
      .sort((a, b) => b.iniciaEn.localeCompare(a.iniciaEn));
  }, [citas, estado, q]);

  const conteo = (e: string) => citas.filter((c) => c.estado === e).length;
  const confirmadas = citas.filter((c) => ["confirmada", "en_curso", "atendida"].includes(c.estado)).length;
  const pendientes = citas.filter((c) => ["propuesta", "pendiente_pago"].includes(c.estado)).length;

  return (
    <AdminShell>
      <PageHeader
        title="Reservas"
        subtitle={`${citas.length} reservas (últimos y próximos 30 días) · ${confirmadas} confirmadas · ${pendientes} pendientes de pago`}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {estados.map((e) => (
            <motion.button
              key={e}
              whileTap={{ scale: 0.95 }}
              onClick={() => setEstado(e)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-normal capitalize transition-all duration-200 shadow-sm cursor-pointer",
                estado === e
                  ? "border-brand-800 bg-brand-800 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-900",
              )}
            >
              {e === "todas" ? `Todas (${citas.length})` : `${formatoEstado(e)} (${conteo(e)})`}
            </motion.button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar paciente, servicio o teléfono..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs font-normal text-slate-700 placeholder:text-slate-400 focus:border-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-700/10 shadow-sm transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {error}
        </div>
      )}

      <Reveal className="mt-6">
        <TableCard>
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th className="py-3.5 px-5 text-left">Fecha</th>
              <th className="py-3.5 px-5 text-left">Hora</th>
              <th className="py-3.5 px-5 text-left">Paciente</th>
              <th className="py-3.5 px-5 text-left">Teléfono</th>
              <th className="py-3.5 px-5 text-left">Servicio</th>
              <th className="py-3.5 px-5 text-left">Sede</th>
              <th className="py-3.5 px-5 text-left">Canal</th>
              <th className="py-3.5 px-5 text-left">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-normal text-slate-700">
            {cargando ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-xs text-slate-400">
                  Cargando reservas...
                </td>
              </tr>
            ) : (
              filtradas.map((c) => (
                <tr key={c.reservaId} className="transition-colors duration-150 hover:bg-slate-50/80">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {fechaBogota({ day: "2-digit", month: "short" }, c.iniciaEn)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {fechaBogota({ hour: "2-digit", minute: "2-digit", hour12: false }, c.iniciaEn)}
                  </td>
                  <td className="px-5 py-3.5">{c.paciente ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Phone size={13} className="text-slate-400" />
                      {c.telefono ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">{c.servicio ?? "—"}</td>
                  <td className="px-5 py-3.5">{c.sede}</td>
                  <td className="px-5 py-3.5 capitalize">{c.canal}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-2.5 py-0.5 text-xs rounded-full border capitalize ${obtenerEstiloEstado(c.estado)}`}>
                      {formatoEstado(c.estado)}
                    </span>
                  </td>
                </tr>
              ))
            )}
            {!cargando && filtradas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-xs text-slate-400">
                  No hay reservas que coincidan con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </TableCard>
      </Reveal>
    </AdminShell>
  );
}
