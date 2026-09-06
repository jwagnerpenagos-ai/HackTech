
import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { BrandMark } from "@/components/site/brand-mark";
import { TelegramIcon } from "@/components/site/telegram-icon";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/servicios", label: "Servicios" },
  { href: "/nosotros", label: "Nosotros" },
  { href: "/resenas", label: "Reseñas" },
  { href: "/#contacto", label: "Contacto" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Oculta la barra al bajar (más pantalla para leer) y la devuelve apenas
  // subes un poco -- solo pasado un umbral, para que no "parpadee" cerca
  // del tope ni al hacer scroll de un pixel.
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      if (!open) {
        const goingDown = y > lastY.current;
        if (y > 120 && goingDown) setHidden(true);
        else if (!goingDown) setHidden(false);
      }
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  return (
    <motion.header
      animate={{ y: hidden ? "-100%" : "0%" }}
      transition={{ type: "spring", stiffness: 400, damping: 40 }}
      className={cn(
        "glass-nav sticky top-0 z-40 border-b transition-colors duration-300",
        scrolled
          ? "border-sky-100 bg-white/85 shadow-sm shadow-brand-900/5"
          : "border-transparent bg-white/60"
      )}
    >
      <Container className="flex h-20 items-center justify-between">
        <Link to="/" className="group/brand text-ink-900">
          <motion.span
            className="inline-block"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <BrandMark />
          </motion.span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname.startsWith(l.href.replace(/#.*$/, "")) &&
                  l.href !== "/#contacto";
            return (
              <Link
                key={l.href}
                to={l.href}
                className={cn(
                  "relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-deep-600"
                    : "text-ink-600 hover:text-deep-600"
                )}
              >
                {l.label}
                {active && (
                  <motion.span
                    layoutId="navbar-active"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full gradient-bg"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block">
          <Button
            type="button"
            size="sm"
            title="Muy pronto podrás agendar por Telegram"
          >
            <TelegramIcon size={15} /> Agendar cita
          </Button>
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          className="-mr-2 rounded-lg p-2 text-ink-900 transition-colors hover:bg-sky-100 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menú"
          aria-expanded={open}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={open ? "close" : "open"}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex"
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </Container>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-sky-100 bg-white md:hidden"
          >
            <Container className="flex flex-col py-2">
              {links.map((l, i) => (
                <motion.div
                  key={l.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                >
                  <Link
                    to={l.href}
                    className="block rounded-lg px-3 py-3 text-sm font-medium text-ink-600 transition-colors hover:bg-sky-100 hover:text-deep-600"
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </Link>
                </motion.div>
              ))}
              <Button
                type="button"
                size="sm"
                className="mt-2 mb-3 w-full"
                title="Muy pronto podrás agendar por Telegram"
              >
                <TelegramIcon size={15} /> Agendar cita
              </Button>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
