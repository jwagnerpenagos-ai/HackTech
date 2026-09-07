import type { Db } from "../db.js";
import * as pacientes from "./pacientes.js";
import * as clinico from "../web/clinico.js";

/**
 * Resumen de la historia clínica de un paciente, para que el bot se lo mande
 * a Lina por Telegram como texto (no hay generación de PDF en el servidor —
 * eso hoy solo existe en el navegador, ver historia-clinica-modal.tsx). Junta
 * lo que ya exponen web/clinico.ts y dominio/pacientes.ts; no agrega lógica
 * de negocio nueva, solo la consolida en una sola llamada para el bot.
 */

export interface HistoriaResumen {
  pacienteId: number;
  nombreCompleto: string;
  telefono: string | null;
  email: string | null;
  antecedentes: { nombre: string; detalle: string | null; esBanderaRoja: boolean }[];
  anamnesisUltima: clinico.AnamnesisRegistro | null;
  vitalesUltima: clinico.SignosVitalesRegistro | null;
  dolorUltima: clinico.EvaluacionDolorRegistro | null;
  evolucionesRecientes: clinico.EvolucionRegistro[];
  citasRecientes: clinico.CitaPacienteAdmin[];
}

export type ResultadoHistoriaResumen =
  | { tipo: "no_encontrado" }
  | { tipo: "ambiguo"; candidatos: { id: number; nombreCompleto: string }[] }
  | { tipo: "encontrado"; resumen: HistoriaResumen };

const MAX_EVOLUCIONES = 3;
const MAX_CITAS = 5;

export async function resumenHistoria(db: Db, nombre: string): Promise<ResultadoHistoriaResumen> {
  const r = await pacientes.buscarPaciente(db, nombre);
  if (r.tipo === "no_encontrado") return { tipo: "no_encontrado" };
  if (r.tipo === "ambiguo") {
    return {
      tipo: "ambiguo",
      candidatos: r.candidatos.map((c) => ({ id: c.id, nombreCompleto: c.nombreCompleto })),
    };
  }

  const pacienteId = r.paciente.id;
  const [antecedentes, anamnesis, vitales, dolor, evoluciones, citas] = await Promise.all([
    clinico.listarAntecedentesPaciente(db, pacienteId),
    clinico.listarAnamnesis(db, pacienteId),
    clinico.listarSignosVitales(db, pacienteId),
    clinico.listarEvaluacionesDolor(db, pacienteId),
    clinico.listarEvoluciones(db, pacienteId),
    clinico.listarCitasDePaciente(db, pacienteId),
  ]);

  return {
    tipo: "encontrado",
    resumen: {
      pacienteId,
      nombreCompleto: r.paciente.nombreCompleto,
      telefono: r.paciente.telefono,
      email: r.paciente.email,
      antecedentes: antecedentes.map((a) => ({ nombre: a.nombre, detalle: a.detalle, esBanderaRoja: a.esBanderaRoja })),
      anamnesisUltima: anamnesis[0] ?? null,
      vitalesUltima: vitales[0] ?? null,
      dolorUltima: dolor[0] ?? null,
      evolucionesRecientes: evoluciones.slice(0, MAX_EVOLUCIONES),
      citasRecientes: citas.slice(0, MAX_CITAS),
    },
  };
}
