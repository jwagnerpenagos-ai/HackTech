import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Users,
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Activity,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { AnimatePresence, motion } from "framer-motion";
import { Container } from "@/components/ui/container";
import { BrandMark } from "@/components/site/brand-mark";
import { Reveal } from "@/components/site/reveal";
import { api, guardarToken, ApiError } from "@/lib/api";

gsap.registerPlugin(useGSAP);

export default function AdminLoginPage() {
  const panelRef = useRef<HTMLElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [recordar, setRecordar] = useState(true);
  const [errorLogin, setErrorLogin] = useState("");

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".login-badge", { opacity: 0, y: -14, duration: 0.5 })
        .from(".login-title", { opacity: 0, y: 22, duration: 0.7 }, "-=0.25")
        .from(
          ".login-bullet",
          { opacity: 0, x: -14, duration: 0.4, stagger: 0.1 },
          "-=0.3"
        )
        .from(".login-card-stats", { opacity: 0, y: 15, duration: 0.5 }, "-=0.2")
        .from(".login-foot", { opacity: 0, duration: 0.5 }, "-=0.1");

      const el = panelRef.current;
      const photo = photoRef.current;
      if (!el || !photo) return;

      const xTo = gsap.quickTo(photo, "x", { duration: 0.8, ease: "power3.out" });
      const yTo = gsap.quickTo(photo, "y", { duration: 0.8, ease: "power3.out" });
      const onMove = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;
        xTo(relX * -14);
        yTo(relY * -14);
      };
      el.addEventListener("mousemove", onMove);
      return () => el.removeEventListener("mousemove", onMove);
    },
    { scope: panelRef }
  );

  const manejarEnvio = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const usuario = String(fd.get("email") ?? "").trim();
    const clave = String(fd.get("password") ?? "");
    setErrorLogin("");
    setCargando(true);
    api
      .login(usuario, clave)
      .then((r) => {
        guardarToken(r.token);
        navigate("/admin/agenda");
      })
      .catch((err: unknown) => {
        setErrorLogin(
          err instanceof ApiError && err.status === 503
            ? "El panel no está habilitado en este entorno."
            : "Usuario o contraseña incorrectos.",
        );
      })
      .finally(() => setCargando(false));
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2 bg-slate-950 font-sans selection:bg-blue-600 selection:text-white">
      <section
        ref={panelRef}
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 border-r border-slate-800/60"
      >
        <div
          ref={photoRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 scale-105 bg-[url('/images/login-portrait.jpg')] bg-cover bg-center opacity-30 mix-blend-overlay"
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-950/30 via-slate-950/60 to-slate-950/90" />

        <div className="animate-float-lg pointer-events-none absolute -right-20 top-10 h-80 w-80 rounded-full bg-blue-600/10 blur-[120px]" />
        <div
          className="animate-float pointer-events-none absolute -left-16 bottom-10 h-80 w-80 rounded-full bg-indigo-500/10 blur-[120px]"
          style={{ animationDelay: "-2.5s" }}
        />

        <div className="login-badge relative z-10 flex items-center justify-between">
          <Link to="/" className="group/brand">
            <BrandMark variant="light" />
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300 backdrop-blur-md">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" /> Acceso Médico Seguro
          </div>
        </div>

        <div className="relative z-10 max-w-lg my-auto py-8">
          <h2 className="login-title font-display text-4xl font-extrabold leading-tight tracking-tight text-white">
            Gestión clínica e historias médicas en un solo lugar.
          </h2>
          <p className="login-title mt-4 text-sm leading-relaxed text-blue-200/80 font-normal">
            Plataforma integral de control de pacientes, sesiones de rehabilitación física y automatización de citas.
          </p>

          <ul className="mt-8 space-y-3.5 text-sm text-slate-300">
            <li className="login-bullet flex items-center gap-3.5">
              <div className="p-2 rounded-lg bg-blue-900/40 border border-blue-700/30 text-blue-400">
                <CalendarDays size={18} />
              </div>
              <span className="font-medium text-slate-200">Agenda médica y confirmaciones por WhatsApp</span>
            </li>
            <li className="login-bullet flex items-center gap-3.5">
              <div className="p-2 rounded-lg bg-blue-900/40 border border-blue-700/30 text-blue-400">
                <Users size={18} />
              </div>
              <span className="font-medium text-slate-200">Expediente digital y seguimiento de evolución</span>
            </li>
            <li className="login-bullet flex items-center gap-3.5">
              <div className="p-2 rounded-lg bg-blue-900/40 border border-blue-700/30 text-blue-400">
                <Activity size={18} />
              </div>
              <span className="font-medium text-slate-200">Métricas de rendimiento y pacientes activos</span>
            </li>
          </ul>

          <div className="login-card-stats mt-8 p-4 rounded-xl bg-blue-950/40 border border-blue-800/50 backdrop-blur-md flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-blue-200/90">Servidores de agenda sincronizados</span>
            </div>
            <span className="text-xs text-blue-400 font-mono font-semibold flex items-center gap-1">
              <CheckCircle2 size={13} /> Sistema Activo
            </span>
          </div>
        </div>

        <p className="login-foot relative z-10 text-xs text-slate-400 font-mono">
          Fisioterapia Li © {new Date().getFullYear()} · Panel Administrativo V2.4
        </p>
      </section>


      <section className="relative flex items-center justify-center overflow-hidden bg-slate-50 p-6 sm:p-12">
        <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[120px]" />

        <Container className="relative max-w-sm px-0">
          <Reveal variant="left" className="lg:hidden mb-6">
            <Link to="/" className="group/brand inline-block">
              <BrandMark size="sm" />
            </Link>
          </Reveal>

          <Reveal>
            <h1 className="font-display text-3xl font-extrabold text-slate-900 tracking-tight">
              Iniciar Sesión
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Ingresa tus credenciales para acceder al sistema.
            </p>
          </Reveal>

          <Reveal delayMs={120}>
            <form className="mt-8 grid gap-5" autoComplete="on" onSubmit={manejarEnvio}>
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />

              <label className="block space-y-1.5">
                <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Correo Electrónico
                </span>
                <div className="relative group">
                  <Mail
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600"
                  />
                  <input
                    type="email"
                    name="email"
                    autoComplete="username"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-all hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                    placeholder="admin@fisioterapeutali.com"
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Contraseña
                  </span>
                  <a
                    href="#recuperar"
                    className="text-xs text-blue-600 hover:text-blue-800 transition-colors font-medium"
                  >
                    ¿Olvidaste tu clave?
                  </a>
                </div>
                <div className="relative group">
                  <Lock
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-600"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-all hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 focus:outline-none p-1"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={showPassword ? "on" : "off"}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center justify-center"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </motion.span>
                    </AnimatePresence>
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={recordar}
                    onChange={(e) => setRecordar(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                  />
                  <span className="text-xs text-slate-600 font-medium">Recordar credenciales</span>
                </label>
              </div>

              {errorLogin && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {errorLogin}
                </p>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="mt-2 w-full flex justify-center items-center gap-2 bg-blue-900 hover:bg-blue-950 text-white py-3 px-4 rounded-xl font-semibold text-sm shadow-lg shadow-blue-900/20 transition-all active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {cargando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  <span>Entrar al Panel</span>
                )}
              </button>
            </form>
          </Reveal>

          <Reveal delayMs={200}>
            <Link
              to="/"
              className="mt-8 flex items-center justify-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-blue-900"
            >
              <ArrowLeft size={16} /> Volver al sitio principal
            </Link>
          </Reveal>
        </Container>
      </section>
    </main>
  );
}