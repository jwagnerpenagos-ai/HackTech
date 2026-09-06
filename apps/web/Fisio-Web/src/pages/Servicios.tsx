import {
  Gift,
  Users,
  CreditCard,
  CalendarClock,
  RefreshCw,
  Shirt,
  Sparkles,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Reveal } from "@/components/site/reveal";
import { Showcase } from "@/components/site/showcase";
import { SectionHeading } from "@/components/site/section-heading";
import { Container } from "@/components/ui/container";
import { ServiceCatalogCard } from "@/components/site/service-catalog-card";
import {
  catalogo,
  promociones,
  politicas,
  indicacionesPreviasPorCategoria,
} from "@/lib/data";

const vitrina = [
  {
    key: "valoracion-rehabilitacion",
    eyebrow: "Valoración y rehabilitación",
    title: "Evaluación y terapia física a tu ritmo",
    description:
      "Empezamos con una valoración completa para entender tu punto de partida, y desde ahí construimos un plan de rehabilitación con seguimiento sesión a sesión.",
    chipLabel: "Valoración inicial",
    chipValue: 100000,
    imageSrc: "/images/servicio-valoracion.jpg",
    imageAlt: "Lina Murillo aplicando terapia manual en consultorio",
  },
  {
    key: "prescripcion-ejercicio",
    eyebrow: "Prescripción de ejercicio",
    title: "Planes de ejercicio individuales o grupales",
    description:
      "Programas ajustados a tus objetivos y tu proceso, con opción individual o en grupo -- ideal para mantenimiento y prevención, no solo para lesión.",
    chipLabel: "Plan personalizado",
    chipValue: 60000,
    imageSrc: "/images/servicio-ejercicio.jpg",
    imageAlt: "Sesión de ejercicio guiado con kettlebell",
  },
  {
    key: "modulacion-postejercicio",
    eyebrow: "Modulación postejercicio",
    title: "Descargas musculares por zona",
    description:
      "Presoterapia, terapia manual e instrumental, ventosas y pistola percutora -- por zona o cuerpo completo, pensado para tu recuperación después del esfuerzo físico.",
    chipLabel: "Descarga cuerpo completo",
    chipValue: 150000,
    imageSrc: "/images/servicio-descargas.jpg",
    imageAlt: "Terapia de ventosas para descarga muscular",
    imagePosition: "center bottom",
  },
  {
    key: "procedimientos-especializados",
    eyebrow: "Procedimientos especializados",
    title: "Punción seca, terapia neural, PRP y sueroterapia",
    description:
      "Procedimientos especializados para casos que requieren un abordaje más específico, siempre explicando el porqué de cada técnica antes de aplicarla.",
    chipLabel: "Punción seca",
    chipValue: 120000,
    imageSrc: "/images/servicio-procedimientos.jpg",
    imageAlt: "Técnica especializada de movilización neural",
  },
];

