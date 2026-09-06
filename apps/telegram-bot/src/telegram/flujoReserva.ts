import type { Bot } from "grammy";
import {
  emparejarServicio,
  estadoInicial,
  etiquetaServicio,
  parsearFechaSimple,
  pedirDatosDeRegistro,
  textoDeAccion,
} from "../conversation.js";
import { fechaLarga, formatearResultado } from "../resultados.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";
import {
  editarOResponder,
  fechaMinimaReserva,
  formatearMonto,
  hoyBogota,
  LLAVE_NEQUI,
} from "./formato.js";
import {
  camposFaltantesDeRegistro,
  datosPago,
  disponibilidadDeResultado,
  estadoDeResultado,
  proximosDeResultado,
  serviciosDeCatalogo,
  estaRegistrado,
  valoracionRealizada,
} from "./parsers.js";
import {
  RSV_CANCELAR,
  TECLADO_CONFIRMAR,
  TECLADO_VOLVER,
  tecladoHoras,
  tecladoProximos,
  tecladoServicios,
} from "./teclados.js";

const RE_VALORACION = /valoraci[oó]n inicial/i;

const PEDIR_FECHA =
  "¿Para qué día? Escríbame la fecha: «el viernes», «20 de septiembre», «21/11/2026».\n" +
  "Debe ser con al menos 24 horas de anticipación.";

function resumenReserva(f: {
  servicio?: string;
  fecha?: string;
  hora?: string;
  sede?: string;
  reprogramarDe?: number;
}): string {
  const reprogramando = f.reprogramarDe !== undefined;
  return [
    reprogramando ? "Por favor confirme el nuevo horario de su cita:" : "Por favor confirme su cita:",
    "",
    `• Servicio: ${f.servicio ?? "?"}`,
    `• Fecha: ${f.fecha ? fechaLarga(f.fecha) : "?"}`,
    `• Hora: ${f.hora ?? "?"}`,
    `• Sede: ${f.sede ?? "?"}`,
    "",
    reprogramando
      ? "Si ya pagó esta cita, su pago se mantiene. Si no, le pediré el comprobante."
      : "Recuerde que para confirmarla se requiere el pago anticipado del 100%.",
  ].join("\n");
}

/**
 * Tras un `crear_sesion` / `modificar_sesion` OK: deja la sesión esperando la
 * foto del comprobante y le dice al paciente cuánto y a dónde transferir. Si no
 * vino la info de pago (no debería), solo recuerda el pago anticipado.
 */
export async function pedirComprobante(ctx: MiContexto, datos: unknown): Promise<void> {
  const d = datosPago(datos);
  if (d.compraId === undefined || d.montoTotal === undefined || d.reservaId === undefined) {
    await ctx.reply("Recuerde que la cita se confirma con el pago anticipado.");
    return;
  }
  ctx.session = {
    ...estadoInicial(),
    esperandoComprobante: { reservaId: d.reservaId, compraId: d.compraId, monto: d.montoTotal },
  };
  await ctx.reply(
    [
      `Para confirmar la cita, transfiera ${formatearMonto(d.montoTotal)} a la Llave Nequi ${LLAVE_NEQUI}`,
      "y envíeme aquí la foto del comprobante.",
      "",
      "Si no recibimos el pago con al menos 24 horas de anticipación, el cupo se libera.",
    ].join("\n"),
  );
}

/**
 * Muestra los próximos horarios para `servicio` (sistema híbrido: se ofrecen
 * las N más próximas en orden, no todo el calendario). Deja el flujo en paso
 * "slot". `prefacio` es texto opcional que va antes (p. ej. el servicio elegido).
 */
export async function mostrarProximos(
  ctx: MiContexto,
  deps: FlujoDeps,
  servicio: string,
  prefacio: string,
): Promise<void> {
  const flujo = ctx.session.reservaFlujo;
  if (!flujo) return;
  const disp = await deps.n8n(deps.cfg, "consultar_disponibilidad", { servicio }, String(ctx.chat?.id ?? ""));
  const proximos = proximosDeResultado(disp);
  ctx.session = { ...ctx.session, reservaFlujo: { ...flujo, paso: "slot", servicio, proximos } };
  if (proximos.length === 0) {
    await editarOResponder(
      ctx,
      `${prefacio}No encontré horarios para ${servicio} en las próximas semanas. Escríbanos al 311 398 1422.`,
    );
    return;
  }
  await editarOResponder(
    ctx,
    `${prefacio}Estos son los próximos horarios para ${servicio}. Elija uno o pida otro día:`,
    tecladoProximos(proximos),
  );
}

