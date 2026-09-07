import type { Bot } from "grammy";
import { logger } from "../logger.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import { tarjetaPago } from "./flujoPagos.js";

type DepsVigilancia = Pick<FlujoDeps, "cfg" | "cApi">;

/**
 * Vigilancia de pagos entrantes desde la web. El checkout simulado registra un
 * `comercial.pago` (estado `registrado`) sin comprobante adjunto; nadie le
 * escribe al bot, así que hay que ir a buscarlo. Cada `intervaloMs` consulta
 * los pagos por verificar y, por cada uno que no hubiéramos visto antes, le
 * manda a Lina (y demás staff) la misma tarjeta de `/pagos` con
 * `[✓ Verificar]` / `[✗ Rechazar]`.
 *
 * Al arrancar sembramos `vistos` con lo que ya está pendiente para no repetir
 * el histórico; a partir de ahí solo avisa lo nuevo. El registro de "vistos"
 * vive en memoria: si el bot se reinicia, `/pagos` sigue mostrando todo.
 */
export function iniciarVigilanciaPagos(
  bot: Bot<MiContexto>,
  deps: DepsVigilancia,
  opts: { intervaloMs?: number } = {},
): () => void {
  const intervaloMs = opts.intervaloMs ?? 15_000;
  const staff = [...deps.cfg.allowedChatIds];
  if (staff.length === 0) {
    logger.warn("vigilancia de pagos web deshabilitada: no hay chats de staff configurados");
    return () => undefined;
  }

  const vistos = new Set<number>();
  let sembrado = false;
  let corriendo = false;

  async function revisar(): Promise<void> {
    if (corriendo) return; // evita solaparse si una vuelta se demora
    corriendo = true;
    try {
      const r = await deps.cApi.pagosPendientes(deps.cfg);
      if (!r.ok) return;

      if (!sembrado) {
        for (const p of r.datos.pagos) vistos.add(p.pagoId);
        sembrado = true;
        return;
      }

      for (const p of r.datos.pagos) {
        if (vistos.has(p.pagoId)) continue;
        vistos.add(p.pagoId);
        const { caption, teclado } = tarjetaPago(p);
        const texto = `Nuevo pago desde la web 🌐\n${caption}`;
        for (const chatId of staff) {
          try {
            await bot.api.sendMessage(chatId, texto, { reply_markup: teclado });
          } catch (err) {
            logger.warn(
              { chatId, err: err instanceof Error ? err.message : "desconocido" },
              "no pude avisar del pago web a un chat de staff",
            );
          }
        }
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : "desconocido" }, "vigilancia de pagos: vuelta fallida");
    } finally {
      corriendo = false;
    }
  }

  const timer = setInterval(() => void revisar(), intervaloMs);
  timer.unref(); // no debe impedir que el proceso termine
  void revisar(); // siembra inmediata

  return () => {
    clearInterval(timer);
  };
}
