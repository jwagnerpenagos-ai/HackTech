import { useEffect, useState } from "react";
import {
  X,
  User,
  Stethoscope,
  Activity,
  HeartPulse,
  ClipboardList,
  CalendarPlus,
  AlertTriangle,
  Check,
  Plus,
  Download,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  api,
  ApiError,
  type PacienteAdminApi,
  type CatalogosClinicosApi,
  type CitaPacienteApi,
  type AntecedentePacienteApi,
  type AnamnesisApi,
  type SignosVitalesApi,
  type EvaluacionDolorApi,
  type EvolucionApi,
  type ServicioCatalogoApi,
  type SedeApi,
} from "@/lib/api";
import { partesDeContacto, combinarContacto } from "@/lib/utils";
const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:border-brand-800 focus:outline-none";
const labelCls = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1";

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

type Tab = "consulta" | "datos" | "antecedentes" | "vitales" | "dolor" | "evolucion" | "anamnesis" | "citas";

const TABS_REFERENCIA: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "datos", label: "Datos", icon: User },
  { id: "antecedentes", label: "Antecedentes", icon: AlertTriangle },
  { id: "vitales", label: "Signos vitales", icon: HeartPulse },
  { id: "dolor", label: "Dolor", icon: Activity },
  { id: "evolucion", label: "Evolución", icon: ClipboardList },
  { id: "anamnesis", label: "Anamnesis", icon: Stethoscope },
  { id: "citas", label: "Citas", icon: CalendarPlus },
];

const TAB_CONSULTA = { id: "consulta" as const, label: "Consulta en curso", icon: Sparkles };

function bogotaFecha(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso));
}
function bogotaHoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

type ContextoFecha = { variante: "hoy" | "programada" | "pasada"; mensaje: string };

function contextoFecha(iniciaEnIso: string): ContextoFecha {
  const fechaCita = bogotaFecha(iniciaEnIso);
  const hoy = bogotaHoy();
  const fechaHora = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iniciaEnIso));
  if (fechaCita === hoy) {
    return { variante: "hoy", mensaje: `Consulta de hoy · ${fechaHora}` };
  }
  if (fechaCita > hoy) {
    return {
      variante: "programada",
      mensaje: `Vas a registrar una consulta programada para el ${fechaHora}, todavía no ha ocurrido.`,
    };
  }
  return {
    variante: "pasada",
    mensaje: `Estás completando el registro de una consulta ya realizada el ${fechaHora}.`,
  };
}

