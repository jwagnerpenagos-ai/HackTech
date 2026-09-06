import { Target, MapPin, Clock, GraduationCap, CheckCircle2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Testimonials } from "@/components/site/testimonials";
import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "@/components/site/section-heading";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AvatarPhoto } from "@/components/ui/avatar-photo";
import { perfil } from "@/lib/data";

const credenciales = [
  { titulo: "Universidad de Boyacá", tipo: "Pregrado", texto: perfil.formacion[0] },
  { titulo: "Univ. Autónoma de Manizales", tipo: "Especialización y maestría", texto: perfil.formacion[1] },
  { titulo: "CAAFYR", tipo: "Certificación", texto: perfil.certificaciones[1] },
  { titulo: "CRAPTICA", tipo: "Diplomado internacional", texto: perfil.certificaciones[2] },
  { titulo: "Fisioterapia en Movimiento", tipo: "Diplomado", texto: perfil.certificaciones[0] },
];

const areasShowcase = [
  {
    area: "Neurorrehabilitación",
    image: "/images/area-neurorrehabilitacion.jpg",
    alt: "Sesión de neurorrehabilitación con paciente pediátrico",
    texto:
      "Estimulación motora y funcional para pacientes con compromiso neurológico, incluida atención pediátrica.",
  },
  {
    area: "Rehabilitación Deportiva",
    image: "/images/area-deportiva.jpg",
    alt: "Atención de fisioterapia deportiva durante un evento de running",
    texto:
      "Recuperación y prevención de lesiones para deportistas, dentro y fuera del consultorio.",
  },
];

