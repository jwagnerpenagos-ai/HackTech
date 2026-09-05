import { z } from "zod";

/**
 * Configuración del servicio, leída del entorno una sola vez al arrancar.
 * Si algo falta o es inválido, el proceso no levanta: es preferible fallar
 * en el arranque que servir con una config a medias.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  NLU_PORT: z.coerce.number().int().min(1).max(65535).default(8100),
  NLU_HOST: z.string().min(1).default("127.0.0.1"),

  // Secreto compartido entre servicios internos. Obligatorio en producción.
  INTERNAL_API_KEY: z.string().min(16).optional(),

  OLLAMA_HOST: z.string().url().default("http://127.0.0.1:11434"),
  // qwen2.5:7b-instruct: mejor que llama3.1:8b para español + salida JSON, y
  // el 3B se quedaba corto clasificando 13 intenciones (ver historial). Un
  // modelo < 7B degrada bastante la clasificación.
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5:7b-instruct"),
  NLU_OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),

  TIMEZONE: z.string().min(1).default("America/Bogota"),

  // Límites defensivos de la superficie HTTP.
  NLU_MAX_BODY_BYTES: z.coerce.number().int().min(256).max(1_048_576).default(8_192),
  NLU_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
  NLU_RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

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
      "INTERNAL_API_KEY es obligatorio cuando NODE_ENV=production: el servicio NLU no debe quedar sin autenticación entre servicios.",
    );
  }

  cached = Object.freeze({ ...parsed.data, isProd });
  return cached;
}

/** Solo para pruebas: descarta la config memorizada. */
export function _resetConfigForTests(): void {
  cached = null;
}
