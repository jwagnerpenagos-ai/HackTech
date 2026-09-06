import { ClipboardCheck, Activity, HeartPulse } from 'lucide-react';

export const ProcessSection = () => {
  const steps = [
    {
      icon: <ClipboardCheck className="w-8 h-8 text-emerald-600" />,
      title: "1. Valoración Inicial",
      description: "Evaluamos tu diagnóstico, movilidad y objetivos de recuperación en tu primera consulta.",
    },
    {
      icon: <Activity className="w-8 h-8 text-emerald-600" />,
      title: "2. Plan Personalizado",
      description: "Diseñamos una rutina de terapia y ejercicios adaptados exactamente a tu condición.",
    },
    {
      icon: <HeartPulse className="w-8 h-8 text-emerald-600" />,
      title: "3. Terapia y Seguimiento",
      description: "Ejecutamos las sesiones de rehabilitación monitoreando tu progreso semana a semana.",
    },
  ];

  return (
    <section className="py-16 bg-slate-50 border-y border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-800">Tu Proceso de Recuperación</h2>
          <p className="text-slate-600 mt-2 text-sm sm:text-base">
            Tres sencillos pasos para volver a disfrutar de tu vida cotidiana.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
              <div className="p-3 bg-emerald-50 w-fit rounded-lg mb-4">{step.icon}</div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">{step.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};