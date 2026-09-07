import type { Config } from "./config.js";
import { INTENCIONES_RESTRINGIDAS } from "./auth.js";
import { esSensible } from "./sensitive.js";
import { interpretar, type IntencionNlu, type ResultadoNlu } from "./nluClient.js";
import { sanearMensaje } from "./sanitize.js";
import { noAutorizado } from "./commands.js";

/** Un servicio del catálogo, cacheado durante el flujo guiado de reserva. */
export interface ServicioResumen {
  nombre: string;
  duracionMin?: number;
  precio?: number | null;
  moneda?: string | null;
  /** false = no se reserva por el bot (planes grupales/convenios). Ausente = sí. */
  reservable?: boolean;
}

/**
 * Flujo guiado de "pedir una cita" con botones: servicio -> fecha -> hora ->
 * confirmar. Vive en la sesión mientras el paciente lo recorre. Distinto del
 * bucle de `faltantes` (texto): este lo maneja bot.ts con callbacks `rsv:*`.
 */
/** Un horario propuesto en la lista de "próximos disponibles". */
export interface SlotPropuesto {
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM (Bogotá)
  sede: string;
  etiqueta: string; // "mié 10/09 · 14:00"
}

export interface ReservaFlujo {
  // "slot": eligiendo de la lista de próximos; "fecha": escribió "otro día";
  // "hora": eligiendo de los horarios de un día concreto; "confirmar": resumen.
  paso: "servicio" | "slot" | "fecha" | "hora" | "confirmar";
  servicios: ServicioResumen[];
  servicio?: string;
  proximos?: SlotPropuesto[];
  fecha?: string; // YYYY-MM-DD
  hora?: string; // HH:MM (Bogotá)
  sede?: string; // se muestra; core-api la deriva de la fecha
  // Si está definido, este flujo NO crea una cita nueva: reprograma la cita
  // con este id (viene del flujo de cancelar). bot.ts llama `modificar_sesion`
  // en vez de `crear_sesion` y, si ya estaba pagada, no vuelve a pedir pago.
  reprogramarDe?: number;
}

/** Estado conversacional que se guarda por chat mientras faltan datos. */
export interface EstadoConversacion {
  intencion: string | null;
  entidades: Record<string, string | number>;
  faltantes: string[];
  esperandoConfirmacion: boolean;
  /**
   * Tras un `crear_sesion` exitoso hecho por el propio paciente (fase 3), se
   * le pregunta si quiere sincronizar con su Google Calendar personal —
   * opcional, nunca bloquea la reserva ya confirmada. Sí/no se resuelve con
   * `resolverOfertaCalendar`, igual patrón que `esperandoConfirmacion`.
   */
  ofertaCalendarPendiente: { reservaId: number; pacienteId: number } | null;
  /** Flujo guiado de reserva en curso, si lo hay. Lo maneja bot.ts. */
  reservaFlujo: ReservaFlujo | null;
  /**
   * Tras reservar, el bot espera la foto del comprobante de pago para esta
   * cita. `monto` es lo que debe transferir; `compraId` la compra que se
   * marca pagada al verificar. Lo maneja bot.ts (handler de fotos).
   */
  esperandoComprobante: { reservaId: number; compraId: number; monto: number } | null;
  /** Flujo guiado de "cancelar una cita" (botones). Lo maneja bot.ts (callbacks `cxl:*`). */
  cancelarFlujo: {
    paso: "elegir" | "confirmar";
    citas: CitaCancelable[];
    elegida?: CitaCancelable;
  } | null;
}

export interface CitaCancelable {
  reservaId: number;
  etiqueta: string;
  iniciaEn: string; // ISO
  estado: string;
  servicio: string;
}

export function estadoInicial(): EstadoConversacion {
  return {
    intencion: null,
    entidades: {},
    faltantes: [],
    esperandoConfirmacion: false,
    ofertaCalendarPendiente: null,
    reservaFlujo: null,
    esperandoComprobante: null,
    cancelarFlujo: null,
  };
}

function entidadesTexto(e: Record<string, unknown>): Record<string, string | number> {
  const pares = Object.entries(e).filter(
    (par): par is [string, string | number] =>
      (typeof par[1] === "string" && par[1].length > 0) ||
      (typeof par[1] === "number" && Number.isFinite(par[1])),
  );
  return Object.fromEntries(pares);
}

