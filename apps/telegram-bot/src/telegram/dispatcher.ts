import type { Bot } from "grammy";
import { esAutorizado } from "../auth.js";
import {
  pedirDatosDeRegistro,
  procesarTexto,
  resolverConfirmacion,
  resolverOfertaCalendar,
  textoDeAccion,
  type Accion,
} from "../conversation.js";
import type { Config } from "../config.js";
import { logger } from "../logger.js";
import { formatearResultado } from "../resultados.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import { interpretarSiNo } from "./formato.js";
import { camposFaltantesDeRegistro } from "./parsers.js";
import { iniciarReservaGuiada, pedirComprobante, reservaManejaTexto } from "./flujoReserva.js";
import { iniciarCancelarGuiado } from "./flujoCancelar.js";

function urlAutorizacionCalendar(cfg: Config, oferta: { reservaId: number; pacienteId: number }): string {
  const url = new URL("/oauth/paciente/iniciar", cfg.GOOGLE_ADAPTER_URL);
  url.searchParams.set("reserva_id", String(oferta.reservaId));
  url.searchParams.set("paciente_id", String(oferta.pacienteId));
  return url.toString();
}

/**
 * Ejecuta la `Accion` que devolvió `conversation.ts`. Para "ejecutar", el texto
 * de `conversation.ts` es solo un resumen de logs: la respuesta real sale de
 * llamar a n8n y formatear. Las demás acciones se responden con su propio texto
 * (o arrancan un flujo guiado), sin tocar la red.
 */
async function responderAccion(
  ctx: MiContexto,
  deps: FlujoDeps,
  chatId: number,
  accion: Accion,
): Promise<void> {
  if (accion.tipo === "iniciar_reserva_guiada") {
    await iniciarReservaGuiada(ctx, deps, accion.entidades);
    return;
  }
  if (accion.tipo === "iniciar_cancelar_guiado") {
    await iniciarCancelarGuiado(ctx, deps);
    return;
  }

  // Pregunta de solo lectura en medio de un flujo: se resuelve la consulta y se
  // recuerda el dato que faltaba (la sesión sigue en el flujo).
  if (accion.tipo === "consulta_y_retomar") {
    const resultado = await deps.n8n(deps.cfg, accion.intencion, accion.entidades, String(chatId));
    await ctx.reply(formatearResultado(accion.intencion, resultado));
    if (accion.rePrompt.length > 0) await ctx.reply(accion.rePrompt);
    return;
  }

  if (accion.tipo !== "ejecutar") {
    await ctx.reply(textoDeAccion(accion));
    return;
  }

  logger.info(
    { chatId, intencion: accion.intencion, entidades: Object.keys(accion.entidades) },
    "accion a ejecutar",
  );
  const resultado = await deps.n8n(deps.cfg, accion.intencion, accion.entidades, String(chatId));

  // core-api pide datos que faltan antes de reservar (nombre/teléfono en la
  // primera cita, o algún campo que el NLU no capturó): se reentra al bucle de
  // "pedir_dato" para completarlos y reintentar.
  if (
    accion.intencion === "crear_sesion" &&
    resultado.tipo === "error_negocio" &&
    (resultado.codigo === "registro_requerido" || resultado.codigo === "datos_incompletos")
  ) {
    const camposFaltantes = camposFaltantesDeRegistro(resultado.datos);
    if (camposFaltantes !== null && camposFaltantes.length > 0) {
      const r = pedirDatosDeRegistro(accion.entidades, camposFaltantes);
      ctx.session = r.estado;
      await ctx.reply(textoDeAccion(r.accion));
      return;
    }
  }

  await ctx.reply(formatearResultado(accion.intencion, resultado));

  // Tras reservar por el bucle de texto (p. ej. al terminar el registro), se
  // pide el comprobante de pago igual que en el flujo guiado.
  if (accion.intencion === "crear_sesion" && resultado.tipo === "ok") {
    await pedirComprobante(ctx, resultado.datos);
  }
}

/**
 * Registra los handlers de mensajes "libres" (no callbacks): texto según el
 * estado de la sesión, foto/documento como comprobante de pago, y el resto.
 */
export function registrarDispatcher(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;

    // ¿Flujo guiado de reserva en curso? (un texto suele ser una fecha).
    if (ctx.session.reservaFlujo) {
      await reservaManejaTexto(ctx, deps, ctx.message.text);
      return;
    }

    // ¿Esperando el sí/no de "¿agrego esto a tu Calendar?" (fase 3)?
    if (ctx.session.ofertaCalendarPendiente) {
      const sn = interpretarSiNo(ctx.message.text);
      if (sn === null) {
        await ctx.reply('Por favor responda "sí" o "no".');
        return;
      }
      const r = resolverOfertaCalendar(ctx.session, sn);
      ctx.session = r.estado;
      if (r.tipo === "aceptado") {
        await ctx.reply(
          `Abra este enlace para autorizar el acceso, con su propia cuenta de Google:\n${urlAutorizacionCalendar(deps.cfg, r)}`,
        );
      } else {
        await ctx.reply("Listo, no la agrego al calendario.");
      }
      return;
    }

    // ¿Esperando un sí/no de confirmación de una intención sensible?
    if (ctx.session.esperandoConfirmacion) {
      const sn = interpretarSiNo(ctx.message.text);
      if (sn === null) {
        await ctx.reply('Responda "sí" o "no" para confirmar o cancelar.');
        return;
      }
      const r = resolverConfirmacion(ctx.session, sn);
      ctx.session = r.estado;
      await responderAccion(ctx, deps, chatId, r.accion);
      return;
    }

    const r = await procesarTexto(deps.cfg, ctx.session, ctx.message.text, deps.nlu, esAutorizado(deps.cfg, chatId));
    ctx.session = r.estado;
    await responderAccion(ctx, deps, chatId, r.accion);
  });

  // Foto o documento: si el chat espera el comprobante de un pago, se registra.
  bot.on(["message:photo", "message:document"], async (ctx) => {
    const esperando = ctx.session.esperandoComprobante;
    if (!esperando) {
      await ctx.reply(
        "Recibí una imagen, pero no tengo un pago pendiente. Si es un comprobante, primero reserve su cita.",
      );
      return;
    }
    const fileId = ctx.message.photo?.at(-1)?.file_id ?? ctx.message.document?.file_id;
    if (fileId === undefined) {
      await ctx.reply("No pude leer el archivo. Intente enviarlo de nuevo, por favor.");
      return;
    }
    const r = await deps.cApi.registrarPago(deps.cfg, {
      compraId: esperando.compraId,
      valor: esperando.monto,
      comprobanteRef: fileId,
      creadoPor: String(ctx.chat.id),
    });
    if (!r.ok) {
      await ctx.reply("No pude registrar su comprobante en este momento. Intente de nuevo en un rato.");
      return;
    }
    ctx.session = { ...ctx.session, esperandoComprobante: null };
    await ctx.reply("Recibí su comprobante. En cuanto verifiquemos el pago le confirmo la cita. ✅");
  });

  // Cualquier otro tipo de mensaje (stickers, audio, etc.).
  bot.on("message", async (ctx) => {
    await ctx.reply("Por ahora solo puedo leer texto y fotos de comprobantes. Use /help.");
  });
}
