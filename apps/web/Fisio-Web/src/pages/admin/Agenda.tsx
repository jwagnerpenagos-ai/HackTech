import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminShell } from '../../components/admin/admin-shell';
import { IndicadoresCitas } from '../../components/admin/indicadores-cita';
import { TarjetaCita } from '../../components/admin/tarjeta-cita';
import type { PropiedadesTarjetaCita } from '../../components/admin/tarjeta-cita';
import { CalendarioSemana } from '../../components/admin/calendario-semana';
import { HistoriaClinicaModal } from '../../components/admin/historia-clinica-modal';
import { reservasEjemplo } from '@/lib/data';
import { api, leerToken, ApiError, type CitaAdminApi, type PacienteAdminApi } from '@/lib/api';

const normalizarTexto = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,\-]/g, "");

// Estado de core-api -> estado que dibuja la tarjeta.
function estadoTarjeta(e: string): PropiedadesTarjetaCita['estado'] {
  if (e === 'confirmada' || e === 'en_curso') return 'confirmada';
  if (e === 'atendida' || e === 'no_asistio') return 'completada';
  if (e.startsWith('cancelada') || e === 'expirada' || e === 'rechazada') return 'cancelada';
  return 'pendiente';
}

function aTarjeta(c: CitaAdminApi): PropiedadesTarjetaCita {
  const inicio = new Date(c.iniciaEn);
  const hora = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(inicio);
  return {
    id: String(c.reservaId),
    pacienteId: c.pacienteId,
    iniciaEnIso: c.iniciaEn,
    terminaEnIso: c.terminaEn,
    nombrePaciente: c.paciente ?? 'Sin paciente',
    hora: `${hora} \u00b7 ${c.sede}`,
    servicio: c.servicio ?? 'Cita',
    estado: estadoTarjeta(c.estado),
    notas: '',
  };
}

// --- Navegaci\u00f3n por semana (Lun-Dom, ancla en Am\u00e9rica/Bogot\u00e1) --------------

function bogotaHoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}
function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function inicioSemana(fechaIso: string): string {
  const dow = new Date(`${fechaIso}T00:00:00Z`).getUTCDay();
  return sumarDias(fechaIso, dow === 0 ? -6 : 1 - dow);
}
function fechaBogotaDeIso(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(iso));
}
const DIAS_SEMANA = ['Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado', 'Domingo'];

function formatoRangoSemana(inicio: string, fin: string): string {
  const dIni = new Date(`${inicio}T00:00:00Z`);
  const dFin = new Date(`${fin}T00:00:00Z`);
  const mesFmt = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', month: 'long' });
  const mesIni = mesFmt.format(dIni);
  const mesFin = mesFmt.format(dFin);
  const diaIni = dIni.getUTCDate();
  const diaFin = dFin.getUTCDate();
  const anio = dFin.getUTCFullYear();
  return mesIni === mesFin
    ? `${diaIni} \u2013 ${diaFin} de ${mesFin} de ${anio}`
    : `${diaIni} de ${mesIni} \u2013 ${diaFin} de ${mesFin} de ${anio}`;
}