export type Accion =
  | { tipo: "responder"; texto: string }
  | { tipo: "pedir_dato"; texto: string }
  | { tipo: "pedir_confirmacion"; texto: string; intencion: string }
  | { tipo: "ejecutar"; texto: string; intencion: string; entidades: Record<string, string | number> }
  // El usuario preguntó algo de solo lectura (catálogo, agenda, disponibilidad)
  // en medio de un flujo de datos: bot.ts resuelve la consulta, muestra el
  // resultado y luego responde `rePrompt` para retomar el dato que faltaba.
  | {
      tipo: "consulta_y_retomar";
      intencion: string;
      entidades: Record<string, string | number>;
      rePrompt: string;
    }
  // Un paciente (no admin) quiere agendar: bot.ts arranca el flujo guiado con
  // botones (servicio -> fecha -> hora -> confirmar) en vez del bucle de texto.
  // `entidades` trae lo que el NLU ya sacó (p. ej. el servicio), para no
  // volver a pedirlo.
  | { tipo: "iniciar_reserva_guiada"; entidades: Record<string, string | number> }
  // Un paciente quiere cancelar una cita: bot.ts arranca el flujo guiado
  // (lista sus citas -> elige -> confirma).
  | { tipo: "iniciar_cancelar_guiado" };

export interface Procesado {
  estado: EstadoConversacion;
  accion: Accion;
}

/**
 * Texto plano de una `Accion` para responder al usuario. Las acciones que
 * arrancan un flujo guiado o resuelven una consulta no tienen texto propio
 * (lo produce el módulo del flujo), por eso devuelven `""` / el `rePrompt`.
 */
export function textoDeAccion(accion: Accion): string {
  if (accion.tipo === "consulta_y_retomar") return accion.rePrompt;
  if (accion.tipo === "iniciar_reserva_guiada" || accion.tipo === "iniciar_cancelar_guiado") return "";
  return accion.texto;
}

const ETIQUETA_DATO = new Map<string, string>([
  ["cliente", "el nombre del paciente"],
  ["servicio", "el servicio"],
  ["sede", "la sede"],
  ["fecha", "la fecha (por ejemplo, 2026-09-15)"],
  ["hora", "la hora (por ejemplo, 15:00)"],
  ["sesion_id", "el número de la cita"],
  ["destinatario", "el destinatario"],
  ["asunto", "el asunto"],
  ["texto", "el contenido"],
  ["carpeta", "el nombre de la carpeta"],
  ["consulta", "qué desea buscar"],
  ["telefono", "su número de teléfono"],
  ["email", "su correo"],
]);

function resumen(intencion: string, entidades: Record<string, string | number>): string {
  const partes = Object.entries(entidades).map(([k, v]) => `${k}: ${String(v)}`);
  return partes.length > 0 ? `${intencion} — ${partes.join(", ")}` : intencion;
}

function textoPedirDato(slot: string): string {
  const etiqueta = ETIQUETA_DATO.get(slot) ?? slot;
  return `Para continuar necesito ${etiqueta}.`;
}

const PALABRAS_PREGUNTA =
  /(^|\s)(qu[eé]|cu[aá]l(es)?|cu[aá]nto?s?|c[oó]mo|d[oó]nde|cu[aá]ndo|qui[eé]n|hay|tienen|ten[eé]s|ofrecen|ofreces|puedo|pod[eé]s|podr[ií]a|sirve|explic|cu[eé]nt|cont[aá]|mostr|dec[ií]|dime)/i;

/**
 * Heurística barata para decidir, cuando estamos rellenando un dato, si el
 * mensaje es la respuesta al dato (corto y sin forma de pregunta) o es otra
 * cosa (una pregunta, un cambio de tema) que conviene reinterpretar con el NLU.
 */
export function pareceValorDirecto(texto: string): boolean {
  const t = texto.trim();
  if (t.includes("?") || t.includes("¿")) return false;
  if (PALABRAS_PREGUNTA.test(t)) return false;
  return t.split(/\s+/).filter(Boolean).length <= 6;
}

/** Intenciones de solo lectura que se pueden resolver "de paso" sin abandonar un flujo. */
const SOLO_LECTURA = new Set(["consultar_catalogo", "consultar_agenda", "consultar_disponibilidad"]);

