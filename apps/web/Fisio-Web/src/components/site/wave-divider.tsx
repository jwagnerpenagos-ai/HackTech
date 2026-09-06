// Motivo recurrente del sitio: una onda que representa movimiento y
// recuperación. Dos capas que derivan en sentidos opuestos a distinta
// velocidad -- se lee como agua real y no como un SVG estático de
// plantilla. El movimiento se congela con prefers-reduced-motion.
export function WaveDivider({
  flip = false,
  fill = "var(--color-white)",
  className = "",
}: {
  flip?: boolean;
  fill?: string;
  className?: string;
}) {
  // Unidad de onda periódica sobre 1440px, dibujada dos veces para poder
  // desplazar -1440px en bucle sin costura.
  const path =
    "M0,60 C180,100 360,20 720,60 C1080,100 1260,20 1440,60 " +
    "C1620,100 1800,20 2160,60 C2520,100 2700,20 2880,60 L2880,120 L0,120 Z";

  return (
    <div
      aria-hidden
      className={`w-full overflow-hidden leading-[0] ${flip ? "rotate-180" : ""} ${className}`}
    >
      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        className="h-16 w-[200%] sm:h-24"
      >
        <path
          d={path}
          fill={fill}
          opacity="0.45"
          className="wave-layer-b"
          transform="translate(0 14)"
        />
        <path d={path} fill={fill} className="wave-layer-a" />
      </svg>
    </div>
  );
}
