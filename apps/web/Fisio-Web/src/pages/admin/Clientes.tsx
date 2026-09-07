import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Phone,
  Mail,
  MapPin,
  Gift,
  Edit3,
  Save,
  CheckCircle2,
  FileText,
  User,
  AlertCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, Badge } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import { pacientesEjemplo } from "@/lib/data";
import { HistoriaClinicaModal } from "@/components/admin/historia-clinica-modal";
import { ExportMenu } from "@/components/admin/export-menu";
import { exportarExcel, exportarPDF } from "@/lib/reportes";
import { api, leerToken, ApiError, type PacienteAdminApi, type CitaAdminApi } from "@/lib/api";
type PacienteEjemplo = PacienteAdminApi;
import { cn, partesDeContacto, combinarContacto } from "@/lib/utils";

const normalizarTexto = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,\-]/g, "");


// Fallback fuera de línea: la ficha de ejemplo no trae id numérico ni
// contacto de emergencia combinado, así que se adapta a la forma real.
const pacientesFallback: PacienteEjemplo[] = pacientesEjemplo.map((p, i) => ({
  id: i + 1,
  nombre: p.nombre,
  documento: p.documento,
  telefono: p.telefono,
  email: p.email,
  ciudad: p.ciudad,
  eps: p.eps,
  ocupacion: p.ocupacion,
  contactoEmergencia: p.contactoEmergencia,
  referido: p.referido ?? null,
  referidosEfectivos: p.referidosEfectivos,
  ultimaSesion: p.ultimaSesion,
}));

