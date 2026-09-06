import { z } from "zod";

/**
 * Configuración del servicio, leída del entorno una sola vez al arrancar.
 * Si algo falta o es inválido, el proceso no levanta: es preferible fallar
 * en el arranque que servir con una config a medias (mismo criterio que
 * services/nlu).
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  CORE_API_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  CORE_API_HOST: z.string().min(1).default("127.0.0.1"),

  DATABASE_URL: z.string().min(1),
  CORE_API_DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // Secreto compartido entre servicios internos. Obligatorio en producción.
  INTERNAL_API_KEY: z.string().min(16).optional(),

  // chat_id de Telegram con acceso administrativo (Lina/staff): agenda
  // completa, bloquear horario, etc. Un chat fuera de esta lista solo puede
  // ver/agendar lo suyo (identidad resuelta vía personas.vinculo_telegram).
  CORE_API_ADMIN_CHAT_IDS: z.string().default(""),

  TIMEZONE: z.string().min(1).default("America/Bogota"),

  // --- API de navegador (apps/web) ---
  // Sesión de un solo usuario (Lina): estas credenciales autorizan el panel.
  // Vacías = el panel admin queda deshabilitado (login siempre 401).
  WEB_ADMIN_USUARIO: z.string().default(""),
  WEB_ADMIN_CLAVE: z.string().default(""),
  // Secreto para firmar el token de sesión del panel. Si falta, se genera
  // uno efímero al arrancar (los tokens no sobreviven un reinicio).
  WEB_SESSION_SECRET: z.string().min(16).optional(),
  WEB_TOKEN_TTL_MIN: z.coerce.number().int().min(5).max(1440).default(480),
  // URL pública del sitio, para armar la URL de retorno de la pasarela.
  WEB_PUBLIC_URL: z.string().url().default("http://localhost:3000"),

  // --- Pasarela de pago ---
  //   manual      -> sin pasarela: reserva pendiente_pago, Lina confirma en el panel.
  //   mock        -> checkout simulado por el propio sitio (demo sin cuenta).
  //   mercadopago -> Checkout Pro real; requiere MP_ACCESS_TOKEN (token de PRUEBA TEST-…).
  PASARELA_MODO: z.enum(["manual", "mock", "mercadopago"]).default("manual"),
  MP_ACCESS_TOKEN: z.string().default(""),

  // Límites defensivos de la superficie HTTP.
  CORE_API_MAX_BODY_BYTES: z.coerce.number().int().min(256).max(1_048_576).default(16_384),
  CORE_API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  CORE_API_RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
}).transform((env) => ({
  ...env,
  adminChatIds: new Set(
    env.CORE_API_ADMIN_CHAT_IDS.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isSafeInteger(n)),
  ),
}));

export type Config = Readonly<z.infer<typeof EnvSchema>> & {
  readonly isProd: boolean;
};

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(raíz)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de entorno inválida:\n${detalle}`);
  }

  const isProd = parsed.data.NODE_ENV === "production";
  if (isProd && !parsed.data.INTERNAL_API_KEY) {
    throw new Error(
      "INTERNAL_API_KEY es obligatorio cuando NODE_ENV=production: core-api decide y ejecuta sobre la base, no debe quedar sin autenticación entre servicios.",
    );
  }

  cached = Object.freeze({ ...parsed.data, isProd });
  return cached;
}

/** Solo para pruebas: descarta la config memorizada. */
export function _resetConfigForTests(): void {
  cached = null;
}
