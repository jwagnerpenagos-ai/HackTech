import { useMemo, useState } from "react";
import { Star, Quote } from "lucide-react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Reveal } from "@/components/site/reveal";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import { resenasEjemplo } from "@/lib/data";

const filtros = [5, 4, 3, 2, 1] as const;

export default function ResenasPage() {
  const [filtro, setFiltro] = useState<number | null>(null);

  const resenas = useMemo(
    () =>
      filtro
        ? resenasEjemplo.filter((r) => r.calificacion === filtro)
        : resenasEjemplo,
    [filtro]
  );

  const promedio = (
    resenasEjemplo.reduce((acc, r) => acc + r.calificacion, 0) /
    resenasEjemplo.length
  ).toFixed(1);

  const distribucion = filtros.map((f) => ({
    estrellas: f,
    cantidad: resenasEjemplo.filter((r) => r.calificacion === f).length,
  }));

  return (
    <>
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-white">
          <div className="dot-grid pointer-events-none absolute inset-0" />
          <Container className="section-sm relative grid gap-10 md:grid-cols-[1fr_auto] md:items-center">
            <Reveal>
              <span className="eyebrow">
                <span className="h-1.5 w-1.5 rounded-full gradient-bg" />
                Experiencias reales de pacientes
              </span>
              <h1 className="gradient-text mt-3 font-display text-4xl font-extrabold leading-[1.1] sm:text-5xl">
                Reseñas
              </h1>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={20}
                      className={
                        i < Math.round(Number(promedio))
                          ? "fill-azure-500 text-azure-500"
                          : "fill-sky-100 text-sky-100"
                      }
                    />
                  ))}
                </div>
                <p className="text-ink-600">
                  {promedio} de 5 · {resenasEjemplo.length} reseñas
                </p>
              </div>
            </Reveal>

            <Reveal delayMs={120}>
              <div className="card w-full p-6 md:w-72">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-4xl font-extrabold text-ink-900">
                    {promedio}
                  </span>
                  <span className="text-sm text-ink-600">de 5</span>
                </div>
                <div className="mt-4 space-y-1.5">
                  {distribucion.map((d, i) => (
                    <div key={d.estrellas} className="flex items-center gap-2">
                      <span className="flex w-6 items-center gap-0.5 text-xs text-ink-600">
                        {d.estrellas}
                        <Star size={10} className="fill-current" />
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sky-100">
                        <motion.span
                          initial={{ width: 0 }}
                          whileInView={{
                            width: `${(d.cantidad / resenasEjemplo.length) * 100}%`,
                          }}
                          viewport={{ once: true }}
                          transition={{
                            duration: 0.7,
                            delay: i * 0.06,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className="block h-full rounded-full gradient-bg"
                        />
                      </span>
                      <span className="w-4 text-right text-xs text-ink-600">
                        {d.cantidad}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </Container>
        </section>

        <section className="bg-mist">
          <Container className="section-sm">
            <div className="flex flex-wrap gap-2">
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setFiltro(null)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  filtro === null
                    ? "border-deep-600 bg-deep-600 text-white"
                    : "border-sky-300 bg-white text-ink-600 hover:bg-sky-100"
                )}
              >
                Todas
              </motion.button>
              {filtros.map((f) => (
                <motion.button
                  key={f}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setFiltro(f)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                    filtro === f
                      ? "border-deep-600 bg-deep-600 text-white"
                      : "border-sky-300 bg-white text-ink-600 hover:bg-sky-100"
                  )}
                >
                  {f} <Star size={13} className="fill-current" />
                </motion.button>
              ))}
            </div>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {resenas.map((r, i) => (
                <Reveal key={r.nombre + r.fecha} delayMs={(i % 4) * 90}>
                  <motion.article
                    whileHover={{ y: -6, scale: 1.015 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="card flex h-full flex-col justify-between p-6"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <Star
                              key={j}
                              size={15}
                              className={
                                j < r.calificacion
                                  ? "fill-azure-500 text-azure-500"
                                  : "fill-sky-100 text-sky-100"
                              }
                            />
                          ))}
                        </div>
                        <time className="text-xs text-ink-600">
                          {new Date(r.fecha + "T00:00:00").toLocaleDateString("es-CO", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </time>
                      </div>
                      <Quote
                        size={22}
                        strokeWidth={0}
                        className="mt-4 fill-sky-100 text-sky-100"
                      />
                      <blockquote className="mt-1 text-sm leading-relaxed text-ink-600">
                        &ldquo;{r.comentario}&rdquo;
                      </blockquote>
                    </div>
                    <div className="mt-6 flex items-center justify-between gap-3 border-t border-sky-100 pt-4 text-sm">
                      <div>
                        <span className="font-semibold text-ink-900">
                          {r.nombre}
                        </span>
                        {r.sede && (
                          <span className="block text-xs text-ink-600">
                            Sede {r.sede}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-deep-600">
                        {r.servicio}
                      </span>
                    </div>
                  </motion.article>
                </Reveal>
              ))}
            </div>

            {resenas.length === 0 && (
              <p className="mt-8 text-sm text-ink-600">
                No hay reseñas con esa calificación todavía.
              </p>
            )}
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
