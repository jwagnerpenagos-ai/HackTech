import React from 'react';
import { Calendar, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface PropiedadesIndicadores {
  totalCitas: number;
  pendientes: number;
  completadas: number;
  canceladas: number;
}

export const IndicadoresCitas: React.FC<PropiedadesIndicadores> = ({
  totalCitas,
  pendientes,
  completadas,
  canceladas,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <p className="text-xs text-slate-500 font-medium">Citas de la Semana</p>
          <h3 className="text-2xl font-bold text-slate-800 mt-1">{totalCitas}</h3>
        </div>
        <div className="p-3 bg-slate-100 text-slate-600 rounded-lg">
          <Calendar className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <p className="text-xs text-slate-500 font-medium">Por Confirmar</p>
          <h3 className="text-2xl font-bold text-amber-600 mt-1">{pendientes}</h3>
        </div>
        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
          <AlertCircle className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <p className="text-xs text-slate-500 font-medium">Atendidos</p>
          <h3 className="text-2xl font-bold text-blue-600 mt-1">{completadas}</h3>
        </div>
        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
          <CheckCircle className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <p className="text-xs text-slate-500 font-medium">Cancelaciones</p>
          <h3 className="text-2xl font-bold text-rose-600 mt-1">{canceladas}</h3>
        </div>
        <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
          <XCircle className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};