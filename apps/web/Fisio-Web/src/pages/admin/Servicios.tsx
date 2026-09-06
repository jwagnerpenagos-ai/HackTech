import { useState, useEffect } from "react";
import { Search, Tag, Clock, ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, Badge } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { catalogo as catalogoLocal, bufferPorServicio as bufferLocal } from "@/lib/data";
import { formatCOP } from "@/lib/utils";

export default function AdminServiciosPage() {
  const [q, setQ] = useState("");
  const [catalogoData, setCatalogoData] = useState(catalogoLocal);
  const [bufferData, setBufferData] = useState(bufferLocal);

  useEffect(() => {
    const cargarServicios = async () => {
      try {
        const res = await fetch('/api/servicios');
        if (!res.ok) throw new Error('API no disponible');
        const data = await res.json();
        setCatalogoData(data.catalogo);
        setBufferData(data.bufferPorServicio);
      } catch {
        setCatalogoData(catalogoLocal);
        setBufferData(bufferLocal);
      }
    };

    cargarServicios();
  }, []);

  const total = catalogoData.reduce((n, c) => n + c.servicios.length, 0);

  return (
    <AdminShell>
      <PageHeader
        title="Servicios"
        subtitle={`${total} servicios en ${catalogoData.length} categorías. Precios y duraciones del catálogo vigente.`}
        action={
          <div className="relative w-full sm:w-64">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar servicio o tarifa..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-4 text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-brand-800 focus:outline-none focus:ring-4 focus:ring-brand-800/10 shadow-sm transition"
            />
          </div>
        }
      />

      <div className="mt-6 space-y-8">
        {catalogoData.map((cat) => {
          const serviciosFiltrados = cat.servicios.filter(
            (s) =>
              s.nombre.toLowerCase().includes(q.toLowerCase()) ||
              s.descripcion.toLowerCase().includes(q.toLowerCase())
          );

          if (serviciosFiltrados.length === 0) return null;

          return (
            <section key={cat.id} className="space-y-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  {cat.nombre}
                </h2>
                {cat.descripcion && (
                  <p className="mt-0.5 text-xs text-slate-500 font-normal">{cat.descripcion}</p>
                )}
              </div>

              <div className="grid gap-4">
                {serviciosFiltrados.map((s, i) => (
                  <Reveal key={s.slug} delayMs={i * 40}>
                    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="max-w-xl">
                          <p className="font-semibold text-slate-900 text-sm">{s.nombre}</p>
                          <p className="mt-1 text-xs text-slate-500 leading-relaxed font-normal">{s.descripcion}</p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/60">
                            <Clock size={12} className="text-slate-400" />
                            {s.duracion}
                          </span>
                          
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/60">
                            +{bufferData[s.slug] ?? 15} min prep.
                          </span>

                          {s.reservableIndividualmente ? (
                            <Badge tono="verde" dot={false}>
                              Reservable en línea
                            </Badge>
                          ) : (
                            <Badge tono="ambar" dot={false}>
                              Solo por contacto
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <tr>
                              <th className="py-2 px-3">Opción / paquete</th>
                              <th className="py-2 px-3 text-right">Precio</th>
                              <th className="py-2 px-3 text-right">Por sesión</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-normal">
                            {s.opciones.map((o) => (
                              <tr key={o.label} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2.5 px-3 text-slate-800 font-medium">{o.label}</td>
                                <td className="py-2.5 px-3 text-right text-slate-900 font-semibold font-mono">
                                  {formatCOP(o.precio)}
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                                  {o.porSesion ? formatCOP(o.porSesion) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {s.notaPromo && (
                        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 border border-emerald-200/60 w-fit">
                          <Tag size={13} className="text-emerald-600 shrink-0" />
                          <span>{s.notaPromo}</span>
                        </div>
                      )}
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 font-normal flex items-center gap-2">
        <ShieldAlert size={15} className="text-slate-400 shrink-0" />
        <span>
          Vista de solo lectura. La edición del catálogo se hará desde la API núcleo cuando esté disponible.
        </span>
      </div>
    </AdminShell>
  );
}