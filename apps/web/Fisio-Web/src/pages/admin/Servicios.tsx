import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Clock, ShieldAlert, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, Badge } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { ExportMenu } from "@/components/admin/export-menu";
import { exportarExcel, exportarPDF } from "@/lib/reportes";
import { catalogo as catalogoLocal, bufferPorServicio as bufferLocal } from "@/lib/data";
import {
  api,
  leerToken,
  ApiError,
  type CategoriaCatalogoApi,
  type ServicioCatalogoApi,
  type CategoriaAdminApi,
} from "@/lib/api";
import { formatCOP } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Fallback fuera de línea: adapta la ficha de ejemplo (sin ids reales) a la
// forma que devuelve la API. Los ids negativos son solo para que React
// tenga una key; con la API caída no hay CRUD posible de todos modos.
let contador = -1;
const catalogoFallback: CategoriaCatalogoApi[] = catalogoLocal.map((cat, ci) => ({
  id: -(ci + 1),
  nombre: cat.nombre,
  servicios: cat.servicios.map((s) => ({
    id: contador--,
    slug: s.slug,
    nombre: s.nombre,
    duracion: s.duracion,
    duracionMin: s.duracionMin,
    duracionMaxMin: s.duracionMin,
    bufferPosteriorMinutos: bufferLocal[s.slug] ?? 15,
    descripcion: s.descripcion,
    reservableIndividualmente: s.reservableIndividualmente,
    opciones: s.opciones.map((o) => ({ id: contador--, label: o.label, precio: o.precio, porSesion: o.porSesion ?? null })),
  })),
}));

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:border-brand-800 focus:outline-none";
const labelCls = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1";

interface FormServicio {
  categoriaId: number;
  nombre: string;
  descripcion: string;
  duracionMinMinutos: number;
  duracionMaxMinutos: number;
  bufferPosteriorMinutos: number;
}

function formDesdeServicio(s: ServicioCatalogoApi, categoriaId: number): FormServicio {
  return {
    categoriaId,
    nombre: s.nombre,
    descripcion: s.descripcion ?? "",
    duracionMinMinutos: s.duracionMin,
    duracionMaxMinutos: s.duracionMaxMin,
    bufferPosteriorMinutos: s.bufferPosteriorMinutos,
  };
}

