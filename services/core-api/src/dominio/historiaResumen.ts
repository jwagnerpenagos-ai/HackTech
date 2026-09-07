import type { Db } from "../db.js";
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

/**
 * Búsqueda por número de documento (exacta, no difusa): es un identificador
 * mucho más preciso que el nombre para algo tan sensible como la historia
 * clínica. `LIMIT 2` es solo defensivo — dos personas activas con el mismo
 * número pero distinto tipo de documento no debería pasar, pero si pasa se
 * reporta como ambiguo en vez de mostrar la ficha equivocada.
 */
export async function resumenHistoria(db: Db, documento: string): Promise<ResultadoHistoriaResumen> {
  const doc = documento.trim();
  const r = await db.query<{
    id: number | string;
    nombre_completo: string;
    telefono: string | null;
    email: string | null;
  }>(
    `SELECT id, nombres || ' ' || apellidos AS nombre_completo, telefono, email
       FROM personas.paciente
      WHERE numero_documento = $1 AND activo
      LIMIT 2`,
    [doc],
  );

  if (r.rows.length === 0) return { tipo: "no_encontrado" };
  if (r.rows.length > 1) {
    return {
      tipo: "ambiguo",
      candidatos: r.rows.map((f) => ({ id: Number(f.id), nombreCompleto: f.nombre_completo })),
    };
  }

  const fila = r.rows[0]!;
  const pacienteId = Number(fila.id);
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
      nombreCompleto: fila.nombre_completo,
      telefono: fila.telefono,
      email: fila.email,
      antecedentes: antecedentes.map((a) => ({ nombre: a.nombre, detalle: a.detalle, esBanderaRoja: a.esBanderaRoja })),
      anamnesisUltima: anamnesis[0] ?? null,
      vitalesUltima: vitales[0] ?? null,
      dolorUltima: dolor[0] ?? null,
      evolucionesRecientes: evoluciones.slice(0, MAX_EVOLUCIONES),
      citasRecientes: citas.slice(0, MAX_CITAS),
    },
  };
}
