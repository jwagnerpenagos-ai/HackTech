import React, { useState, useEffect, useMemo } from 'react';
import { 
  Loader2, Search, X, Calendar, Activity, User, CheckCircle, Save, 
  FileText, AlertCircle, Stethoscope 
} from 'lucide-react';
import { AdminShell } from '../../components/admin/admin-shell';
import { IndicadoresCitas } from '../../components/admin/indicadores-cita';
import { TarjetaCita } from '../../components/admin/tarjeta-cita';
import type { PropiedadesTarjetaCita } from '../../components/admin/tarjeta-cita';
import { reservasEjemplo, pacientesEjemplo, type PacienteEjemplo } from '@/lib/data';

const normalizarTexto = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,\-]/g, "");

export const Agenda: React.FC = () => {
  const [modoVista, setModoVista] = useState<'tablero' | 'lista'>('tablero');
  const [q, setQ] = useState('');
  const [listaCitas, setListaCitas] = useState<PropiedadesTarjetaCita[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  
  const [historiaSeleccionada, setHistoriaSeleccionada] = useState<{
    cita: PropiedadesTarjetaCita;
    paciente?: PacienteEjemplo;
  } | null>(null);

  const [comentarioTemp, setComentarioTemp] = useState('');

  // Carga inicial conectada a API con fallback
  useEffect(() => {
    const obtenerCitas = async () => {
      try {
        setCargando(true);
        const res = await fetch('/api/citas');
        if (!res.ok) throw new Error('API no disponible, usando datos de reserva');
        const data = await res.json();
        setListaCitas(data);
      } catch {
        const citasIniciales: PropiedadesTarjetaCita[] = reservasEjemplo.map((r) => ({
          id: r.id,
          nombrePaciente: r.cliente,
          hora: `${r.fecha} - ${r.hora}`,
          servicio: r.servicio,
          estado: r.estado as PropiedadesTarjetaCita['estado'],
          notas: '',
        }));
        setListaCitas(citasIniciales); 
      } finally {
        setCargando(false);
      }
    };

    obtenerCitas();
  }, []);

  const citasFiltradas = useMemo(() => {
    const term = normalizarTexto(q.trim());

    return listaCitas
      .filter((cita) => {
        if (!term) return true;
        const pacienteNorm = normalizarTexto(cita.nombrePaciente);
        const servicioNorm = normalizarTexto(cita.servicio);
        return pacienteNorm.includes(term) || servicioNorm.includes(term);
      })
      .sort((a, b) => b.hora.localeCompare(a.hora));
  }, [q, listaCitas]);

  const manejarConfirmacion = async (idCita: string) => {
    try {
      await fetch(`/api/citas/${idCita}/confirmar`, { method: 'PATCH' });
    } catch {
      console.warn('Sincronización backend pendiente, ejecutando localmente');
    }
    setListaCitas(previas =>
      previas.map(cita => (cita.id === idCita ? { ...cita, estado: 'confirmada' } : cita))
    );
  };

  const manejarCancelacion = async (idCita: string) => {
    try {
      await fetch(`/api/citas/${idCita}/cancelar`, { method: 'PATCH' });
    } catch {
      console.warn('Sincronización backend pendiente, ejecutando localmente');
    }
    setListaCitas(previas =>
      previas.map(cita => (cita.id === idCita ? { ...cita, estado: 'cancelada' } : cita))
    );
  };

  const abrirHistoriaClinica = (cita: PropiedadesTarjetaCita) => {
    const pacienteEncontrado = pacientesEjemplo.find(
      (p) => normalizarTexto(p.nombre) === normalizarTexto(cita.nombrePaciente)
    );
    setHistoriaSeleccionada({
      cita,
      paciente: pacienteEncontrado,
    });
    setComentarioTemp(cita.notas || '');
  };

  const guardarNotasYCompletar = async (completar = false) => {
    if (!historiaSeleccionada) return;

    const idCita = historiaSeleccionada.cita.id;
    const nuevoEstado = completar ? 'completada' : historiaSeleccionada.cita.estado;

    try {
      await fetch(`/api/citas/${idCita}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas: comentarioTemp, estado: nuevoEstado }),
      });
    } catch {
      console.warn('Guardado persistido en estado local.');
    }

    setListaCitas((previas) =>
      previas.map((c) =>
        c.id === idCita
          ? { ...c, notas: comentarioTemp, estado: nuevoEstado }
          : c
      )
    );

    if (completar) {
      setHistoriaSeleccionada(null);
    }
  };

  const citasPendientes = citasFiltradas.filter(cita => cita.estado === 'pendiente');
  const citasConfirmadas = citasFiltradas.filter(cita => cita.estado === 'confirmada');
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
                onClick={() => setModoVista('tablero')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
                  modoVista === 'tablero' ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Tablero
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

        {cargando ? (
          <div className="flex justify-center items-center py-20 text-slate-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
            <span className="text-sm font-medium">Cargando citas...</span>
          </div>
        ) : modoVista === 'tablero' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
            <div className="bg-slate-100/80 p-4 rounded-xl border-t-4 border-amber-400 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-slate-700 text-sm">Por Confirmar</h3>
                <span className="bg-white text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold border">{citasPendientes.length}</span>
              </div>
              {citasPendientes.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Sin citas pendientes</p>
              ) : (
                citasPendientes.map(cita => (
                  <TarjetaCita 
                    key={cita.id} 
                    {...cita} 
                    alConfirmar={manejarConfirmacion} 
                    alCancelar={manejarCancelacion}
                    alVerHistoriaClinica={abrirHistoriaClinica}
                  />
                ))
              )}
            </div>

            <div className="bg-slate-100/80 p-4 rounded-xl border-t-4 border-emerald-500 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-slate-700 text-sm">Confirmadas</h3>
                <span className="bg-white text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold border">{citasConfirmadas.length}</span>
              </div>
              {citasConfirmadas.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Sin citas confirmadas</p>
              ) : (
                citasConfirmadas.map(cita => (
                  <TarjetaCita 
                    key={cita.id} 
                    {...cita} 
                    alVerHistoriaClinica={abrirHistoriaClinica}
                  />
                ))
              )}
            </div>

            <div className="bg-slate-100/80 p-4 rounded-xl border-t-4 border-blue-500 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-slate-700 text-sm">Completadas</h3>
                <span className="bg-white text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold border">{citasCompletadas.length}</span>
              </div>
              {citasCompletadas.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Sin citas completadas</p>
              ) : (
                citasCompletadas.map(cita => (
                  <TarjetaCita 
                    key={cita.id} 
                    {...cita} 
                    alVerHistoriaClinica={abrirHistoriaClinica}
                  />
                ))
              )}
            </div>

            <div className="bg-slate-100/80 p-4 rounded-xl border-t-4 border-rose-500 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-slate-700 text-sm">Canceladas</h3>
                <span className="bg-white text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold border">{citasCanceladas.length}</span>
              </div>
              {citasCanceladas.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Sin citas canceladas</p>
              ) : (
                citasCanceladas.map(cita => (
                  <TarjetaCita 
                    key={cita.id} 
                    {...cita} 
                    alVerHistoriaClinica={abrirHistoriaClinica}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm mt-6">
            {citasFiltradas.length === 0 ? (
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
                  {citasFiltradas.map(cita => (
                    <tr key={cita.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-800">{cita.nombrePaciente}</td>
                      <td className="p-4 text-slate-600 font-mono text-xs">{cita.hora}</td>
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

      {historiaSeleccionada && (
        <div 
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs"
          onClick={() => setHistoriaSeleccionada(null)}
        >
          <div 
            className="h-full w-full max-w-lg bg-white p-6 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-800 text-white font-bold text-xs shadow-xs">
                    {historiaSeleccionada.cita.nombrePaciente.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {historiaSeleccionada.cita.nombrePaciente}
                    </h2>
                    <p className="text-xs text-slate-500 font-mono">
                      CC/Doc: {historiaSeleccionada.paciente?.documento ?? "No registrado"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setHistoriaSeleccionada(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-2">
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Stethoscope size={14} className="text-brand-800" />
                      Consulta de Fisioterapia
                    </span>
                    <span className="capitalize px-2 py-0.5 rounded-md font-medium text-[11px] bg-white border border-slate-200 text-slate-700">
                      {historiaSeleccionada.cita.estado}
                    </span>
                  </div>
                  <p className="flex items-center gap-2 text-slate-700 pt-1">
                    <Activity size={14} className="text-brand-800 shrink-0" />
                    <span className="font-medium">Tratamiento:</span> {historiaSeleccionada.cita.servicio}
                  </p>
                  <p className="flex items-center gap-2 text-slate-600">
                    <Calendar size={14} className="text-slate-400 shrink-0" />
                    <span>Fecha y hora: {historiaSeleccionada.cita.hora}</span>
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 p-3.5 space-y-2 text-xs">
                  <h4 className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <User size={14} className="text-slate-500" /> Datos de Identificación
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Teléfono:</span>
                      <span className="font-medium text-slate-800">{historiaSeleccionada.paciente?.telefono ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">EPS:</span>
                      <span className="font-medium text-slate-800">{historiaSeleccionada.paciente?.eps ?? "Particular"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Ciudad:</span>
                      <span className="font-medium text-slate-800">{historiaSeleccionada.paciente?.ciudad ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Ocupación:</span>
                      <span className="font-medium text-slate-800">{historiaSeleccionada.paciente?.ocupacion ?? "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-amber-50/60 border border-amber-200/80 p-3.5 text-xs space-y-2">
                  <h4 className="font-semibold text-amber-900 flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-700" /> Antecedentes & Alertas
                  </h4>
                  <div className="text-amber-900/90 space-y-1 font-normal">
                    <p><span className="font-medium">Contacto de Emergencia:</span> {historiaSeleccionada.paciente?.contactoEmergencia ?? "No especificado"}</p>
                    <p><span className="font-medium">Alergias / Contraindicaciones:</span> Ninguna reportada</p>
                    <p><span className="font-medium">Última Atención Registrada:</span> {historiaSeleccionada.paciente?.ultimaSesion ?? "Sesión inicial"}</p>
                  </div>
                </div>

                {historiaSeleccionada.cita.estado === 'confirmada' ? (
                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity size={14} className="text-brand-800" />
                      Evolución Clínica / Notas de Atención
                    </label>
                    <textarea
                      value={comentarioTemp}
                      onChange={(e) => setComentarioTemp(e.target.value)}
                      placeholder="Escribe la valoración del día, nivel de dolor (EVA), técnicas aplicadas o recomendaciones..."
                      rows={4}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-800/10 transition"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => guardarNotasYCompletar(false)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                      >
                        <Save size={13} /> Guardar borrador
                      </button>
                    </div>
                  </div>
                ) : (
                  historiaSeleccionada.cita.notas && (
                    <div className="space-y-1.5 pt-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                        <FileText size={13} className="text-slate-400" /> Observaciones de la Sesión
                      </label>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-700 font-normal italic">
                        "{historiaSeleccionada.cita.notas}"
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              {historiaSeleccionada.cita.estado === 'confirmada' ? (
                <button
                  onClick={() => guardarNotasYCompletar(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-800 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  <CheckCircle size={15} />
                  Guardar y Marcar Cita como Completada
                </button>
              ) : (
                <div className="p-2.5 bg-slate-100/80 text-slate-600 rounded-xl text-center text-xs font-normal border border-slate-200/60">
                  Modo lectura — Cita en estado <span className="font-semibold capitalize">{historiaSeleccionada.cita.estado}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
};

export default Agenda;