export default function AdminClientesPage() {
  const [q, setQ] = useState("");
  const [listaPacientes, setListaPacientes] = useState<PacienteEjemplo[]>([]);
  const [citas, setCitas] = useState<CitaAdminApi[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<PacienteEjemplo | null>(null);
  const [pacienteModal, setPacienteModal] = useState<PacienteEjemplo | null>(null);

  // Control de Pestañas (Datos vs Historia Clínica)
  const [tabActiva, setTabActiva] = useState<"datos" | "historia">("datos");

  const [editando, setEditando] = useState(false);
  const [datosEdit, setDatosEdit] = useState<PacienteEjemplo | null>(null);
  const [contactoForm, setContactoForm] = useState({ nombre: "", parentesco: "", telefono: "" });
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);
  const navigate = useNavigate();

  // Cargar clientes reales de core-api. Sin sesión -> al login.
  useEffect(() => {
    if (!leerToken()) {
      navigate("/admin/login");
      return;
    }
    let vivo = true;
    (async () => {
      try {
        setCargando(true);
        const hace1a = new Date();
        hace1a.setFullYear(hace1a.getFullYear() - 1);
        const en1a = new Date();
        en1a.setFullYear(en1a.getFullYear() + 1);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const [pacientes, citasApi] = await Promise.all([
          api.pacientesAdmin(),
          api.citas(fmt(hace1a), fmt(en1a)),
        ]);
        if (vivo) {
          setListaPacientes(pacientes);
          setCitas(citasApi);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          navigate("/admin/login");
          return;
        }
        if (vivo) setListaPacientes(pacientesFallback);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (sel) {
      setDatosEdit({ ...sel });
      setContactoForm(partesDeContacto(sel.contactoEmergencia));
      setEditando(false);
      setGuardadoExitoso(false);
      setTabActiva("datos");
    } else {
      setDatosEdit(null);
    }
  }, [sel]);

  const citasPorPaciente = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of citas) if (c.paciente) map.set(c.paciente, (map.get(c.paciente) ?? 0) + 1);
    return map;
  }, [citas]);

  const ciudades = useMemo(
    () => Array.from(new Set(listaPacientes.map((p) => p.ciudad).filter((c): c is string => !!c))).sort(),
    [listaPacientes],
  );
  const epsList = useMemo(
    () => Array.from(new Set(listaPacientes.map((p) => p.eps).filter((e): e is string => !!e))).sort(),
    [listaPacientes],
  );

  const [filtroCiudad, setFiltroCiudad] = useState("todas");
  const [filtroEps, setFiltroEps] = useState("todas");
  const [filtroActividad, setFiltroActividad] = useState<"todos" | "activos" | "inactivos" | "sin_sesiones">("todos");
  const [filtroReferidos, setFiltroReferidos] = useState<"todos" | "con" | "elegibles">("todos");

  const filtrosActivos =
    filtroCiudad !== "todas" || filtroEps !== "todas" || filtroActividad !== "todos" || filtroReferidos !== "todos";

  function limpiarFiltros() {
    setFiltroCiudad("todas");
    setFiltroEps("todas");
    setFiltroActividad("todos");
    setFiltroReferidos("todos");
  }

  const fmtFechaCorta = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric" }).format(
          new Date(iso),
        )
      : "Sin sesiones";

  async function exportarExcelClientes() {
    await exportarExcel("clientes", [
      {
        nombre: "Clientes",
        filas: filtrados.map((p) => ({
          Nombre: p.nombre,
          Documento: p.documento,
          Teléfono: p.telefono ?? "",
          Correo: p.email ?? "",
          Ciudad: p.ciudad ?? "",
          EPS: p.eps ?? "",
          Ocupación: p.ocupacion ?? "",
          "Contacto de emergencia": p.contactoEmergencia ?? "",
          "Última sesión": fmtFechaCorta(p.ultimaSesion),
          Citas: citasPorPaciente.get(p.nombre) ?? 0,
        })),
      },
    ]);
  }

  async function exportarPdfClientes() {
    await exportarPDF({
      base: "clientes",
      titulo: "Listado de clientes",
      subtitulo: `${filtrados.length} de ${listaPacientes.length} pacientes con ficha registrada`,
      meta: filtrosActivos ? ["Incluye los filtros activos en pantalla."] : [],
      columnas: ["Nombre", "Documento", "Teléfono", "Ciudad", "EPS", "Última sesión", "Citas"],
      filas: filtrados.map((p) => [
        p.nombre,
        p.documento,
        p.telefono ?? "—",
        p.ciudad ?? "—",
        p.eps ?? "—",
        fmtFechaCorta(p.ultimaSesion),
        citasPorPaciente.get(p.nombre) ?? 0,
      ]),
    });
  }

  const DIAS_ACTIVO = 60;

  const filtrados = useMemo(() => {
    const term = normalizarTexto(q.trim());
    const ahora = Date.now();
    return listaPacientes.filter((p) => {
      if (term) {
        const nombreNorm = normalizarTexto(p.nombre);
        const docNorm = normalizarTexto(p.documento);
        const telNorm = normalizarTexto(p.telefono ?? "");
        if (!nombreNorm.includes(term) && !docNorm.includes(term) && !telNorm.includes(term)) return false;
      }
      if (filtroCiudad !== "todas" && p.ciudad !== filtroCiudad) return false;
      if (filtroEps !== "todas" && p.eps !== filtroEps) return false;
      if (filtroReferidos === "con" && p.referidosEfectivos < 1) return false;
      if (filtroReferidos === "elegibles" && p.referidosEfectivos < 5) return false;
      if (filtroActividad !== "todos") {
        const diasDesdeUltima = p.ultimaSesion
          ? (ahora - new Date(p.ultimaSesion).getTime()) / (1000 * 60 * 60 * 24)
          : null;
        if (filtroActividad === "sin_sesiones" && diasDesdeUltima !== null) return false;
        if (filtroActividad === "activos" && (diasDesdeUltima === null || diasDesdeUltima > DIAS_ACTIVO)) return false;
        if (filtroActividad === "inactivos" && (diasDesdeUltima === null || diasDesdeUltima <= DIAS_ACTIVO))
          return false;
      }
      return true;
    });
  }, [q, listaPacientes, filtroCiudad, filtroEps, filtroActividad, filtroReferidos]);

  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const manejarGuardar = async () => {
    if (!datosEdit) return;
    setErrorGuardado(null);

    let contactoEmergencia: string | null;
    try {
      contactoEmergencia = combinarContacto(contactoForm);
    } catch (e) {
      setErrorGuardado(e instanceof Error ? e.message : "Contacto de emergencia inválido.");
      return;
    }

    try {
      const actualizado = await api.actualizarPaciente(datosEdit.id, {
        nombre: datosEdit.nombre,
        telefono: datosEdit.telefono,
        email: datosEdit.email,
        ciudad: datosEdit.ciudad,
        eps: datosEdit.eps,
        ocupacion: datosEdit.ocupacion,
        referido: datosEdit.referido,
        contactoEmergencia,
      });
      setListaPacientes((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
      setSel(actualizado);
      setEditando(false);
      setGuardadoExitoso(true);
      setTimeout(() => setGuardadoExitoso(false), 3000);
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/admin/login");
        return;
      }
      setErrorGuardado(err instanceof ApiError ? err.message : "No se pudo conectar con la API núcleo.");
      return;
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="Clientes"
        subtitle={`${listaPacientes.length} pacientes con ficha registrada.`}
        action={
          <div className="relative w-full sm:w-72">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o cédula..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs font-normal text-slate-700 placeholder:text-slate-400 focus:border-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-700/10 shadow-sm transition-all"
            />
          </div>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={filtroCiudad}
          onChange={(e) => setFiltroCiudad(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-brand-700 focus:outline-none"
        >
          <option value="todas">Todas las ciudades</option>
          {ciudades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={filtroEps}
          onChange={(e) => setFiltroEps(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-brand-700 focus:outline-none"
        >
          <option value="todas">Todas las EPS</option>
          {epsList.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        <select
          value={filtroActividad}
          onChange={(e) => setFiltroActividad(e.target.value as typeof filtroActividad)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-brand-700 focus:outline-none"
        >
          <option value="todos">Cualquier actividad</option>
          <option value="activos">Activos (últimos {DIAS_ACTIVO} días)</option>
          <option value="inactivos">Inactivos (+{DIAS_ACTIVO} días sin venir)</option>
          <option value="sin_sesiones">Sin sesiones registradas</option>
        </select>

        <select
          value={filtroReferidos}
          onChange={(e) => setFiltroReferidos(e.target.value as typeof filtroReferidos)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-brand-700 focus:outline-none"
        >
          <option value="todos">Referidos: todos</option>
          <option value="con">Con al menos 1 referido</option>
          <option value="elegibles">Elegibles para 10% OFF (5+)</option>
        </select>

        {filtrosActivos && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="text-xs font-medium text-brand-800 hover:text-brand-900 hover:underline"
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-slate-400">
          {filtrados.length} de {listaPacientes.length}
        </span>

        <ExportMenu onExcel={exportarExcelClientes} onPdf={exportarPdfClientes} disabled={filtrados.length === 0} />
      </div>

      {cargando ? (
        <div className="p-12 text-center text-xs text-slate-400">
          Cargando lista de clientes...
        </div>
      ) : (
        <div className="mt-6 grid gap-3">
          {filtrados.map((p, i) => {
            const citas = citasPorPaciente.get(p.nombre) ?? 0;
            return (
              <Reveal key={p.id} delayMs={Math.min(i, 8) * 40}>
                <motion.button
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => setSel(p)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-800 font-semibold text-xs border border-brand-200/60">
                      {p.nombre
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">
                        {p.nombre}
                      </p>
                      <p className="truncate text-xs text-slate-500 font-normal mt-0.5">
                        Doc: {p.documento} · {p.ciudad ?? "Ciudad no registrada"} · EPS: {p.eps ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {p.referidosEfectivos >= 5 && (
                      <Badge tono="verde">10% OFF</Badge>
                    )}
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-normal text-slate-700 border border-slate-200/60">
                      {citas} {citas === 1 ? "cita" : "citas"}
                    </span>
                  </div>
                </motion.button>
              </Reveal>
            );
          })}

          {filtrados.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
              No se encontraron clientes que coincidan con la búsqueda.
            </div>
          )}
        </div>
      )}

      {/* Panel Lateral de Detalle del Cliente */}
      <AnimatePresence>
        {sel && datosEdit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setSel(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl flex flex-col justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                {/* Cabecera del Panel */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-800 text-white font-bold text-sm shadow-sm">
                      {sel.nombre
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 leading-tight">
                        {sel.nombre}
                      </h2>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Doc: {sel.documento}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {tabActiva === "datos" && (
                      <button
                        onClick={() => setEditando(!editando)}
                        className={cn(
                          "rounded-lg p-1.5 text-xs font-medium transition flex items-center gap-1 cursor-pointer",
                          editando
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "text-slate-600 hover:bg-slate-100"
                        )}
                        title="Editar información personal"
                      >
                        <Edit3 size={15} />
                        <span>{editando ? "Cancelar" : "Editar"}</span>
                      </button>
                    )}
                    <button
                      onClick={() => setSel(null)}
                      aria-label="Cerrar"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Selector de Pestañas */}
                <div className="mt-4 flex border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <button
                    onClick={() => {
                      setTabActiva("datos");
                    }}
                    className={cn(
                      "flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition cursor-pointer",
                      tabActiva === "datos"
                        ? "border-brand-800 text-brand-800"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <User size={14} /> Datos Personales
                  </button>
                  <button
                    onClick={() => setPacienteModal(sel)}
                    className="flex items-center gap-1.5 py-2.5 px-4 text-slate-500 hover:text-brand-800 transition cursor-pointer"
                  >
                    <FileText size={14} /> Historia Clínica completa
                  </button>
                </div>

                {guardadoExitoso && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    <span>Información actualizada correctamente.</span>
                  </div>
                )}

                {errorGuardado && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                    <AlertCircle size={15} className="text-rose-600 shrink-0" />
                    <span>{errorGuardado}</span>
                  </div>
                )}

                {/* CONTENIDO PESTAÑA 1: DATOS PERSONALES */}
                {tabActiva === "datos" && (
                  <>
                    {editando ? (
                      <div className="mt-5 space-y-3.5 text-xs text-slate-700 font-normal">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Nombre Completo
                          </label>
                          <input
                            type="text"
                            value={datosEdit.nombre}
                            onChange={(e) =>
                              setDatosEdit({ ...datosEdit, nombre: e.target.value })
                            }
                            className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Documento / Cédula
                            </label>
                            <input
                              type="text"
                              value={datosEdit.documento}
                              readOnly
                              title="El documento se edita desde la base de datos, no desde el panel."
                              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Teléfono
                            </label>
                            <input
                              type="text"
                              value={datosEdit.telefono ?? ""}
                              onChange={(e) =>
                                setDatosEdit({ ...datosEdit, telefono: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Correo Electrónico
                          </label>
                          <input
                            type="email"
                            value={datosEdit.email ?? ""}
                            onChange={(e) =>
                              setDatosEdit({ ...datosEdit, email: e.target.value })
                            }
                            className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Ciudad
                            </label>
                            <input
                              type="text"
                              value={datosEdit.ciudad ?? ""}
                              onChange={(e) =>
                                setDatosEdit({ ...datosEdit, ciudad: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              EPS / Aseguradora
                            </label>
                            <input
                              type="text"
                              value={datosEdit.eps ?? ""}
                              onChange={(e) =>
                                setDatosEdit({ ...datosEdit, eps: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Ocupación / Perfil
                          </label>
                          <input
                            type="text"
                            value={datosEdit.ocupacion ?? ""}
                            onChange={(e) =>
                              setDatosEdit({ ...datosEdit, ocupacion: e.target.value })
                            }
                            className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Contacto de Emergencia
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="Nombre"
                              value={contactoForm.nombre}
                              onChange={(e) => setContactoForm({ ...contactoForm, nombre: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder="Parentesco"
                              value={contactoForm.parentesco}
                              onChange={(e) => setContactoForm({ ...contactoForm, parentesco: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder="Teléfono"
                              value={contactoForm.telefono}
                              onChange={(e) => setContactoForm({ ...contactoForm, telefono: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                            />
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">
                            Ej: Pedro Torres · Padre · 3105550100. Deja los 3 vacíos si no aplica.
                          </p>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            ¿Quién lo refirió?
                          </label>
                          <input
                            type="text"
                            value={datosEdit.referido ?? ""}
                            onChange={(e) =>
                              setDatosEdit({ ...datosEdit, referido: e.target.value })
                            }
                            className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                          />
                        </div>

                        <div className="pt-3">
                          <button
                            onClick={manejarGuardar}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-brand-800 hover:bg-brand-900 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                          >
                            <Save size={15} />
                            Guardar Cambios
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-5 space-y-2.5 rounded-xl bg-slate-50 p-4 border border-slate-100 text-xs text-slate-700 font-normal">
                          <p className="flex items-center gap-2.5">
                            <Phone size={14} className="text-brand-700 shrink-0" />
                            <span>{sel.telefono}</span>
                          </p>
                          <p className="flex items-center gap-2.5">
                            <Mail size={14} className="text-brand-700 shrink-0" />
                            <span className="truncate">{sel.email}</span>
                          </p>
                          <p className="flex items-center gap-2.5">
                            <MapPin size={14} className="text-brand-700 shrink-0" />
                            <span>{sel.ciudad}</span>
                          </p>
                        </div>

                        <Dl>
                          <Row k="EPS / Aseguradora" v={sel.eps ?? "—"} />
                          <Row k="Ocupación / Perfil" v={sel.ocupacion ?? "—"} />
                          <Row k="Contacto de emergencia" v={sel.contactoEmergencia ?? "—"} />
                          <Row
                            k="Última sesión"
                            v={
                              sel.ultimaSesion
                                ? new Intl.DateTimeFormat("es-CO", {
                                    timeZone: "America/Bogota",
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  }).format(new Date(sel.ultimaSesion))
                                : "Sin sesiones registradas"
                            }
                          />
                          <Row k="¿Quién lo refirió?" v={sel.referido ?? "—"} />
                        </Dl>

                        <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                          <p className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                            <Gift size={15} className="text-brand-700" />
                            Programa de referidos
                          </p>
                          <div className="mt-3 flex items-center gap-1.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "h-2 flex-1 rounded-full transition-all",
                                  i < sel.referidosEfectivos ? "bg-brand-800" : "bg-slate-200"
                                )}
                              />
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-slate-500 font-normal">
                            {sel.referidosEfectivos} de 5 referidos efectivos.{" "}
                            {sel.referidosEfectivos >= 5
                              ? "Aplica 10% OFF en el próximo servicio."
                              : `Faltan ${5 - sel.referidosEfectivos} para el 10% OFF.`}
                          </p>
                        </div>
                      </>
                    )}
                  </>
                )}

              </div>

              <div className="mt-6 rounded-xl bg-slate-100/70 p-3 text-center text-xs text-slate-500 font-normal">
                Ficha sincronizada con el módulo de atención clínica.
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {pacienteModal && (
        <HistoriaClinicaModal
          paciente={pacienteModal}
          onClose={() => setPacienteModal(null)}
          onPacienteActualizado={(p) => {
            setPacienteModal(p);
            setListaPacientes((prev) => prev.map((x) => (x.id === p.id ? p : x)));
          }}
        />
      )}
    </AdminShell>
  );
}

function Dl({ children }: { children: React.ReactNode }) {
  return (
    <dl className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
      {children}
    </dl>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-xs font-normal">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right text-slate-900 font-medium">{v}</dd>
    </div>
  );
}