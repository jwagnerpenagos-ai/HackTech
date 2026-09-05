import type { NivelAcceso } from "./auth.js";

/**
 * Textos que ve el paciente. Funciones puras (sin grammY ni red): los botones
 * los arma bot.ts a partir de MENU_ACCIONES / INFO_ACCIONES.
 *
 * Registro: español de Colombia, trato de "usted". Sin tecnicismos ni
 * referencias a cómo funciona el bot por dentro.
 */

/** Botones del menú de /start. `data` = callback_data que maneja bot.ts. */
export const MENU_ACCIONES = [
  { texto: "Servicios y precios", data: "menu:catalogo" },
  { texto: "Pedir una cita", data: "menu:agendar" },
  { texto: "Mis citas", data: "menu:agenda" },
  { texto: "Información", data: "menu:info" },
] as const;

/** Submenú del botón "Información". */
export const INFO_ACCIONES = [
  { texto: "Horarios y sedes", data: "info:horarios" },
  { texto: "Quiénes somos", data: "info:quienes" },
  { texto: "Pago y políticas", data: "info:pago" },
  { texto: "Antes de su cita", data: "info:cita" },
] as const;

export function inicio(nivel: NivelAcceso): string {
  const lineas = [
    "La Fisioterapeuta Li — Lina Murillo",
    "Fisioterapia en Tunja y Turmequé, Boyacá.",
    "",
    "Le puedo ayudar con:",
    "• Servicios, precios y paquetes",
    "• Horarios disponibles y reserva de citas",
    "• Sus citas programadas",
    "• Información del consultorio (horarios, sedes, pago)",
    "",
    "Escriba su consulta o use los botones.",
  ];
  if (nivel === "autorizado") {
    lineas.push("", "Usted tiene acceso de personal del consultorio.");
  }
  return lineas.join("\n");
}

export const AYUDA = [
  "Puedo ayudarle con:",
  "• Los servicios y sus precios",
  "• Los horarios disponibles para un servicio",
  "• Reservar una cita",
  "• Ver sus citas",
  "• Información del consultorio: horarios, sedes, pago y políticas",
  "",
  "Comandos:",
  "/start — inicio y menú",
  "/help — esta ayuda",
  "/cancelar — cancelar lo que estemos haciendo",
  "/id — ver su identificador de chat",
  "/ping — comprobar que respondo",
  "",
  "Si es su primera cita le pediré su nombre y su teléfono; después ya lo reconozco.",
].join("\n");

export const INFO_HORARIOS = [
  "Horarios y sedes",
  "",
  "Atención todos los días, de 7:00 a. m. a 8:00 p. m.",
  "Almuerzo: de 12:00 m. a 2:00 p. m.",
  "",
  "• Sede Tunja: de lunes a viernes.",
  "• Sede Turmequé: sábados y domingos.",
  "",
  "Para ver las horas libres de un servicio, pídame la disponibilidad e indique el servicio y el día.",
].join("\n");

export const INFO_QUIENES = [
  "Quiénes somos",
  "",
  "La Fisioterapeuta Li es el consultorio de Lina Murillo, fisioterapeuta de la",
  "Universidad de Boyacá, con Especialización y Maestría en Neurorrehabilitación",
  "en formación (Universidad Autónoma de Manizales).",
  "",
  "Enfoque: neurorrehabilitación y rehabilitación deportiva.",
  "Sedes en Tunja y Turmequé, Boyacá.",
  "",
  "Contacto directo: 311 398 1422 (teléfono y WhatsApp).",
].join("\n");

export const INFO_PAGO = [
  "Pago y políticas",
  "",
  "• Para confirmar una cita se requiere el pago anticipado del 100%.",
  "• Medios de pago: Nequi / Llave 311 398 1422 (Lina Murillo), o efectivo.",
  "• Cambios y cancelaciones: con mínimo 24 a 48 horas de anticipación. Fuera",
  "  de ese plazo, la cita se cobra completa.",
  "• Sus datos se usan solo para gestionar sus citas; no se comparten con",
  "  terceros.",
].join("\n");

export const INFO_CITA = [
  "Antes de su cita",
  "",
  "La primera cita es una valoración: se revisa su motivo de consulta, se hace",
  "una evaluación física y se define el plan de tratamiento.",
  "",
  "Qué llevar:",
  "• Ejercicio y rehabilitación: ropa cómoda o deportiva, calzado adecuado e",
  "  hidratación. Llegue de 5 a 10 minutos antes.",
  "• Descargas musculares: ropa cómoda que permita trabajar las distintas zonas.",
  "• Punción seca, terapia neural, PRP y sueroterapia: ropa holgada y",
  "  puntualidad estricta.",
].join("\n");

export function miId(chatId: number | undefined): string {
  return chatId === undefined
    ? "No pude identificar su chat."
    : `Su identificador de chat es: ${chatId}`;
}

export const PONG = "pong";

export const CANCELADO = "Listo, cancelé lo que estábamos haciendo. ¿En qué le ayudo?";

export function noAutorizado(): string {
  return "Su chat no tiene permiso para esta acción. Use /id y solicite acceso al consultorio.";
}
