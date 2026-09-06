import { Calendar, ArrowRight, CheckCircle2 } from 'lucide-react';

export const Hero = () => {
  return (
    <section className="relative bg-slate-900 text-white overflow-hidden py-16 md:py-24">
      <div className="container mx-mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Columna Izquierda: Propuesta de Valor + CTA */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" /> Fisioterapia Especializada
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-50 leading-tight">
              Recupera tu movilidad y vive <span className="text-emerald-400">sin dolor</span>
            </h1>
            
            <p className="text-slate-300 text-base sm:text-lg">
              Tratamientos personalizados de rehabilitación deportiva, terapia musculoesquelética y recuperación post-operatoria.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <a
                href="#agendar"
                className="inline-flex justify-center items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium px-6 py-3 rounded-lg shadow-lg hover:shadow-emerald-500/20 transition-all"
              >
                <Calendar className="w-5 h-5" />
                Agendar Valoración
              </a>
              <a
                href="#servicios"
                className="inline-flex justify-center items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-6 py-3 rounded-lg transition-all"
              >
                Ver Servicios
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Columna Derecha: Tarjeta Flotante + Imagen */}
          <div className="relative flex justify-center">
            <div className="relative w-full max-w-md bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-2xl overflow-hidden">
              <img
                src="/images/hero-physio.jpg" 
                alt="Sesión de Fisioterapia"
                className="w-full h-72 object-cover rounded-xl"
              />
              {/* Badge flotante de Disponibilidad */}
              <div className="absolute bottom-6 left-6 right-6 bg-slate-900/95 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-lg flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Disponibilidad Hoy</p>
                  <p className="text-sm font-semibold text-emerald-400">2 turnos disponibles</p>
                </div>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};