/** Confianza mínima para que una intención nueva interrumpa un flujo en curso. */
const UMBRAL_CAMBIO_TEMA = 0.8;

function armarDesdeIntencion(intn: IntencionNlu): EstadoConversacion {
  return {
    intencion: intn.intencion,
    entidades: entidadesTexto(intn.entidades),
    faltantes: [...intn.faltantes],
    esperandoConfirmacion: false,
    ofertaCalendarPendiente: null,
    reservaFlujo: null,
    esperandoComprobante: null,
    cancelarFlujo: null,
  };
}

function siguientePaso(estado: EstadoConversacion): Procesado {
  const primeroFaltante = estado.faltantes[0];
  if (primeroFaltante !== undefined) {
    return {
      estado,
      accion: { tipo: "pedir_dato", texto: textoPedirDato(primeroFaltante) },
    };
  }
  const intencion = estado.intencion ?? "desconocida";
  if (esSensible(intencion)) {
    return {
      estado: { ...estado, esperandoConfirmacion: true },
      accion: {
        tipo: "pedir_confirmacion",
        intencion,
        texto: `Va a: ${resumen(intencion, estado.entidades)}.\n¿Confirma? (sí / no)`,
      },
    };
  }
  return {
    estado: estadoInicial(),
    accion: {
      tipo: "ejecutar",
      intencion,
      entidades: estado.entidades,
      texto: `Ejecutando: ${resumen(intencion, estado.entidades)}\n(pendiente conectar la API núcleo)`,
    },
  };
}

/**
 * Núcleo del manejo de texto libre, sin dependencias de grammY para poder
 * probarlo aislado. `nlu` se inyecta en las pruebas. `autorizado` decide si
 * ESTE chat puede ejecutar una intención administrativa
 * (`INTENCIONES_RESTRINGIDAS`); por defecto `true` para no romper llamadas
 * existentes (pruebas, y cualquier canal sin ese concepto) — `bot.ts` sí lo
 * pasa siempre explícito, calculado con `esAutorizado(cfg, chatId)`.
 */
