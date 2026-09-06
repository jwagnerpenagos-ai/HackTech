import type { Config } from "./config.js";

/**
 * Frontera de identidad del bot.
 *
 * `TELEGRAM_ALLOWED_CHAT_IDS` es la allowlist ADMINISTRATIVA (Lina/staff):
 * agenda completa, bloquear horario, buscar cualquier cliente, enviar
 * correos/crear carpetas a mano. Cualquier otro chat puede consultar el
 * catálogo, ver disponibilidad y agendar para sí mismo sin estar en esta
 * lista — su identidad como paciente se resuelve del lado de `core-api` vía
 * `personas.vinculo_telegram` (chat sin paciente vinculado = primera cita),
 * no aquí. Este archivo solo decide qué chats tienen el nivel "admin".
 */

export type NivelAcceso = "autorizado" | "desconocido";

export function nivelDeAcceso(cfg: Config, chatId: number | undefined): NivelAcceso {
  if (chatId === undefined) return "desconocido";
  return cfg.allowedChatIds.has(chatId) ? "autorizado" : "desconocido";
}

export function esAutorizado(cfg: Config, chatId: number | undefined): boolean {
  return nivelDeAcceso(cfg, chatId) === "autorizado";
}

/**
 * Intenciones administrativas: solo un chat autorizado (Lina/staff) puede
 * ejecutarlas. `cancelar_sesion` y `modificar_sesion` NO están: un paciente
 * puede cancelar o reprogramar SU cita desde el flujo guiado (el candado real
 * es el chequeo de propiedad en core-api).
 */
export const INTENCIONES_RESTRINGIDAS = new Set<string>([
  "buscar_cliente",
  "enviar_correo",
  "crear_carpeta",
  "buscar_archivo",
  "bloquear_horario",
]);
