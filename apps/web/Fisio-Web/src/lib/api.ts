// Cliente de la API núcleo (core-api). En desarrollo el proxy de Vite manda
// `/api/*` a http://localhost:8000, así que basta con rutas relativas.
// Contrato: contracts/web-api.md.

const TOKEN_KEY = "fisio.admin.token";

export function guardarToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* almacenamiento no disponible */
  }
}
export function leerToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function borrarToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export class ApiError extends Error {
  status: number;
  codigo: string;
  constructor(status: number, codigo: string, mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = "ApiError";
    this.status = status;
    this.codigo = codigo;
  }
}

async function pedir<T>(
  ruta: string,
  opciones: { method?: string; body?: unknown; auth?: boolean; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opciones.body !== undefined) headers["content-type"] = "application/json";
  if (opciones.idempotencyKey) headers["idempotency-key"] = opciones.idempotencyKey;
  if (opciones.auth) {
    const t = leerToken();
    if (t) headers["authorization"] = `Bearer ${t}`;
  }

  const resp = await fetch(ruta, {
    method: opciones.method ?? "GET",
    headers,
    ...(opciones.body !== undefined ? { body: JSON.stringify(opciones.body) } : {}),
  });

  const texto = await resp.text();
  const datos: unknown = texto ? JSON.parse(texto) : null;

  if (!resp.ok) {
    const d = (datos ?? {}) as { error?: string; mensaje?: string };
    if (resp.status === 401 && opciones.auth) borrarToken();
    throw new ApiError(resp.status, d.error ?? "error", d.mensaje);
  }
  return datos as T;
}

// --- Tipos del contrato -----------------------------------------------------

export interface ServicioApi {
  slug: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  duracionMin: number;
  precio: number | null;
  moneda: string | null;
}

export interface SedeApi {
  id: number;
  codigo: string;
  nombre: string;
  ciudad: string;
  departamento: string;
  dias: number[];
  nota: string;
}

export interface PacienteReservaApi {
  nombre: string;
  tipoDocumento?: string;
  documento?: string;
  fechaNacimiento?: string;
  genero?: string;
  telefono?: string;
  email?: string;
  codigoReferido?: string;
}

export interface ReservaCreadaApi {
  reservaId: number;
  /** id público de la reserva; viaja como `ref` en el checkout. */
  reservaUuid: string;
  referencia: string;
  estado: string;
  monto: number | null;
  moneda: string | null;
  nequi: string;
}

export interface CheckoutApi {
  reservaId: number;
  estado: string;
  servicio: string | null;
  sede: string | null;
  paciente: string;
  iniciaEn: string;
  monto: number | null;
  moneda: string | null;
  nequi: string;
  codigoReferido: string | null;
}

export interface EstadoPagoApi {
  estado: "sin_pago" | "en_proceso" | "aprobado" | "rechazado";
  reservaId: number;
  codigoReferido: string | null;
}

export interface OpcionTarifaApi {
  id: number;
  label: string;
  precio: number;
  porSesion: number | null;
}

export interface ServicioCatalogoApi {
  id: number;
  slug: string;
  nombre: string;
  duracion: string;
  duracionMin: number;
  duracionMaxMin: number;
  bufferPosteriorMinutos: number;
  descripcion: string | null;
  opciones: OpcionTarifaApi[];
  reservableIndividualmente: boolean;
}

export interface CategoriaCatalogoApi {
  id: number;
  nombre: string;
  servicios: ServicioCatalogoApi[];
}

export interface CatalogoAdminApi {
  catalogo: CategoriaCatalogoApi[];
  bufferPorServicio: Record<string, number>;
}

export interface PacienteAdminApi {
  id: number;
  nombre: string;
  documento: string;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  eps: string | null;
  ocupacion: string | null;
  contactoEmergencia: string | null;
  referido: string | null;
  referidosEfectivos: number;
  ultimaSesion: string | null;
}

export interface ActualizarPacienteApi {
  nombre?: string;
  telefono?: string | null;
  email?: string | null;
  ciudad?: string | null;
  eps?: string | null;
  ocupacion?: string | null;
  referido?: string | null;
  contactoEmergencia?: string | null;
}