export default function AdminServiciosPage() {
  const [q, setQ] = useState("");
  const [catalogoData, setCatalogoData] = useState<CategoriaCatalogoApi[]>(catalogoFallback);
  const [categorias, setCategorias] = useState<CategoriaAdminApi[]>([]);
  const [enVivo, setEnVivo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Edición de un servicio existente
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formEdit, setFormEdit] = useState<FormServicio | null>(null);

  // Confirmación de "eliminar" (desactivar) en dos pasos, sin diálogo nativo
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);

  // Alta de servicio nuevo
  const [creando, setCreando] = useState(false);
  const [formNuevo, setFormNuevo] = useState<FormServicio & { precioInicial: string; nombreOpcionInicial: string }>({
    categoriaId: 0,
    nombre: "",
    descripcion: "",
    duracionMinMinutos: 60,
    duracionMaxMinutos: 60,
    bufferPosteriorMinutos: 15,
    precioInicial: "",
    nombreOpcionInicial: "Sesión individual",
  });

  // Opciones de precio: edición y alta
  const [editandoTarifaId, setEditandoTarifaId] = useState<number | null>(null);
  const [formTarifa, setFormTarifa] = useState<{ nombre: string; valorTotal: string }>({ nombre: "", valorTotal: "" });
  const [agregandoTarifaEn, setAgregandoTarifaEn] = useState<number | null>(null);
  const [formNuevaTarifa, setFormNuevaTarifa] = useState({
    nombre: "",
    sesionesIncluidas: "1",
    cupoPersonas: "1",
    valorTotal: "",
  });

  const cargar = async () => {
    try {
      setCargando(true);
      setError(null);
      const [data, cats] = await Promise.all([api.serviciosAdmin(), api.categoriasAdmin()]);
      setCatalogoData(data.catalogo);
      setCategorias(cats);
      setEnVivo(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/admin/login");
        return;
      }
      setCatalogoData(catalogoFallback);
      setEnVivo(false);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!leerToken()) {
      navigate("/admin/login");
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  function empezarEdicion(s: ServicioCatalogoApi, categoriaId: number) {
    setEditandoId(s.id);
    setFormEdit(formDesdeServicio(s, categoriaId));
    setConfirmandoId(null);
  }

  async function guardarEdicion() {
    if (editandoId === null || !formEdit) return;
    try {
      setError(null);
      await api.actualizarServicio(editandoId, {
        categoriaId: formEdit.categoriaId,
        nombre: formEdit.nombre,
        descripcion: formEdit.descripcion || null,
        duracionMinMinutos: formEdit.duracionMinMinutos,
        duracionMaxMinutos: formEdit.duracionMaxMinutos,
        bufferPosteriorMinutos: formEdit.bufferPosteriorMinutos,
      });
      setEditandoId(null);
      setFormEdit(null);
      await cargar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el servicio.");
    }
  }

  async function eliminarServicio(id: number) {
    try {
      setError(null);
      await api.eliminarServicio(id);
      setConfirmandoId(null);
      await cargar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "No se pudo desactivar el servicio.");
    }
  }

  async function crearServicio() {
    if (!formNuevo.nombre.trim() || !formNuevo.categoriaId) {
      setError("Nombre y categoría son obligatorios.");
      return;
    }
    const precio = Number(formNuevo.precioInicial.replace(/[^\d]/g, ""));
    try {
      setError(null);
      await api.crearServicio({
        categoriaId: formNuevo.categoriaId,
        nombre: formNuevo.nombre.trim(),
        descripcion: formNuevo.descripcion || null,
        duracionMinMinutos: formNuevo.duracionMinMinutos,
        duracionMaxMinutos: formNuevo.duracionMaxMinutos,
        bufferPosteriorMinutos: formNuevo.bufferPosteriorMinutos,
        tarifaInicial:
          precio > 0
            ? {
                nombre: formNuevo.nombreOpcionInicial || "Sesión individual",
                sesionesIncluidas: 1,
                cupoPersonas: 1,
                valorTotal: precio,
              }
            : null,
      });
      setCreando(false);
      setFormNuevo({
        categoriaId: 0,
        nombre: "",
        descripcion: "",
        duracionMinMinutos: 60,
        duracionMaxMinutos: 60,
        bufferPosteriorMinutos: 15,
        precioInicial: "",
        nombreOpcionInicial: "Sesión individual",
      });
      await cargar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "No se pudo crear el servicio.");
    }
  }

  function empezarEdicionTarifa(o: { id: number; label: string; precio: number }) {
    setEditandoTarifaId(o.id);
    setFormTarifa({ nombre: o.label, valorTotal: String(o.precio) });
  }

  async function guardarTarifa() {
    if (editandoTarifaId === null) return;
    const valor = Number(formTarifa.valorTotal.replace(/[^\d]/g, ""));
    try {
      setError(null);
      await api.actualizarTarifa(editandoTarifaId, { nombre: formTarifa.nombre, valorTotal: valor });
      setEditandoTarifaId(null);
      await cargar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar la tarifa.");
    }
  }

  async function eliminarTarifa(id: number) {
    try {
      setError(null);
      await api.eliminarTarifa(id);
      await cargar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "No se pudo quitar la opción.");
    }
  }

  async function agregarTarifa(servicioId: number) {
    const valor = Number(formNuevaTarifa.valorTotal.replace(/[^\d]/g, ""));
    if (!formNuevaTarifa.nombre.trim() || valor <= 0) {
      setError("La opción necesita un nombre y un precio.");
      return;
    }
    try {
      setError(null);
      await api.agregarTarifa(servicioId, {
        nombre: formNuevaTarifa.nombre.trim(),
        sesionesIncluidas: Number(formNuevaTarifa.sesionesIncluidas) || 1,
        cupoPersonas: Number(formNuevaTarifa.cupoPersonas) || 1,
        valorTotal: valor,
      });
      setAgregandoTarifaEn(null);
      setFormNuevaTarifa({ nombre: "", sesionesIncluidas: "1", cupoPersonas: "1", valorTotal: "" });
      await cargar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "No se pudo agregar la opción.");
    }
  }

  const total = catalogoData.reduce((n, c) => n + c.servicios.length, 0);

  const catalogoFiltrado = catalogoData
    .map((cat) => ({
      ...cat,
      servicios: cat.servicios.filter(
        (s) =>
          s.nombre.toLowerCase().includes(q.toLowerCase()) ||
          (s.descripcion ?? "").toLowerCase().includes(q.toLowerCase()),
      ),
    }))
    .filter((cat) => cat.servicios.length > 0);

  async function exportarExcelServicios() {
    await exportarExcel(
      "servicios",
      catalogoFiltrado.map((cat) => ({
        nombre: cat.nombre,
        filas: cat.servicios.flatMap((s) =>
          s.opciones.map((o) => ({
            Servicio: s.nombre,
            Duración: s.duracion,
            "Opción / paquete": o.label,
            Precio: o.precio,
            "Por sesión": o.porSesion ?? "",
            "Reservable en línea": s.reservableIndividualmente ? "Sí" : "No",
          })),
        ),
      })),
    );
  }

  async function exportarPdfServicios() {
    const filas = catalogoFiltrado.flatMap((cat) =>
      cat.servicios.flatMap((s) =>
        s.opciones.map((o) => [
          cat.nombre,
          s.nombre,
          s.duracion,
          o.label,
          formatCOP(o.precio),
          o.porSesion ? formatCOP(o.porSesion) : "—",
        ]),
      ),
    );
    await exportarPDF({
      base: "servicios",
      titulo: "Catálogo de servicios",
      subtitulo: `${total} servicios en ${catalogoData.length} categorías`,
      columnas: ["Categoría", "Servicio", "Duración", "Opción / paquete", "Precio", "Por sesión"],
      filas,
    });
  }

  return (
    <AdminShell>
      <PageHeader
        title="Servicios"
        subtitle={
          cargando
            ? "Cargando catálogo..."
            : `${total} servicios en ${catalogoData.length} categorías${enVivo ? "" : " · sin conexión con la API, solo lectura"}.`
        }
        action={
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar servicio..."
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-4 text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-brand-800 focus:outline-none focus:ring-4 focus:ring-brand-800/10 shadow-sm transition"
              />
            </div>
            <button
              type="button"
              disabled={!enVivo}
              onClick={() => setCreando((v) => !v)}
              title={enVivo ? "Nuevo servicio" : "Necesita conexión con la API"}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={14} /> Nuevo servicio
            </button>
            <ExportMenu
              onExcel={exportarExcelServicios}
              onPdf={exportarPdfServicios}
              disabled={catalogoFiltrado.length === 0}
            />
          </div>
        }
      />

      {error && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-rose-700">
            <X size={14} />
          </button>
        </div>
      )}

      {creando && (
        <Reveal className="mt-6">
          <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5">
            <p className="text-sm font-semibold text-slate-900">Nuevo servicio</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Nombre</label>
                <input
                  className={inputCls}
                  value={formNuevo.nombre}
                  onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
                  placeholder="Ej. Drenaje linfático"
                />
              </div>
              <div>
                <label className={labelCls}>Categoría</label>
                <select
                  className={inputCls}
                  value={formNuevo.categoriaId}
                  onChange={(e) => setFormNuevo({ ...formNuevo, categoriaId: Number(e.target.value) })}
                >
                  <option value={0}>Selecciona...</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Descripción</label>
                <textarea
                  className={cn(inputCls, "min-h-16")}
                  value={formNuevo.descripcion}
                  onChange={(e) => setFormNuevo({ ...formNuevo, descripcion: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Duración mín. (min)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={formNuevo.duracionMinMinutos}
                  onChange={(e) => setFormNuevo({ ...formNuevo, duracionMinMinutos: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Duración máx. (min)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={formNuevo.duracionMaxMinutos}
                  onChange={(e) => setFormNuevo({ ...formNuevo, duracionMaxMinutos: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Preparación posterior (min)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={formNuevo.bufferPosteriorMinutos}
                  onChange={(e) => setFormNuevo({ ...formNuevo, bufferPosteriorMinutos: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Precio sesión individual (opcional)</label>
                <input
                  className={inputCls}
                  value={formNuevo.precioInicial}
                  onChange={(e) => setFormNuevo({ ...formNuevo, precioInicial: e.target.value })}
                  placeholder="100000"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={crearServicio}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900"
              >
                <Check size={14} /> Crear servicio
              </button>
              <button
                type="button"
                onClick={() => setCreando(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Reveal>
      )}

      <div className="mt-6 space-y-8">
        {catalogoFiltrado.map((cat) => {
          const serviciosFiltrados = cat.servicios;

          return (
            <section key={cat.id} className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">{cat.nombre}</h2>

              <div className="grid gap-4">
                {serviciosFiltrados.map((s, i) => {
                  const editandoEste = editandoId === s.id && formEdit;
                  return (
                    <Reveal key={s.id} delayMs={i * 40}>
                      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:shadow-md">
                        {editandoEste ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <label className={labelCls}>Nombre</label>
                              <input
                                className={inputCls}
                                value={formEdit.nombre}
                                onChange={(e) => setFormEdit({ ...formEdit, nombre: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Categoría</label>
                              <select
                                className={inputCls}
                                value={formEdit.categoriaId}
                                onChange={(e) => setFormEdit({ ...formEdit, categoriaId: Number(e.target.value) })}
                              >
                                {categorias.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nombre}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>Preparación posterior (min)</label>
                              <input
                                type="number"
                                className={inputCls}
                                value={formEdit.bufferPosteriorMinutos}
                                onChange={(e) =>
                                  setFormEdit({ ...formEdit, bufferPosteriorMinutos: Number(e.target.value) })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelCls}>Descripción</label>
                              <textarea
                                className={cn(inputCls, "min-h-16")}
                                value={formEdit.descripcion}
                                onChange={(e) => setFormEdit({ ...formEdit, descripcion: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Duración mín. (min)</label>
                              <input
                                type="number"
                                className={inputCls}
                                value={formEdit.duracionMinMinutos}
                                onChange={(e) =>
                                  setFormEdit({ ...formEdit, duracionMinMinutos: Number(e.target.value) })
                                }
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Duración máx. (min)</label>
                              <input
                                type="number"
                                className={inputCls}
                                value={formEdit.duracionMaxMinutos}
                                onChange={(e) =>
                                  setFormEdit({ ...formEdit, duracionMaxMinutos: Number(e.target.value) })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2 flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={guardarEdicion}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900"
                              >
                                <Check size={14} /> Guardar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditandoId(null);
                                  setFormEdit(null);
                                }}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="max-w-xl">
                              <p className="font-semibold text-slate-900 text-sm">{s.nombre}</p>
                              <p className="mt-1 text-xs text-slate-500 leading-relaxed font-normal">
                                {s.descripcion}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/60">
                                <Clock size={12} className="text-slate-400" />
                                {s.duracion}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/60">
                                +{s.bufferPosteriorMinutos} min prep.
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
                              {enVivo && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    title="Editar"
                                    onClick={() => empezarEdicion(s, cat.id)}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  {confirmandoId === s.id ? (
                                    <span className="flex items-center gap-1 rounded-lg bg-rose-50 px-1.5 py-1 text-[11px] text-rose-700">
                                      ¿Eliminar?
                                      <button
                                        type="button"
                                        onClick={() => eliminarServicio(s.id)}
                                        className="font-semibold underline"
                                      >
                                        Sí
                                      </button>
                                      <button type="button" onClick={() => setConfirmandoId(null)}>
                                        No
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      title="Eliminar"
                                      onClick={() => setConfirmandoId(s.id)}
                                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                              <tr>
                                <th className="py-2 px-3">Opción / paquete</th>
                                <th className="py-2 px-3 text-right">Precio</th>
                                <th className="py-2 px-3 text-right">Por sesión</th>
                                {enVivo && <th className="py-2 px-3 w-16" />}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-normal">
                              {s.opciones.map((o) =>
                                editandoTarifaId === o.id ? (
                                  <tr key={o.id}>
                                    <td className="py-2 px-3">
                                      <input
                                        className={inputCls}
                                        value={formTarifa.nombre}
                                        onChange={(e) => setFormTarifa({ ...formTarifa, nombre: e.target.value })}
                                      />
                                    </td>
                                    <td className="py-2 px-3" colSpan={2}>
                                      <input
                                        className={cn(inputCls, "text-right")}
                                        value={formTarifa.valorTotal}
                                        onChange={(e) => setFormTarifa({ ...formTarifa, valorTotal: e.target.value })}
                                      />
                                    </td>
                                    <td className="py-2 px-3">
                                      <div className="flex gap-1">
                                        <button type="button" onClick={guardarTarifa} className="text-emerald-600">
                                          <Check size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditandoTarifaId(null)}
                                          className="text-slate-400"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ) : (
                                  <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-2.5 px-3 text-slate-800 font-medium">{o.label}</td>
                                    <td className="py-2.5 px-3 text-right text-slate-900 font-semibold font-mono">
                                      {formatCOP(o.precio)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                                      {o.porSesion ? formatCOP(o.porSesion) : "—"}
                                    </td>
                                    {enVivo && (
                                      <td className="py-2.5 px-3">
                                        <div className="flex justify-end gap-1">
                                          <button
                                            type="button"
                                            title="Editar precio"
                                            onClick={() => empezarEdicionTarifa(o)}
                                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                          >
                                            <Pencil size={12} />
                                          </button>
                                          <button
                                            type="button"
                                            title="Quitar opción"
                                            onClick={() => eliminarTarifa(o.id)}
                                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>

                        {enVivo &&
                          (agregandoTarifaEn === s.id ? (
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                              <input
                                className={inputCls}
                                placeholder="Nombre"
                                value={formNuevaTarifa.nombre}
                                onChange={(e) => setFormNuevaTarifa({ ...formNuevaTarifa, nombre: e.target.value })}
                              />
                              <input
                                type="number"
                                className={inputCls}
                                placeholder="Sesiones"
                                value={formNuevaTarifa.sesionesIncluidas}
                                onChange={(e) =>
                                  setFormNuevaTarifa({ ...formNuevaTarifa, sesionesIncluidas: e.target.value })
                                }
                              />
                              <input
                                type="number"
                                className={inputCls}
                                placeholder="Cupo"
                                value={formNuevaTarifa.cupoPersonas}
                                onChange={(e) =>
                                  setFormNuevaTarifa({ ...formNuevaTarifa, cupoPersonas: e.target.value })
                                }
                              />
                              <input
                                className={inputCls}
                                placeholder="Precio"
                                value={formNuevaTarifa.valorTotal}
                                onChange={(e) => setFormNuevaTarifa({ ...formNuevaTarifa, valorTotal: e.target.value })}
                              />
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => agregarTarifa(s.id)}
                                  className="rounded-lg bg-brand-800 px-2 py-1.5 text-xs font-semibold text-white"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAgregandoTarifaEn(null)}
                                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAgregandoTarifaEn(s.id)}
                              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-brand-800 hover:text-brand-900"
                            >
                              <Plus size={12} /> Agregar opción
                            </button>
                          ))}
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {!enVivo && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 font-normal flex items-center gap-2">
          <ShieldAlert size={15} className="text-slate-400 shrink-0" />
          <span>Sin conexión con la API núcleo: vista de solo lectura con datos de ejemplo.</span>
        </div>
      )}
    </AdminShell>
  );
}
