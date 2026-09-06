import { horaCorta } from "../resultados.js";
import type { CitaCancelable, ServicioResumen, SlotPropuesto } from "../conversation.js";
import type { ResultadoEjecucion } from "../n8nClient.js";
import { etiquetaSlot } from "./formato.js";

/**
 * Extractores de forma sobre `resultado.datos` (JSON externo, tipo `unknown`).
 * Todos puros y defensivos: si la forma no calza, devuelven vacío/neutro en
 * vez de tirar. Es la frontera entre "lo que respondió core-api" y los tipos
 * internos del bot.
 */

function datosObjeto(resultado: ResultadoEjecucion): Record<string, unknown> | null {
  if (resultado.tipo !== "ok" || typeof resultado.datos !== "object" || resultado.datos === null) {
    return null;
  }
  return resultado.datos as Record<string, unknown>;
}

/** `resultado.datos.camposFaltantes` como `string[]`, o `null` si no vino bien. */
export function camposFaltantesDeRegistro(datos: unknown): string[] | null {
  if (typeof datos !== "object" || datos === null || !("camposFaltantes" in datos)) return null;
  const campos = datos.camposFaltantes;
  if (!Array.isArray(campos) || !campos.every((c) => typeof c === "string")) return null;
  return campos;
}

export interface DatosPago {
  reservaId?: number | undefined;
  compraId?: number | undefined;
  montoTotal?: number | undefined;
}

/** Extrae reservaId / compraId / montoTotal de la respuesta de `crear_sesion` / `modificar_sesion`. */
export function datosPago(datos: unknown): DatosPago {
  if (typeof datos !== "object" || datos === null) return {};
  const d = datos as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    return undefined;
  };
  return { reservaId: num(d["reservaId"]), compraId: num(d["compraId"]), montoTotal: num(d["montoTotal"]) };
}

/** `estado` (string) dentro de `resultado.datos`, o "" si no vino. */
export function estadoDeResultado(datos: unknown): string {
  if (typeof datos !== "object" || datos === null) return "";
  const e = (datos as { estado?: unknown }).estado;
  return typeof e === "string" ? e : "";
}

export function serviciosDeCatalogo(resultado: ResultadoEjecucion): ServicioResumen[] {
  const d = datosObjeto(resultado);
  const lista = d?.["servicios"];
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((s): ServicioResumen[] => {
    if (typeof s !== "object" || s === null || typeof (s as { nombre?: unknown }).nombre !== "string") return [];
    const o = s as Record<string, unknown>;
    return [
      {
        nombre: o["nombre"] as string,
        ...(typeof o["duracionMinMinutos"] === "number" ? { duracionMin: o["duracionMinMinutos"] } : {}),
        precio: typeof o["precio"] === "number" ? o["precio"] : null,
        moneda: typeof o["moneda"] === "string" ? o["moneda"] : null,
      },
    ];
  });
}

/** ¿core-api marcó este chat como paciente ya registrado? Por defecto sí (admin/web/forma inesperada). */
export function estaRegistrado(resultado: ResultadoEjecucion): boolean {
  const d = datosObjeto(resultado);
  if (d === null) return true;
  return d["registrado"] !== false;
}

export function disponibilidadDeResultado(resultado: ResultadoEjecucion): { sede: string; horas: string[] } {
  const d = datosObjeto(resultado);
  if (d === null) return { sede: "", horas: [] };
  const slots = Array.isArray(d["slots"]) ? (d["slots"] as unknown[]) : [];
  const horas = slots
    .map((s) => (typeof s === "object" && s !== null ? (s as { inicio?: unknown }).inicio : undefined))
    .filter((i): i is string => typeof i === "string")
    .map((iso) => horaCorta(iso));
  return { sede: typeof d["sede"] === "string" ? d["sede"] : "", horas: [...new Set(horas)] };
}

/** Modo "proximos" de consultar_disponibilidad: los próximos horarios en orden. */
export function proximosDeResultado(resultado: ResultadoEjecucion): SlotPropuesto[] {
  const d = datosObjeto(resultado);
  const slots = d?.["slots"];
  if (!Array.isArray(slots)) return [];
  return slots.flatMap((s): SlotPropuesto[] => {
    if (typeof s !== "object" || s === null) return [];
    const o = s as Record<string, unknown>;
    if (typeof o["inicio"] !== "string" || typeof o["fecha"] !== "string") return [];
    return [
      {
        fecha: o["fecha"],
        hora: horaCorta(o["inicio"]),
        sede: typeof o["sede"] === "string" ? o["sede"] : "",
        etiqueta: etiquetaSlot(o["inicio"]),
      },
    ];
  });
}

/** Estados de una cita que el paciente todavía puede cancelar. */
const ESTADOS_CANCELABLES = new Set(["pendiente_pago", "confirmada", "propuesta"]);

/** Extrae de `consultar_agenda` las citas del paciente que todavía se pueden cancelar. */
export function citasCancelablesDeResultado(resultado: ResultadoEjecucion): CitaCancelable[] {
  const d = datosObjeto(resultado);
  const citas = d?.["citas"];
  if (!Array.isArray(citas)) return [];
  return citas.flatMap((c): CitaCancelable[] => {
    if (typeof c !== "object" || c === null) return [];
    const o = c as Record<string, unknown>;
    const reservaId = typeof o["reservaId"] === "number" ? o["reservaId"] : Number(o["reservaId"]);
    const iniciaEn = typeof o["iniciaEn"] === "string" ? o["iniciaEn"] : "";
    const estado = typeof o["estado"] === "string" ? o["estado"] : "";
    if (!Number.isFinite(reservaId) || iniciaEn === "" || !ESTADOS_CANCELABLES.has(estado)) return [];
    if (new Date(iniciaEn).getTime() <= Date.now()) return [];
    const servicio = typeof o["servicio"] === "string" ? o["servicio"] : "Cita";
    return [{ reservaId, iniciaEn, estado, servicio, etiqueta: `${etiquetaSlot(iniciaEn)} · ${servicio}` }];
  });
}
