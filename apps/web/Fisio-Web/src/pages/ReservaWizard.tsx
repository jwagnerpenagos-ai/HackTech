import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, MapPin, Clock, CreditCard, Info } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/site/stepper";
import {
  catalogo,
  indicacionesPreviasPorCategoria,
  contacto,
  tiposDocumento,
  generos,
  epsOpciones,
  ciudadesResidencia,
  ocupaciones,
  parentescos,
  motivosConsulta,
  OTRO,
} from "@/lib/data";
import { fechaMinimaReserva, sumarHora, fechaISO } from "@/lib/agenda";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const MENSAJE_ERROR: Record<string, string> = {
  cupo_ocupado: "Ese horario se acaba de ocupar. Elige otro, por favor.",
  anticipacion_insuficiente: "Las citas se reservan con al menos 24 horas de anticipación.",
  valoracion_requerida:
    "Para tu primera cita agendamos una Valoración inicial. Después de esa consulta podrás reservar los demás servicios.",
  no_reservable: "Ese servicio no se reserva en línea. Escríbenos al 311 398 1422.",
};

const steps = ["Servicio", "Sede", "Fecha y hora", "Tus datos", "Confirmación"];

const stepMotion = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
};

const telefonoRegex = /^[0-9+()\s-]+$/;

const fichaSchema = z
  .object({
    nombre: z.string().trim().min(2, "Escribe tu nombre completo").max(80, "Máximo 80 caracteres"),
    tipoDocumento: z.string().min(1, "Selecciona el tipo"),
    documento: z.string().trim().min(4, "Número no válido").max(20, "Máximo 20 caracteres"),
    fechaNacimiento: z.string().min(1, "Requerida"),
    genero: z.string().min(1, "Selecciona una opción"),
    telefono: z
      .string()
      .trim()
      .min(7, "Escribe un teléfono de contacto")
      .max(20, "Máximo 20 caracteres")
      .regex(telefonoRegex, "Solo números, espacios y + ( ) -"),
    email: z.string().trim().email("Correo no válido").max(120, "Máximo 120 caracteres"),
    eps: z.string().min(1, "Selecciona tu EPS"),
    epsOtro: z.string().trim().max(60).optional(),
    ciudad: z.string().min(1, "Selecciona tu ciudad"),
    ciudadOtro: z.string().trim().max(60).optional(),
    ocupacion: z.string().min(1, "Selecciona tu ocupación"),
    ocupacionOtro: z.string().trim().max(60).optional(),
    emergenciaNombre: z.string().trim().min(2, "Requerido").max(80, "Máximo 80 caracteres"),
    emergenciaParentesco: z.string().min(1, "Selecciona el parentesco"),
    emergenciaTelefono: z
      .string()
      .trim()
      .min(7, "Escribe un teléfono")
      .max(20, "Máximo 20 caracteres")
      .regex(telefonoRegex, "Solo números, espacios y + ( ) -"),
    motivo: z.string().min(1, "Selecciona un motivo"),
    motivoDetalle: z.string().trim().max(400, "Máximo 400 caracteres").optional(),
    referido: z.string().trim().max(80, "Máximo 80 caracteres").optional(),
    notas: z.string().trim().max(300, "Máximo 300 caracteres").optional(),
    empresa: z.string().max(0, "").optional(),
  })
  .superRefine((val, ctx) => {
    if (val.eps === OTRO && !val.epsOtro)
      ctx.addIssue({ path: ["epsOtro"], code: "custom", message: "Especifica tu EPS" });
    if (val.ciudad === OTRO && !val.ciudadOtro)
      ctx.addIssue({ path: ["ciudadOtro"], code: "custom", message: "Especifica tu ciudad" });
    if (val.ocupacion === OTRO && !val.ocupacionOtro)
      ctx.addIssue({ path: ["ocupacionOtro"], code: "custom", message: "Especifica tu ocupación" });
  });

