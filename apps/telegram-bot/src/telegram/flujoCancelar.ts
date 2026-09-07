import { type Bot, InlineKeyboard } from "grammy";
import { estadoInicial, type CitaCancelable } from "../conversation.js";
import { fechaLarga, formatearResultado, horaCorta } from "../resultados.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import { editarOResponder } from "./formato.js";
import { citasCancelablesDeResultado, estadoDeResultado } from "./parsers.js";
import { tecladoConfirmarCancelacion } from "./teclados.js";
import { mostrarProximos } from "./flujoReserva.js";

const MS_24H = 24 * 60 * 60 * 1000;

/** ¿Esta cita todavía se puede pasar a otro día sin penalidad? */
function puedeReprogramar(c: CitaCancelable): boolean {
  const dentroDePlazo = new Date(c.iniciaEn).getTime() - Date.now() >= MS_24H;
  return c.estado === "pendiente_pago" || c.estado === "propuesta" || dentroDePlazo;
}

/** Texto de confirmación de cancelación, según estado y ventana de 24 h. */
function textoConfirmarCancelacion(c: CitaCancelable): string {
  const dentroDePlazo = new Date(c.iniciaEn).getTime() - Date.now() >= MS_24H;
  const cabecera = `Su cita: ${c.servicio}\n${fechaLarga(c.iniciaEn.slice(0, 10))} · ${horaCorta(c.iniciaEn)}\n\n`;
  if (c.estado === "pendiente_pago") {
    return `${cabecera}Todavía no está pagada, así que no hay ningún cargo. Puede pasarla a otro día o cancelarla.\n¿Qué desea hacer?`;
  }
  if (dentroDePlazo) {
    return `${cabecera}Está dentro del plazo (más de 24 h). Puede pasarla a otro día y conservar su pago, o cancelarla sin penalidad.\n¿Qué desea hacer?`;
  }
  return `${cabecera}⚠️ Faltan menos de 24 h: según la política, al cancelar se pierde el valor pagado de esta cita.\n¿Confirma de todos modos?`;
}

/** Lista las citas cancelables del paciente como botones. Entrada al flujo `cxl:*`. */
export async function iniciarCancelarGuiado(ctx: MiContexto, deps: FlujoDeps): Promise<void> {
  const resultado = await deps.n8n(deps.cfg, "consultar_agenda", {}, String(ctx.chat?.id ?? ""));
  const citas = citasCancelablesDeResultado(resultado);
  if (citas.length === 0) {
    await ctx.reply("No tiene citas próximas para cancelar.");
    return;
  }
  ctx.session = { ...estadoInicial(), cancelarFlujo: { paso: "elegir", citas } };
  const k = new InlineKeyboard();
  citas.forEach((c, i) => {
    k.text(c.etiqueta, `cxl:pick:${i}`).row();
  });
  k.text("✕ Salir", "cxl:no");
  await ctx.reply("¿Qué cita desea cancelar?", { reply_markup: k });
}

/** Registra los callbacks `cxl:*` del flujo guiado de cancelar / reprogramar. */
export function registrarFlujoCancelar(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  bot.callbackQuery("cxl:start", async (ctx) => {
    await ctx.answerCallbackQuery();
    await iniciarCancelarGuiado(ctx, deps);
  });

  bot.callbackQuery("cxl:no", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session = estadoInicial();
    await editarOResponder(ctx, "Listo, no cancelé nada.");
  });

  bot.callbackQuery(/^cxl:pick:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const f = ctx.session.cancelarFlujo;
    const c = f?.citas[Number(ctx.match[1])];
    if (f?.paso !== "elegir" || c === undefined) {
      await editarOResponder(ctx, "Ese menú ya no está activo. Escriba «mis citas» para volver a empezar.");
      return;
    }
    ctx.session = { ...ctx.session, cancelarFlujo: { ...f, paso: "confirmar", elegida: c } };
    await editarOResponder(ctx, textoConfirmarCancelacion(c), tecladoConfirmarCancelacion(puedeReprogramar(c)));
  });

  bot.callbackQuery("cxl:mover", async (ctx) => {
    await ctx.answerCallbackQuery();
    const f = ctx.session.cancelarFlujo;
    const c = f?.elegida;
    if (f?.paso !== "confirmar" || c === undefined) {
      await editarOResponder(ctx, "Ese menú ya no está activo. Escriba «mis citas» para volver a empezar.");
      return;
    }
    // Se reutiliza el flujo guiado de reserva, marcado con `reprogramarDe`.
    ctx.session = {
      ...estadoInicial(),
      reservaFlujo: { paso: "slot", servicios: [], servicio: c.servicio, reprogramarDe: c.reservaId },
    };
    await mostrarProximos(ctx, deps, c.servicio, `Va a reprogramar: ${c.etiqueta}.\n\n`);
  });

  bot.callbackQuery("cxl:ok", async (ctx) => {
    await ctx.answerCallbackQuery();
    const c = ctx.session.cancelarFlujo?.elegida;
    if (ctx.session.cancelarFlujo?.paso !== "confirmar" || c === undefined) {
      await editarOResponder(ctx, "Ese menú ya no está activo. Escriba «mis citas» para volver a empezar.");
      return;
    }
    ctx.session = estadoInicial();
    const resultado = await deps.n8n(deps.cfg, "cancelar_sesion", { sesion_id: c.reservaId }, String(ctx.chat?.id ?? ""));
    if (resultado.tipo !== "ok") {
      await editarOResponder(ctx, formatearResultado("cancelar_sesion", resultado));
      return;
    }
    await editarOResponder(
      ctx,
      estadoDeResultado(resultado.datos) === "cancelada_tarde"
        ? "Listo, su cita quedó cancelada. Como fue con menos de 24 h de anticipación, según la política se cobra el valor."
        : `Listo, su cita de ${c.servicio} quedó cancelada, sin ningún cargo. Cuando quiera agendar otra, aquí estoy.`,
    );
  });
}
