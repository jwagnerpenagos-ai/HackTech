import type { Bot } from "grammy";
import { esAutorizado } from "../auth.js";
import { fechaLarga, horaCorta } from "../resultados.js";
import type { HistoriaResumen } from "../coreApiClient.js";
import type { FlujoDeps, MiContexto } from "./contexto.js";

/**
 * `/historia <documento>`: resumen de la historia clínica de un paciente,
 * buscado por número de documento (exacto, no por nombre — más preciso y
 * sin ambigüedad para algo tan sensible), como texto directo en el chat. No
 * es un PDF — eso hoy solo se genera en el navegador (ver
 * historia-clinica-modal.tsx) y montar generación de PDF en el servidor es
 * una pieza nueva que no vale la pena a esta altura. Junta datos
 * personales, antecedentes, la última anamnesis/signos/dolor registrados y
 * las evoluciones y citas más recientes.
 */

function fechaCorta(iso: string): string {
  return `${fechaLarga(iso.slice(0, 10))}, ${horaCorta(iso)}`;
}

function formatearResumen(r: HistoriaResumen): string {
  const partes: string[] = [`🗂️ Historia clínica — ${r.nombreCompleto}`];

  const contacto = [r.telefono, r.email].filter((v): v is string => Boolean(v));
  if (contacto.length > 0) partes.push(contacto.join(" · "));

  if (r.antecedentes.length > 0) {
    partes.push(
      "",
      "⚠️ Antecedentes:",
      ...r.antecedentes.map((a) => `• ${a.nombre}${a.esBanderaRoja ? " 🚩" : ""}${a.detalle ? ` — ${a.detalle}` : ""}`),
    );
  }

  if (r.anamnesisUltima) {
    const a = r.anamnesisUltima;
    partes.push(
      "",
      `📋 Anamnesis (${fechaCorta(a.registradoEn)}):`,
      a.motivoConsulta ? `Motivo: ${a.motivoConsulta}` : "",
      a.enfermedadActual ? `Enfermedad actual: ${a.enfermedadActual}` : "",
      a.objetivosTerapeuticos ? `Objetivos: ${a.objetivosTerapeuticos}` : "",
    );
  }

  if (r.vitalesUltima) {
    const v = r.vitalesUltima;
    const signos = [
      v.sistolica && v.diastolica ? `TA ${v.sistolica}/${v.diastolica}` : null,
      v.frecuenciaCardiaca ? `FC ${v.frecuenciaCardiaca}` : null,
      v.saturacionO2 ? `SpO2 ${v.saturacionO2}%` : null,
      v.imc ? `IMC ${v.imc}` : null,
    ].filter((s): s is string => Boolean(s));
    partes.push(
      "",
      `💓 Últimos signos vitales (${fechaCorta(v.tomadoEn)}):`,
      signos.join(" · ") || "Sin valores registrados",
      v.requiereAtencion ? "⚠️ Requiere atención" : "",
    );
  }

  if (r.dolorUltima) {
    const d = r.dolorUltima;
    partes.push(
      "",
      `🩹 Última evaluación de dolor (${fechaCorta(d.evaluadoEn)}):`,
      `${d.intensidad}/10 · ${d.clasificacion}${d.zona ? ` · ${d.zona}` : ""}${d.localizacion ? ` · ${d.localizacion}` : ""}`,
    );
  }

  if (r.evolucionesRecientes.length > 0) {
    partes.push(
      "",
      "📝 Evoluciones recientes:",
      ...r.evolucionesRecientes.map((e) => {
        const linea = [e.subjetivo, e.objetivo, e.analisis, e.plan].filter((v): v is string => Boolean(v)).join(" · ");
        return `• ${fechaCorta(e.registradoEn)}${linea ? ` — ${linea}` : ""}`;
      }),
    );
  }

  if (r.citasRecientes.length > 0) {
    partes.push(
      "",
      "📅 Citas recientes:",
      ...r.citasRecientes.map((c) => `• ${fechaCorta(c.iniciaEn)} · ${c.servicio ?? "?"} · ${c.sede} · ${c.estado}`),
    );
  }

  return partes.filter((l) => l !== "").join("\n");
}

export function registrarFlujoHistoria(bot: Bot<MiContexto>, deps: FlujoDeps): void {
  bot.command("historia", async (ctx) => {
    if (!esAutorizado(deps.cfg, ctx.chat.id)) {
      await ctx.reply("Este comando es solo para el personal del consultorio.");
      return;
    }
    const documento = ctx.match.trim();
    if (!documento) {
      await ctx.reply("Uso: /historia <número de documento>\nEj.: /historia 1103456789");
      return;
    }
    const r = await deps.cApi.historiaResumen(deps.cfg, documento);
    if (!r.ok) {
      await ctx.reply("No pude consultar la historia clínica en este momento.");
      return;
    }
    if (r.datos.tipo === "no_encontrado") {
      await ctx.reply(`No encontré ningún paciente con el documento "${documento}".`);
      return;
    }
    if (r.datos.tipo === "ambiguo") {
      const lista = r.datos.candidatos.map((c) => `• ${c.nombreCompleto}`).join("\n");
      await ctx.reply(`Hay más de un paciente con ese número de documento; contacte al soporte:\n${lista}`);
      return;
    }
    await ctx.reply(formatearResumen(r.datos.resumen));
  });
}