type FichaForm = z.infer<typeof fichaSchema>;

function edadDesde(fechaNacimiento: string): number | null {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento + "T00:00:00");
  if (Number.isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad >= 0 && edad < 120 ? edad : null;
}

function categoriaDeSlug(slug: string) {
  return catalogo.find((c) => c.servicios.some((s) => s.slug === slug));
}

export function ReservaWizard() {
  const [params] = useSearchParams();
  const preselected = params.get("servicio");

  const [step, setStep] = useState(0);
  const [servicioSlug, setServicioSlug] = useState(preselected ?? "");
  const [sedeCodigo, setSedeCodigo] = useState("");
  const [fecha, setFecha] = useState<Date | undefined>(undefined);
  const [hora, setHora] = useState<string>("");
  const [enviado, setEnviado] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [errorEnvio, setErrorEnvio] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Una clave de idempotencia por recorrido del wizard: si el usuario da doble
  // clic o reintenta, core-api devuelve la misma reserva y no crea otra.
  const idempotencyKey = useMemo(
    () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`),
    [],
  );

  const { data: servicios = [] } = useQuery({
    queryKey: ["servicios"],
    queryFn: api.servicios,
    staleTime: 5 * 60_000,
  });
  const { data: sedes = [] } = useQuery({ queryKey: ["sedes"], queryFn: api.sedes, staleTime: 5 * 60_000 });

  const servicio = servicios.find((s) => s.slug === servicioSlug);
  const sedeObj = sedes.find((s) => s.codigo === sedeCodigo);
  const categoria = servicioSlug ? categoriaDeSlug(servicioSlug) : undefined;
  const minFecha = useMemo(() => fechaMinimaReserva(), []);

  const sedeAtiendeDia = (codigo: string, d: Date): boolean => {
    const s = sedes.find((x) => x.codigo === codigo);
    return s ? s.dias.includes(d.getDay()) : false;
  };

  const fechaSel = fecha ? fechaISO(fecha) : "";
  const { data: horas = [], isFetching: cargandoHoras } = useQuery({
    queryKey: ["disponibilidad", servicioSlug, sedeCodigo, fechaSel],
    queryFn: () => api.disponibilidad(servicioSlug, sedeCodigo, fechaSel),
    enabled: Boolean(servicioSlug && sedeCodigo && fechaSel),
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FichaForm>({ resolver: zodResolver(fichaSchema) });

  const epsSel = watch("eps");
  const ciudadSel = watch("ciudad");
  const ocupacionSel = watch("ocupacion");
  const edad = edadDesde(watch("fechaNacimiento") ?? "");

  function goNext() {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onConfirmar(data: FichaForm) {
    if (data.empresa) return; // honeypot
    setErrorEnvio("");
    setEnviando(true);
    try {
      const r = await api.crearReserva(
        {
          servicio: servicioSlug,
          sede: sedeCodigo,
          fecha: fecha ? fechaISO(fecha) : "",
          hora,
          paciente: {
            nombre: data.nombre,
            tipoDocumento: data.tipoDocumento,
            documento: data.documento,
            fechaNacimiento: data.fechaNacimiento,
            genero: data.genero,
            telefono: data.telefono,
            email: data.email,
          },
        },
        idempotencyKey,
      );
      // Con pasarela: el backend devuelve la URL del checkout. Se sale del
      // SPA hacia Wompi; al volver, /reservar/resultado consulta el estado.
      if (r.checkoutUrl) {
        window.location.assign(r.checkoutUrl);
        return;
      }
      setReferencia(r.referencia);
      setEnviado(true);
      goNext();
    } catch (e) {
      const codigo = e instanceof ApiError ? e.codigo : "error";
      setErrorEnvio(
        MENSAJE_ERROR[codigo] ?? "No pudimos registrar tu reserva. Intenta de nuevo en un momento.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Container className="max-w-3xl pb-16">
      <div className="flex items-center justify-between border-b border-sky-100 pb-4">
        <div>
          <span className="eyebrow inline-flex items-center gap-1.5 text-xs font-bold uppercase text-deep-600">
            <span className="h-1.5 w-1.5 rounded-full gradient-bg" />
            Agenda en línea
          </span>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">
            Reservar Cita
          </h1>
        </div>

        {step < 4 && (
          <a
            href="/"
            className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          >
            Cancelar
          </a>
        )}
      </div>

      <div className="mt-6">
        <Stepper steps={steps} current={step} />
      </div>

      {step > 0 && step < 4 && (
        <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-600">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              {servicio && (
                <span className="inline-flex items-center gap-1 font-semibold text-ink-900">
                  <span className="text-deep-600">Servicio:</span> {servicio.nombre}
                </span>
              )}
              {sedeObj && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} className="text-deep-600" /> {sedeObj.nombre}
                </span>
              )}
              {fecha && hora && (
                <span className="inline-flex items-center gap-1 font-semibold text-deep-600">
                  {fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short" })} - {hora}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setStep(0)}
              className="text-[11px] font-bold text-azure-500 hover:underline cursor-pointer"
            >
              Modificar
            </button>
          </div>
        </div>
      )}

      <div className="card mt-6 overflow-hidden p-6 sm:p-8 shadow-md">
        <AnimatePresence mode="wait" initial={false}>
          {/* PASO 0 — SERVICIO */}
          {step === 0 && (
            <motion.div key="step-0" {...stepMotion}>
              <h2 className="font-display text-xl font-bold text-ink-900">
                ¿Qué sesión necesitas?
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                Selecciona la especialidad o tratamiento que requieres.
              </p>

              <div className="mt-6 grid gap-3">
                {servicios.map((s) => (
                  <label
                    key={s.slug}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all",
                      servicioSlug === s.slug
                        ? "border-deep-600 bg-sky-100/80 ring-2 ring-inset ring-deep-600/20 shadow-xs"
                        : "border-sky-200 hover:border-deep-600 hover:bg-mist"
                    )}
                  >
                    <div>
                      <span className="block font-bold text-ink-900">{s.nombre}</span>
                      <span className="mt-0.5 block text-xs text-ink-600">
                        Duración estimada: {s.duracionMin} minutos
                      </span>
                    </div>
                    <input
                      type="radio"
                      name="servicio"
                      className="h-4 w-4 accent-[var(--color-deep-600)]"
                      checked={servicioSlug === s.slug}
                      onChange={() => setServicioSlug(s.slug)}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-sky-100 pt-5">
                <a href="/" className="text-xs font-semibold text-ink-600 hover:text-red-600">
                  Cancelar
                </a>
                <Button disabled={!servicioSlug} onClick={goNext}>
                  Continuar
                </Button>
              </div>
            </motion.div>
          )}

          {/* PASO 1 — SEDE */}
          {step === 1 && (
            <motion.div key="step-1" {...stepMotion}>
              <h2 className="font-display text-xl font-bold text-ink-900">
                ¿En qué sede te atendemos?
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                La disponibilidad depende de la sede seleccionada.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {sedes.map((s) => (
                  <label
                    key={s.codigo}
                    className={cn(
                      "flex cursor-pointer flex-col justify-between rounded-2xl border p-5 transition-all",
                      sedeCodigo === s.codigo
                        ? "border-deep-600 bg-sky-100/80 ring-2 ring-inset ring-deep-600/20 shadow-xs"
                        : "border-sky-200 hover:border-deep-600 hover:bg-mist"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-bold text-ink-900">
                          <MapPin size={18} className="text-deep-600" />
                          {s.nombre}
                        </span>
                        <input
                          type="radio"
                          name="sede"
                          className="h-4 w-4 accent-[var(--color-deep-600)]"
                          checked={sedeCodigo === s.codigo}
                          onChange={() => {
                            setSedeCodigo(s.codigo);
                            setFecha(undefined);
                            setHora("");
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-ink-600">
                        {s.ciudad}, {s.departamento}
                      </p>
                    </div>

                    <p className="mt-4 text-xs font-semibold text-azure-500 bg-white/70 p-2 rounded-lg border border-sky-100">
                      {s.nota}
                    </p>
                  </label>
                ))}
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-sky-100 pt-5">
                <Button variant="ghost" onClick={goBack}>
                  Atrás
                </Button>
                <Button disabled={!sedeCodigo} onClick={goNext}>
                  Continuar
                </Button>
              </div>
            </motion.div>
          )}

          {/* PASO 2 — FECHA Y HORA */}
          {step === 2 && (
            <motion.div key="step-2" {...stepMotion}>
              <h2 className="font-display text-xl font-bold text-ink-900">
                Elige fecha y hora
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-600">
                <Clock size={14} className="text-deep-600" />
                Se requieren mínimo 24 horas de anticipación. Almuerzo 12:00–14:00.
              </p>

              <div className="mt-6 flex flex-col items-center gap-8 lg:flex-row lg:items-start">
                <div className="rounded-2xl border border-sky-100 bg-white p-3 shadow-xs">
                  <DayPicker
                    mode="single"
                    selected={fecha}
                    onSelect={(d) => {
                      setFecha(d);
                      setHora("");
                    }}
                    disabled={[
                      { before: minFecha },
                      (d: Date) => !sedeAtiendeDia(sedeCodigo, d),
                    ]}
                    className="rdp-fisio"
                  />
                </div>

                <div className="w-full flex-1">
                  <AnimatePresence mode="wait" initial={false}>
                    {!fecha && (
                      <motion.div
                        key="sin-fecha"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 p-6 text-center text-xs text-ink-600"
                      >
                        Selecciona un día habilitado para consultar los horarios.
                      </motion.div>
                    )}

                    {fecha && cargandoHoras && (
                      <motion.div
                        key="cargando-horas"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5 text-center text-xs text-ink-600"
                      >
                        Consultando horarios disponibles…
                      </motion.div>
                    )}

                    {fecha && !cargandoHoras && horas.length === 0 && (
                      <motion.div
                        key="sin-cupos"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-center text-xs text-amber-800"
                      >
                        No hay cupos disponibles ese día. Prueba otra fecha.
                      </motion.div>
                    )}

                    {fecha && !cargandoHoras && horas.length > 0 && (
                      <motion.div
                        key="horarios"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-deep-600">
                          Horarios disponibles
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {horas.map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setHora(h)}
                              className={cn(
                                "rounded-xl border py-2.5 text-xs font-bold transition-all cursor-pointer",
                                hora === h
                                  ? "border-deep-600 bg-deep-600 text-white shadow-sm"
                                  : "border-sky-200 text-ink-900 hover:border-deep-600 hover:bg-sky-100"
                              )}
                            >
                              {h}
                            </button>
                          ))}
                        </div>

                        {hora && servicio && (
                          <div className="mt-4 rounded-xl bg-sky-100/70 p-3 text-xs text-ink-600">
                            Duración aproximada: <strong>{servicio.duracionMin} min</strong> (Finaliza ~{sumarHora(hora, servicio.duracionMin)})
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-sky-100 pt-5">
                <Button variant="ghost" onClick={goBack}>
                  Atrás
                </Button>
                <Button disabled={!fecha || !hora} onClick={goNext}>
                  Continuar
                </Button>
              </div>
            </motion.div>
          )}

          {/* PASO 3 — DATOS DEL PACIENTE */}
          {step === 3 && (
            <motion.form key="step-3" {...stepMotion} onSubmit={handleSubmit(onConfirmar)}>
              <input
                type="text"
                {...register("empresa")}
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />

              <h2 className="font-display text-xl font-bold text-ink-900">
                Información del Paciente
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                Ficha requerida para tu atención e historia clínica.
              </p>

              <Grupo titulo="Datos básicos">
                <Field label="Nombre completo" error={errors.nombre?.message}>
                  <input
                    {...register("nombre")}
                    autoComplete="name"
                    maxLength={80}
                    className="fisio-input"
                    placeholder="Ana Torres"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
                  <SelectField
                    label="Tipo Doc."
                    error={errors.tipoDocumento?.message}
                    {...register("tipoDocumento")}
                  >
                    <option value="">—</option>
                    {tiposDocumento.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </SelectField>

                  <Field label="Número de documento" error={errors.documento?.message}>
                    <input
                      {...register("documento")}
                      inputMode="numeric"
                      maxLength={20}
                      className="fisio-input"
                      placeholder="1052884331"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={`Fecha de nacimiento ${edad != null ? `(${edad} años)` : ""}`}
                    error={errors.fechaNacimiento?.message}
                  >
                    <input
                      {...register("fechaNacimiento")}
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      className="fisio-input"
                    />
                  </Field>

                  <SelectField
                    label="Género"
                    error={errors.genero?.message}
                    {...register("genero")}
                  >
                    <option value="">Selecciona</option>
                    {generos.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </SelectField>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Teléfono / WhatsApp" error={errors.telefono?.message}>
                    <input
                      {...register("telefono")}
                      type="tel"
                      autoComplete="tel"
                      maxLength={20}
                      className="fisio-input"
                      placeholder="300 000 0000"
                    />
                  </Field>

                  <Field label="Correo Electrónico" error={errors.email?.message}>
                    <input
                      {...register("email")}
                      type="email"
                      autoComplete="email"
                      maxLength={120}
                      className="fisio-input"
                      placeholder="ana@correo.com"
                    />
                  </Field>
                </div>
              </Grupo>

              <Grupo titulo="Perfil">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="EPS / Aseguradora" error={errors.eps?.message} {...register("eps")}>
                    <option value="">Selecciona</option>
                    {epsOpciones.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </SelectField>
                  {epsSel === OTRO && (
                    <Field label="¿Cuál EPS?" error={errors.epsOtro?.message}>
                      <input {...register("epsOtro")} maxLength={60} className="fisio-input" />
                    </Field>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Ciudad de residencia"
                    error={errors.ciudad?.message}
                    {...register("ciudad")}
                  >
                    <option value="">Selecciona</option>
                    {ciudadesResidencia.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </SelectField>
                  {ciudadSel === OTRO && (
                    <Field label="¿Cuál ciudad?" error={errors.ciudadOtro?.message}>
                      <input {...register("ciudadOtro")} maxLength={60} className="fisio-input" />
                    </Field>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Ocupación / Perfil"
                    error={errors.ocupacion?.message}
                    {...register("ocupacion")}
                  >
                    <option value="">Selecciona</option>
                    {ocupaciones.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </SelectField>
                  {ocupacionSel === OTRO && (
                    <Field label="¿Cuál ocupación?" error={errors.ocupacionOtro?.message}>
                      <input {...register("ocupacionOtro")} maxLength={60} className="fisio-input" />
                    </Field>
                  )}
                </div>
              </Grupo>

              <Grupo titulo="Contacto de emergencia">
                <Field label="Nombre de contacto" error={errors.emergenciaNombre?.message}>
                  <input
                    {...register("emergenciaNombre")}
                    maxLength={80}
                    className="fisio-input"
                    placeholder="Pedro Torres"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Parentesco"
                    error={errors.emergenciaParentesco?.message}
                    {...register("emergenciaParentesco")}
                  >
                    <option value="">Selecciona</option>
                    {parentescos.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </SelectField>

                  <Field label="Teléfono de contacto" error={errors.emergenciaTelefono?.message}>
                    <input
                      {...register("emergenciaTelefono")}
                      type="tel"
                      maxLength={20}
                      className="fisio-input"
                      placeholder="300 000 0000"
                    />
                  </Field>
                </div>
              </Grupo>

              <Grupo titulo="Motivo de consulta">
                <SelectField label="Motivo principal" error={errors.motivo?.message} {...register("motivo")}>
                  <option value="">Selecciona</option>
                  {motivosConsulta.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </SelectField>

                <Field label="Cuéntanos brevemente (opcional)" error={errors.motivoDetalle?.message}>
                  <textarea
                    {...register("motivoDetalle")}
                    maxLength={400}
                    className="fisio-input min-h-20"
                    placeholder="Desde cuándo presentas la molestia o tratamientos previos…"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="¿Quién te refirió? (opcional)" error={errors.referido?.message}>
                    <input {...register("referido")} maxLength={80} className="fisio-input" />
                  </Field>

                  <Field label="Notas adicionales (opcional)" error={errors.notas?.message}>
                    <input
                      {...register("notas")}
                      maxLength={300}
                      className="fisio-input"
                      placeholder="Alguna condición especial"
                    />
                  </Field>
                </div>
              </Grupo>

              {errorEnvio && (
                <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  {errorEnvio}
                </p>
              )}

              <div className="mt-8 flex items-center justify-between border-t border-sky-100 pt-5">
                <Button type="button" variant="ghost" onClick={goBack} disabled={enviando}>
                  Atrás
                </Button>
                <Button type="submit" className="gradient-bg-pan" disabled={enviando}>
                  {enviando ? "Enviando…" : "Confirmar Reserva"}
                </Button>
              </div>
            </motion.form>
          )}

          {/* PASO 4 — CONFIRMACIÓN */}
          {step === 4 && enviado && (
            <motion.div key="step-4" {...stepMotion} className="py-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={38} />
              </div>

              <h2 className="mt-4 font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                ¡Solicitud Registrada!
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm text-ink-600 leading-relaxed">
                Recibimos tu solicitud para <strong className="text-ink-900">{servicio?.nombre}</strong> en{" "}
                <strong className="text-ink-900">{sedeObj?.nombre}</strong>.
              </p>

              <div className="mt-4 inline-block rounded-full bg-sky-100 px-4 py-1 text-xs font-bold text-deep-600">
                Código de reserva: {referencia}
              </div>

              <div className="mt-8 space-y-3 text-left">
                {categoria && (
                  <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-white p-4 shadow-xs">
                    <Info size={18} className="mt-0.5 shrink-0 text-deep-600" />
                    <div>
                      <p className="text-xs font-bold text-ink-900">Indicaciones para tu cita</p>
                      <p className="mt-0.5 text-xs text-ink-600">
                        {indicacionesPreviasPorCategoria[categoria.id]}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-xs">
                  <CreditCard size={18} className="mt-0.5 shrink-0 text-deep-600" />
                  <div>
                    <p className="text-xs font-bold text-ink-900">Pago por Adelantado</p>
                    <p className="mt-0.5 text-xs text-ink-600">
                      Puedes completar el pago vía Nequi al <strong className="text-ink-900">{contacto.nequi}</strong> o en efectivo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-center gap-3">
                <Button href="/" variant="secondary">
                  Volver al inicio
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Container>
  );
}

function Grupo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mt-6 border-t border-sky-100 pt-5">
      <legend className="text-xs font-bold uppercase tracking-wider text-deep-600">
        {titulo}
      </legend>
      <div className="mt-3 grid gap-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-900">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const SelectField = ({
  label,
  error,
  children,
  ref,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  ref?: React.Ref<HTMLSelectElement>;
}) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-ink-900">{label}</span>
    <select ref={ref} className="fisio-input bg-white" {...props}>
      {children}
    </select>
    {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
  </label>
);