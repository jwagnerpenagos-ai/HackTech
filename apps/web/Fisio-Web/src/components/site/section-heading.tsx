import { cn } from "@/lib/utils";

// Encabezado de sección reutilizable: eyebrow + título + descripción, con
// una alineación consistente en todo el sitio para que cada sección se
// lea con la misma jerarquía tipográfica.
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  titleClassName,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      {eyebrow && (
        <span className="eyebrow">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full gradient-bg",
              align === "center" && "hidden"
            )}
          />
          {eyebrow}
        </span>
      )}
      <h2
        className={cn(
          "mt-3 font-display text-3xl font-bold leading-[1.15] text-ink-900 sm:text-[2.125rem]",
          titleClassName
        )}
      >
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-base leading-relaxed text-ink-600">
          {description}
        </p>
      )}
    </div>
  );
}
