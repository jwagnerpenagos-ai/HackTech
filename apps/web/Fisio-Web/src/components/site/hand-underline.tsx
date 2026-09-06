import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Subrayado dibujado a mano bajo una palabra clave. Es un trazo SVG
// irregular (no text-decoration) que se dibuja solo al entrar en pantalla
// -- un detalle que le quita el look de plantilla automática.
export function HandUnderline({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [drawn, setDrawn] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || drawn) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDrawn(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [drawn]);

  return (
    <span
      ref={ref}
      className={cn("relative inline-block whitespace-nowrap", className)}
    >
      {children}
      <svg
        aria-hidden
        viewBox="0 0 300 22"
        preserveAspectRatio="none"
        className="absolute -bottom-1 left-0 h-[0.4em] w-full overflow-visible"
      >
        <path
          d="M5 13 C 55 4, 105 20, 158 11 C 205 3, 255 17, 295 9"
          fill="none"
          stroke="var(--color-brand-400)"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: drawn ? 0 : 1,
            transition: "stroke-dashoffset 850ms cubic-bezier(0.65,0,0.35,1) 200ms",
          }}
        />
      </svg>
    </span>
  );
}
