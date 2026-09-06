import { useEffect, useRef, useState } from "react";

// Cuenta un número desde 0 hasta su valor cuando entra en pantalla.
// Acepta strings con prefijo/sufijo ("+500", "24/7", "4") y anima solo
// el primer bloque numérico. Con prefers-reduced-motion muestra el valor
// final directamente.
export function CountUp({
  value,
  durationMs = 1500,
  className,
}: {
  value: string;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const match = value.match(/^(\D*)(\d[\d.,]*)(.*)$/);
  const [display, setDisplay] = useState(
    match ? `${match[1]}0${match[3]}` : value
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || !match) {
      setDisplay(value);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const [, prefix, numStr, suffix] = match;
    const target = parseInt(numStr.replace(/[.,]/g, ""), 10);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(
            `${prefix}${Math.round(target * eased).toLocaleString("es-CO")}${suffix}`
          );
          if (t < 1) requestAnimationFrame(tick);
          else setDisplay(value);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