export function HistoriaClinicaModal({
  paciente,
  reservaContextoId,
  onClose,
  onPacienteActualizado,
}: {
  paciente: PacienteAdminApi;
  reservaContextoId?: number | null;
  onClose: () => void;
  onPacienteActualizado: (p: PacienteAdminApi) => void;
}) {
  const [tab, setTab] = useState<Tab>(reservaContextoId ? "consulta" : "datos");
  const [reservaActivaId, setReservaActivaId] = useState<number | null>(reservaContextoId ?? null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catalogos, setCatalogos] = useState<CatalogosClinicosApi | null>(null);
  const [citas, setCitas] = useState<CitaPacienteApi[]>([]);
  const [antecedentes, setAntecedentes] = useState<AntecedentePacienteApi[]>([]);
  const [anamnesis, setAnamnesis] = useState<AnamnesisApi[]>([]);
  const [vitales, setVitales] = useState<SignosVitalesApi[]>([]);
  const [dolor, setDolor] = useState<EvaluacionDolorApi[]>([]);
  const [evolucion, setEvolucion] = useState<EvolucionApi[]>([]);

  const cargarTodo = async () => {
    try {
      setCargando(true);
      setError(null);
      const [cat, cit, ant, ana, vit, dol, evo] = await Promise.all([
        api.catalogosClinicos(),
        api.citasDePaciente(paciente.id),
        api.antecedentesPaciente(paciente.id),
        api.anamnesisDePaciente(paciente.id),
        api.signosVitalesDePaciente(paciente.id),
        api.dolorDePaciente(paciente.id),
        api.evolucionDePaciente(paciente.id),
      ]);
      setCatalogos(cat);
      setCitas(cit);
      setAntecedentes(ant);
      setAnamnesis(ana);
      setVitales(vit);
      setDolor(dol);
      setEvolucion(evo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la historia clínica.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paciente.id]);

  const citaActiva = citas.find((c) => c.reservaId === reservaActivaId) ?? null;
  const tabsAMostrar = citaActiva ? [TAB_CONSULTA, ...TABS_REFERENCIA] : TABS_REFERENCIA;
  const datosFaltantes =
    paciente.documento === "Sin documento" ||
    !paciente.telefono ||
    !paciente.email ||
    !paciente.ciudad ||
    !paciente.eps ||
    !paciente.ocupacion ||
    !paciente.contactoEmergencia;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-gradient-to-r from-brand-50/60 to-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-800 text-white font-bold text-sm shadow-sm">
              {paciente.nombre.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate leading-tight">{paciente.nombre}</h2>
              <p className="text-xs text-slate-500 font-mono">{paciente.documento}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                exportarHistoriaPdf(paciente, { antecedentes, anamnesis, vitales, dolor, evolucion, citas })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              <Download size={14} /> Exportar PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-3 py-2 shrink-0">
          {tabsAMostrar.map((t) => {
            const Icon = t.icon;
            const activo = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  activo
                    ? t.id === "consulta"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-brand-800 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                <Icon size={14} /> {t.label}
                {t.id === "datos" && datosFaltantes && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Ficha incompleta" />
                )}
              </button>
            );
          })}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          {cargando ? (
            <p className="text-center text-xs text-slate-400 py-12">Cargando historia clínica...</p>
          ) : error ? (
            <p className="text-center text-xs text-rose-600 py-12">{error}</p>
          ) : (
            <>
              {tab === "consulta" && citaActiva && (
                <TabConsulta
                  cita={citaActiva}
                  onIrA={setTab}
                  onFinalizar={async () => {
                    await api.asistenciaCita(citaActiva.reservaId, true);
                    await cargarTodo();
                  }}
                />
              )}
              {tab === "datos" && (
                <TabDatos paciente={paciente} onActualizado={onPacienteActualizado} />
              )}
              {tab === "antecedentes" && catalogos && (
                <TabAntecedentes
                  pacienteId={paciente.id}
                  catalogo={catalogos.antecedentes}
                  actuales={antecedentes}
                  onGuardado={cargarTodo}
                />
              )}
              {tab === "vitales" && (
                <TabVitales
                  pacienteId={paciente.id}
                  registros={vitales}
                  reservaContextoId={reservaActivaId}
                  onCreado={cargarTodo}
                />
              )}
              {tab === "dolor" && catalogos && (
                <TabDolor
                  pacienteId={paciente.id}
                  registros={dolor}
                  catalogo={catalogos}
                  reservaContextoId={reservaActivaId}
                  onCreado={cargarTodo}
                />
              )}
              {tab === "evolucion" && (
                <TabEvolucion
                  pacienteId={paciente.id}
                  registros={evolucion}
                  citas={citas}
                  reservaContextoId={reservaActivaId}
                  onCreado={cargarTodo}
                />
              )}
              {tab === "anamnesis" && catalogos && (
                <TabAnamnesis
                  pacienteId={paciente.id}
                  registros={anamnesis}
                  motivos={catalogos.motivosConsulta}
                  reservaContextoId={reservaContextoId ?? null}
                  onCreado={cargarTodo}
                />
              )}
              {tab === "citas" && (
                <TabCitas
                  pacienteId={paciente.id}
                  citas={citas}
                  onAgendada={cargarTodo}
                  onSeleccionar={(id) => {
                    setReservaActivaId(id);
                    setTab("consulta");
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Consulta en curso: aterriza aquí al entrar a una cita concreta -------

const BANNER_CONTEXTO: Record<ContextoFecha["variante"], string> = {
  hoy: "border-emerald-200 bg-emerald-50 text-emerald-800",
  programada: "border-amber-200 bg-amber-50 text-amber-800",
  pasada: "border-slate-200 bg-slate-50 text-slate-700",
};

function TabConsulta({
  cita,
  onIrA,
  onFinalizar,
}: {
  cita: CitaPacienteApi;
  onIrA: (t: Tab) => void;
  onFinalizar: () => Promise<void>;
}) {
  const [finalizando, setFinalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctx = contextoFecha(cita.iniciaEn);
  const yaCerrada = cita.estado === "atendida" || cita.estado === "no_asistio";

  async function finalizar() {
    setFinalizando(true);
    setError(null);
    try {
      await onFinalizar();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "No se pudo finalizar la consulta. Revisa tu conexión e intenta de nuevo.",
      );
    } finally {
      setFinalizando(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className={`rounded-xl border p-4 text-sm font-medium ${BANNER_CONTEXTO[ctx.variante]}`}>
        {ctx.mensaje}
        <p className="mt-1 text-xs font-normal opacity-80">
          {cita.servicio ?? "Cita"} · {cita.sede}
        </p>
      </div>

      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Documenta la sesión
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <TarjetaAccionConsulta
            icono={HeartPulse}
            titulo="Signos vitales"
            descripcion="Presión, frecuencia, peso, talla."
            onClick={() => onIrA("vitales")}
          />
          <TarjetaAccionConsulta
            icono={Activity}
            titulo="Dolor (EVA)"
            descripcion="Intensidad, tipo y zona."
            onClick={() => onIrA("dolor")}
          />
          <TarjetaAccionConsulta
            icono={ClipboardList}
            titulo="Evolución (SOAP)"
            descripcion="Subjetivo, objetivo, análisis, plan."
            onClick={() => onIrA("evolucion")}
          />
        </div>
      </div>

      {yaCerrada ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2.5">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <p className="text-xs font-medium text-emerald-800">
            Esta consulta ya quedó marcada como {cita.estado === "atendida" ? "atendida" : "no asistida"}. Puedes
            seguir agregando o revisando registros desde las pestañas de arriba.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">
            Al finalizar, la cita queda marcada como atendida. Puedes volver a esta pestaña en cualquier momento
            mientras la consulta siga abierta.
          </p>
          {error && (
            <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
          <button
            onClick={finalizar}
            disabled={finalizando}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 size={15} /> {finalizando ? "Guardando..." : "Finalizar consulta y marcar atendida"}
          </button>
        </div>
      )}
    </div>
  );
}

function TarjetaAccionConsulta({
  icono: Icono,
  titulo,
  descripcion,
  onClick,
}: {
  icono: typeof User;
  titulo: string;
  descripcion: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md cursor-pointer"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
        <Icono size={17} />
      </span>
      <span className="text-xs font-semibold text-slate-900">{titulo}</span>
      <span className="text-[11px] text-slate-500 leading-snug">{descripcion}</span>
    </button>
  );
}

// --- Exportar historia clínica en PDF (vista de impresión del navegador) --

function exportarHistoriaPdf(
  paciente: PacienteAdminApi,
  datos: {
    antecedentes: AntecedentePacienteApi[];
    anamnesis: AnamnesisApi[];
    vitales: SignosVitalesApi[];
    dolor: EvaluacionDolorApi[];
    evolucion: EvolucionApi[];
    citas: CitaPacienteApi[];
  },
) {
  const f = (iso: string | null) => fmtFecha(iso);
  const filaAntecedentes = datos.antecedentes.length
    ? datos.antecedentes
        .map((a) => `<li><strong>${a.nombre}</strong>${a.detalle ? ` — ${a.detalle}` : ""}</li>`)
        .join("")
    : "<li>Sin antecedentes registrados.</li>";

  const ultimaAnamnesis = datos.anamnesis[0];
  const anamnesisHtml = ultimaAnamnesis
    ? `<table>
        <tr><th>Registrada</th><td>${f(ultimaAnamnesis.registradoEn)}</td></tr>
        <tr><th>Motivo</th><td>${ultimaAnamnesis.motivoConsulta ?? "—"}</td></tr>
        <tr><th>Enfermedad actual</th><td>${ultimaAnamnesis.enfermedadActual ?? "—"}</td></tr>
        <tr><th>Causa aparente</th><td>${ultimaAnamnesis.causaAparente ?? "—"}</td></tr>
        <tr><th>Tratamientos previos</th><td>${ultimaAnamnesis.tratamientosPrevios ?? "—"}</td></tr>
        <tr><th>Objetivos</th><td>${ultimaAnamnesis.objetivosTerapeuticos ?? "—"}</td></tr>
      </table>`
    : "<p>Sin anamnesis registrada.</p>";

  const vitalesHtml = datos.vitales.length
    ? `<table>
        <thead><tr><th>Fecha</th><th>TA</th><th>FC</th><th>FR</th><th>SpO2</th><th>IMC</th></tr></thead>
        <tbody>${datos.vitales
          .map(
            (v) =>
              `<tr><td>${f(v.tomadoEn)}</td><td>${v.sistolica ?? "—"}/${v.diastolica ?? "—"}</td><td>${
                v.frecuenciaCardiaca ?? "—"
              }</td><td>${v.frecuenciaRespiratoria ?? "—"}</td><td>${v.saturacionO2 ?? "—"}</td><td>${
                v.imc ?? "—"
              }</td></tr>`,
          )
          .join("")}</tbody>
      </table>`
    : "<p>Sin tomas registradas.</p>";

  const dolorHtml = datos.dolor.length
    ? `<table>
        <thead><tr><th>Fecha</th><th>Intensidad</th><th>Zona</th><th>Tipo</th></tr></thead>
        <tbody>${datos.dolor
          .map(
            (d) =>
              `<tr><td>${f(d.evaluadoEn)}</td><td>${d.intensidad}/10 (${d.clasificacion})</td><td>${
                d.zona ?? "—"
              }</td><td>${d.tiposDolor.join(", ") || "—"}</td></tr>`,
          )
          .join("")}</tbody>
      </table>`
    : "<p>Sin evaluaciones registradas.</p>";

  const evolucionHtml = datos.evolucion.length
    ? datos.evolucion
        .map(
          (e) => `<div class="nota">
            <p class="fecha">${f(e.registradoEn)}</p>
            ${e.subjetivo ? `<p><strong>S:</strong> ${e.subjetivo}</p>` : ""}
            ${e.objetivo ? `<p><strong>O:</strong> ${e.objetivo}</p>` : ""}
            ${e.analisis ? `<p><strong>A:</strong> ${e.analisis}</p>` : ""}
            ${e.plan ? `<p><strong>P:</strong> ${e.plan}</p>` : ""}
          </div>`,
        )
        .join("")
    : "<p>Sin notas de evolución.</p>";

  const citasHtml = datos.citas.length
    ? `<table>
        <thead><tr><th>Fecha</th><th>Servicio</th><th>Sede</th><th>Estado</th></tr></thead>
        <tbody>${datos.citas
          .map((c) => `<tr><td>${f(c.iniciaEn)}</td><td>${c.servicio ?? "—"}</td><td>${c.sede}</td><td>${c.estado.replace(/_/g, " ")}</td></tr>`)
          .join("")}</tbody>
      </table>`
    : "<p>Sin citas registradas.</p>";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Historia clínica — ${paciente.nombre}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1e293b; margin: 2.5rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin-bottom: 0.1rem; }
  h2 { font-size: 1rem; margin-top: 2rem; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; }
  .subtitulo { color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
  th, td { border: 1px solid #e2e8f0; padding: 0.4rem 0.6rem; text-align: left; }
  th { background: #f8fafc; }
  ul { margin: 0.5rem 0; padding-left: 1.2rem; font-size: 0.85rem; }
  .nota { border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.6rem 0.8rem; margin-top: 0.6rem; font-size: 0.85rem; }
  .nota .fecha { font-weight: bold; margin-bottom: 0.3rem; }
  .barra-imprimir { position: sticky; top: 0; background: #f1f5f9; border-bottom: 1px solid #cbd5e1;
    padding: 0.75rem 1rem; margin: -2.5rem -2.5rem 1.5rem; font-family: system-ui, sans-serif; }
  .barra-imprimir button { font-family: inherit; font-size: 0.85rem; font-weight: 600; padding: 0.5rem 1rem;
    border-radius: 8px; border: none; background: #015d47; color: white; cursor: pointer; }
  .barra-imprimir button:hover { background: #014536; }
  @media print { .barra-imprimir { display: none; } body { margin: 1.5cm; } }
</style>
</head><body>
  <div class="barra-imprimir">
    <button onclick="window.print()">Imprimir / Guardar como PDF</button>
  </div>
  <h1>${paciente.nombre}</h1>
  <p class="subtitulo">
    ${paciente.documento} · ${paciente.telefono ?? "sin teléfono"} · ${paciente.eps ?? "particular"} ·
    Generado el ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" }).format(new Date())}
  </p>

  <h2>Antecedentes</h2>
  <ul>${filaAntecedentes}</ul>

  <h2>Anamnesis (más reciente)</h2>
  ${anamnesisHtml}

  <h2>Signos vitales</h2>
  ${vitalesHtml}

  <h2>Evaluaciones de dolor</h2>
  ${dolorHtml}

  <h2>Evolución de sesiones</h2>
  ${evolucionHtml}

  <h2>Historial de citas</h2>
  ${citasHtml}
</body></html>`;

  const ventana = window.open("", "_blank");
  if (!ventana) return;
  ventana.document.write(html);
  ventana.document.close();
  ventana.focus();
}

// --- Datos personales -------------------------------------------------------

function TabDatos({
  paciente,
  onActualizado,
}: {
  paciente: PacienteAdminApi;
  onActualizado: (p: PacienteAdminApi) => void;
}) {
  const [form, setForm] = useState({
    telefono: paciente.telefono ?? "",
    email: paciente.email ?? "",
    ciudad: paciente.ciudad ?? "",
    eps: paciente.eps ?? "",
    ocupacion: paciente.ocupacion ?? "",
    referido: paciente.referido ?? "",
  });
  const [contactoForm, setContactoForm] = useState(partesDeContacto(paciente.contactoEmergencia));
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    let contactoEmergencia: string | null;
    try {
      contactoEmergencia = combinarContacto(contactoForm);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Contacto de emergencia inválido.");
      return;
    }
    try {
      setGuardando(true);
      setErr(null);
      const actualizado = await api.actualizarPaciente(paciente.id, { ...form, contactoEmergencia });
      onActualizado(actualizado);
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const camposFaltantes = [
    paciente.documento === "Sin documento" ? "Documento" : null,
    !paciente.telefono ? "Teléfono" : null,
    !paciente.email ? "Correo" : null,
    !paciente.ciudad ? "Ciudad" : null,
    !paciente.eps ? "EPS" : null,
    !paciente.ocupacion ? "Ocupación" : null,
    !paciente.contactoEmergencia ? "Contacto de emergencia" : null,
  ].filter((c): c is string => c !== null);

  return (
    <div className="space-y-4">
      {camposFaltantes.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Ficha incompleta.</strong> Falta: {camposFaltantes.join(", ")}.
          </span>
        </div>
      )}
      {ok && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
          Datos actualizados.
        </div>
      )}
      {err && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{err}</div>}

      <div className="rounded-xl border border-slate-200 p-5">
        <p className="mb-3 text-xs font-semibold text-slate-800">Datos de contacto</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Teléfono</label>
            <input className={inputCls} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Correo</label>
            <input className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Ciudad</label>
            <input className={inputCls} value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>EPS</label>
            <input className={inputCls} value={form.eps} onChange={(e) => setForm({ ...form, eps: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Ocupación</label>
            <input className={inputCls} value={form.ocupacion} onChange={(e) => setForm({ ...form, ocupacion: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>¿Quién lo refirió?</label>
            <input className={inputCls} value={form.referido} onChange={(e) => setForm({ ...form, referido: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-5">
        <p className="mb-3 text-xs font-semibold text-slate-800">Contacto de emergencia</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Nombre</label>
            <input
              className={inputCls}
              value={contactoForm.nombre}
              onChange={(e) => setContactoForm({ ...contactoForm, nombre: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Parentesco</label>
            <input
              className={inputCls}
              value={contactoForm.parentesco}
              onChange={(e) => setContactoForm({ ...contactoForm, parentesco: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Teléfono</label>
            <input
              className={inputCls}
              value={contactoForm.telefono}
              onChange={(e) => setContactoForm({ ...contactoForm, telefono: e.target.value })}
            />
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">Deja los 3 campos vacíos si no aplica.</p>
      </div>

      <button
        onClick={guardar}
        disabled={guardando}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
      >
        <Check size={14} /> Guardar
      </button>
    </div>
  );
}

// --- Antecedentes ------------------------------------------------------------

function TabAntecedentes({
  pacienteId,
  catalogo,
  actuales,
  onGuardado,
}: {
  pacienteId: number;
  catalogo: CatalogosClinicosApi["antecedentes"];
  actuales: AntecedentePacienteApi[];
  onGuardado: () => void;
}) {
  const [seleccion, setSeleccion] = useState<Map<number, string>>(
    () => new Map(actuales.map((a) => [a.antecedenteId, a.detalle ?? ""])),
  );
  const [guardando, setGuardando] = useState(false);

  function toggle(id: number) {
    setSeleccion((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, "");
      return next;
    });
  }

  async function guardar() {
    setGuardando(true);
    try {
      await api.actualizarAntecedentes(
        pacienteId,
        Array.from(seleccion.entries()).map(([antecedenteId, detalle]) => ({
          antecedenteId,
          detalle: detalle || null,
        })),
      );
      onGuardado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalogo.map((a) => {
          const marcado = seleccion.has(a.id);
          return (
            <div
              key={a.id}
              className={`rounded-lg border p-2.5 ${a.esBanderaRoja ? "border-rose-200 bg-rose-50/40" : "border-slate-200"}`}
            >
              <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input type="checkbox" checked={marcado} onChange={() => toggle(a.id)} />
                {a.nombre}
                {a.esBanderaRoja && <AlertTriangle size={12} className="text-rose-600" />}
              </label>
              {marcado && (
                <input
                  className={`${inputCls} mt-1.5`}
                  placeholder="Detalle (opcional)"
                  value={seleccion.get(a.id) ?? ""}
                  onChange={(e) =>
                    setSeleccion((prev) => new Map(prev).set(a.id, e.target.value))
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={guardar}
        disabled={guardando}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
      >
        <Check size={14} /> Guardar antecedentes
      </button>
    </div>
  );
}

// --- Signos vitales -----------------------------------------------------------

function TabVitales({
  pacienteId,
  registros,
  reservaContextoId,
  onCreado,
}: {
  pacienteId: number;
  registros: SignosVitalesApi[];
  reservaContextoId: number | null;
  onCreado: () => void;
}) {
  const [form, setForm] = useState({
    sistolica: "",
    diastolica: "",
    frecuenciaCardiaca: "",
    frecuenciaRespiratoria: "",
    saturacionO2: "",
    pesoKg: "",
    tallaCm: "",
  });
  const [guardando, setGuardando] = useState(false);

  async function registrar() {
    setGuardando(true);
    try {
      const num = (v: string) => (v.trim() ? Number(v) : null);
      await api.crearSignosVitales(pacienteId, {
        reservaId: reservaContextoId,
        sistolica: num(form.sistolica),
        diastolica: num(form.diastolica),
        frecuenciaCardiaca: num(form.frecuenciaCardiaca),
        frecuenciaRespiratoria: num(form.frecuenciaRespiratoria),
        saturacionO2: num(form.saturacionO2),
        pesoKg: num(form.pesoKg),
        tallaCm: num(form.tallaCm),
      });
      setForm({
        sistolica: "",
        diastolica: "",
        frecuenciaCardiaca: "",
        frecuenciaRespiratoria: "",
        saturacionO2: "",
        pesoKg: "",
        tallaCm: "",
      });
      onCreado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-800 mb-2.5">Registrar nueva toma</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          <div>
            <label className={labelCls}>Sistólica</label>
            <input className={inputCls} value={form.sistolica} onChange={(e) => setForm({ ...form, sistolica: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Diastólica</label>
            <input className={inputCls} value={form.diastolica} onChange={(e) => setForm({ ...form, diastolica: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>FC (lpm)</label>
            <input className={inputCls} value={form.frecuenciaCardiaca} onChange={(e) => setForm({ ...form, frecuenciaCardiaca: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>FR (rpm)</label>
            <input className={inputCls} value={form.frecuenciaRespiratoria} onChange={(e) => setForm({ ...form, frecuenciaRespiratoria: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>SpO2 (%)</label>
            <input className={inputCls} value={form.saturacionO2} onChange={(e) => setForm({ ...form, saturacionO2: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Peso (kg)</label>
            <input className={inputCls} value={form.pesoKg} onChange={(e) => setForm({ ...form, pesoKg: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Talla (cm)</label>
            <input className={inputCls} value={form.tallaCm} onChange={(e) => setForm({ ...form, tallaCm: e.target.value })} />
          </div>
        </div>
        <button
          onClick={registrar}
          disabled={guardando}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
        >
          <Plus size={14} /> Registrar toma
        </button>
      </div>

      <div className="space-y-2">
        {registros.length === 0 && <p className="text-xs text-slate-400">Sin tomas registradas.</p>}
        {registros.map((r) => (
          <div
            key={r.id}
            className={`rounded-lg border p-3 text-xs ${r.requiereAtencion ? "border-rose-200 bg-rose-50/40" : "border-slate-200"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">{fmtFecha(r.tomadoEn)}</span>
              {r.requiereAtencion && (
                <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                  <AlertTriangle size={12} /> Requiere atención
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
              {r.sistolica !== null && (
                <span>
                  TA: {r.sistolica}/{r.diastolica} <span className="text-slate-400">({r.estadoTension})</span>
                </span>
              )}
              {r.frecuenciaCardiaca !== null && (
                <span>
                  FC: {r.frecuenciaCardiaca} <span className="text-slate-400">({r.estadoFrecuenciaCardiaca})</span>
                </span>
              )}
              {r.saturacionO2 !== null && (
                <span>
                  SpO2: {r.saturacionO2}% <span className="text-slate-400">({r.estadoSaturacion})</span>
                </span>
              )}
              {r.imc !== null && (
                <span>
                  IMC: {r.imc} <span className="text-slate-400">({r.estadoImc})</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Dolor ---------------------------------------------------------------

function TabDolor({
  pacienteId,
  registros,
  catalogo,
  reservaContextoId,
  onCreado,
}: {
  pacienteId: number;
  registros: EvaluacionDolorApi[];
  catalogo: CatalogosClinicosApi;
  reservaContextoId: number | null;
  onCreado: () => void;
}) {
  const [intensidad, setIntensidad] = useState(5);
  const [comportamiento, setComportamiento] = useState("");
  const [zonaId, setZonaId] = useState(0);
  const [localizacion, setLocalizacion] = useState("");
  const [tipos, setTipos] = useState<Set<number>>(new Set());
  const [guardando, setGuardando] = useState(false);

  function toggleTipo(id: number) {
    setTipos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function registrar() {
    setGuardando(true);
    try {
      await api.crearEvaluacionDolor(pacienteId, {
        reservaId: reservaContextoId,
        intensidad,
        comportamiento: comportamiento || null,
        zonaId: zonaId || null,
        localizacion: localizacion || null,
        tiposDolorIds: Array.from(tipos),
      });
      setIntensidad(5);
      setComportamiento("");
      setZonaId(0);
      setLocalizacion("");
      setTipos(new Set());
      onCreado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-800">Nueva evaluación (escala EVA)</p>
        <div>
          <label className={labelCls}>Intensidad: {intensidad}/10</label>
          <input
            type="range"
            min={0}
            max={10}
            value={intensidad}
            onChange={(e) => setIntensidad(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={labelCls}>Comportamiento</label>
            <select className={inputCls} value={comportamiento} onChange={(e) => setComportamiento(e.target.value)}>
              <option value="">—</option>
              <option value="continuo">Continuo</option>
              <option value="intermitente">Intermitente</option>
              <option value="aumenta_con_movimiento">Aumenta con movimiento</option>
              <option value="aumenta_en_reposo">Aumenta en reposo</option>
              <option value="nocturno">Nocturno</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Zona</label>
            <select className={inputCls} value={zonaId} onChange={(e) => setZonaId(Number(e.target.value))}>
              <option value={0}>—</option>
              {catalogo.zonasAnatomicas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Localización (libre)</label>
          <input className={inputCls} value={localizacion} onChange={(e) => setLocalizacion(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Tipo de dolor</label>
          <div className="flex flex-wrap gap-1.5">
            {catalogo.tiposDolor.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTipo(t.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition cursor-pointer ${
                  tipos.has(t.id) ? "border-brand-800 bg-brand-800 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.nombre}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={registrar}
          disabled={guardando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
        >
          <Plus size={14} /> Registrar
        </button>
      </div>

      <div className="space-y-2">
        {registros.length === 0 && <p className="text-xs text-slate-400">Sin evaluaciones registradas.</p>}
        {registros.map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-200 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">{fmtFecha(r.evaluadoEn)}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                {r.intensidad}/10 · {r.clasificacion}
              </span>
            </div>
            <p className="mt-1 text-slate-600">
              {[r.zona, r.comportamiento?.replace(/_/g, " "), r.tiposDolor.join(", "), r.localizacion]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Evolución (SOAP) ---------------------------------------------------

function TabEvolucion({
  pacienteId,
  registros,
  citas,
  reservaContextoId,
  onCreado,
}: {
  pacienteId: number;
  registros: EvolucionApi[];
  citas: CitaPacienteApi[];
  reservaContextoId: number | null;
  onCreado: () => void;
}) {
  const [reservaId, setReservaId] = useState<number | null>(reservaContextoId);
  const [form, setForm] = useState({ subjetivo: "", objetivo: "", analisis: "", plan: "", tecnicasAplicadas: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function registrar() {
    if (!reservaId) {
      setError("Selecciona a qué cita corresponde esta evolución.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.crearEvolucion(pacienteId, { reservaId, ...form });
      setForm({ subjetivo: "", objetivo: "", analisis: "", plan: "", tecnicasAplicadas: "" });
      onCreado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la evolución.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-800">Nueva nota de evolución</p>
        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{error}</div>}
        <div>
          <label className={labelCls}>Cita</label>
          <select
            className={inputCls}
            value={reservaId ?? 0}
            onChange={(e) => setReservaId(Number(e.target.value) || null)}
          >
            <option value={0}>Selecciona la cita...</option>
            {citas.map((c) => (
              <option key={c.reservaId} value={c.reservaId}>
                {fmtFecha(c.iniciaEn)} · {c.servicio ?? "Cita"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>S — Subjetivo</label>
          <textarea className={`${inputCls} min-h-14`} value={form.subjetivo} onChange={(e) => setForm({ ...form, subjetivo: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>O — Objetivo</label>
          <textarea className={`${inputCls} min-h-14`} value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>A — Análisis</label>
          <textarea className={`${inputCls} min-h-14`} value={form.analisis} onChange={(e) => setForm({ ...form, analisis: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>P — Plan</label>
          <textarea className={`${inputCls} min-h-14`} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Técnicas aplicadas</label>
          <input className={inputCls} value={form.tecnicasAplicadas} onChange={(e) => setForm({ ...form, tecnicasAplicadas: e.target.value })} />
        </div>
        <button
          onClick={registrar}
          disabled={guardando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
        >
          <Plus size={14} /> Guardar evolución
        </button>
      </div>

      <div className="space-y-2">
        {registros.length === 0 && <p className="text-xs text-slate-400">Sin notas de evolución.</p>}
        {registros.map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
            <p className="font-semibold text-slate-800">{fmtFecha(r.registradoEn)}</p>
            {r.subjetivo && <p><span className="font-medium text-slate-500">S:</span> {r.subjetivo}</p>}
            {r.objetivo && <p><span className="font-medium text-slate-500">O:</span> {r.objetivo}</p>}
            {r.analisis && <p><span className="font-medium text-slate-500">A:</span> {r.analisis}</p>}
            {r.plan && <p><span className="font-medium text-slate-500">P:</span> {r.plan}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Anamnesis -----------------------------------------------------------

function TabAnamnesis({
  pacienteId,
  registros,
  motivos,
  reservaContextoId,
  onCreado,
}: {
  pacienteId: number;
  registros: AnamnesisApi[];
  motivos: CatalogosClinicosApi["motivosConsulta"];
  reservaContextoId: number | null;
  onCreado: () => void;
}) {
  const [abierto, setAbierto] = useState(registros.length === 0);
  const [form, setForm] = useState({
    motivoConsultaId: 0,
    enfermedadActual: "",
    inicioSintomas: "",
    causaAparente: "",
    tratamientosPrevios: "",
    objetivosTerapeuticos: "",
  });
  const [guardando, setGuardando] = useState(false);
  const ultima = registros[0];

  async function guardar() {
    setGuardando(true);
    try {
      await api.crearAnamnesis(pacienteId, {
        reservaId: reservaContextoId,
        motivoConsultaId: form.motivoConsultaId || null,
        enfermedadActual: form.enfermedadActual || null,
        inicioSintomas: form.inicioSintomas || null,
        causaAparente: form.causaAparente || null,
        tratamientosPrevios: form.tratamientosPrevios || null,
        objetivosTerapeuticos: form.objetivosTerapeuticos || null,
      });
      setAbierto(false);
      onCreado();
    } finally {
      setGuardando(false);
    }
  }

  function camposDe(a: AnamnesisApi) {
    return [
      ["Motivo de consulta", a.motivoConsulta],
      ["Enfermedad actual", a.enfermedadActual],
      ["Inicio de síntomas", a.inicioSintomas],
      ["Causa aparente", a.causaAparente],
      ["Tratamientos previos", a.tratamientosPrevios],
      ["Respuesta a tratamientos", a.respuestaTratamientos],
      ["Objetivos terapéuticos", a.objetivosTerapeuticos],
    ].filter(([, valor]) => valor) as [string, string][];
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Columna izquierda: formulario */}
      <div>
        {!abierto ? (
          <button
            onClick={() => setAbierto(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 py-3 text-xs font-semibold text-brand-800 hover:bg-brand-50 transition cursor-pointer"
          >
            <Plus size={14} /> {ultima ? "Registrar corrección" : "Registrar anamnesis inicial"}
          </button>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-sm">
            <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <Stethoscope size={14} className="text-brand-700" />
              {ultima ? "Nueva corrección" : "Anamnesis inicial"}
            </p>
            <div>
              <label className={labelCls}>Motivo de consulta</label>
              <select
                className={inputCls}
                value={form.motivoConsultaId}
                onChange={(e) => setForm({ ...form, motivoConsultaId: Number(e.target.value) })}
              >
                <option value={0}>—</option>
                {motivos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Enfermedad actual</label>
              <textarea className={`${inputCls} min-h-14`} value={form.enfermedadActual} onChange={(e) => setForm({ ...form, enfermedadActual: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Inicio de síntomas</label>
                <input type="date" className={inputCls} value={form.inicioSintomas} onChange={(e) => setForm({ ...form, inicioSintomas: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Causa aparente</label>
                <input className={inputCls} value={form.causaAparente} onChange={(e) => setForm({ ...form, causaAparente: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Tratamientos previos</label>
              <input className={inputCls} value={form.tratamientosPrevios} onChange={(e) => setForm({ ...form, tratamientosPrevios: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Objetivos terapéuticos</label>
              <textarea className={`${inputCls} min-h-14`} value={form.objetivosTerapeuticos} onChange={(e) => setForm({ ...form, objetivosTerapeuticos: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={guardar}
                disabled={guardando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
              >
                <Check size={14} /> Guardar
              </button>
              {ultima && (
                <button
                  onClick={() => setAbierto(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Columna derecha: vigente + historial de correcciones */}
      <div className="space-y-3">
        {registros.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center h-full flex flex-col items-center justify-center">
            <Stethoscope size={24} className="text-slate-300" />
            <p className="mt-2 text-xs font-medium text-slate-600">Todavía no hay anamnesis para este paciente.</p>
            <p className="mt-0.5 text-[11px] text-slate-400 max-w-[220px]">
              Registra el motivo de consulta y los objetivos terapéuticos antes de empezar el tratamiento.
            </p>
          </div>
        ) : (
          registros.map((a, i) => {
            const campos = camposDe(a);
            return (
              <div key={a.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <p className="text-xs font-semibold text-slate-800">{fmtFecha(a.registradoEn)}</p>
                  {i === 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Vigente
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      Reemplazada
                    </span>
                  )}
                </div>
                {a.motivoCorreccion && (
                  <p className="px-4 pt-2 text-[11px] italic text-amber-700">Motivo de la corrección: {a.motivoCorreccion}</p>
                )}
                {campos.length > 0 ? (
                  <dl className="divide-y divide-slate-100">
                    {campos.map(([etiqueta, valor]) => (
                      <div key={etiqueta} className="px-4 py-2.5 text-xs">
                        <dt className="font-semibold uppercase tracking-wide text-[10px] text-slate-400 mb-0.5">
                          {etiqueta}
                        </dt>
                        <dd className="text-slate-700 leading-relaxed">{valor}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="px-4 py-3 text-xs text-slate-400">Se registró sin detalles adicionales.</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// --- Citas + agendar próxima ----------------------------------------------

function TabCitas({
  pacienteId,
  citas,
  onAgendada,
  onSeleccionar,
}: {
  pacienteId: number;
  citas: CitaPacienteApi[];
  onAgendada: () => void;
  onSeleccionar: (reservaId: number) => void;
}) {
  const [agendando, setAgendando] = useState(false);
  const [servicios, setServicios] = useState<ServicioCatalogoApi[]>([]);
  const [sedes, setSedes] = useState<SedeApi[]>([]);
  const [servicioId, setServicioId] = useState(0);
  const [servicioSlug, setServicioSlug] = useState("");
  const [sedeId, setSedeId] = useState(0);
  const [sedeCodigo, setSedeCodigo] = useState("");
  const [fecha, setFecha] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoPagoId, setConfirmandoPagoId] = useState<number | null>(null);

  async function confirmarPago(reservaId: number) {
    setConfirmandoPagoId(reservaId);
    setError(null);
    try {
      await api.confirmarCita(reservaId);
      onAgendada();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo confirmar el pago.");
    } finally {
      setConfirmandoPagoId(null);
    }
  }

  async function abrirAgendar() {
    setAgendando(true);
    if (servicios.length === 0) {
      const [cat, sedesApi] = await Promise.all([api.serviciosAdmin(), api.sedes()]);
      setServicios(cat.catalogo.flatMap((c) => c.servicios).filter((s) => s.reservableIndividualmente));
      setSedes(sedesApi);
    }
  }

  async function buscarDisponibilidad() {
    if (!servicioSlug || !sedeCodigo || !fecha) return;
    setCargandoSlots(true);
    setSlot("");
    try {
      const r = await api.disponibilidad(servicioSlug, sedeCodigo, fecha);
      setSlots(r);
    } finally {
      setCargandoSlots(false);
    }
  }

  async function confirmar() {
    if (!servicioId || !sedeId || !fecha || !slot) {
      setError("Completa servicio, sede, fecha y hora.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.agendarProximaCita(pacienteId, {
        servicioId,
        sedeId,
        iniciaEnIso: `${fecha}T${slot}:00-05:00`,
      });
      setAgendando(false);
      onAgendada();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo agendar la cita.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      {!agendando ? (
        <button
          onClick={abrirAgendar}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900"
        >
          <CalendarPlus size={14} /> Agendar próxima cita
        </button>
      ) : (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4 space-y-2.5 max-w-lg">
          <p className="text-xs font-semibold text-slate-800">Agendar próxima cita</p>
          {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{error}</div>}
          <div>
            <label className={labelCls}>Servicio</label>
            <select
              className={inputCls}
              value={servicioId}
              onChange={(e) => {
                const s = servicios.find((x) => x.id === Number(e.target.value));
                setServicioId(s?.id ?? 0);
                setServicioSlug(s?.slug ?? "");
              }}
            >
              <option value={0}>Selecciona...</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Sede</label>
            <select
              className={inputCls}
              value={sedeId}
              onChange={(e) => {
                const s = sedes.find((x) => x.id === Number(e.target.value));
                setSedeId(s?.id ?? 0);
                setSedeCodigo(s?.codigo.toLowerCase() ?? "");
              }}
            >
              <option value={0}>Selecciona...</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Fecha</label>
            <input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <button
            onClick={buscarDisponibilidad}
            disabled={!servicioSlug || !sedeCodigo || !fecha || cargandoSlots}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
          >
            {cargandoSlots ? "Buscando..." : "Ver horarios disponibles"}
          </button>
          {slots.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((h) => (
                <button
                  key={h}
                  onClick={() => setSlot(h)}
                  className={`rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${
                    slot === h ? "border-brand-800 bg-brand-800 text-white" : "border-slate-200 text-slate-700 hover:bg-white"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={confirmar}
              disabled={guardando || !slot}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
            >
              <Check size={14} /> Confirmar cita
            </button>
            <button
              onClick={() => setAgendando(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{error}</div>}

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Servicio</th>
              <th className="px-3 py-2">Sede</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {citas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  Sin citas registradas.
                </td>
              </tr>
            ) : (
              citas.map((c) => (
                <tr key={c.reservaId}>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtFecha(c.iniciaEn)}</td>
                  <td className="px-3 py-2">{c.servicio ?? "—"}</td>
                  <td className="px-3 py-2">{c.sede}</td>
                  <td className="px-3 py-2 capitalize">{c.estado.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-right">
                    {(c.estado === "confirmada" || c.estado === "en_curso") && (
                      <button
                        onClick={() => onSeleccionar(c.reservaId)}
                        className="inline-flex items-center gap-1 text-brand-800 hover:underline cursor-pointer font-medium"
                      >
                        Documentar esta consulta <ChevronRight size={12} />
                      </button>
                    )}
                    {(c.estado === "pendiente_pago" || c.estado === "propuesta") && (
                      <button
                        onClick={() => confirmarPago(c.reservaId)}
                        disabled={confirmandoPagoId === c.reservaId}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                      >
                        <Check size={13} /> {confirmandoPagoId === c.reservaId ? "Confirmando…" : "Confirmar pago"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