/** Arranca el flujo guiado: carga el catálogo y muestra el menú de servicios. */
export async function iniciarReservaGuiada(
  ctx: MiContexto,
  deps: FlujoDeps,
  prefill: Record<string, string | number>,
): Promise<void> {
  const chatId = ctx.chat?.id ?? 0;
  const catalogo = await deps.n8n(deps.cfg, "consultar_catalogo", {}, String(chatId));
  // Solo los servicios reservables por el bot: los planes grupales/convenios
  // quedan en el catálogo como información, pero no en el menú de reserva.
  const servicios = serviciosDeCatalogo(catalogo).filter((s) => s.reservable !== false);
  if (servicios.length === 0) {
    await ctx.reply("No pude cargar los servicios en este momento. Intente de nuevo en un rato.");
    return;
  }

  ctx.session = { ...estadoInicial(), reservaFlujo: { paso: "slot", servicios } };

  // Hasta que el paciente asista a su valoración inicial, solo puede agendar
  // esa consulta (sea un chat nuevo o uno que ya reservó la valoración pero
  // todavía no la hizo).
  const val = servicios.find((s) => RE_VALORACION.test(s.nombre)) ?? servicios[0];
  if (!valoracionRealizada(catalogo) && val !== undefined) {
    const prefacio = estaRegistrado(catalogo)
      ? "Su valoración inicial todavía no se ha realizado. Cuando asista a esa consulta se habilitan los demás servicios.\n" +
        `Por ahora puedo agendarle la Valoración inicial (${etiquetaServicio(val)}).\n\n`
      : `Como es su primera cita con nosotros, agendamos una Valoración inicial (${etiquetaServicio(val)}).\n` +
        "Después de esa consulta podrá reservar cualquiera de los demás servicios.\n\n";
    await mostrarProximos(ctx, deps, val.nombre, prefacio);
    return;
  }

  const preSvc = typeof prefill["servicio"] === "string" ? emparejarServicio(servicios, prefill["servicio"]) : null;
  if (preSvc) {
    await mostrarProximos(ctx, deps, preSvc.nombre, `Servicio: ${etiquetaServicio(preSvc)}.\n\n`);
    return;
  }

  ctx.session = { ...estadoInicial(), reservaFlujo: { paso: "servicio", servicios } };
  await ctx.reply("¿Qué servicio desea agendar?", { reply_markup: tecladoServicios(servicios) });
}

/** Un texto recibido mientras el flujo guiado espera la fecha ("elegir otro día"). */
async function reservaRecibeFecha(ctx: MiContexto, deps: FlujoDeps, texto: string): Promise<void> {
  const flujo = ctx.session.reservaFlujo;
  if ((flujo?.paso !== "fecha" && flujo?.paso !== "slot") || flujo.servicio === undefined) return;

  let fecha = parsearFechaSimple(texto, hoyBogota());
  if (fecha === null) {
    // Fallback: dejar que el NLU resuelva una frase más libre. Se envuelve en
    // una oración de agenda para que el modelo extraiga la fecha con contexto.
    const r = await deps.nlu(deps.cfg, `quiero agendar una cita para ${texto}`);
    if (r.ok && typeof r.intencion.entidades["fecha"] === "string") {
      fecha = r.intencion.entidades["fecha"];
    }
  }
  if (fecha === null) {
    await ctx.reply("No entendí la fecha. Escríbala como «el viernes», «20 de septiembre» o «21/11/2026».", {
      reply_markup: TECLADO_VOLVER,
    });
    return;
  }
  if (fecha < fechaMinimaReserva()) {
    await ctx.reply("Las citas se agendan con al menos 24 horas de anticipación. Elija otra fecha.", {
      reply_markup: TECLADO_VOLVER,
    });
    return;
  }

  const disp = await deps.n8n(
    deps.cfg,
    "consultar_disponibilidad",
    { servicio: flujo.servicio, fecha },
    String(ctx.chat?.id ?? ""),
  );
  const { sede, horas } = disponibilidadDeResultado(disp);
  if (horas.length === 0) {
    await ctx.reply(`No hay horarios libres para ${flujo.servicio} el ${fechaLarga(fecha)}. Pruebe con otra fecha.`, {
      reply_markup: TECLADO_VOLVER,
    });
    return;
  }

  ctx.session = { ...ctx.session, reservaFlujo: { ...flujo, paso: "hora", fecha, sede } };
  await ctx.reply(`Horarios libres para ${flujo.servicio}\n${fechaLarga(fecha)} · ${sede}:`, {
    reply_markup: tecladoHoras(horas),
  });
}

