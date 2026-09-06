import { useState } from "react";
import { Reveal } from "@/components/site/reveal";
import { cn, formatCOP } from "@/lib/utils";

// Sección alternada imagen/texto para presentar cada categoría del
// catálogo. La imagen tiene una ruta ya establecida en /public/images;
// si el archivo no existe todavía, cae a un placeholder de marca con el
// mismo chip de info -- así no se rompe nada mientras llegan las fotos.
export function Showcase({
  index,
  eyebrow,
  title,
  description,
  chipLabel,
  chipValue,
  imageSrc,
  imageAlt,
  imageSide = "right",
  imagePosition = "center",
}: {
  index: number;
  eyebrow: string;
  title: string;
  description: string;
  chipLabel: string;
  chipValue: number;
  imageSrc: string;
  imageAlt: string;
  imageSide?: "left" | "right";
  // Foto de origen vertical dentro de un marco ancho y corto: object-cover
  // por sí solo suele centrar el recorte en una zona vacía (pared, techo).
  // Este prop ancla el recorte a la parte de la foto que sí importa.
  imagePosition?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const num = String(index).padStart(2, "0");

  const image = (
    <Reveal
      delayMs={100}
      className={cn(
        "group relative h-[280px] overflow-hidden rounded-3xl border border-sky-100 shadow-xl shadow-brand-900/10 sm:h-[380px]",
        imgFailed ? "gradient-bg" : "bg-sky-100"
      )}
    >
      {!imgFailed && (
        <img
          src={imageSrc}
          alt={imageAlt}
          loading="lazy"
          onError={() => setImgFailed(true)}
          style={{ objectPosition: imagePosition }}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-deep-700/50 via-transparent to-transparent" />
      <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-xl border border-white/20 bg-deep-700/85 px-4 py-3 text-xs text-white backdrop-blur-md sm:inset-x-6 sm:bottom-6">
        <span className="font-medium">{chipLabel}</span>
        <span className="font-semibold text-brand-200">
          Desde {formatCOP(chipValue)}
        </span>
      </div>
    </Reveal>
  );

  const text = (
    <Reveal>
      <div className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-white px-3 py-1 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-deep-600">
        <span className="text-sky-300">{num}</span> {eyebrow}
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold leading-tight text-ink-900 sm:text-[1.9rem]">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-600 sm:text-base">
        {description}
      </p>
    </Reveal>
  );

  return (
    <div className="grid items-center gap-8 sm:gap-10 lg:grid-cols-12">
      {imageSide === "right" ? (
        <>
          <div className="lg:col-span-5">{text}</div>
          <div className="lg:col-span-7">{image}</div>
        </>
      ) : (
        <>
          <div className="order-2 lg:order-1 lg:col-span-7">{image}</div>
          <div className="order-1 lg:order-2 lg:col-span-5">{text}</div>
        </>
      )}
    </div>
  );
}
