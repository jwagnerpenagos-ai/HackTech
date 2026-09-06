import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  CalendarCheck,
  MessageCircle,
  ShieldCheck,
  Gift,
  Users,
  MapPin,
  Clock,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { WaveDivider } from "@/components/site/wave-divider";
import { Testimonials } from "@/components/site/testimonials";
import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "@/components/site/section-heading";
import { HandUnderline } from "@/components/site/hand-underline";
import { CountUp } from "@/components/site/count-up";
import { TelegramIcon } from "@/components/site/telegram-icon";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { useParallax } from "@/lib/use-parallax";
import {
  serviciosDestacados,
  promociones,
  sedes,
  contacto,
  politicas,
} from "@/lib/data";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// Colección de imágenes para el carrusel
const imagenesHero = [
  {
    src: "/images/Logo.png",
    alt: "Logo Lina Murillo",
    badge: "Especialista Certificada",
    isLogo: true,
  },
  {
    src: "/images/hero-sesion.jpg",
    alt: "Lina Murillo, fisioterapeuta, aplicando una sesión de terapia manual a un paciente",
    badge: "Fisioterapia Personalizada",
    isLogo: false,
  },
  {
    src: "/images/servicio-ejercicio.jpg",
    alt: "Sesión de ejercicio terapéutico y rehabilitación",
    badge: "Ejercicio Terapéutico",
    isLogo: false,
  },
];