export interface IndicadoresAdminApi {
  citasSemana: number;
  citasSemanaPrev: number;
  ingresosMes: number;
  ingresosMesPrev: number;
  ocupacion: number;
  ocupacionPrev: number;
  nuevosPacientes: number;
  nuevosPacientesPrev: number;
  citasPorServicio: { servicio: string; valor: number }[];
  reservasPorCanal: { canal: string; valor: number }[];
  citasPorDia: { dia: string; valor: number }[];
}

export interface EventoHistorialApi {
  id: string;
  fechaHora: string;
  actor: string;
  canal: string;
  accion: string;
  detalle: string;
  resultado: "ok" | "error" | "pendiente";
}

export interface IntegracionAdminApi {
  id: string;
  nombre: string;
  descripcion: string;
  estado: "conectado" | "requiere_atencion" | "no_verificable";
  detalle: string;
}

export interface CategoriaAdminApi {
  id: number;
  nombre: string;
}

export interface TarifaInicialApi {
  nombre: string;
  sesionesIncluidas: number;
  cupoPersonas: number;
  valorTotal: number;
}

export interface CrearServicioApi {
  categoriaId: number;
  nombre: string;
  descripcion?: string | null;
  duracionMinMinutos: number;
  duracionMaxMinutos: number;
  bufferPosteriorMinutos: number;
  tarifaInicial?: TarifaInicialApi | null;
}

export interface ActualizarServicioApi {
  categoriaId?: number;
  nombre?: string;
  descripcion?: string | null;
  duracionMinMinutos?: number;
  duracionMaxMinutos?: number;
  bufferPosteriorMinutos?: number;
}

export interface CitaAdminApi {
  reservaId: number;
  pacienteId: number | null;
  estado: string;
  iniciaEn: string;
  terminaEn: string;
  servicio: string | null;
  sede: string;
  paciente: string | null;
  telefono: string | null;
  canal: string;
}

// --- Historia clínica -------------------------------------------------------

export interface CatalogosClinicosApi {
  motivosConsulta: { id: number; nombre: string }[];
  antecedentes: { id: number; codigo: string; nombre: string; esBanderaRoja: boolean }[];
  zonasAnatomicas: { id: number; codigo: string; nombre: string }[];
  tiposDolor: { id: number; codigo: string; nombre: string }[];
}

export interface CitaPacienteApi {
  reservaId: number;
  estado: string;
  iniciaEn: string;
  terminaEn: string;
  servicio: string | null;
  sede: string;
  canal: string;
}

export interface AntecedentePacienteApi {
  antecedenteId: number;
  codigo: string;
  nombre: string;
  esBanderaRoja: boolean;
  detalle: string | null;
}

export interface AnamnesisApi {
  id: number;
  reservaId: number | null;
  motivoConsulta: string | null;
  motivoDetalle: string | null;
  descripcionPaciente: string | null;
  enfermedadActual: string | null;
  inicioSintomas: string | null;
  causaAparente: string | null;
  tratamientosPrevios: string | null;
  respuestaTratamientos: string | null;
  objetivosTerapeuticos: string | null;
  registradoPor: string;
  registradoEn: string;
  anulaAId: number | null;
  motivoCorreccion: string | null;
}

export interface SignosVitalesApi {
  id: number;
  sistolica: number | null;
  diastolica: number | null;
  frecuenciaCardiaca: number | null;
  frecuenciaRespiratoria: number | null;
  saturacionO2: number | null;
  pesoKg: number | null;
  tallaCm: number | null;
  imc: number | null;
  estadoTension: string | null;
  estadoFrecuenciaCardiaca: string | null;
  estadoFrecuenciaRespiratoria: string | null;
  estadoSaturacion: string | null;
  estadoImc: string | null;
  requiereAtencion: boolean;
  tomadoEn: string;
  tomadoPor: string | null;
}

export interface EvaluacionDolorApi {
  id: number;
  intensidad: number;
  clasificacion: string;
  comportamiento: string | null;
  localizacion: string | null;
  zona: string | null;
  tiposDolor: string[];
  evaluadoEn: string;
  evaluadoPor: string | null;
}

