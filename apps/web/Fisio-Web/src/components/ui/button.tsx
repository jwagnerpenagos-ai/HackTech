import * as React from "react";
import { Link } from "react-router-dom";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-600 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "gradient-bg text-white shadow-lg shadow-brand-700/25 hover:shadow-xl hover:shadow-brand-700/30",
        secondary:
          "border border-sky-300 bg-white text-deep-600 shadow-sm shadow-brand-900/5 hover:border-deep-600 hover:bg-sky-100",
        ghost: "text-deep-600 hover:bg-sky-100",
      },
      size: {
        default: "h-11 px-6 text-sm",
        sm: "h-9 px-4 text-[13px]",
        lg: "h-12 px-8 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

// Física de resorte para el gesto -- misma sensación en los tres tipos de
// render (link externo, ruta interna, botón). El lift solo aplica al
// primario (es el que "flota"); los demás únicamente escalan.
const tapSpring = { type: "spring" as const, stiffness: 420, damping: 18 };
const hoverLift = { y: -2, scale: 1.015 };
const hoverScale = { scale: 1.02 };

const MotionLink = motion.create(Link);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { href?: string };

export function Button({
  className,
  variant,
  size,
  href,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  const whileHover = variant === "primary" ? hoverLift : hoverScale;

  if (href) {
    const isExternal = /^https?:\/\//.test(href);
    if (isExternal) {
      return (
        <motion.a
          href={href}
          className={classes}
          target="_blank"
          rel="noopener noreferrer"
          whileHover={whileHover}
          whileTap={{ scale: 0.96 }}
          transition={tapSpring}
        >
          {children}
        </motion.a>
      );
    }
    return (
      <MotionLink
        to={href}
        className={classes}
        whileHover={whileHover}
        whileTap={{ scale: 0.96 }}
        transition={tapSpring}
      >
        {children}
      </MotionLink>
    );
  }

  return (
    <motion.button
      className={classes}
      whileHover={whileHover}
      whileTap={{ scale: 0.96 }}
      transition={tapSpring}
      {...(props as HTMLMotionProps<"button">)}
    >
      {children}
    </motion.button>
  );
}
