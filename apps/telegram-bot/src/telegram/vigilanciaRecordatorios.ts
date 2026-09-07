import type { Bot } from "grammy";
import { logger } from "../logger.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";

type DepsVigilancia = Pick<FlujoDeps, "cfg" | "cApi">;

function fechaHoraBogota(iso: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  const h = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${f}, ${h}`;
}

/**
 * Indicaciones previas por tipo de servicio (contenido real de Lina, ver
 * services/nlu/conocimiento/primera-cita.md). Duplicado a propósito en
 * core-api y en el bot, igual que fechaHoraBogota en este mismo archivo.
 */
function indicacionesPara(servicio: string | null): string {
  const s = (servicio ?? "").toLowerCase();
  if (/punci[oó]n|neural|prp|plasma|suero/.test(s)) {
    return "Venga con ropa holgada y cómoda que dé acceso fácil a la zona a tratar, y le pedimos puntualidad estricta.";
  }
  if (/descarga|modulaci[oó]n/.test(s)) {
    return "Venga con ropa cómoda que permita trabajar la zona a tratar. Si gusta, traiga hidratación y una toalla, y llegue con un poco de anticipación.";
  }
  return "Venga con ropa cómoda o deportiva y calzado adecuado para ejercicio. Si gusta, traiga hidratación y una toalla, y por favor llegue de 5 a 10 minutos antes.";
}

/**
 * Recordatorio de cita 24h antes. Cada `intervaloMs` le pide a core-api que
 * reclame (inserte de forma atómica) las citas confirmadas que caen en esa
 * ventana y todavía no tienen recordatorio. Por cada una: si la paciente
 * tiene el chat de Telegram vinculado, el bot le escribe directo y reporta
 * el resultado; si no, le pide a core-api que encole el correo (mismo
 * mecanismo que el correo de "cita confirmada").
 */
export function iniciarVigilanciaRecordatorios(
  bot: Bot<MiContexto>,
  deps: DepsVigilancia,
  opts: { intervaloMs?: number } = {},
): () => void {
  const intervaloMs = opts.intervaloMs ?? 15 * 60_000;
  let corriendo = false;

  async function revisar(): Promise<void> {
    if (corriendo) return;
    corriendo = true;
    try {
      const r = await deps.cApi.recordatoriosReclamar(deps.cfg);
      if (!r.ok) return;

      for (const rec of r.datos.recordatorios) {
        const servicio = rec.servicio ?? "su cita";
        const cuando = fechaHoraBogota(rec.iniciaEn);
        const texto = [
          `Hola${rec.paciente ? `, ${rec.paciente.split(" ")[0]}` : ""} 👋`,
          `Le recordamos su cita de ${servicio} mañana.`,
          "",
          `Cuándo: ${cuando}`,
          rec.sede ? `Dónde: ${rec.sede}` : "",
          "",
          indicacionesPara(rec.servicio),
          "",
          "Si necesita cancelar o reprogramar, escríbanos al 311 398 1422.",
        ]
          .filter((l) => l.length > 0)
          .join("\n");

        if (rec.chatId) {
          try {
            await bot.api.sendMessage(Number(rec.chatId), texto);
            await deps.cApi.recordatorioMarcarEnviado(deps.cfg, {
              reservaId: rec.reservaId,
              pacienteId: rec.pacienteId,
              ok: true,
            });
          } catch (err) {
            const mensaje = err instanceof Error ? err.message : "desconocido";
            logger.warn({ reservaId: rec.reservaId, err: mensaje }, "no pude mandar el recordatorio por Telegram");
            await deps.cApi.recordatorioMarcarEnviado(deps.cfg, {
              reservaId: rec.reservaId,
              pacienteId: rec.pacienteId,
              ok: false,
              error: mensaje,
            });
          }
          continue;
        }

        await deps.cApi.recordatorioEnviarEmail(deps.cfg, { reservaId: rec.reservaId, pacienteId: rec.pacienteId });
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : "desconocido" },
        "vigilancia de recordatorios: vuelta fallida",
      );
    } finally {
      corriendo = false;
    }
  }

  const timer = setInterval(() => void revisar(), intervaloMs);
  timer.unref();
  void revisar();

  return () => {
    clearInterval(timer);
  };
}
