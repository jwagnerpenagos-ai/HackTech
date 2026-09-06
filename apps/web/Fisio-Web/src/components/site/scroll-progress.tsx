import { useEffect, useRef, useState } from "react";

// Barra fina en la parte superior que muestra el avance de scroll de la
// página. Usa scaleX (compositable, sin recalcular layout) y un punto de
// luz que sigue el borde de avance.
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const update = () => {
      raf.current = 0;
      const scrollTop = window.scrollY;
      const height =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(height > 0 ? Math.min(1, scrollTop / height) : 0);
    };
    const onScroll = () => {
      if (!raf.current) raf.current = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] bg-sky-100/60">
      <div
        className="relative h-full origin-left gradient-bg transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${progress})` }}
      >
        <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-brand-400 shadow-[0_0_8px_2px_var(--color-brand-400)]" />
      </div>
    </div>
  );
}