export default function NosotrosPage() {
  return (
    <>
      <Navbar />
      <main className="bg-white">
        {/* Presentación / Hero Profile */}
        <section className="grain relative overflow-hidden bg-white py-12 sm:py-16">
          <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="pointer-events-none absolute right-0 top-0 h-[480px] w-[480px] rounded-full bg-brand-400/10 blur-[140px]" />

          <Container className="relative">
            <div className="grid items-center gap-10 md:grid-cols-12">
              
              {/* Foto de Perfil limpia */}
              <div className="md:col-span-5 lg:col-span-4">
                <Reveal>
                  <div className="relative mx-auto w-fit">
                    <div className="pointer-events-none absolute -inset-4 rounded-full bg-gradient-to-br from-sky-300/40 via-brand-400/20 to-transparent blur-2xl" />
                    
                    <AvatarPhoto
                      src="/images/login-portrait.jpg"
                      initials="LM"
                      alt={perfil.nombreCompleto}
                      className="relative h-48 w-48 shrink-0 rounded-full border-4 border-white object-[center_20%] shadow-2xl shadow-brand-900/20 sm:h-60 sm:w-60"
                    />
                  </div>
                </Reveal>
              </div>

              {/* Información Detallada */}
              <div className="md:col-span-7 lg:col-span-8">
                <Reveal delayMs={120}>
                  <div className="flex flex-wrap items-center gap-2">
                    {perfil.areasEnfoque.map((area) => (
                      <span
                        key={area}
                        className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50/80 px-3 py-1 text-xs font-semibold text-deep-600"
                      >
                        <span className="h-1.5 w-1.5 rounded-full gradient-bg" />
                        {area}
                      </span>
                    ))}
                  </div>

                  <h1 className="gradient-text mt-4 font-display text-4xl font-extrabold leading-[1.1] sm:text-5xl">
                    {perfil.nombreProfesional}
                  </h1>

                  <p className="mt-1.5 text-xs font-bold uppercase tracking-wider text-azure-500">
                    {perfil.nombreCompleto}
                  </p>

                  <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-ink-600">
                    Fisioterapeuta enfocada en neurorrehabilitación y
                    rehabilitación deportiva, combinando terapia manual,
                    ejercicio terapéutico y técnicas complementarias para
                    acompañar el proceso de recuperación individualizado de cada paciente.
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-6 text-xs font-semibold text-ink-600">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-deep-600" /> Valoración integral
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-deep-600" /> Tratamiento individual
                    </span>
                  </div>

                  <div className="mt-8">
                    <Button href="/reservar" size="lg" className="gradient-bg-pan">
                      Reservar cita <ArrowRight size={16} />
                    </Button>
                  </div>
                </Reveal>
              </div>

            </div>
          </Container>
        </section>

        {/* Formación y certificaciones */}
        <section className="bg-sky-100 py-12 sm:py-16">
          <Container className="section-sm">
            <Reveal>
              <SectionHeading
                eyebrow="Formación & certificaciones"
                title="Respaldo académico y profesional"
                description="Constante actualización científica para brindar tratamientos seguros y efectivos."
                titleClassName="text-2xl sm:text-[1.75rem]"
              />
            </Reveal>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {credenciales.map((c, i) => (
                <Reveal key={c.titulo} delayMs={i * 80}>
                  <motion.div
                    whileHover={{ y: -6 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="card card-hover sheen h-full p-6 border-l-4 border-l-deep-600 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 font-display text-sm font-bold text-deep-600">
                          {String(i + 1).padStart(2, "0")}
                        </div>
                        <GraduationCap size={20} className="text-azure-500" />
                      </div>

                      <h3 className="mt-4 font-display text-base font-bold text-ink-900">
                        {c.titulo}
                      </h3>

                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-azure-500">
                        {c.tipo}
                      </p>

                      <p className="mt-2 text-sm leading-relaxed text-ink-600">
                        {c.texto}
                      </p>
                    </div>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>

        {/* Áreas de enfoque */}
        <section className="bg-white py-12 sm:py-16">
          <Container className="section-sm">
            <Reveal>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100">
                  <Target className="text-deep-600" size={22} />
                </div>
                <div>
                  <span className="eyebrow">Especialidades</span>
                  <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                    Áreas de enfoque principal
                  </h2>
                </div>
              </div>
            </Reveal>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {areasShowcase.map((a, i) => (
                <Reveal
                  key={a.area}
                  variant={i % 2 === 0 ? "left" : "right"}
                  delayMs={i * 100}
                >
                  <div className="group relative h-72 overflow-hidden rounded-3xl border border-sky-100 shadow-md shadow-brand-900/10 transition-all hover:shadow-xl sm:h-80">
                    <img
                      src={a.image}
                      alt={a.alt}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-deep-700/90 via-deep-700/30 to-transparent" />
                    
                    <div className="absolute inset-x-6 bottom-6 text-white">
                      <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-xs mb-2">
                        {a.area}
                      </span>
                      <p className="mt-1 text-sm sm:text-base leading-relaxed text-sky-100">
                        {a.texto}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>

        {/* Sedes y horarios */}
        <section className="bg-sky-100 py-12 sm:py-16">
          <Container className="section-sm">
            <Reveal>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-xs">
                  <MapPin className="text-deep-600" size={22} />
                </div>
                <div>
                  <span className="eyebrow">Ubicaciones</span>
                  <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                    Sedes y disponibilidad
                  </h2>
                </div>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {perfil.sedes.map((s) => (
                  <motion.div
                    key={s.nombre}
                    whileHover={{ y: -4 }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                    className="card card-hover sheen p-6"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-azure-500">
                        <MapPin size={16} />
                      </div>
                      <p className="font-display font-bold text-ink-900 text-base">
                        {s.nombre}
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-ink-600">
                      {s.horario}
                    </p>
                  </motion.div>
                ))}
              </div>

              <div className="mt-4 flex items-start gap-3.5 card p-6 border-l-4 border-l-azure-500">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-deep-600">
                  <Clock size={18} />
                </div>
                <div>
                  <p className="font-display font-bold text-sm text-ink-900">Horario General de Atención</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-600">
                    {perfil.horarioGeneral}
                  </p>
                </div>
              </div>
            </Reveal>
          </Container>
        </section>

        <Testimonials />
      </main>
      <Footer />
    </>
  );
}