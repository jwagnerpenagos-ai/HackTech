import type { NivelAcceso } from "./auth.js";

/**
 * Comandos estructurados. Son funciones puras que devuelven texto: funcionan
 * aunque el servicio NLU esté caído.
 */

export const AYUDA = [
  "Comandos:",
  "/start — inicia",
  "/help — esta ayuda",
  "/id — muestra tu chat_id",
  "/ping — comprueba que el bot responde",
  "",
  "También podés simplemente saludar o preguntar cosas generales del",
  "consultorio (\"¿quién sos?\", políticas, qué esperar en la primera cita).",
  "",
  "Escribime en lenguaje natural, por ejemplo:",
  '  «hola» · «¿qué servicios tienen y a cómo?»  ·  «¿qué horarios hay para punción seca en Tunja el viernes?»',
  '  «quiero agendar una cita»  ·  «¿qué citas tengo?»',
  "",
  "Si es tu primera cita te voy a pedir tu nombre y tu teléfono; las",
  "próximas veces ya te reconozco. Las acciones administrativas (agenda",
  "completa, bloquear horario, etc.) piden confirmación y son solo para",
  "el staff del consultorio.",
].join("\n");

export function inicio(nivel: NivelAcceso): string {
  if (nivel === "autorizado") {
    return "Listo. Tenés acceso de administrador. Escribí lo que necesitás o usá /help.";
  }
  return [
    "¡Hola! Soy el asistente de La Fisioterapeuta Li.",
    "Puedo contarte sobre nuestros servicios y precios, y ayudarte a agendar una cita.",
    "Escribime lo que necesites, o usá /help para ver ejemplos.",
  ].join("\n");
}

export function miId(chatId: number | undefined): string {
  return chatId === undefined
    ? "No pude determinar tu chat_id."
    : `Tu chat_id es: ${chatId}`;
}

export const PONG = "pong";

export function noAutorizado(): string {
  return "Tu chat no está autorizado para esta acción. Usá /id y pedí acceso al administrador.";
}
