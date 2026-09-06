import { useMemo, useState, useEffect } from "react";
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
  Lock,
  Calendar,
  Activity,
  AlertCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader, Badge } from "@/components/admin/kit";
import { Reveal } from "@/components/site/reveal";
import {
  pacientesEjemplo,
  reservasEjemplo,
  type PacienteEjemplo,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const normalizarTexto = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,\-]/g, "");

// Estructura simulada para la historia clínica en modo solo lectura
interface HistoriaClinica {
  antecedentes: string;
  motivoConsulta: string;
  diagnosticoFisioterapeutico: string;
  evolucionSesiones: {
    fecha: string;
    nota: string;
    fisioterapeuta: string;
  }[];
}

const historiaClinicaEjemplo: HistoriaClinica = {
  antecedentes: "Sin alergias conocidas. Cirugía de LCA en rodilla derecha (2022).",
  motivoConsulta: "Dolor lumbar persistente post-ejercicio y restricción de movilidad.",
  diagnosticoFisioterapeutico: "Lumbago mecánico con tensión en la musculatura paravertebral.",
  evolucionSesiones: [
    {
      fecha: "15 Ago 2026",
      nota: "Evaluación inicial. Liberación miofascial y ejercicios de control motor.",
      fisioterapeuta: "Dra. Laura Borda",
    },
    {
      fecha: "28 Ago 2026",
      nota: "Disminución del dolor a 3/10. Se incrementa carga de ejercicio terapéutico.",
      fisioterapeuta: "Dra. Laura Borda",
    },
  ],
};