export interface EvolucionApi {
  id: number;
  reservaId: number;
  subjetivo: string | null;
  objetivo: string | null;
  analisis: string | null;
  plan: string | null;
  tecnicasAplicadas: string | null;
  registradoPor: string;
  registradoEn: string;
  anulaAId: number | null;
  motivoCorreccion: string | null;
}

// --- Endpoints ------------------------------------------------------------

export const api = {
  servicios: () => pedir<{ servicios: ServicioApi[] }>("/api/servicios").then((r) => r.servicios),

  sedes: () => pedir<{ sedes: SedeApi[] }>("/api/sedes").then((r) => r.sedes),

  disponibilidad: (servicioSlug: string, sedeCodigo: string, fecha: string) =>
    pedir<{ slots: string[] }>(
      `/api/disponibilidad?servicio=${encodeURIComponent(servicioSlug)}&sede=${encodeURIComponent(
        sedeCodigo,
      )}&fecha=${fecha}`,
    ).then((r) => r.slots),

  crearReserva: (
    input: { servicio: string; sede: string; fecha: string; hora: string; paciente: PacienteReservaApi },
    idempotencyKey: string,
  ) => pedir<ReservaCreadaApi>("/api/reservas", { method: "POST", body: input, idempotencyKey }),

  // Checkout de pago simulado del sitio. `ref` es el reservaUuid.
  checkout: (ref: string) => pedir<CheckoutApi>(`/api/pagos/checkout?ref=${encodeURIComponent(ref)}`),

  simularPago: (ref: string) =>
    pedir<{ pagoId: number; estado: string }>("/api/pagos/simular", { method: "POST", body: { ref } }),

  estadoPago: (ref: string) => pedir<EstadoPagoApi>(`/api/pagos/estado?ref=${encodeURIComponent(ref)}`),

  // Admin
  login: (usuario: string, clave: string) =>
    pedir<{ token: string; expiraEn: string }>("/api/admin/login", { method: "POST", body: { usuario, clave } }),

  serviciosAdmin: () => pedir<CatalogoAdminApi>("/api/admin/servicios", { auth: true }),

  categoriasAdmin: () =>
    pedir<{ categorias: CategoriaAdminApi[] }>("/api/admin/categorias", { auth: true }).then((r) => r.categorias),

  crearServicio: (input: CrearServicioApi) =>
    pedir<{ id: number }>("/api/admin/servicios", { method: "POST", auth: true, body: input }),

  actualizarServicio: (id: number, input: ActualizarServicioApi) =>
    pedir<{ ok: true }>(`/api/admin/servicios/${id}`, { method: "PATCH", auth: true, body: input }),

  eliminarServicio: (id: number) =>
    pedir<{ ok: true }>(`/api/admin/servicios/${id}`, { method: "DELETE", auth: true }),

  agregarTarifa: (servicioId: number, input: TarifaInicialApi) =>
    pedir<{ id: number }>(`/api/admin/servicios/${servicioId}/tarifas`, { method: "POST", auth: true, body: input }),

  actualizarTarifa: (id: number, input: { nombre?: string; valorTotal?: number }) =>
    pedir<{ ok: true }>(`/api/admin/tarifas/${id}`, { method: "PATCH", auth: true, body: input }),

  eliminarTarifa: (id: number) =>
    pedir<{ ok: true }>(`/api/admin/tarifas/${id}`, { method: "DELETE", auth: true }),

  pacientesAdmin: () =>
    pedir<{ pacientes: PacienteAdminApi[] }>("/api/admin/pacientes", { auth: true }).then((r) => r.pacientes),

  actualizarPaciente: (id: number, input: ActualizarPacienteApi) =>
    pedir<PacienteAdminApi>(`/api/admin/pacientes/${id}`, { method: "PATCH", auth: true, body: input }),

  indicadoresAdmin: () => pedir<IndicadoresAdminApi>("/api/admin/indicadores", { auth: true }),

  historialAdmin: () =>
    pedir<{ eventos: EventoHistorialApi[] }>("/api/admin/historial", { auth: true }).then((r) => r.eventos),

  integracionesAdmin: () =>
    pedir<{ integraciones: IntegracionAdminApi[] }>("/api/admin/integraciones", { auth: true }).then(
      (r) => r.integraciones,
    ),

  citas: (desde?: string, hasta?: string) => {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const suf = qs.toString() ? `?${qs.toString()}` : "";
    return pedir<{ citas: CitaAdminApi[] }>(`/api/admin/citas${suf}`, { auth: true }).then((r) => r.citas);
  },

  confirmarCita: (id: number) =>
    pedir<{ reservaId: number; estado: string }>(`/api/admin/citas/${id}/confirmar`, { method: "PATCH", auth: true }),

  cancelarCita: (id: number, motivo?: string) =>
    pedir<{ reservaId: number; estado: string }>(`/api/admin/citas/${id}/cancelar`, {
      method: "PATCH",
      auth: true,
      body: { motivo },
    }),

  asistenciaCita: (id: number, asistio: boolean) =>
    pedir<{ reservaId: number; estado: string }>(`/api/admin/citas/${id}/asistencia`, {
      method: "PATCH",
      auth: true,
      body: { asistio },
    }),

  // Historia clínica
  catalogosClinicos: () => pedir<CatalogosClinicosApi>("/api/admin/catalogos-clinicos", { auth: true }),

  citasDePaciente: (pacienteId: number) =>
    pedir<{ citas: CitaPacienteApi[] }>(`/api/admin/pacientes/${pacienteId}/citas`, { auth: true }).then(
      (r) => r.citas,
    ),

  agendarProximaCita: (
    pacienteId: number,
    input: { servicioId: number; sedeId: number; iniciaEnIso: string },
  ) => pedir<{ reservaId: number }>(`/api/admin/pacientes/${pacienteId}/agendar`, { method: "POST", auth: true, body: input }),

  antecedentesPaciente: (pacienteId: number) =>
    pedir<{ antecedentes: AntecedentePacienteApi[] }>(`/api/admin/pacientes/${pacienteId}/antecedentes`, {
      auth: true,
    }).then((r) => r.antecedentes),

  actualizarAntecedentes: (pacienteId: number, items: { antecedenteId: number; detalle?: string | null }[]) =>
    pedir<{ ok: true }>(`/api/admin/pacientes/${pacienteId}/antecedentes`, {
      method: "PUT",
      auth: true,
      body: { items },
    }),

  anamnesisDePaciente: (pacienteId: number) =>
    pedir<{ anamnesis: AnamnesisApi[] }>(`/api/admin/pacientes/${pacienteId}/anamnesis`, { auth: true }).then(
      (r) => r.anamnesis,
    ),

  crearAnamnesis: (pacienteId: number, input: Record<string, unknown>) =>
    pedir<{ id: number }>(`/api/admin/pacientes/${pacienteId}/anamnesis`, { method: "POST", auth: true, body: input }),

  signosVitalesDePaciente: (pacienteId: number) =>
    pedir<{ signosVitales: SignosVitalesApi[] }>(`/api/admin/pacientes/${pacienteId}/signos-vitales`, {
      auth: true,
    }).then((r) => r.signosVitales),

  crearSignosVitales: (pacienteId: number, input: Record<string, unknown>) =>
    pedir<{ id: number }>(`/api/admin/pacientes/${pacienteId}/signos-vitales`, {
      method: "POST",
      auth: true,
      body: input,
    }),

  dolorDePaciente: (pacienteId: number) =>
    pedir<{ evaluaciones: EvaluacionDolorApi[] }>(`/api/admin/pacientes/${pacienteId}/dolor`, { auth: true }).then(
      (r) => r.evaluaciones,
    ),

  crearEvaluacionDolor: (pacienteId: number, input: Record<string, unknown>) =>
    pedir<{ id: number }>(`/api/admin/pacientes/${pacienteId}/dolor`, { method: "POST", auth: true, body: input }),

  evolucionDePaciente: (pacienteId: number) =>
    pedir<{ evoluciones: EvolucionApi[] }>(`/api/admin/pacientes/${pacienteId}/evolucion`, { auth: true }).then(
      (r) => r.evoluciones,
    ),

  crearEvolucion: (pacienteId: number, input: Record<string, unknown>) =>
    pedir<{ id: number }>(`/api/admin/pacientes/${pacienteId}/evolucion`, { method: "POST", auth: true, body: input }),
};
