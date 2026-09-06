import { InlineKeyboard } from "grammy";
import type { ServicioResumen, SlotPropuesto } from "../conversation.js";

/** callback_data para "✕ Cancelar" dentro del flujo de reserva guiada. */
export const RSV_CANCELAR = "rsv:cancel";

/** Teclado inline genérico, 2 botones por fila. */
export function tecladoDe(acciones: readonly { texto: string; data: string }[]): InlineKeyboard {
  const teclado = new InlineKeyboard();
  acciones.forEach((accion, i) => {
    teclado.text(accion.texto, accion.data);
    if (i % 2 === 1) teclado.row();
  });
  return teclado;
}

export function tecladoServicios(servicios: ServicioResumen[]): InlineKeyboard {
  const k = new InlineKeyboard();
  servicios.forEach((s, i) => {
    k.text(s.nombre, `rsv:svc:${i}`).row();
  });
  k.text("✕ Cancelar", RSV_CANCELAR);
  return k;
}

export function tecladoProximos(proximos: SlotPropuesto[]): InlineKeyboard {
  const k = new InlineKeyboard();
  proximos.slice(0, 6).forEach((s, i) => {
    k.text(s.etiqueta, `rsv:slot:${i}`).row();
  });
  k.text("📅 Elegir otro día", "rsv:fecha").row();
  k.text("✕ Cancelar", RSV_CANCELAR);
  return k;
}

export function tecladoHoras(horas: string[]): InlineKeyboard {
  const k = new InlineKeyboard();
  horas.slice(0, 24).forEach((h, i) => {
    k.text(h, `rsv:hora:${h}`);
    if (i % 3 === 2) k.row();
  });
  k.row().text("« Cambiar fecha", "rsv:fecha").text("✕ Cancelar", RSV_CANCELAR);
  return k;
}

export const TECLADO_CONFIRMAR = new InlineKeyboard()
  .text("✓ Confirmar", "rsv:ok")
  .text("✕ Cancelar", RSV_CANCELAR);

export const TECLADO_VOLVER = new InlineKeyboard()
  .text("« Volver a los más cercanos", "rsv:volver")
  .row()
  .text("✕ Cancelar", RSV_CANCELAR);

/**
 * Botones de la pantalla de confirmación de cancelación. `puedeMover` decide
 * si se ofrece "pasar a otro día" (lo calcula `flujoCancelar`, no este módulo).
 */
export function tecladoConfirmarCancelacion(puedeMover: boolean): InlineKeyboard {
  const k = new InlineKeyboard();
  if (puedeMover) {
    k.text("📅 Pasar a otro día", "cxl:mover").row();
    k.text("✕ Cancelar la cita", "cxl:ok").row();
    k.text("No, mantener", "cxl:no");
  } else {
    k.text("✕ Cancelar de todos modos", "cxl:ok").row();
    k.text("No, mantener", "cxl:no");
  }
  return k;
}