export default function AdminClientesPage() {
  const [q, setQ] = useState("");
  const [listaPacientes, setListaPacientes] = useState<PacienteEjemplo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<PacienteEjemplo | null>(null);

  // Control de Pestañas (Datos vs Historia Clínica)
  const [tabActiva, setTabActiva] = useState<"datos" | "historia">("datos");

  const [editando, setEditando] = useState(false);
  const [datosEdit, setDatosEdit] = useState<PacienteEjemplo | null>(null);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);

  // Cargar clientes de API o Fallback
  useEffect(() => {
    const cargarClientes = async () => {
      try {
        setCargando(true);
        const res = await fetch("/api/pacientes");
        if (!res.ok) throw new Error("API no disponible");
        const data = await res.json();
        setListaPacientes(data);
      } catch {
        setListaPacientes(pacientesEjemplo);
      } finally {
        setCargando(false);
      }
    };

    cargarClientes();
  }, []);

  useEffect(() => {
    if (sel) {
      setDatosEdit({ ...sel });
      setEditando(false);
      setGuardadoExitoso(false);
      setTabActiva("datos");
    } else {
      setDatosEdit(null);
    }
  }, [sel]);

  const citasPorPaciente = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reservasEjemplo)
      map.set(r.cliente, (map.get(r.cliente) ?? 0) + 1);
    return map;
  }, []);

  const filtrados = useMemo(() => {
    const term = normalizarTexto(q.trim());
    return listaPacientes.filter((p) => {
      if (!term) return true;
      const nombreNorm = normalizarTexto(p.nombre);
      const docNorm = normalizarTexto(p.documento);
      const telNorm = normalizarTexto(p.telefono);
      return (
        nombreNorm.includes(term) ||
        docNorm.includes(term) ||
        telNorm.includes(term)
      );
    });
  }, [q, listaPacientes]);

  const manejarGuardar = async () => {
    if (!datosEdit) return;

    try {
      await fetch(`/api/pacientes/${datosEdit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datosEdit),
      });
    } catch {
      console.warn("Actualización ejecutada en memoria local.");
    }

    setListaPacientes((prev) =>
      prev.map((p) => (p.id === datosEdit.id ? datosEdit : p))
    );
    setSel(datosEdit);
    setEditando(false);
    setGuardadoExitoso(true);

    setTimeout(() => setGuardadoExitoso(false), 3000);
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
                        Doc: {p.documento} · {p.ciudad} · EPS: {p.eps}
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
                    onClick={() => {
                      setTabActiva("historia");
                      setEditando(false);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition cursor-pointer",
                      tabActiva === "historia"
                        ? "border-brand-800 text-brand-800"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <FileText size={14} /> Historia Clínica
                  </button>
                </div>

                {guardadoExitoso && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    <span>Información actualizada correctamente.</span>
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
                              onChange={(e) =>
                                setDatosEdit({ ...datosEdit, documento: e.target.value })
                              }
                              className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Teléfono
                            </label>
                            <input
                              type="text"
                              value={datosEdit.telefono}
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
                            value={datosEdit.email}
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
                              value={datosEdit.ciudad}
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
                              value={datosEdit.eps}
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
                            value={datosEdit.ocupacion}
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
                          <input
                            type="text"
                            value={datosEdit.contactoEmergencia}
                            onChange={(e) =>
                              setDatosEdit({
                                ...datosEdit,
                                contactoEmergencia: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:border-brand-800 focus:outline-none"
                          />
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
                          <Row k="EPS / Aseguradora" v={sel.eps} />
                          <Row k="Ocupación / Perfil" v={sel.ocupacion} />
                          <Row k="Contacto de emergencia" v={sel.contactoEmergencia} />
                          <Row k="Última sesión" v={sel.ultimaSesion} />
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

                {/* CONTENIDO PESTAÑA 2: HISTORIA CLÍNICA (SOLO LECTURA) */}
                {tabActiva === "historia" && (
                  <div className="mt-5 space-y-4 text-xs">
                    {/* Badge indicando Solo Lectura */}
                    <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-800">
                      <div className="flex items-center gap-2">
                        <Lock size={15} className="text-amber-700 shrink-0" />
                        <span className="font-semibold text-[11px]">
                          Modo Solo Lectura
                        </span>
                      </div>
                      <span className="text-[10px] bg-amber-200/60 px-2 py-0.5 rounded-md font-mono text-amber-900">
                        Historial Protegido
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                          Antecedentes Médicos
                        </span>
                        <p className="text-slate-800 leading-relaxed font-normal bg-white p-2.5 rounded-lg border border-slate-200/60">
                          {historiaClinicaEjemplo.antecedentes}
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                          Motivo de Consulta Inicial
                        </span>
                        <p className="text-slate-800 leading-relaxed font-normal bg-white p-2.5 rounded-lg border border-slate-200/60">
                          {historiaClinicaEjemplo.motivoConsulta}
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                          Diagnóstico Fisioterapéutico
                        </span>
                        <p className="text-slate-800 leading-relaxed font-semibold bg-white p-2.5 rounded-lg border border-slate-200/60 text-brand-900">
                          {historiaClinicaEjemplo.diagnosticoFisioterapeutico}
                        </p>
                      </div>
                    </div>

                    {/* Registro de Evolución */}
                    <div className="pt-2">
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5 mb-3">
                        <Activity size={14} className="text-brand-800" />
                        Evolución de Sesiones
                      </h4>

                      <div className="space-y-3">
                        {historiaClinicaEjemplo.evolucionSesiones.map((sesion, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs"
                          >
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                              <span className="flex items-center gap-1.5 font-semibold text-slate-900 text-[11px]">
                                <Calendar size={13} className="text-brand-700" />
                                {sesion.fecha}
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium">
                                {sesion.fisioterapeuta}
                              </span>
                            </div>
                            <p className="text-slate-600 leading-relaxed text-xs">
                              {sesion.nota}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-slate-500 text-[11px]">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>
                        Para registrar una nueva sesión o modificar la historia clínica, dirígete al módulo clínico de atención.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-xl bg-slate-100/70 p-3 text-center text-xs text-slate-500 font-normal">
                Ficha sincronizada con el módulo de atención clínica.
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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