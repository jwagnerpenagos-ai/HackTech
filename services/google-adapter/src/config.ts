import { z } from "zod";

/**
 * Configuración del servicio, leída del entorno una sola vez al arrancar.
 * Mismo criterio que services/core-api y services/nlu: si algo falta o es
 * inválido, el proceso no levanta.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  GOOGLE_ADAPTER_HOST: z.string().min(1).default("127.0.0.1"),
  GOOGLE_ADAPTER_PORT: z.coerce.number().int().min(1).max(65535).default(8200),

  DATABASE_URL: z.string().min(1),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().default("http://localhost:8200/oauth/callback"),

  // Cuenta de Lina: obligatorio para que el consumidor del outbox funcione,
  // pero el proceso igual debe poder arrancar sin él (por ejemplo, para
  // exponer /oauth/paciente/* mientras se hace el setup inicial). El
  // calendario a usar es por sede (catalogo.sede.google_calendar_id), no
  // una variable de entorno.
  GOOGLE_REFRESH_TOKEN: z.string().optional(),

  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60_000).default(5000),
  OUTBOX_LOTE: z.coerce.number().int().min(1).max(100).default(20),

  TIMEZONE: z.string().min(1).default("America/Bogota"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Config = Readonly<z.infer<typeof EnvSchema>> & { readonly isProd: boolean };

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
  if (isProd && (!parsed.data.GOOGLE_CLIENT_ID || !parsed.data.GOOGLE_CLIENT_SECRET)) {
    throw new Error("GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET son obligatorios con NODE_ENV=production.");
  }

  cached = Object.freeze({ ...parsed.data, isProd });
  return cached;
}

/** Solo para pruebas: descarta la config memorizada. */
export function _resetConfigForTests(): void {
  cached = null;
}
