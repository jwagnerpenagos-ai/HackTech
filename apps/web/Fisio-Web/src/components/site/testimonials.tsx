import { Star, ArrowUpRight, Quote } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "@/components/site/section-heading";
import { resenasEjemplo } from "@/lib/data";

export function Testimonials() {
  const destacadas = resenasEjemplo.slice(0, 3);

  return (
    <section className="bg-white">
      <Container className="section-sm">
        <div className="flex items-end justify-between gap-6">
          <Reveal>
            <SectionHeading
              eyebrow="Testimonios"
              title="Lo que cuentan quienes ya vinieron"
              description="Experiencias reales de pacientes atendidos en consulta."
            />
          </Reveal>
          <Link
            to="/resenas"
            className="group hidden shrink-0 items-center gap-1 pb-1 text-sm font-semibold text-deep-600 transition-colors hover:text-deep-700 sm:flex"
          >
            Ver todas
            <ArrowUpRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {destacadas.map((r, i) => (
            <Reveal key={r.nombre} delayMs={i * 100}>
              <motion.figure
                whileHover={{ y: -6, scale: 1.015 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="card flex h-full flex-col justify-between p-6"
              >
                <div>
                  <Quote
                    size={26}
                    className="fill-sky-100 text-sky-100"
                    strokeWidth={0}
                  />
                  <div
                    className="mt-3 flex gap-0.5"
                    aria-label={`${r.calificacion} de 5 estrellas`}
                  >
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star
                        key={j}
                        size={16}
                        className={
                          j < r.calificacion
                            ? "fill-azure-500 text-azure-500"
                            : "fill-sky-100 text-sky-100"
                        }
                      />
                    ))}
                  </div>
                  <blockquote className="mt-4 text-sm leading-relaxed text-ink-600">
                    &ldquo;{r.comentario}&rdquo;
                  </blockquote>
                </div>
                <figcaption className="mt-6 border-t border-sky-100 pt-4 text-sm">
                  <span className="font-semibold text-ink-900">{r.nombre}</span>
                  <span className="text-ink-600"> · {r.servicio}</span>
                </figcaption>
              </motion.figure>
            </Reveal>
          ))}
        </div>

        <Link
          to="/resenas"
          className="mt-8 flex items-center gap-1 text-sm font-semibold text-deep-600 sm:hidden"
        >
          Ver todas las reseñas <ArrowUpRight size={16} />
        </Link>
      </Container>
    </section>
  );
}
