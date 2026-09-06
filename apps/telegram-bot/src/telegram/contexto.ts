import type { Context, SessionFlavor } from "grammy";
import type { Config } from "../config.js";
import type { EstadoConversacion } from "../conversation.js";
import type { ResultadoEjecucion } from "../n8nClient.js";
import type { ResultadoNlu } from "../nluClient.js";
import type { ClienteCoreApi } from "../coreApiClient.js";

/** Contexto de grammY con la sesión conversacional del bot. */
export type MiContexto = Context & SessionFlavor<EstadoConversacion>;

/** Ejecuta una intención vía n8n (que la reenvía a core-api). Inyectable en pruebas. */
export type ClienteN8n = (
  cfg: Config,
  intencion: string,
  entidades: Record<string, string | number>,
  creadoPor: string,
) => Promise<ResultadoEjecucion>;

export type ClienteNlu = (cfg: Config, mensaje: string) => Promise<ResultadoNlu>;

/**
 * Dependencias ya resueltas que cada módulo de flujo recibe al registrarse.
 * `crearBot` arma este objeto una vez (con los defaults o los mocks de prueba)
 * y se lo pasa a `registrarFlujoReserva`, `registrarMenu`, etc.
 */
export interface FlujoDeps {
  cfg: Config;
  n8n: ClienteN8n;
  nlu: ClienteNlu;
  cApi: ClienteCoreApi;
}
