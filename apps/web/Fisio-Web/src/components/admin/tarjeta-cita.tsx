import React from 'react';
import { User, CheckCircle2, XCircle, Calendar, Activity } from 'lucide-react';

export interface PropiedadesTarjetaCita {
  id: string;
  pacienteId: number | null;
  /** ISO completo, para agrupar/ordenar por día. No se muestra tal cual. */
  iniciaEnIso: string;
  /** ISO completo del fin, para calcular la altura del bloque en la vista calendario. */
  terminaEnIso: string;
  nombrePaciente: string;
  hora: string;
  servicio: string;
  estado: 'pendiente' | 'confirmada' | 'completada' | 'cancelada';
  notas?: string;
  alConfirmar?: (id: string) => void;
  alCancelar?: (id: string) => void;
  alVerHistoriaClinica?: (cita: PropiedadesTarjetaCita) => void;
}

// Borde de color por estado: el diferenciador visual para distinguir de
// un vistazo sin depender solo del badge de texto.
const BORDE_ESTADO: Record<PropiedadesTarjetaCita['estado'], string> = {
  pendiente: 'border-l-amber-400',
  confirmada: 'border-l-emerald-500',
  completada: 'border-l-blue-500',
  cancelada: 'border-l-rose-400',
};

export const TarjetaCita: React.FC<PropiedadesTarjetaCita> = (props) => {
  const {
    id,
    nombrePaciente,
    hora,
    servicio,
    estado,
    notas,
    alConfirmar,
    alCancelar,
    alVerHistoriaClinica,
  } = props;

  return (
    <div
      className={`bg-white p-4 rounded-xl border border-l-4 ${BORDE_ESTADO[estado]} border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3`}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-600 bg-slate-100/80 px-2.5 py-1 rounded-md w-fit border border-slate-200/60">
          <Calendar size={12} className="text-slate-400 shrink-0" />
          <span>{hora}</span>
        </div>

        <h4 className="font-semibold text-slate-900 text-sm leading-tight truncate pt-0.5" title={nombrePaciente}>
          {nombrePaciente}
        </h4>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium truncate">
        <Activity size={13} className="text-brand-800 shrink-0" />
        <span className="truncate">{servicio}</span>
      </div>

      {notas && (
        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px] text-slate-600 italic line-clamp-2">
          "{notas}"
        </div>
      )}

      {(alConfirmar || alCancelar) && estado === 'pendiente' && (
        <div className="flex items-center gap-2 pt-2.5 border-t border-slate-100">
          {alConfirmar && (
            <button
              onClick={() => alConfirmar(id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-sm font-semibold shadow-sm transition cursor-pointer"
            >
              <CheckCircle2 size={16} /> Confirmar pago
            </button>
          )}
          {alCancelar && (
            <button
              onClick={() => alCancelar(id)}
              className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
              title="Cancelar cita"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>
      )}

      {estado === 'cancelada' && (
        <div className="pt-2 border-t border-slate-100">
          <span className="inline-block px-2.5 py-0.5 text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200/80 rounded-md">
            Cita Cancelada
          </span>
        </div>
      )}

      {alVerHistoriaClinica && (
        <div className="pt-2 border-t border-slate-100 flex justify-start">
          <button
            onClick={() => alVerHistoriaClinica(props)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-800 hover:text-brand-900 hover:underline transition cursor-pointer"
          >
            <User size={13} />
            Ver Historia Clínica
          </button>
        </div>
      )}
    </div>
  );
};