export default function Home() {
  const glow = useParallax<HTMLDivElement>(0.12);
  const heroRef = useRef<HTMLElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);

  // carrusel
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % imagenesHero.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % imagenesHero.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + imagenesHero.length) % imagenesHero.length);
  };

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".hero-badge", { opacity: 0, y: -14, duration: 0.5 })
        .from(".hero-title", { opacity: 0, y: 26, duration: 0.7 }, "-=0.25")
        .from(".hero-desc", { opacity: 0, y: 16, duration: 0.6 }, "-=0.4")
        .from(
          ".hero-cta > *",
          { opacity: 0, y: 14, duration: 0.5, stagger: 0.12 },
          "-=0.35"
        )
        .from(
          photoRef.current,
          { opacity: 0, scale: 1.06, x: 40, duration: 0.9 },
          "-=0.6"
        );

      gsap.to(photoRef.current, {
        y: 50,
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1,
        },
      });
    },
    { scope: heroRef }
  );

  return (
    <>
      <Navbar />

      <main>
        {/* Hero Section */}
        <section ref={heroRef} className="grain relative overflow-hidden bg-white">
          <div className="dot-grid pointer-events-none absolute inset-0" />
          <div
            ref={glow}
            className="pointer-events-none absolute left-1/2 top-20 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-brand-400/10 blur-[150px]"
          />

          <Container className="relative py-12 sm:py-20">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
              
              {/* Columna Izquierda: Texto */}
              <div className="mx-auto max-w-xl text-center lg:mx-0 lg:max-w-none lg:text-left">
                <span className="hero-badge inline-flex items-center gap-2 rounded-full border border-sky-300 bg-white/80 px-4 py-1.5 text-xs font-semibold text-brand-900 shadow-sm shadow-brand-900/5 backdrop-blur">
                  <span className="h-2.5 w-2.5 rounded-full gradient-bg" />
                  Lina Murillo · Fisioterapia &amp; Neurorrehabilitación
                </span>

                <h1 className="hero-title mt-6 font-display text-4xl font-extrabold leading-[1.1] text-ink-900 sm:text-[3.25rem]">
                  Tu cuerpo se mueve mejor cuando alguien lo{" "}
                  <span className="gradient-text">
                    <HandUnderline>cuida bien</HandUnderline>
                  </span>
                  .
                </h1>

                <p className="hero-desc mx-auto mt-6 max-w-md text-lg leading-relaxed text-ink-600 lg:mx-0">
                  Sesiones de fisioterapia personalizadas, agenda tu cita en
                  minutos y recibe la confirmación al instante.
                </p>

                <div className="hero-cta mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                  <Button
                    type="button"
                    size="lg"
                    className="gradient-bg-pan shadow-md shadow-brand-900/15"
                    title="Muy pronto podrás agendar por Telegram"
                  >
                    <TelegramIcon size={18} /> Agendar cita
                  </Button>
                  <Button href="/servicios" size="lg" variant="secondary">
                    Ver servicios
                  </Button>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-ink-600 lg:justify-start">
                  <span className="flex items-center gap-1.5 text-deep-600">
                    <CheckCircle2 size={16} /> Valoración integral
                  </span>
                  <span className="flex items-center gap-1.5 text-deep-600">
                    <CheckCircle2 size={16} /> Atención 1 a 1
                  </span>
                </div>
              </div>

              {/* Columna Derecha */}
              <div
                ref={photoRef}
                className="group relative mx-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-sky-100 shadow-2xl shadow-brand-900/15 lg:max-w-none"
              >
                <div className="relative h-[380px] w-full sm:h-[460px] lg:h-[520px] bg-sky-50/50">
                  {imagenesHero.map((img, index) => (
                    <img
                      key={img.src}
                      src={img.src}
                      alt={img.alt}
                      loading={index === 0 ? "eager" : "lazy"}
                      className={`absolute inset-0 h-full w-full transition-all duration-500 ease-in-out ${
                        img.isLogo ? "object-contain p-12 bg-white" : "object-cover group-hover:scale-[1.03]"
                      } ${
                        index === currentSlide ? "opacity-100 scale-100" : "opacity-0 pointer-events-none"
                      }`}
                    />
                  ))}
                </div>

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-deep-700/40 via-transparent to-transparent" />

                <div className="absolute top-4 left-4 z-10 rounded-full bg-white/90 px-3.5 py-1 text-xs font-bold text-brand-900 backdrop-blur shadow-sm border border-sky-100">
                  {imagenesHero[currentSlide].badge}
                </div>

                <button
                  type="button"
                  onClick={prevSlide}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-ink-900 backdrop-blur transition hover:bg-white hover:scale-105 active:scale-95 cursor-pointer shadow-md z-10"
                  aria-label="Imagen anterior"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={nextSlide}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-ink-900 backdrop-blur transition hover:bg-white hover:scale-105 active:scale-95 cursor-pointer shadow-md z-10"
                  aria-label="Imagen siguiente"
                >
                  <ChevronRight size={20} />
                </button>

                {/* Indicadores flotantes (Dots) */}
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/40 px-3 py-1.5 backdrop-blur-sm z-10">
                  {imagenesHero.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setCurrentSlide(index)}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        index === currentSlide ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                      }`}
                      aria-label={`Ir a imagen ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
              <Reveal variant="left" delayMs={250}>
                <div className="card card-hover sheen h-full p-5 text-left border-l-4 border-l-deep-600">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-deep-600">
                    <Gift size={14} /> Promoción
                  </div>
                  <p className="mt-2 font-display text-base font-bold text-ink-900">
                    Valoración inicial gratis
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">
                    {promociones.valoracionGratis}
                  </p>
                </div>
              </Reveal>

              <Reveal variant="right" delayMs={330}>
                <div className="card card-hover sheen h-full p-5 text-left border-l-4 border-l-azure-500">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-azure-500">
                    <Users size={14} /> Referidos
                  </div>
                  <p className="mt-2 font-display text-base font-bold text-ink-900">
                    10% OFF por referir
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">
                    {promociones.referidos}
                  </p>
                </div>
              </Reveal>
            </div>

            {/* Estadísticas */}
            <Reveal delayMs={320}>
              <dl className="mx-auto mt-12 grid max-w-lg grid-cols-3 divide-x divide-sky-100 rounded-2xl border border-sky-100 bg-white/80 py-6 shadow-sm shadow-brand-900/5 backdrop-blur">
                <Stat value="+500" label="sesiones realizadas" />
                <Stat value="4" label="áreas de tratamiento" />
                <Stat value="24/7" label="reserva en línea" />
              </dl>
            </Reveal>
          </Container>
        </section>

        <WaveDivider fill="var(--color-white)" className="bg-mist" />

        {/* Cómo funciona */}
        <section className="bg-white py-6">
          <Container className="section-sm">
            <Reveal>
              <SectionHeading
                eyebrow="Cómo funciona"
                title="Reservar toma menos de dos minutos"
                description="Sin llamadas ni esperas: eliges, confirmas y llegas tranquilo a tu sesión."
              />
            </Reveal>
            <div className="mt-10 grid items-start gap-6 sm:grid-cols-3">
              <Reveal variant="left">
                <Feature
                  number="01"
                  icon={<CalendarCheck className="text-deep-600" size={20} />}
                  title="Elige un horario"
                  text="Consulta la disponibilidad real y escoge el momento que te sirva."
                />
              </Reveal>
              <Reveal delayMs={120}>
                <Feature
                  number="02"
                  icon={<MessageCircle className="text-deep-600" size={20} />}
                  title="Recibe confirmación"
                  text="Te avisamos por correo apenas quede agendada tu sesión."
                />
              </Reveal>
              <Reveal variant="right" delayMs={240}>
                <Feature
                  number="03"
                  icon={<ShieldCheck className="text-deep-600" size={20} />}
                  title="Asiste tranquilo"
                  text="Tu plan de tratamiento queda registrado y a la mano para tu terapeuta."
                />
              </Reveal>
            </div>
          </Container>
        </section>

        <WaveDivider fill="var(--color-sky-100)" className="bg-white" />

        {/* Servicios */}
        <section className="bg-sky-100">
          <Container className="section-sm">
            <div className="flex items-end justify-between gap-6">
              <Reveal>
                <SectionHeading
                  eyebrow="Servicios"
                  title="Un plan que se ajusta a tu proceso"
                  description="Cada plan se ajusta a tu proceso de recuperación, no al revés."
                />
              </Reveal>
              <Link
                to="/servicios"
                className="group hidden shrink-0 items-center gap-1 pb-1 text-sm font-semibold text-deep-600 transition-colors hover:text-deep-700 sm:flex"
              >
                Ver todos
                <ArrowUpRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </Link>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {serviciosDestacados.map((s, i) => (
                <Reveal
                  key={s.slug}
                  variant={i % 2 === 0 ? "left" : "right"}
                  delayMs={(i % 2) * 90}
                >
                  <Link
                    to={`/reservar?servicio=${s.slug}`}
                    className="card card-hover sheen group flex h-full flex-col border-l-[3px] border-l-deep-600 p-6"
                  >
                    <p className="font-display text-lg font-bold text-ink-900">
                      {s.nombre}
                    </p>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">
                      {s.descripcion}
                    </p>
                    <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-azure-500">
                      Sesión de {s.duracionMin} minutos
                      <ArrowRight
                        size={13}
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </p>
                  </Link>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>

        <WaveDivider fill="var(--color-white)" className="bg-sky-100" />

        <Testimonials />

        <section className="bg-white pb-4">
          <Container>
            <Reveal variant="scale">
              <div className="gradient-bg-pan grain relative overflow-hidden rounded-3xl px-8 py-14 text-center shadow-xl shadow-brand-900/20 sm:px-16">
                <div className="animate-float-lg pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
                <div
                  className="animate-float pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-2xl"
                  style={{ animationDelay: "-2s" }}
                />
                <h2 className="relative font-display text-3xl font-bold text-white sm:text-4xl">
                  ¿Listo para volver a moverte sin dolor?
                </h2>
                <p className="relative mx-auto mt-3 max-w-md text-sky-100">
                  Agenda tu valoración inicial y diseñamos juntos el plan que tu
                  recuperación necesita.
                </p>
                <div className="relative mt-8 flex flex-wrap justify-center gap-3">
                  <Button href="/reservar" size="lg" variant="secondary">
                    Reservar cita <ArrowRight size={18} />
                  </Button>
                  <Link
                    to="/servicios"
                    className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white ring-1 ring-inset ring-white/40 transition-colors hover:bg-white/10"
                  >
                    Ver servicios
                  </Link>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>

        {/* Contacto */}
        <section id="contacto" className="scroll-mt-24 bg-white">
          <Container className="section-sm">
            <Reveal>
              <SectionHeading
                eyebrow="Contacto"
                title="Dónde y cuándo te atendemos"
                description="Escríbenos por WhatsApp para resolver dudas o coordinar planes grupales y convenios."
              />
            </Reveal>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {sedes.map((s, i) => (
                <Reveal key={s.codigo} delayMs={i * 90}>
                  <div className="card h-full p-6">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100">
                      <MapPin className="text-deep-600" size={20} />
                    </div>
                    <p className="mt-4 font-display text-lg font-bold text-ink-900">
                      {s.nombre}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">
                      {s.ciudad}, {s.departamento}
                    </p>
                    <p className="mt-3 text-sm font-medium text-azure-500">
                      {s.nota}
                    </p>
                  </div>
                </Reveal>
              ))}

              <Reveal delayMs={180}>
                <div className="card flex h-full flex-col p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100">
                    <Clock className="text-deep-600" size={20} />
                  </div>
                  <p className="mt-4 font-display text-lg font-bold text-ink-900">
                    Horario general
                  </p>
                  <p className="mt-1 flex-1 text-sm text-ink-600">
                    {contacto.horarioGeneral}
                  </p>
                  <div className="mt-4 flex items-start gap-2 text-sm text-ink-600">
                    <CreditCard size={16} className="mt-0.5 shrink-0 text-deep-600" />
                    <span>
                      Pago 100% por adelantado · Nequi / Llave {contacto.nequi} o
                      efectivo.
                    </span>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal delayMs={120}>
              <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-sky-100 bg-mist p-6 sm:flex-row sm:items-center">
                <div>
                  <p className="font-display text-base font-bold text-ink-900">
                    ¿Prefieres escribir?
                  </p>
                  <p className="mt-1 text-sm text-ink-600">
                    Respondemos por WhatsApp al {contacto.whatsapp}.
                  </p>
                </div>
                <Button href={contacto.whatsappUrl} variant="secondary">
                  <MessageCircle size={16} /> Escribir por WhatsApp
                </Button>
              </div>
            </Reveal>

            <p className="mt-6 text-xs text-ink-600">
              {politicas.convenios}
            </p>
          </Container>
        </section>
      </main>

      <Footer />
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-2 text-center">
      <dt className="font-display text-2xl font-bold text-deep-600">
        <CountUp value={value} />
      </dt>
      <dd className="mt-0.5 text-xs text-ink-600">{label}</dd>
    </div>
  );
}

function Feature({
  number,
  icon,
  title,
  text,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="card card-hover sheen group h-full p-6">
      <div className="flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
          {icon}
        </div>
        <span className="font-display text-2xl font-bold text-sky-300/80">
          {number}
        </span>
      </div>
      <p className="mt-4 font-display text-lg font-bold text-ink-900">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{text}</p>
    </div>
  );
}