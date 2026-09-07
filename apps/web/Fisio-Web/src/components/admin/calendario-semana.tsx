import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { PropiedadesTarjetaCita } from './tarjeta-cita';

export interface DiaCalendario {
  fecha: string; // YYYY-MM-DD
  etiqueta: string; // "Lunes", "Martes"...
  citas: PropiedadesTarjetaCita[];
}

interface PropiedadesCalendarioSemana {
  dias: DiaCalendario[];
  alConfirmar: (id: string) => void;
  alCancelar: (id: string) => void;
  alVerHistoriaClinica: (cita: PropiedadesTarjetaCita) => void;
}

// Ventana visible del calendario: 7:00 a 20:00 (horario general del
// consultorio). Una cita fuera de esta franja simplemente se recorta al
// borde más cercano -- no debería pasar según las reglas de agenda.
const HORA_INICIO_MIN = 7 * 60;
const HORA_FIN_MIN = 20 * 60;
const RANGO_MIN = HORA_FIN_MIN - HORA_INICIO_MIN;
const ALTO_HORA_PX = 56;
const ALTO_TOTAL_PX = ((HORA_FIN_MIN - HORA_INICIO_MIN) / 60) * ALTO_HORA_PX;

const FONDO_ESTADO: Record<PropiedadesTarjetaCita['estado'], string> = {
  pendiente: 'bg-amber-50 border-amber-300 text-amber-900',
  confirmada: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  completada: 'bg-blue-50 border-blue-300 text-blue-900',
  cancelada: 'bg-rose-50 border-rose-200 text-rose-700 opacity-70',
};

function minutosBogota(iso: string): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(partes.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

const HORAS = Array.from({ length: RANGO_MIN / 60 + 1 }, (_, i) => HORA_INICIO_MIN / 60 + i);

interface CitaConCarril {
  cita: PropiedadesTarjetaCita;
  carril: number;
  totalCarriles: number;
}

// Si dos citas del mismo día se solapan en el tiempo (no debería pasar con
// un solo profesional activo, pero los datos de prueba a veces lo hacen),
// se reparten en carriles lado a lado en vez de dibujarse una sobre otra.
function asignarCarriles(citas: PropiedadesTarjetaCita[]): CitaConCarril[] {
  const ordenadas = [...citas].sort((a, b) => a.iniciaEnIso.localeCompare(b.iniciaEnIso));
  const finPorCarril: number[] = [];
  const carrilPorCita: number[] = [];

  for (const c of ordenadas) {
    const inicio = minutosBogota(c.iniciaEnIso);
    const fin = Math.max(minutosBogota(c.terminaEnIso), inicio + 20);
    let carril = finPorCarril.findIndex((finOcupado) => finOcupado <= inicio);
    if (carril === -1) {
      carril = finPorCarril.length;
      finPorCarril.push(fin);
    } else {
      finPorCarril[carril] = fin;
    }
    carrilPorCita.push(carril);
  }

  const totalCarriles = Math.max(1, finPorCarril.length);
  return ordenadas.map((cita, i) => ({ cita, carril: carrilPorCita[i]!, totalCarriles }));
}

export const CalendarioSemana: React.FC<PropiedadesCalendarioSemana> = ({
  dias,
  alConfirmar,
  alCancelar,
  alVerHistoriaClinica,
}) => {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-w-[900px]">
        {/* Columna de horas */}
        <div className="w-14 shrink-0 border-r border-slate-100 pt-9">
          {HORAS.map((h) => (
            <div
              key={h}
              style={{ height: ALTO_HORA_PX }}
              className="pr-2 text-right text-[10px] text-slate-400 -translate-y-2"
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Columnas de días */}
        {dias.map((dia) => (
          <div key={dia.fecha} className="flex-1 min-w-[110px] border-r border-slate-100 last:border-r-0">
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-2 py-1.5 text-center">
              <p className="text-xs font-semibold text-slate-800">{dia.etiqueta.slice(0, 3)}</p>
              <p className="text-[10px] text-slate-400">
                {new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(
                  new Date(`${dia.fecha}T00:00:00Z`),
                )}
              </p>
            </div>
            <div
              className="relative"
              style={{
                height: ALTO_TOTAL_PX,
                backgroundImage: `repeating-linear-gradient(to bottom, #f1f5f9 0, #f1f5f9 1px, transparent 1px, transparent ${ALTO_HORA_PX}px)`,
              }}
            >
              {asignarCarriles(dia.citas).map(({ cita, carril, totalCarriles }) => {
                const inicioMin = minutosBogota(cita.iniciaEnIso);
                const finMin = Math.max(minutosBogota(cita.terminaEnIso), inicioMin + 20);
                const topPct = (Math.max(inicioMin, HORA_INICIO_MIN) - HORA_INICIO_MIN) / RANGO_MIN;
                const altoPct = (Math.min(finMin, HORA_FIN_MIN) - Math.max(inicioMin, HORA_INICIO_MIN)) / RANGO_MIN;
                const anchoPct = 100 / totalCarriles;
                return (
                  <button
                    key={cita.id}
                    type="button"
                    onClick={() => alVerHistoriaClinica(cita)}
                    style={{
                      top: `${Math.max(0, topPct) * 100}%`,
                      height: `${Math.max(altoPct, 0.02) * 100}%`,
                      left: `${carril * anchoPct}%`,
                      width: `calc(${anchoPct}% - 2px)`,
                    }}
                    className={`absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight shadow-xs transition hover:shadow-md hover:z-20 cursor-pointer ${FONDO_ESTADO[cita.estado]}`}
                  >
                    <p className="font-semibold truncate">{cita.hora.split(' · ')[0]}</p>
                    <p className="truncate">{cita.nombrePaciente}</p>
                    <p className="truncate opacity-80">{cita.servicio}</p>
                    {cita.estado === 'pendiente' && (
                      <div className="mt-0.5 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => alConfirmar(cita.id)}
                          title="Confirmar pago"
                          className="rounded bg-white/70 p-0.5 text-emerald-700 hover:bg-white"
                        >
                          <CheckCircle2 size={11} />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => alCancelar(cita.id)}
                          title="Cancelar"
                          className="rounded bg-white/70 p-0.5 text-rose-700 hover:bg-white"
                        >
                          <XCircle size={11} />
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