export async function procesarTexto(
  cfg: Config,
  estadoPrevio: EstadoConversacion,
  entrada: string,
  nlu: (cfg: Config, mensaje: string) => Promise<ResultadoNlu> = interpretar,
  autorizado = true,
): Promise<Procesado> {
  const { texto } = sanearMensaje(entrada);
  if (texto.length === 0) {
    return { estado: estadoPrevio, accion: { tipo: "responder", texto: "No recibí ningún texto." } };
  }

  // Si veníamos rellenando datos, este mensaje suele ser el valor del primer
  // faltante — pero puede ser una pregunta o un cambio de tema. Ver
  // `manejarMensajeEnFlujo`.
  if (estadoPrevio.intencion !== null && estadoPrevio.faltantes.length > 0) {
    return manejarMensajeEnFlujo(cfg, estadoPrevio, texto, nlu, autorizado);
  }

  // Mensaje nuevo: se interpreta con el NLU.
  const r = await nlu(cfg, texto);
  if (!r.ok) {
    return {
      estado: estadoPrevio,
      accion: {
        tipo: "responder",
        texto: "No pude procesar su mensaje en este momento. Intente de nuevo o use /help.",
      },
    };
  }

  return manejarIntencionNueva(cfg, r.intencion, autorizado);
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Llena el primer faltante con `valor` y avanza el flujo. */
function llenarFaltante(estado: EstadoConversacion, valor: string): Procesado {
  const [slot, ...resto] = estado.faltantes;
  if (slot === "email" && !RE_EMAIL.test(valor.trim())) {
    return {
      estado,
      accion: { tipo: "pedir_dato", texto: "Ese correo no parece válido. Escríbalo así: nombre@correo.com" },
    };
  }
  return siguientePaso({
    ...estado,
    entidades: { ...estado.entidades, ...(slot !== undefined ? { [slot]: valor.trim() } : {}) },
    faltantes: resto,
  });
}

/**
 * Mensaje recibido mientras se rellenan datos de un flujo (p. ej. `crear_sesion`
 * pidiendo servicio/fecha/hora). Si parece un valor, lo usa como respuesta al
 * dato. Si parece una pregunta o un cambio de tema, lo reinterpreta:
 *  - charla / info → responde y retoma el mismo dato.
 *  - consulta de solo lectura → la resuelve "de paso" y retoma (bot.ts).
 *  - otra acción con confianza alta → abandona el flujo y atiende lo nuevo.
 *  - nada claro → lo toma igual como valor del dato.
 */
async function manejarMensajeEnFlujo(
  cfg: Config,
  estadoPrevio: EstadoConversacion,
  texto: string,
  nlu: (cfg: Config, mensaje: string) => Promise<ResultadoNlu>,
  autorizado: boolean,
): Promise<Procesado> {
  const slot = estadoPrevio.faltantes[0];

  if (pareceValorDirecto(texto)) return llenarFaltante(estadoPrevio, texto);

  const r = await nlu(cfg, texto);
  if (r.ok) {
    const otra = r.intencion;
    const rePrompt = slot !== undefined ? `Sigamos con su cita. ${textoPedirDato(slot)}` : "";

    if (otra.intencion === "charla_general") {
      const resp = otra.respuesta?.trim();
      const cuerpo = resp !== undefined && resp.length > 0 ? resp : "Con gusto.";
      return {
        estado: estadoPrevio,
        accion: { tipo: "responder", texto: rePrompt.length > 0 ? `${cuerpo}\n\n${rePrompt}` : cuerpo },
      };
    }

    if (SOLO_LECTURA.has(otra.intencion) && otra.confianza >= cfg.BOT_CONFIANZA_MINIMA) {
      return {
        estado: estadoPrevio,
        accion: {
          tipo: "consulta_y_retomar",
          intencion: otra.intencion,
          entidades: entidadesTexto(otra.entidades),
          rePrompt,
        },
      };
    }

    if (
      otra.intencion !== "desconocida" &&
      otra.intencion !== estadoPrevio.intencion &&
      otra.confianza >= UMBRAL_CAMBIO_TEMA
    ) {
      return manejarIntencionNueva(cfg, otra, autorizado);
    }
  }

  // No se pudo reinterpretar o no era nada claro: se toma como valor del dato.
  return llenarFaltante(estadoPrevio, texto);
}

/**
 * Rutea una intención recién interpretada por el NLU (mensaje nuevo o cambio
 * de tema): charla, allowlist admin, umbral de confianza, o arranque de flujo.
 */
function manejarIntencionNueva(cfg: Config, intn: IntencionNlu, autorizado: boolean): Procesado {
  if (intn.intencion === "desconocida") {
    return {
      estado: estadoInicial(),
      accion: { tipo: "responder", texto: "No entendí su solicitud. Escriba /help para ver qué puedo hacer." },
    };
  }

  // Saludo, "¿quién sos?", preguntas generales del consultorio: se responde
  // directo con lo que armó el NLU (grounded en services/nlu/conocimiento/),
  // sin pasar por la allowlist admin ni el umbral de confianza — nunca llega a
  // n8n/core-api, es puro texto informativo.
  if (intn.intencion === "charla_general") {
    const respuesta = intn.respuesta?.trim();
    return {
      estado: estadoInicial(),
      accion: {
        tipo: "responder",
        texto:
          respuesta !== undefined && respuesta.length > 0
            ? respuesta
            : "Hola. ¿En qué le puedo ayudar?",
      },
    };
  }

  if (INTENCIONES_RESTRINGIDAS.has(intn.intencion) && !autorizado) {
    return {
      estado: estadoInicial(),
      accion: { tipo: "responder", texto: noAutorizado() },
    };
  }

  if (intn.confianza < cfg.BOT_CONFIANZA_MINIMA) {
    return {
      estado: estadoInicial(),
      accion: {
        tipo: "responder",
        texto: "No entendí bien. ¿Puede decirlo de otra forma? Con /help ve lo que puedo hacer.",
      },
    };
  }

  // Un paciente que quiere agendar entra al flujo guiado con botones. El staff
  // (autorizado) sigue con el bucle de texto, más rápido cuando agenda por otro.
  if (intn.intencion === "crear_sesion" && !autorizado) {
    return {
      estado: estadoInicial(),
      accion: { tipo: "iniciar_reserva_guiada", entidades: entidadesTexto(intn.entidades) },
    };
  }

  // Un paciente que quiere cancelar o reprogramar: flujo guiado (elige de SUS
  // citas; al confirmar una, se le ofrece "pasar a otro día"). El staff sigue
  // con el texto ("cancela la cita 5" / "mueve la cita 5 al viernes").
  if (
    (intn.intencion === "cancelar_sesion" || intn.intencion === "modificar_sesion") &&
    !autorizado
  ) {
    return { estado: estadoInicial(), accion: { tipo: "iniciar_cancelar_guiado" } };
  }

  return siguientePaso(armarDesdeIntencion(intn));
}

/** Arranca el flujo de texto de "quiero agendar" (staff / canales sin botones). */
export function iniciarAgendamiento(): Procesado {
  return siguientePaso({
    intencion: "crear_sesion",
    entidades: {},
    faltantes: ["servicio", "fecha", "hora"],
    esperandoConfirmacion: false,
    ofertaCalendarPendiente: null,
    reservaFlujo: null,
    esperandoComprobante: null,
    cancelarFlujo: null,
  });
}

/**
 * `crear_sesion` puede volver de core-api con `registro_requerido`: el chat
 * es primera cita y faltan datos de registro (nombre/teléfono). En vez de
 * un mensaje final, esto reentra al mismo bucle de "pedir_dato" que ya
 * maneja `procesarTexto`, para completar esos campos y reintentar.
 */
export function pedirDatosDeRegistro(
  entidadesActuales: Record<string, string | number>,
  camposFaltantes: string[],
): Procesado {
  return siguientePaso({
    intencion: "crear_sesion",
    entidades: entidadesActuales,
    faltantes: camposFaltantes,
    esperandoConfirmacion: false,
    ofertaCalendarPendiente: null,
    reservaFlujo: null,
    esperandoComprobante: null,
    cancelarFlujo: null,
  });
}

/** Resolución de la confirmación pendiente. */
export function resolverConfirmacion(
  estado: EstadoConversacion,
  respuesta: "si" | "no",
): Procesado {
  if (!estado.esperandoConfirmacion || estado.intencion === null) {
    return {
      estado: estadoInicial(),
      accion: { tipo: "responder", texto: "No hay nada pendiente de confirmar." },
    };
  }
  if (respuesta === "no") {
    return {
      estado: estadoInicial(),
      accion: { tipo: "responder", texto: "Cancelado. No se hizo ningún cambio." },
    };
  }
  return {
    estado: estadoInicial(),
    accion: {
      tipo: "ejecutar",
      intencion: estado.intencion,
      entidades: estado.entidades,
      texto: `Confirmado: ${resumen(estado.intencion, estado.entidades)}\n(pendiente conectar la API núcleo)`,
    },
  };
}

export type ResultadoOfertaCalendar =
  | { estado: EstadoConversacion; tipo: "sin_pendiente" | "declinado" }
  | { estado: EstadoConversacion; tipo: "aceptado"; reservaId: number; pacienteId: number };

/** Resolución del sí/no de "¿agrego la cita a tu Google Calendar?" (fase 3, opcional). */
export function resolverOfertaCalendar(
  estado: EstadoConversacion,
  respuesta: "si" | "no",
): ResultadoOfertaCalendar {
  const oferta = estado.ofertaCalendarPendiente;
  if (!oferta) return { estado: estadoInicial(), tipo: "sin_pendiente" };
  if (respuesta === "no") return { estado: estadoInicial(), tipo: "declinado" };
  return { estado: estadoInicial(), tipo: "aceptado", reservaId: oferta.reservaId, pacienteId: oferta.pacienteId };
}

// ---------------------------------------------------------------------------
// Flujo guiado de reserva (botones). Helpers puros; bot.ts hace la red.
// ---------------------------------------------------------------------------

function duracionTexto(min: number | undefined): string {
  if (min === undefined || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const partes = [h > 0 ? `${h} h` : "", m > 0 ? `${m} min` : ""].filter(Boolean);
  return partes.join(" ");
}

function precioTexto(precio: number | null | undefined, moneda: string | null | undefined): string {
  if (precio === null || precio === undefined) return "precio a consultar";
  return `$${precio.toLocaleString("es-CO")} ${moneda ?? "COP"}`;
}

/** Etiqueta de un servicio para el mensaje ("Punción seca · 1 h · $120.000 COP"). */
export function etiquetaServicio(s: ServicioResumen): string {
  return [s.nombre, duracionTexto(s.duracionMin), precioTexto(s.precio, s.moneda)]
    .filter((p) => p.length > 0)
    .join(" · ");
}

/** Empareja el texto del NLU ("sueroterapia") con un servicio del catálogo. */
export function emparejarServicio(servicios: ServicioResumen[], texto: string): ServicioResumen | null {
  const t = texto.trim().toLowerCase();
  if (t.length < 3) return null;
  return (
    servicios.find((s) => s.nombre.toLowerCase() === t) ??
    servicios.find((s) => s.nombre.toLowerCase().includes(t) || t.includes(s.nombre.toLowerCase())) ??
    null
  );
}

const MESES = new Map<string, number>([
  ["enero", 1], ["febrero", 2], ["marzo", 3], ["abril", 4], ["mayo", 5], ["junio", 6],
  ["julio", 7], ["agosto", 8], ["septiembre", 9], ["setiembre", 9], ["octubre", 10],
  ["noviembre", 11], ["diciembre", 12],
]);

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Construye AAAA-MM-DD validando el rango; si no se dio año y ya pasó, usa el próximo. */
function normalizarFecha(y: number, m: number, d: number, hoy: string, tieneAño: boolean): string | null {
  if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const anio = y < 100 ? y + 2000 : y;
  const s = ymd(anio, m, d);
  return !tieneAño && s < hoy ? ymd(anio + 1, m, d) : s;
}

const DIAS_SEMANA = new Map<string, number>([
  ["domingo", 0], ["lunes", 1], ["martes", 2], ["miercoles", 3], ["miércoles", 3],
  ["jueves", 4], ["viernes", 5], ["sabado", 6], ["sábado", 6],
]);

function detectarDiaSemana(t: string): { dow: number; semanaQueViene: boolean } | null {
  const palabras = new Set(t.split(/[^a-záéíóú]+/i).filter((s) => s.length > 0));
  for (const [nombre, dow] of DIAS_SEMANA) {
    if (palabras.has(nombre)) {
      return { dow, semanaQueViene: /viene|pr[oó]xim|siguiente|entrante/.test(t) };
    }
  }
  return null;
}

/**
 * Parsea una fecha escrita por el paciente sin llamar al NLU, tolerando frases:
 * `AAAA-MM-DD`, `D/M[/AAAA]` (o con `-`/`.`), `D de mes [de AAAA]`,
 * "hoy" / "mañana" / "pasado mañana", y días de la semana ("el viernes",
 * "este sábado", "el lunes que viene"). Devuelve `AAAA-MM-DD` o null.
 */
export function parsearFechaSimple(texto: string, hoy: string): string | null {
  const t = texto.trim().toLowerCase();
  const base = new Date(`${hoy}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;

  const desplazar = (dias: number): string => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + dias);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  };

  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return normalizarFecha(Number(iso[1]), Number(iso[2]), Number(iso[3]), hoy, true);

  // eslint-disable-next-line security/detect-unsafe-regex -- cuantificadores acotados; el grupo de año es opcional pero fijo
  const dmy = /(?<!\d)(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?!\d)/.exec(t);
  if (dmy) {
    const tieneAño = dmy[3] !== undefined;
    const y = tieneAño ? Number(dmy[3]) : base.getUTCFullYear();
    return normalizarFecha(y, Number(dmy[2]), Number(dmy[1]), hoy, tieneAño);
  }

  // eslint-disable-next-line security/detect-unsafe-regex -- cuantificadores acotados; el grupo de año es opcional pero fijo
  const dDeMes = /(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/.exec(t);
  if (dDeMes) {
    const m = MESES.get(dDeMes[2] ?? "");
    if (m !== undefined) {
      const tieneAño = dDeMes[3] !== undefined;
      const y = tieneAño ? Number(dDeMes[3]) : base.getUTCFullYear();
      return normalizarFecha(y, m, Number(dDeMes[1]), hoy, tieneAño);
    }
  }

  if (/pasado\s+ma[ñn]ana/.test(t)) return desplazar(2);
  if (/\bma[ñn]ana\b/.test(t)) return desplazar(1);
  if (/\b(hoy|ahora)\b|cuanto antes|lo antes posible/.test(t)) return hoy;

  const dia = detectarDiaSemana(t);
  if (dia) {
    let delta = (dia.dow - base.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7; // "el viernes" cuando hoy es viernes = el próximo
    if (dia.semanaQueViene) delta += 7;
    return desplazar(delta);
  }

  return null;
}