/**
 * Confirma una REPROGRAMACIÓN: llama `modificar_sesion` (core-api mueve la
 * compra y el pago de la cita vieja a la nueva). Si la cita ya estaba pagada
 * (`estado === "confirmada"`), no se vuelve a pedir comprobante.
 */
async function reprogramarConfirmar(
  ctx: MiContexto,
  deps: FlujoDeps,
  flujo: { servicio?: string; fecha?: string; hora?: string; sede?: string; reprogramarDe?: number },
  chatId: number,
): Promise<void> {
  const resultado = await deps.n8n(
    deps.cfg,
    "modificar_sesion",
    { sesion_id: flujo.reprogramarDe ?? 0, fecha: flujo.fecha ?? "", hora: flujo.hora ?? "" },
    String(chatId),
  );
  ctx.session = estadoInicial();

  if (resultado.tipo !== "ok") {
    await editarOResponder(ctx, formatearResultado("modificar_sesion", resultado));
    return;
  }

  const cabecera = [
    "Su cita quedó reprogramada. 📅",
    "",
    flujo.servicio ?? "",
    `${flujo.fecha ? fechaLarga(flujo.fecha) : "?"} · ${flujo.hora ?? "?"}`,
    flujo.sede ?? "",
  ]
    .filter((l) => l.length > 0)
    .join("\n");

  if (estadoDeResultado(resultado.datos) === "confirmada") {
    await editarOResponder(ctx, `${cabecera}\n\nSu pago anterior se mantiene, no hay ningún cargo adicional.`);
    return;
  }
  await editarOResponder(ctx, cabecera);
  await pedirComprobante(ctx, resultado.datos);
}

/** Confirma la reserva del flujo guiado (callback rsv:ok). */
async function reservaConfirmar(ctx: MiContexto, deps: FlujoDeps): Promise<void> {
  const flujo = ctx.session.reservaFlujo;
  if (flujo?.paso !== "confirmar" || !flujo.servicio || !flujo.fecha || !flujo.hora) {
    await editarOResponder(ctx, "Ese flujo ya no está activo. Escriba «pedir una cita» para empezar de nuevo.");
    ctx.session = estadoInicial();
    return;
  }
  const chatId = ctx.chat?.id ?? 0;

  // Reprogramación (viene del flujo de cancelar): mueve la cita, no crea otra.
  if (flujo.reprogramarDe !== undefined) {
    await reprogramarConfirmar(ctx, deps, flujo, chatId);
    return;
  }

  const entidades = { servicio: flujo.servicio, fecha: flujo.fecha, hora: flujo.hora };
  const resultado = await deps.n8n(deps.cfg, "crear_sesion", entidades, String(chatId));

  // Primera cita: falta registrar nombre/teléfono. Se sale del flujo de botones
  // y se entra al de texto, que ya sabe reintentar crear_sesion al terminar.
  if (
    resultado.tipo === "error_negocio" &&
    (resultado.codigo === "registro_requerido" || resultado.codigo === "datos_incompletos")
  ) {
    const campos = camposFaltantesDeRegistro(resultado.datos);
    if (campos && campos.length > 0) {
      const r = pedirDatosDeRegistro(entidades, campos);
      ctx.session = r.estado;
      await editarOResponder(ctx, "Es su primera cita. Para dejarla registrada:");
      await ctx.reply(textoDeAccion(r.accion));
      return;
    }
  }

  ctx.session = estadoInicial();

  if (resultado.tipo !== "ok") {
    await editarOResponder(ctx, formatearResultado("crear_sesion", resultado));
    return;
  }

  const nro = datosPago(resultado.datos).reservaId ?? "?";
  await editarOResponder(
    ctx,
    ["Su cita quedó reservada. 📅", "", flujo.servicio, `${fechaLarga(flujo.fecha)} · ${flujo.hora}`, flujo.sede ?? "", `Reserva #${nro}`]
      .filter((l) => l.length > 0)
      .join("\n"),
  );

  await pedirComprobante(ctx, resultado.datos);
}

