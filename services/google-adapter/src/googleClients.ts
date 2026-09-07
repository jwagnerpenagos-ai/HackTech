import { google } from "googleapis";
import type { Config } from "./config.js";

/**
 * Interfaces angostas (solo lo que este servicio usa) para que
 * `consumer.ts` no dependa de `googleapis` directamente y las pruebas
 * inyecten un cliente falso — mismo criterio que `Db` en `db.ts`.
 */
export interface GmailClient {
  enviarCorreo: (msg: { destinatario: string; asunto: string; texto: string }) => Promise<void>;
}

export interface EventoCalendar {
  resumen: string;
  descripcion?: string;
  inicioIso: string;
  finIso: string;
  zonaHoraria: string;
}

export interface CalendarClient {
  crearEvento: (calendarId: string, evento: EventoCalendar) => Promise<{ id: string }>;
  actualizarEvento: (calendarId: string, eventoId: string, evento: EventoCalendar) => Promise<void>;
  eliminarEvento: (calendarId: string, eventoId: string) => Promise<void>;
}

export interface SheetsClient {
  /** Agrega una fila al final de la hoja indicada (se crea la hoja, con encabezado, si no existe). Devuelve en qué fila quedó. */
  agregarFila: (spreadsheetId: string, hoja: string, valores: (string | number)[]) => Promise<{ fila: number }>;
  /** Sobrescribe una fila ya existente (por número), para reflejar un cambio de estado sin duplicar la cita. */
  actualizarFila: (spreadsheetId: string, hoja: string, fila: number, valores: (string | number)[]) => Promise<void>;
}

/** Construye el mensaje RFC 2822 mínimo y lo codifica en base64url, como pide la API de Gmail. */
function construirMimeBase64(msg: { destinatario: string; asunto: string; texto: string }): string {
  const mime = [
    `To: ${msg.destinatario}`,
    `Subject: =?UTF-8?B?${Buffer.from(msg.asunto, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    msg.texto,
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

function eventoAGoogle(evento: EventoCalendar): {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
} {
  return {
    summary: evento.resumen,
    ...(evento.descripcion !== undefined ? { description: evento.descripcion } : {}),
    start: { dateTime: evento.inicioIso, timeZone: evento.zonaHoraria },
    end: { dateTime: evento.finIso, timeZone: evento.zonaHoraria },
  };
}

/**
 * Un solo cliente OAuth2 por proceso, con el refresh token de la cuenta que
 * corresponda (Lina para el consumidor del outbox, un paciente para el
 * Calendar personal — fase 3). `googleapis` renueva el access token solo.
 */
export function construirOAuth2Client(
  cfg: Pick<Config, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_URI">,
  refreshToken: string,
): InstanceType<typeof google.auth.OAuth2> {
  const client = new google.auth.OAuth2(cfg.GOOGLE_CLIENT_ID, cfg.GOOGLE_CLIENT_SECRET, cfg.GOOGLE_REDIRECT_URI);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export function construirGmailClient(auth: InstanceType<typeof google.auth.OAuth2>): GmailClient {
  const gmail = google.gmail({ version: "v1", auth });
  return {
    async enviarCorreo(msg) {
      await gmail.users.messages.send({ userId: "me", requestBody: { raw: construirMimeBase64(msg) } });
    },
  };
}

const ESCOPES_PACIENTE = ["https://www.googleapis.com/auth/calendar.events"];

/**
 * Cliente OAuth2 "en blanco" (sin refresh token todavía) para el flujo de
 * consentimiento del paciente (fase 3): arma la URL de autorización y luego,
 * en el callback, intercambia el código por tokens. No se reutiliza entre
 * pacientes — cada autorización arma el suyo.
 */
export function construirOAuth2ClientBase(
  cfg: Pick<Config, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_URI">,
): InstanceType<typeof google.auth.OAuth2> {
  return new google.auth.OAuth2(cfg.GOOGLE_CLIENT_ID, cfg.GOOGLE_CLIENT_SECRET, cfg.GOOGLE_REDIRECT_URI);
}

export function generarUrlAutorizacionPaciente(
  client: InstanceType<typeof google.auth.OAuth2>,
  state: string,
): string {
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // fuerza reemitir refresh_token aunque el paciente ya hubiera autorizado antes.
    scope: ESCOPES_PACIENTE,
    state,
  });
}

export interface TokensIntercambiados {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiraEn: Date | null;
}

/** Intercambia el `code` del redirect por tokens y deja el cliente listo (con credenciales) para usarlo de una. */
export async function intercambiarCodigo(
  client: InstanceType<typeof google.auth.OAuth2>,
  code: string,
): Promise<TokensIntercambiados> {
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google no devolvió access_token al intercambiar el código.");
  client.setCredentials(tokens);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    scope: tokens.scope ?? "",
    expiraEn: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

const ENCABEZADO_RESERVAS = ["Fecha", "Paciente", "Servicio", "Sede", "Estado"];

export function construirSheetsClient(auth: InstanceType<typeof google.auth.OAuth2>): SheetsClient {
  const sheets = google.sheets({ version: "v4", auth });
  const hojasCreadas = new Set<string>();

  async function asegurarHoja(spreadsheetId: string, hoja: string): Promise<void> {
    const clave = `${spreadsheetId}:${hoja}`;
    if (hojasCreadas.has(clave)) return;
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existe = (meta.data.sheets ?? []).some((s) => s.properties?.title === hoja);
    if (!existe) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: hoja } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${hoja}!A1:E1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [ENCABEZADO_RESERVAS] },
      });
    }
    hojasCreadas.add(clave);
  }

  /** Extrae el número de fila de un `updatedRange` tipo "Reservas!A5:E5". */
  function filaDeRango(rango: string | null | undefined): number {
    const m = /![A-Z]+(\d+)/.exec(rango ?? "");
    if (!m || !m[1]) throw new Error(`No pude interpretar la fila desde el rango devuelto por Sheets: "${String(rango)}".`);
    return Number(m[1]);
  }

  return {
    async agregarFila(spreadsheetId, hoja, valores) {
      await asegurarHoja(spreadsheetId, hoja);
      const r = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${hoja}!A:E`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [valores] },
      });
      return { fila: filaDeRango(r.data.updates?.updatedRange) };
    },
    async actualizarFila(spreadsheetId, hoja, fila, valores) {
      await asegurarHoja(spreadsheetId, hoja);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${hoja}!A${fila}:E${fila}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [valores] },
      });
    },
  };
}

export function construirCalendarClient(auth: InstanceType<typeof google.auth.OAuth2>): CalendarClient {
  const calendar = google.calendar({ version: "v3", auth });
  return {
    async crearEvento(calendarId, evento) {
      const r = await calendar.events.insert({ calendarId, requestBody: eventoAGoogle(evento) });
      const id = r.data.id;
      if (!id) throw new Error("Google Calendar no devolvió id de evento al crearlo.");
      return { id };
    },
    async actualizarEvento(calendarId, eventoId, evento) {
      await calendar.events.update({ calendarId, eventId: eventoId, requestBody: eventoAGoogle(evento) });
    },
    async eliminarEvento(calendarId, eventoId) {
      try {
        await calendar.events.delete({ calendarId, eventId: eventoId });
      } catch (err) {
        // Ya borrado del lado de Google (404): no es un error real para nosotros.
        const status = (err as { code?: number; response?: { status?: number } }).code ??
          (err as { response?: { status?: number } }).response?.status;
        if (status !== 404 && status !== 410) throw err;
      }
    },
  };
}
