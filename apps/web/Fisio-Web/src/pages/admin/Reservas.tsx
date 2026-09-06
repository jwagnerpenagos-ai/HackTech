import { useMemo, useState, useEffect } from "react";
import { Search, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, TableCard } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { reservasEjemplo, type EstadoReserva, type Reserva } from "@/lib/data";
import { cn } from "@/lib/utils";

// Función para normalizar texto (ignora acentos y mayúsculas)
const normalizarTexto = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const estados: (EstadoReserva | "todas")[] = [
  "todas",
  "confirmada",
  "pendiente",
  "cancelada",
];

// Estilos de estado estandarizados
const obtenerEstiloEstado = (estado: EstadoReserva) => {
  switch (estado) {
    case "confirmada":
      return "bg-emerald-50 text-emerald-700 border-emerald-200/80";
    case "pendiente":
      return "bg-amber-50 text-amber-700 border-amber-200/80";
    case "cancelada":
      return "bg-rose-50 text-rose-700 border-rose-200/80";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
};

export default function AdminReservasPage() {
  const [estado, setEstado] = useState<(typeof estados)[number]>("todas");
  const [q, setQ] = useState("");
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargarReservas = async () => {
      try {
        setCargando(true);
        const res = await fetch('/api/reservas');
        if (!res.ok) throw new Error('API no disponible');
        const data = await res.json();
        setReservas(data);
      } catch {
        setReservas(reservasEjemplo);
      } finally {
        setCargando(false);
      }
    };

    cargarReservas();
  }, []);

  const filtradas = useMemo(() => {
    const term = normalizarTexto(q.trim());

    return reservas
      .filter((r) => estado === "todas" || r.estado === estado)
      .filter((r) => {
        if (!term) return true;

        const clienteNorm = normalizarTexto(r.cliente);
        const servicioNorm = normalizarTexto(r.servicio);
        const sedeNorm = normalizarTexto(r.sede);
        const telefonoNorm = normalizarTexto(r.telefono);

        return (
          clienteNorm.includes(term) ||
          servicioNorm.includes(term) ||
          sedeNorm.includes(term) ||
          telefonoNorm.includes(term)
        );
      })
      .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  }, [estado, q, reservas]);

  const conteo = (e: EstadoReserva) =>
    reservas.filter((r) => r.estado === e).length;

  return (
    <AdminShell>
      <PageHeader
        title="Reservas"
        subtitle={`${reservas.length} reservas · ${conteo("confirmada")} confirmadas · ${conteo("pendiente")} pendientes · ${conteo("cancelada")} canceladas`}
      />

      {/* Filtros y Buscador */}
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
                  : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-900"
              )}
            >
              {e === "todas" ? "Todas las reservas" : e}
            </motion.button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente o servicio..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs font-normal text-slate-700 placeholder:text-slate-400 focus:border-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-700/10 shadow-sm transition-all"
          />
        </div>
      </div>

      {/* Tabla estandarizada con letra compacta (text-xs) */}
      <Reveal className="mt-6">
        <TableCard>
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th className="py-3.5 px-5 text-left">Fecha</th>
              <th className="py-3.5 px-5 text-left">Hora</th>
              <th className="py-3.5 px-5 text-left">Cliente</th>
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
              filtradas.map((r) => (
                <tr
                  key={r.id}
                  className="transition-colors duration-150 hover:bg-slate-50/80"
                >
                  <td className="px-5 py-3.5 whitespace-nowrap">{r.fecha}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{r.hora}</td>
                  <td className="px-5 py-3.5">{r.cliente}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Phone size={13} className="text-slate-400" />
                      {r.telefono}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">{r.servicio}</td>
                  <td className="px-5 py-3.5">{r.sede}</td>
                  <td className="px-5 py-3.5 capitalize">{r.canal}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-2.5 py-0.5 text-xs rounded-full border ${obtenerEstiloEstado(r.estado)}`}>
                      {r.estado}
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