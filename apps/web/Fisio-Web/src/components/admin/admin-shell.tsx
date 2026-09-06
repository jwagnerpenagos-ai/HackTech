import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Users,
  Stethoscope,
  Workflow,
  Plug,
  History,
  BarChart3,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { BrandMark } from "@/components/site/brand-mark";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/admin/reservas", label: "Reservas", icon: ClipboardList },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/servicios", label: "Servicios", icon: Stethoscope },
  { href: "/admin/automatizaciones", label: "Automatizaciones", icon: Workflow },
  { href: "/admin/integraciones", label: "Integraciones", icon: Plug },
  { href: "/admin/historial", label: "Historial", icon: History },
  { href: "/admin/indicadores", label: "Indicadores", icon: BarChart3 },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Función (no JSX ya calculado) porque se monta dos veces -- sidebar de
  // escritorio y menú móvil -- y cada una necesita su propio layoutId para
  // que el resaltado deslizante no se confunda entre ambas instancias.
  const renderNav = (layoutIdPrefix: string) => (
    <nav className="mt-2 flex flex-col gap-1">
      {nav.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive
                ? "font-semibold text-deep-600"
                : "text-ink-600 hover:bg-sky-100 hover:text-deep-600"
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`${layoutIdPrefix}-nav-active`}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="absolute inset-0 rounded-lg bg-sky-100"
              />
            )}
            <Icon size={18} className="relative" />
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-mist">
      {/* Sidebar escritorio */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-sky-100 bg-white p-6 lg:flex">
        <div>
          <Link to="/" className="group/brand">
            <BrandMark size="sm" />
          </Link>
          <p className="mt-8 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
            Panel
          </p>
          {renderNav("desktop")}
        </div>
        <Link
          to="/admin/login"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-600 transition-colors hover:bg-sky-100 hover:text-deep-600"
        >
          <LogOut size={18} />
          Cerrar sesión
        </Link>
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar móvil */}
        <div className="flex items-center justify-between border-b border-sky-100 bg-white p-4 lg:hidden">
          <Link to="/" className="group/brand">
            <BrandMark size="sm" />
          </Link>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setOpen((v) => !v)}
            aria-label="Abrir menú"
            aria-expanded={open}
            className="rounded-lg p-2 text-ink-900 transition-colors hover:bg-sky-100"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </motion.button>
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden border-b border-sky-100 bg-white lg:hidden"
            >
              <div className="p-4">
                {renderNav("mobile")}
                <Link
                  to="/admin/login"
                  onClick={() => setOpen(false)}
                  className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-sky-100"
                >
                  <LogOut size={18} />
                  Cerrar sesión
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 p-6 sm:p-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
