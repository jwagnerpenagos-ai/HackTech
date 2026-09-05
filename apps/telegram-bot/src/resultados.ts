import type { ResultadoEjecucion } from "./n8nClient.js";

/**
 * Traduce lo que devuelve `core-api` (vía n8n) a un mensaje en español para
 * el chat. Puro y testeable sin red, igual que `commands.ts`/`conversation.ts`.
 * La forma de `datos` en cada caso coincide con lo que arma
 * `services/core-api/src/comandos.ts` para esa misma intención.
 */

interface Cita {
  reservaId?: number;
  iniciaEn?: string;
  sede?: string | null;
  servicio?: string | null;
  paciente?: string | null;
  estado?: string;
}

interface Slot {
  inicio?: string;
}

interface Candidato {
  nombreCompleto?: string;
  telefono?: string | null;
}

interface ServicioConTarifa {
  nombre?: string;
  duracionMinMinutos?: number;
  precio?: number | null;
  moneda?: string | null;
}

/** "2026-09-05T15:00:00-05:00" -> "05/09 15:00". Sin librería de fechas: el formato ya viene fijo en offset -05:00. */
function fechaCorta(iso: string | undefined): string {
  if (typeof iso !== "string" || iso.length < 16) return iso ?? "";
  const [fecha, hora] = [iso.slice(0, 10), iso.slice(11, 16)];
  const [, mes, dia] = fecha.split("-");
  return `${dia ?? "?"}/${mes ?? "?"}${hora ? " " + hora : ""}`;
}

function listaOVacio<T>(items: T[] | undefined, aTexto: (item: T) => string, vacio: string): string {
  if (!items || items.length === 0) return vacio;
  return items.map((i) => `• ${aTexto(i)}`).join("\n");
}

/** `datos` viene de un JSON externo (n8n/core-api): solo se estringifican valores que ya son string o number. */
function campoTexto(valor: unknown, defecto: string): string {
  return typeof valor === "string" || typeof valor === "number" ? String(valor) : defecto;
}

/** "80000" -> "$80.000 COP". Sin librería de moneda: el formato es siempre COP con separador de miles. */
function precioTexto(precio: number | null | undefined, moneda: string | null | undefined): string {
  if (precio === null || precio === undefined) return "precio a consultar";
  return `$${precio.toLocaleString("es-CO")} ${moneda ?? "COP"}`;
}

function formatearExito(intencion: string, datos: unknown): string {
  const d = (datos ?? {}) as Record<string, unknown>;
  switch (intencion) {
    case "consultar_catalogo": {
      const servicios = d["servicios"] as ServicioConTarifa[] | undefined;
      return listaOVacio(
        servicios,
        (s) => `${s.nombre ?? "?"} (${s.duracionMinMinutos ?? "?"} min) — ${precioTexto(s.precio, s.moneda)}`,
        "No hay servicios para mostrar.",
      );
    }

    case "crear_sesion":
      return `Cita creada. Número de reserva: ${campoTexto(d["reservaId"], "?")}.`;

    case "modificar_sesion":
      return `Cita reprogramada. Nuevo número de reserva: ${campoTexto(d["reservaId"], "?")}.`;

    case "cancelar_sesion":
      return `Cita cancelada (estado: ${campoTexto(d["estado"], "cancelada")}).`;

    case "bloquear_horario":
      return `Horario bloqueado (reserva #${campoTexto(d["reservaId"], "?")}).`;

    case "consultar_agenda": {
      const citas = d["citas"] as Cita[] | undefined;
      return listaOVacio(
        citas,
        (c) =>
          `${fechaCorta(c.iniciaEn)} — ${c.paciente ?? "sin paciente"} · ${c.servicio ?? "sin servicio"} (${c.estado ?? "?"})`,
        "No hay citas en ese rango.",
      );
    }

    case "consultar_disponibilidad": {
      const slots = d["slots"] as Slot[] | undefined;
      return listaOVacio(slots, (s) => fechaCorta(s.inicio), "No hay horarios disponibles ese día.");
    }

    case "buscar_cliente": {
      const candidatos = d["candidatos"] as Candidato[] | undefined;
      return listaOVacio(
        candidatos,
        (c) => `${c.nombreCompleto ?? "?"}${c.telefono ? ` (${c.telefono})` : ""}`,
        "No encontré ningún paciente con ese nombre.",
      );
    }

    case "enviar_correo":
      return "Correo puesto en cola de envío.";

    case "crear_carpeta":
      return "Carpeta puesta en cola de creación.";

    default:
      return "Listo.";
  }
}

function formatearErrorNegocio(codigo: string, mensaje: string, datos: unknown): string {
  if (codigo === "cliente_ambiguo") {
    const candidatos = (datos as { candidatos?: Candidato[] } | undefined)?.candidatos;
    return `${mensaje}\n${listaOVacio(candidatos, (c) => c.nombreCompleto ?? "?", "")}`;
  }
  return mensaje;
}

export function formatearResultado(intencion: string, resultado: ResultadoEjecucion): string {
  switch (resultado.tipo) {
    case "ok":
      return formatearExito(intencion, resultado.datos);
    case "error_negocio":
      return formatearErrorNegocio(resultado.codigo, resultado.mensaje, resultado.datos);
    case "error_transporte":
      return "No pude completar la acción ahora mismo (falló la comunicación con el sistema de agenda). Probá de nuevo en un momento.";
  }
}
