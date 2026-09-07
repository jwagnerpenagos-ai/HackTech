import type { Bot } from "grammy";
import { esAutorizado } from "../auth.js";
import { horaCorta } from "../resultados.js";
import type { CitaHoy } from "../coreApiClient.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";

/**
 * `/hoy`: agenda completa del día para el personal del consultorio. Comando
 * directo (no pasa por NLU) porque es algo que Lina va a usar todos los días
 * y no debería depender de que el modelo interprete bien la pregunta.
 */

const ETIQUETA_ESTADO: Record<string, string> = {
  propuesta: "Propuesta",
  pendiente_pago: "⏳ Pendiente de pago",
  confirmada: "✅ Confirmada",
  en_curso: "🔵 En curso",
  atendida: "✔️ Atendida",
  no_asistio: "🚫 No asistió",
  cancelada_tarde: "❌ Cancelada (tarde)",
  cancelada_a_tiempo: "❌ Cancelada",
  expirada: "⌛ Expirada",
  rechazada: "❌ Rechazada",
};

function lineaCita(c: CitaHoy): string {
  const estado = ETIQUETA_ESTADO[c.estado] ?? c.estado;
  return `${horaCorta(c.iniciaEn)} · ${c.paciente ?? "Sin paciente"} · ${c.servicio ?? "?"} · ${c.sede} · ${estado}`;
}

export function registrarFlujoHoy(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  bot.command("hoy", async (ctx) => {
    if (!esAutorizado(deps.cfg, ctx.chat.id)) {
      await ctx.reply("Este comando es solo para el personal del consultorio.");
      return;
    }
    const r = await deps.cApi.citasHoy(deps.cfg);
    if (!r.ok) {
      await ctx.reply("No pude consultar la agenda de hoy en este momento.");
      return;
    }
    if (r.datos.citas.length === 0) {
      await ctx.reply("No hay citas registradas para hoy.");
      return;
    }
    const citas = [...r.datos.citas].sort((a, b) => a.iniciaEn.localeCompare(b.iniciaEn));
    const fecha = new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
    const texto = [
      `📅 Agenda de hoy — ${fecha}`,
      "",
      ...citas.map(lineaCita),
      "",
      `${citas.length} ${citas.length === 1 ? "cita" : "citas"} en total.`,
    ].join("\n");
    await ctx.reply(texto);
  });
}