export const Agenda: React.FC = () => {
  const [modoVista, setModoVista] = useState<'calendario' | 'tablero' | 'lista'>('calendario');
  const [q, setQ] = useState('');
  const [listaCitas, setListaCitas] = useState<PropiedadesTarjetaCita[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [semanaInicio, setSemanaInicio] = useState(() => inicioSemana(bogotaHoy()));

  const [pacienteModal, setPacienteModal] = useState<PacienteAdminApi | null>(null);
  const [reservaContextoModal, setReservaContextoModal] = useState<number | null>(null);
  const navigate = useNavigate();

  // Carga por semana desde core-api. Sin sesión -> al login. Si la API falla
  // por otra razón, se muestran datos de ejemplo para no dejar el panel vacío.
  useEffect(() => {
    if (!leerToken()) {
      navigate('/admin/login');
      return;
    }
    let vivo = true;
    (async () => {
      try {
        setCargando(true);
        const citas = await api.citas(semanaInicio, sumarDias(semanaInicio, 7));
        if (vivo) setListaCitas(citas.map(aTarjeta));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          navigate('/admin/login');
          return;
        }
        if (vivo) {
          setListaCitas(
            reservasEjemplo.map((r) => ({
              id: r.id,
              pacienteId: null,
              iniciaEnIso: `${r.fecha}T${r.hora}:00-05:00`,
              terminaEnIso: `${r.fecha}T${r.hora}:00-05:00`,
              nombrePaciente: r.cliente,
              hora: r.hora,
              servicio: r.servicio,
              estado: r.estado as PropiedadesTarjetaCita['estado'],
              notas: '',
            })),
          );
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [navigate, semanaInicio]);

  const citasFiltradas = useMemo(() => {
    const term = normalizarTexto(q.trim());

    return listaCitas
      .filter((cita) => {
        if (!term) return true;
        const pacienteNorm = normalizarTexto(cita.nombrePaciente);
        const servicioNorm = normalizarTexto(cita.servicio);
        return pacienteNorm.includes(term) || servicioNorm.includes(term);
      })
      .sort((a, b) => a.iniciaEnIso.localeCompare(b.iniciaEnIso));
  }, [q, listaCitas]);

  // Las canceladas no ocupan agenda real: por defecto se sacan de la vista
  // principal (calendario/por día/lista) para que no estorben, y se pueden
  // revisar aparte en el desplegable de abajo.
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const citasVisibles = useMemo(
    () => citasFiltradas.filter((c) => c.estado !== 'cancelada'),
    [citasFiltradas],
  );

  // Agrupadas por día de la semana seleccionada, para que ninguna columna
  // crezca sin límite aunque haya cientos de citas confirmadas en total.
  const diasSemana = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = sumarDias(semanaInicio, i);
      return {
        fecha,
        etiqueta: DIAS_SEMANA[i]!,
        citas: citasVisibles.filter((c) => fechaBogotaDeIso(c.iniciaEnIso) === fecha),
      };
    });
  }, [citasVisibles, semanaInicio]);

  const manejarConfirmacion = async (idCita: string) => {
    try {
      await api.confirmarCita(Number(idCita));
      setListaCitas(previas =>
        previas.map(cita => (cita.id === idCita ? { ...cita, estado: 'confirmada' } : cita)),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate('/admin/login');
    }
  };

  const manejarCancelacion = async (idCita: string) => {
    try {
      await api.cancelarCita(Number(idCita));
      setListaCitas(previas =>
        previas.map(cita => (cita.id === idCita ? { ...cita, estado: 'cancelada' } : cita)),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate('/admin/login');
    }
  };

  const abrirHistoriaClinica = async (cita: PropiedadesTarjetaCita) => {
    if (!cita.pacienteId) return;
    try {
      const pacientes = await api.pacientesAdmin();
      const encontrado = pacientes.find((p) => p.id === cita.pacienteId);
      if (!encontrado) return;
      setPacienteModal(encontrado);
      setReservaContextoModal(Number(cita.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate('/admin/login');
    }
  };

  const citasPendientes = citasFiltradas.filter(cita => cita.estado === 'pendiente');
  const citasCompletadas = citasFiltradas.filter(cita => cita.estado === 'completada');
  const citasCanceladas = citasFiltradas.filter(cita => cita.estado === 'cancelada');

  return (
    <AdminShell>
      <div className="p-6 bg-slate-50 min-h-screen">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Agenda de Citas</h1>
            <p className="text-sm text-slate-500">Gestión e indicadores de sesiones diarias de fisioterapia.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar paciente o servicio..."
                className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-brand-800 focus:outline-none shadow-sm"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-1 flex gap-1 shadow-sm">
              <button
                onClick={() => setModoVista('calendario')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
                  modoVista === 'calendario' ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Calendario
              </button>
              <button
                onClick={() => setModoVista('tablero')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
                  modoVista === 'tablero' ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Por día
              </button>
              <button
                onClick={() => setModoVista('lista')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
                  modoVista === 'lista' ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Lista
              </button>
            </div>
          </div>
        </div>

        <IndicadoresCitas
          totalCitas={citasFiltradas.length}
          pendientes={citasPendientes.length}
          completadas={citasCompletadas.length}
          canceladas={citasCanceladas.length}
        />

        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <button
            onClick={() => setSemanaInicio((s) => sumarDias(s, -7))}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
            title="Semana anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-800 capitalize">
              {formatoRangoSemana(semanaInicio, sumarDias(semanaInicio, 6))}
            </span>
            {semanaInicio !== inicioSemana(bogotaHoy()) && (
              <button
                onClick={() => setSemanaInicio(inicioSemana(bogotaHoy()))}
                className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 hover:bg-brand-100 transition cursor-pointer"
              >
                Hoy
              </button>
            )}
          </div>
          <button
            onClick={() => setSemanaInicio((s) => sumarDias(s, 7))}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
            title="Semana siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {citasCanceladas.length > 0 && (
          <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/40">
            <button
              onClick={() => setMostrarCanceladas((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2 text-left cursor-pointer"
            >
              <span className="text-xs font-medium text-rose-700">
                {citasCanceladas.length} {citasCanceladas.length === 1 ? 'cita cancelada' : 'citas canceladas'} esta
                semana
              </span>
              <span className="text-xs text-rose-500 underline">
                {mostrarCanceladas ? 'Ocultar' : 'Ver'}
              </span>
            </button>
            {mostrarCanceladas && (
              <table className="w-full border-t border-rose-100 text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-rose-400">
                    <th className="px-4 pt-2.5 pb-1.5 font-semibold">Paciente</th>
                    <th className="px-4 pt-2.5 pb-1.5 font-semibold whitespace-nowrap">Fecha / hora</th>
                    <th className="px-4 pt-2.5 pb-1.5 font-semibold">Servicio</th>
                    <th className="px-4 pt-2.5 pb-1.5 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {citasCanceladas.map((cita) => (
                    <tr key={cita.id}>
                      <td className="px-4 py-2 font-medium text-slate-700">{cita.nombrePaciente}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                        {new Intl.DateTimeFormat('es-CO', {
                          timeZone: 'America/Bogota',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        }).format(new Date(cita.iniciaEnIso))}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{cita.servicio}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => abrirHistoriaClinica(cita)}
                          className="font-medium text-brand-800 hover:underline cursor-pointer"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {cargando ? (
          <div className="flex justify-center items-center py-20 text-slate-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
            <span className="text-sm font-medium">Cargando citas...</span>
          </div>
        ) : modoVista === 'calendario' ? (
          <CalendarioSemana
            dias={diasSemana}
            alConfirmar={manejarConfirmacion}
            alCancelar={manejarCancelacion}
            alVerHistoriaClinica={abrirHistoriaClinica}
          />
        ) : modoVista === 'tablero' ? (
          <div className="mt-6 space-y-5">
            {diasSemana.map((dia) => (
              <div key={dia.fecha} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-baseline justify-between border-b border-slate-100 pb-2.5 mb-3">
                  <h3 className="font-semibold text-slate-800 text-sm">
                    {dia.etiqueta}{' '}
                    <span className="font-normal text-slate-400">
                      ·{' '}
                      {new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(
                        new Date(`${dia.fecha}T00:00:00Z`),
                      )}
                    </span>
                  </h3>
                  <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-semibold border border-slate-200">
                    {dia.citas.length} {dia.citas.length === 1 ? 'cita' : 'citas'}
                  </span>
                </div>
                {dia.citas.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">Sin citas este día.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {dia.citas.map((cita) => (
                      <TarjetaCita
                        key={cita.id}
                        {...cita}
                        alConfirmar={cita.estado === 'pendiente' ? manejarConfirmacion : undefined}
                        alCancelar={cita.estado === 'pendiente' ? manejarCancelacion : undefined}
                        alVerHistoriaClinica={abrirHistoriaClinica}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm mt-6">
            {citasVisibles.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No hay registros de citas disponibles.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                    <th className="p-4">Paciente</th>
                    <th className="p-4">Fecha / Hora</th>
                    <th className="p-4">Servicio</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {citasVisibles.map(cita => (
                    <tr key={cita.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-800">{cita.nombrePaciente}</td>
                      <td className="p-4 text-slate-600 font-mono text-xs">
                        {new Intl.DateTimeFormat('es-CO', {
                          timeZone: 'America/Bogota',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        }).format(new Date(cita.iniciaEnIso))}
                      </td>
                      <td className="p-4 text-slate-600">{cita.servicio}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                          cita.estado === 'pendiente' ? 'bg-amber-100 text-amber-700' :
                          cita.estado === 'confirmada' ? 'bg-emerald-100 text-emerald-700' :
                          cita.estado === 'completada' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {cita.estado}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => abrirHistoriaClinica(cita)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                        >
                          <User size={14} /> Ver Historia Clínica
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {pacienteModal && (
        <HistoriaClinicaModal
          paciente={pacienteModal}
          reservaContextoId={reservaContextoModal}
          onClose={() => {
            setPacienteModal(null);
            setReservaContextoModal(null);
          }}
          onPacienteActualizado={setPacienteModal}
        />
      )}
    </AdminShell>
  );
};

export default Agenda;