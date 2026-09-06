import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

type Variant = "up" | "left" | "right" | "scale";

// Estado oculto según la dirección desde la que entra el elemento. Variar
// la dirección (según la columna, el lado de la sección, etc.) hace que el
// scroll se sienta compuesto a mano y no como un fade genérico repetido.
const variantsByType: Record<Variant, Variants> = {
  up: {
    hidden: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0 },
  },
  left: {
    hidden: { opacity: 0, x: -40 },
    visible: { opacity: 1, x: 0 },
  },
  right: {
    hidden: { opacity: 0, x: 40 },
    visible: { opacity: 1, x: 0 },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.94, filter: "blur(4px)" },
    visible: { opacity: 1, scale: 1, filter: "blur(0px)" },
  },
};

// "up"/"left"/"right" son puros transforms numéricos -> spring física, se
// siente asentado en vez de lineal. "scale" mezcla blur (no interpola bien
// con spring) -> tween con la misma curva que usaba el Reveal anterior.
const springTransition = { type: "spring" as const, stiffness: 120, damping: 18, mass: 0.9 };
const tweenTransition = { duration: 0.9, ease: [0.16, 1, 0.3, 1] as const };

// Envoltorio de revelado al hacer scroll (Framer Motion `whileInView`).
// Mismo API que antes -- variant para la dirección, delayMs para
// escalonar grupos -- así ningún call-site en el sitio necesita cambiar.
export function Reveal({
  children,
  delayMs = 0,
  variant = "up",
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  variant?: Variant;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const base = variant === "scale" ? tweenTransition : springTransition;

  return (
    <motion.div
      className={className}
      variants={variantsByType[variant]}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15, margin: "0px 0px -8% 0px" }}
      transition={{ ...base, delay: delayMs / 1000 }}
    >
      {children}
    </motion.div>
  );
}
