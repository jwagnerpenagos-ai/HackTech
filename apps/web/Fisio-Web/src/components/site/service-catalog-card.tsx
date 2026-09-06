
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { formatCOP, cn } from "@/lib/utils";
import type { ServicioCatalogo } from "@/lib/data";

const WHATSAPP = "https://wa.me/573113981422";

export function ServiceCatalogCard({ servicio }: { servicio: ServicioCatalogo }) {
  const [open, setOpen] = useState(false);
  const base = servicio.opciones[0];

  return (
    <motion.article
      whileHover={{ y: -6, scale: 1.015 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="card flex h-full flex-col p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">
            {servicio.nombre}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
            {servicio.descripcion}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-deep-600">
          {servicio.duracion}
        </span>
      </div>

      {servicio.notaPromo && (
        <p className="mt-3 inline-block self-start rounded-full bg-mist px-3 py-1 text-xs font-medium text-deep-600 ring-1 ring-inset ring-sky-300">
          {servicio.notaPromo}
        </p>
      )}

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-bold text-ink-900">
          {formatCOP(base.porSesion ?? base.precio)}
        </span>
        {servicio.opciones.length > 1 && (
          <span className="text-sm text-ink-600">por sesión desde</span>
        )}
      </div>

      {servicio.opciones.length > 1 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 flex items-center gap-1 self-start text-sm font-semibold text-deep-600 hover:text-deep-700"
        >
          Ver precios y paquetes
          <ChevronDown
            size={16}
            className={cn("transition-transform", open && "rotate-180")}
          />
        </button>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 space-y-2 overflow-hidden border-t border-sky-100 pt-3"
          >
            {servicio.opciones.map((o) => (
              <li key={o.label} className="flex items-center justify-between text-sm">
                <span className="text-ink-600">{o.label}</span>
                <span className="font-medium text-ink-900">
                  {formatCOP(o.precio)}
                  {o.porSesion && (
                    <span className="ml-1 font-normal text-ink-600">
                      ({formatCOP(o.porSesion)} c/u)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <div className="mt-auto pt-5">
        {servicio.reservableIndividualmente ? (
          <Button href={`/reservar?servicio=${servicio.slug}`} size="sm" variant="secondary" className="w-full">
            Reservar
          </Button>
        ) : (
          <Button href={WHATSAPP} size="sm" variant="secondary" className="w-full">
            Escríbenos para coordinar
          </Button>
        )}
      </div>
    </motion.article>
  );
}
