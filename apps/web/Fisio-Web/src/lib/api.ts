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
}

export interface EstadoPagoApi {
  estado: "sin_pago" | "en_proceso" | "aprobado" | "rechazado";
  reservaId: number;
}

export interface CitaAdminApi {
  reservaId: number;
  estado: string;
  iniciaEn: string;
  terminaEn: string;
  servicio: string | null;
  sede: string;
  paciente: string | null;
  telefono: string | null;
  canal: string;
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
};