export default function ServiciosPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Encabezado Principal Rediseñado */}
        <section className="grain relative overflow-hidden bg-white pb-12 pt-8 sm:pb-16 sm:pt-12">
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
          <Container className="relative">
            <Reveal>
              <div className="grid items-center gap-8 lg:grid-cols-12">
                {/* Texto a la izquierda */}
                <div className="lg:col-span-7">
                  <span className="eyebrow inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1 text-xs font-semibold text-deep-600">
                    <span className="h-2 w-2 rounded-full gradient-bg" />
                    Catálogo de Fisioterapia
                  </span>
                  
                  <h1 className="gradient-text mt-4 font-display text-4xl font-extrabold leading-[1.1] sm:text-5xl lg:text-6xl">
                    Servicios
                  </h1>
                  
                  <p className="mt-4 max-w-xl text-base sm:text-lg leading-relaxed text-ink-600">
                    Catálogo completo de sesiones individuales, paquetes y planes grupales.
                    Los precios de paquete incluyen el valor por sesión.
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-semibold text-ink-600">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-100 bg-white px-3 py-1.5 shadow-xs">
                      <CheckCircle2 size={15} className="text-deep-600" /> Atención personalizada
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-100 bg-white px-3 py-1.5 shadow-xs">
                      <Clock size={15} className="text-deep-600" /> Citas a tu ritmo
                    </span>
                  </div>
                </div>

                {/* Tarjetas rápidas informativas a la derecha para llenar el espacio libre */}
                <div className="grid gap-3.5 sm:grid-cols-2 lg:col-span-5">
                  <div className="card sheen p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-deep-600">
                      <Sparkles size={18} />
                    </div>
                    <p className="mt-3 font-display text-sm font-bold text-ink-900">
                      Planes Flexibles
                    </p>
                    <p className="mt-1 text-xs text-ink-600">
                      Ajustados a tu ritmo y presupuesto con descuentos en paquetes.
                    </p>
                  </div>

                  <div className="card sheen p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-deep-600">
                      <ShieldCheck size={18} />
                    </div>
                    <p className="mt-3 font-display text-sm font-bold text-ink-900">
                      Acompañamiento
                    </p>
                    <p className="mt-1 text-xs text-ink-600">
                      Evaluación continua y ajuste de tratamiento en cada sesión.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>

        {/* Vitrina alternada por categoría */}
        <section className="bg-white">
          <Container className="section space-y-20 sm:space-y-28">
            {vitrina.map((v, i) => (
              <Showcase
                key={v.key}
                index={i + 1}
                eyebrow={v.eyebrow}
                title={v.title}
                description={v.description}
                chipLabel={v.chipLabel}
                chipValue={v.chipValue}
                imageSrc={v.imageSrc}
                imageAlt={v.imageAlt}
                imagePosition={v.imagePosition}
                imageSide={i % 2 === 0 ? "right" : "left"}
              />
            ))}
          </Container>
        </section>

        {/* Listado de Servicios por Categoría */}
        {catalogo.map((cat, i) => (
          <section
            key={cat.id}
            className={i % 2 === 0 ? "bg-mist" : "bg-sky-100"}
          >
            <Container className="section-sm">
              <Reveal>
                <SectionHeading
                  eyebrow={`Categoría ${String(i + 1).padStart(2, "0")}`}
                  title={cat.nombre}
                  description={cat.descripcion}
                  titleClassName="text-2xl sm:text-[1.75rem]"
                />
              </Reveal>
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {cat.servicios.map((s, j) => (
                  <Reveal key={s.slug} delayMs={j * 80}>
                    <ServiceCatalogCard servicio={s} />
                  </Reveal>
                ))}
              </div>
            </Container>
          </section>
        ))}

        {/* Banner de Promociones Rediseñado */}
        <section className="gradient-bg text-white py-12">
          <Container className="grid gap-6 sm:grid-cols-2">
            <div className="flex gap-4 rounded-2xl bg-white/10 p-6 backdrop-blur-sm border border-white/10">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Gift size={24} />
              </div>
              <div>
                <p className="font-display text-lg font-bold">Valoración gratis</p>
                <p className="mt-1 text-sm leading-relaxed text-sky-100">
                  {promociones.valoracionGratis}
                </p>
              </div>
            </div>

            <div className="flex gap-4 rounded-2xl bg-white/10 p-6 backdrop-blur-sm border border-white/10">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Users size={24} />
              </div>
              <div>
                <p className="font-display text-lg font-bold">
                  Programa de referidos
                </p>
                <p className="mt-1 text-sm leading-relaxed text-sky-100">
                  {promociones.referidos}
                </p>
              </div>
            </div>
          </Container>
        </section>

        {/* Indicaciones previas */}
        <section className="bg-white">
          <Container className="section-sm">
            <Reveal>
              <SectionHeading
                eyebrow="Antes de tu sesión"
                title="Cómo prepararte"
                description="Recomendaciones según el tipo de servicio para que aproveches al máximo tu cita."
                titleClassName="text-2xl sm:text-[1.75rem]"
              />
            </Reveal>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {catalogo.map((cat, i) => (
                <Reveal key={cat.id} delayMs={i * 80}>
                  <motion.div
                    whileHover={{ y: -6 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="card card-hover sheen h-full p-6 border-l-4 border-l-deep-600"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-deep-600">
                      <Shirt size={20} />
                    </div>
                    <p className="mt-4 font-display text-base font-bold text-ink-900">
                      {cat.nombre}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">
                      {indicacionesPreviasPorCategoria[cat.id]}
                    </p>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>

        {/* Políticas */}
        <section className="bg-mist">
          <Container className="section-sm">
            <Reveal>
              <SectionHeading
                eyebrow="Antes de reservar"
                title="Reserva, cambios y pagos"
                titleClassName="text-2xl sm:text-[1.75rem]"
              />
              <div className="mt-10 grid gap-6 sm:grid-cols-3">
                <PolicyCard icon={<CalendarClock size={20} />} text={politicas.reserva} />
                <PolicyCard
                  icon={<RefreshCw size={20} />}
                  text={politicas.reagendamiento}
                />
                <PolicyCard
                  icon={<CreditCard size={20} />}
                  text={`Medios de pago: ${politicas.mediosPago.join(" · ")}`}
                />
              </div>
              <p className="mt-8 rounded-2xl border border-sky-100 bg-white p-5 text-sm leading-relaxed text-ink-600 shadow-xs">
                {politicas.convenios}
              </p>
            </Reveal>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}

function PolicyCard({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="card card-hover sheen h-full p-6"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-deep-600">
        {icon}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-600">{text}</p>
    </motion.div>
  );
}