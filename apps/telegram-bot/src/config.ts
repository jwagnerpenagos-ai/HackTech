import { z } from "zod";

/**
 * Configuración del bot, leída del entorno al arrancar. Falla temprano si
 * algo no cuadra.
 */

const TOKEN_RE = /^\d{8,10}:[A-Za-z0-9_-]{35}$/;

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Hay dos bots: uno de desarrollo (rota entre quien prueba) y uno de
    // demostración (no se toca hasta la sustentación). Se elige con TELEGRAM_ENTORNO.
    TELEGRAM_ENTORNO: z.enum(["dev", "demo"]).default("dev"),
    TELEGRAM_BOT_TOKEN_DEV: z.string().regex(TOKEN_RE).optional(),
    TELEGRAM_BOT_TOKEN_DEMO: z.string().regex(TOKEN_RE).optional(),

    // Allowlist ADMINISTRATIVA (Lina/staff): agenda completa, bloquear
    // horario, buscar cualquier cliente. Cualquier otro chat igual puede
    // consultar el catálogo, ver disponibilidad y agendar para sí mismo —
    // ver src/auth.ts.
    TELEGRAM_ALLOWED_CHAT_IDS: z.string().default(""),

    NLU_URL: z.string().url().default("http://127.0.0.1:8100"),
    INTERNAL_API_KEY: z.string().min(16).optional(),
    BOT_NLU_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(8_000),

    // n8n recibe la intención ya confirmada y la reenvía a core-api
    // (POST /comandos): "n8n envía la intención; el modelo nunca". El bot
    // nunca le habla a core-api directamente.
    N8N_URL: z.string().url().default("http://127.0.0.1:5678"),
    N8N_COMANDOS_PATH: z.string().min(1).default("/webhook/comandos"),
    BOT_N8N_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),

    // Fase 3 (opcional): tras reservar, el bot le ofrece al paciente un
    // link para sincronizar con SU Google Calendar personal. El bot nunca
    // habla con Google directamente — solo arma el link hacia este servicio.
    GOOGLE_ADAPTER_URL: z.string().url().default("http://127.0.0.1:8200"),

    // Confianza mínima del NLU para actuar sin repreguntar.
    BOT_CONFIANZA_MINIMA: z.coerce.number().min(0).max(1).default(0.55),

    // Rate limit por chat (mensajes entrantes por minuto).
    BOT_RATE_LIMIT_POR_MINUTO: z.coerce.number().int().min(1).max(600).default(20),

    TIMEZONE: z.string().min(1).default("America/Bogota"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .transform((env, ctx) => {
    const tokenSel =
      env.TELEGRAM_ENTORNO === "demo"
        ? env.TELEGRAM_BOT_TOKEN_DEMO
        : env.TELEGRAM_BOT_TOKEN_DEV;
    if (tokenSel === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Falta el token para TELEGRAM_ENTORNO=${env.TELEGRAM_ENTORNO} (TELEGRAM_BOT_TOKEN_${env.TELEGRAM_ENTORNO.toUpperCase()}).`,
      });
      return z.NEVER;
    }
    const allowed = new Set(
      env.TELEGRAM_ALLOWED_CHAT_IDS.split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => Number(s))
        .filter((n) => Number.isSafeInteger(n)),
    );
    return { ...env, token: tokenSel, allowedChatIds: allowed };
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
  if (isProd && parsed.data.INTERNAL_API_KEY === undefined) {
    throw new Error("INTERNAL_API_KEY es obligatorio con NODE_ENV=production.");
  }
  if (isProd && parsed.data.allowedChatIds.size === 0) {
    throw new Error(
      "TELEGRAM_ALLOWED_CHAT_IDS no puede quedar vacío en producción: sin eso nadie tiene acceso administrativo.",
    );
  }
  cached = Object.freeze({ ...parsed.data, isProd });
  return cached;
}

export function _resetConfigForTests(): void {
  cached = null;
}
