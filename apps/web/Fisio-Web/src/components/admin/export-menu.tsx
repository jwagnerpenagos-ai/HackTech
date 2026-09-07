import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, FileSpreadsheet, FileText, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Estado = "idle" | "excel" | "pdf" | "ok" | "error";

// Botón "Exportar" con menú (Excel / PDF) para las vistas del panel.
// Las funciones onExcel / onPdf arman los datos y disparan la descarga
// (ver src/lib/reportes.ts); aquí solo se gestionan apertura y estado.
export function ExportMenu({
  onExcel,
  onPdf,
  disabled,
  className,
}: {
  onExcel: () => Promise<void>;
  onPdf: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState<Estado>("idle");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function run(tipo: "excel" | "pdf") {
    setEstado(tipo);
    try {
      await (tipo === "excel" ? onExcel() : onPdf());
      setEstado("ok");
      setTimeout(() => setEstado("idle"), 1600);
    } catch (err) {
      console.error("Exportación fallida:", err);
      setEstado("error");
      setTimeout(() => setEstado("idle"), 2400);
    }
    setOpen(false);
  }

  const cargando = estado === "excel" || estado === "pdf";

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        disabled={disabled || cargando}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50",
          estado === "error"
            ? "border-rose-300 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-900"
        )}
      >
        {cargando ? (
          <Loader2 size={14} className="animate-spin" />
        ) : estado === "ok" ? (
          <Check size={14} className="text-emerald-600" />
        ) : (
          <Download size={14} />
        )}
        {cargando
          ? "Generando…"
          : estado === "ok"
            ? "Listo"
            : estado === "error"
              ? "Reintentar"
              : "Exportar"}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-30 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg shadow-brand-900/10"
          >
            <button
              type="button"
              onClick={() => run("excel")}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <FileSpreadsheet size={15} className="text-emerald-600" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => run("pdf")}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <FileText size={15} className="text-rose-500" />
              PDF (.pdf)
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
