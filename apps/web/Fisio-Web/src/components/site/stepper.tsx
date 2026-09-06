import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number; // 0-indexed
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4">
      {steps.map((label, i) => {
        const state =
          i < current ? "done" : i === current ? "active" : "pending";
        return (
          <li key={label} className="flex flex-1 items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <motion.span
                layout
                animate={state === "active" ? { scale: 1.12 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  state === "done" && "gradient-bg text-white",
                  state === "active" &&
                    "bg-white text-deep-700 ring-2 ring-deep-600",
                  state === "pending" &&
                    "border border-sky-300 bg-white text-ink-600"
                )}
              >
                {state === "done" ? (
                  <motion.span
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    className="flex items-center justify-center"
                  >
                    <Check size={16} strokeWidth={3} />
                  </motion.span>
                ) : (
                  i + 1
                )}
              </motion.span>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  state === "pending"
                    ? "text-ink-600"
                    : "font-semibold text-ink-900"
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-sky-300">
                <motion.span
                  initial={false}
                  animate={{ scaleX: i < current ? 1 : 0 }}
                  style={{ originX: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="block h-full w-full gradient-bg"
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
