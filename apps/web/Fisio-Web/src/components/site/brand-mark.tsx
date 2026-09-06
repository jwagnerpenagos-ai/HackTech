
import { cn } from "@/lib/utils";

export function BrandMark({
  withLabel = true,
  labelClassName,
  size = "default",
  variant = "default",
}: {
  withLabel?: boolean;
  labelClassName?: string;
  size?: "default" | "sm";
  variant?: "default" | "light";
}) {
  const logoSize = size === "sm" ? "h-9" : "h-11";
  const isLight = variant === "light";

  return (
    <div className="flex items-center gap-3">
      <img
        src="/images/Logo.png"
        alt="Fisioterapeuta Li"
        className={cn(
          "w-auto shrink-0 object-contain transition-transform duration-200 group-hover/brand:scale-105",
          logoSize
        )}
      />

      {withLabel && (
        <div className={labelClassName}>
          <span
            className={cn(
              "block font-display text-lg font-bold leading-tight",
              isLight ? "text-white" : "text-ink-900"
            )}
          >
            Fisioterapeuta{" "}
            <span className="gradient-text">Li</span>
          </span>

          <span
            className={cn(
              "block text-[11px] font-semibold uppercase tracking-wider",
              isLight ? "text-sky-100" : "text-azure-500"
            )}
          >
            Lina Murillo · Fisioterapia &amp; Neuro
          </span>
        </div>
      )}
    </div>
  );
}