/** Texto recibido mientras el flujo guiado de reserva está activo (paso slot/fecha = fecha escrita). */
export async function reservaManejaTexto(ctx: MiContexto, deps: FlujoDeps, texto: string): Promise<void> {
  const flujo = ctx.session.reservaFlujo;
  if (!flujo) return;
  if (flujo.paso === "fecha" || flujo.paso === "slot") {
    await reservaRecibeFecha(ctx, deps, texto);
  } else {
    await ctx.reply("Toque una de las opciones de arriba, o escriba /cancelar.");
  }
}

/** Registra los callbacks `rsv:*` del flujo guiado de reserva / reprogramación. */
export function registrarFlujoReserva(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  bot.callbackQuery(RSV_CANCELAR, async (ctx) => {
    await ctx.answerCallbackQuery();
    const reprogramando = ctx.session.reservaFlujo?.reprogramarDe !== undefined;
    ctx.session = estadoInicial();
    await editarOResponder(
      ctx,
      reprogramando ? "Listo, dejé su cita como estaba." : "Listo, no agendé nada. ¿Le puedo ayudar en algo más?",
    );
  });

  bot.callbackQuery(/^rsv:svc:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const flujo = ctx.session.reservaFlujo;
    const svc = flujo?.servicios[Number(ctx.match[1])];
    if (flujo?.paso !== "servicio" || svc === undefined) {
      await editarOResponder(ctx, "Ese menú ya no está activo. Escriba «pedir una cita» para empezar.");
      return;
    }
    await mostrarProximos(ctx, deps, svc.nombre, `Servicio: ${etiquetaServicio(svc)}.\n\n`);
  });

  bot.callbackQuery(/^rsv:slot:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const flujo = ctx.session.reservaFlujo;
    const s = flujo?.proximos?.[Number(ctx.match[1])];
    if (flujo?.paso !== "slot" || s === undefined) {
      await editarOResponder(ctx, "Ese menú ya no está activo. Escriba «pedir una cita» para empezar.");
      return;
    }
    const datos = { fecha: s.fecha, hora: s.hora, sede: s.sede };
    ctx.session = { ...ctx.session, reservaFlujo: { ...flujo, paso: "confirmar", ...datos } };
    await editarOResponder(ctx, resumenReserva({ ...flujo, ...datos }), TECLADO_CONFIRMAR);
  });

  bot.callbackQuery("rsv:fecha", async (ctx) => {
    await ctx.answerCallbackQuery();
    const flujo = ctx.session.reservaFlujo;
    if (flujo?.servicio === undefined) return;
    ctx.session = { ...ctx.session, reservaFlujo: { ...flujo, paso: "fecha" } };
    await editarOResponder(ctx, PEDIR_FECHA, TECLADO_VOLVER);
  });

  bot.callbackQuery("rsv:volver", async (ctx) => {
    await ctx.answerCallbackQuery();
    const flujo = ctx.session.reservaFlujo;
    if (flujo?.servicio === undefined) return;
    await mostrarProximos(ctx, deps, flujo.servicio, "");
  });

  bot.callbackQuery(/^rsv:hora:(\d{1,2}:\d{2})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const flujo = ctx.session.reservaFlujo;
    if (flujo?.paso !== "hora") {
      await editarOResponder(ctx, "Ese menú ya no está activo. Escriba «pedir una cita» para empezar.");
      return;
    }
    const hora = ctx.match[1];
    if (hora === undefined) return;
    ctx.session = { ...ctx.session, reservaFlujo: { ...flujo, paso: "confirmar", hora } };
    await editarOResponder(ctx, resumenReserva({ ...flujo, hora }), TECLADO_CONFIRMAR);
  });

  bot.callbackQuery("rsv:ok", async (ctx) => {
    await ctx.answerCallbackQuery();
    await reservaConfirmar(ctx, deps);
  });
}
