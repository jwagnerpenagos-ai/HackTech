import type { Db } from "../db.js";
import { normalizarErrorDb } from "../errores.js";
import * as agenda from "../dominio/agenda.js";
import { confirmarCita } from "./admin.js";

/**
 * Historia clínica, para el panel de Lina durante la consulta.
 *
 * Importante: `clinico.anamnesis`, `clinico.signos_vitales` y
 * `clinico.evolucion` son INMUTABLES en la base (trigger que bloquea
 * UPDATE/DELETE, ver schema.sql "DOMINIO 5 · CLINICO"). No hay endpoints
 * de editar/borrar para esas tablas -- solo "crear", y una corrección se
 * hace creando un registro nuevo con `anulaAId` apuntando al que reemplaza.
 * `clinico.paciente_antecedente` sí es una lista editable (no es un
 * registro de evolución, es "estado actual" del paciente).
 */

// --- Catálogos de referencia -----------------------------------------------

export interface CatalogosClinicos {
  motivosConsulta: { id: number; nombre: string }[];
  antecedentes: { id: number; codigo: string; nombre: string; esBanderaRoja: boolean }[];
  zonasAnatomicas: { id: number; codigo: string; nombre: string }[];
  tiposDolor: { id: number; codigo: string; nombre: string }[];
}

export async function obtenerCatalogosClinicos(db: Db): Promise<CatalogosClinicos> {
  const [motivos, antecedentes, zonas, tipos] = await Promise.all([
    db.query<{ id: number; nombre: string }>(
      `SELECT id, nombre FROM catalogo.motivo_consulta WHERE activo ORDER BY orden, nombre`,
    ),
    db.query<{ id: number; codigo: string; nombre: string; es_bandera_roja: boolean }>(
      `SELECT id, codigo, nombre, es_bandera_roja FROM catalogo.antecedente ORDER BY orden, nombre`,
    ),
    db.query<{ id: number; codigo: string; nombre: string }>(
      `SELECT id, codigo, nombre FROM catalogo.zona_anatomica ORDER BY nombre`,
    ),
    db.query<{ id: number; codigo: string; nombre: string }>(
      `SELECT id, codigo, nombre FROM catalogo.tipo_dolor ORDER BY nombre`,
    ),
  ]);
  return {
    motivosConsulta: motivos.rows,
    antecedentes: antecedentes.rows.map((f) => ({
      id: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      esBanderaRoja: f.es_bandera_roja,
    })),
    zonasAnatomicas: zonas.rows,
    tiposDolor: tipos.rows,
  };
}

// --- Antecedentes del paciente (editable, no es historial de evolución) ---

export interface AntecedentePaciente {
  antecedenteId: number;
  codigo: string;
  nombre: string;
  esBanderaRoja: boolean;
  detalle: string | null;
}

export async function listarAntecedentesPaciente(db: Db, pacienteId: number): Promise<AntecedentePaciente[]> {
  const r = await db.query<{
    antecedente_id: number;
    codigo: string;
    nombre: string;
    es_bandera_roja: boolean;
    detalle: string | null;
  }>(
    `SELECT a.id AS antecedente_id, a.codigo, a.nombre, a.es_bandera_roja, pa.detalle
       FROM clinico.paciente_antecedente pa
       JOIN catalogo.antecedente a ON a.id = pa.antecedente_id
      WHERE pa.paciente_id = $1
      ORDER BY a.orden, a.nombre`,
    [pacienteId],
  );
  return r.rows.map((f) => ({
    antecedenteId: f.antecedente_id,
    codigo: f.codigo,
    nombre: f.nombre,
    esBanderaRoja: f.es_bandera_roja,
    detalle: f.detalle,
  }));
}

export async function actualizarAntecedentesPaciente(
  db: Db,
  pacienteId: number,
  items: { antecedenteId: number; detalle?: string | null | undefined }[],
  registradoPor: string,
): Promise<void> {
  await db.tx(async (tx) => {
    await tx.query(`DELETE FROM clinico.paciente_antecedente WHERE paciente_id = $1`, [pacienteId]);
    for (const item of items) {
      await tx.query(
        `INSERT INTO clinico.paciente_antecedente (paciente_id, antecedente_id, detalle, registrado_por)
         VALUES ($1, $2, $3, $4)`,
        [pacienteId, item.antecedenteId, item.detalle ?? null, registradoPor],
      );
    }
  });
}

// --- Anamnesis (inmutable) --------------------------------------------------

export interface AnamnesisRegistro {
  id: number;
  reservaId: number | null;
  motivoConsulta: string | null;
  motivoDetalle: string | null;
  descripcionPaciente: string | null;
  enfermedadActual: string | null;
  inicioSintomas: string | null;
  causaAparente: string | null;
  tratamientosPrevios: string | null;
  respuestaTratamientos: string | null;
  objetivosTerapeuticos: string | null;
  registradoPor: string;
  registradoEn: string;
  anulaAId: number | null;
  motivoCorreccion: string | null;
}

export async function listarAnamnesis(db: Db, pacienteId: number): Promise<AnamnesisRegistro[]> {
  const r = await db.query<{
    id: number;
    reserva_id: number | null;
    motivo_consulta: string | null;
    motivo_detalle: string | null;
    descripcion_paciente: string | null;
    enfermedad_actual: string | null;
    inicio_sintomas: string | null;
    causa_aparente: string | null;
    tratamientos_previos: string | null;
    respuesta_tratamientos: string | null;
    objetivos_terapeuticos: string | null;
    registrado_por: string;
    registrado_en: string;
    anula_a_id: number | null;
    motivo_correccion: string | null;
  }>(
    `SELECT an.id, an.reserva_id, mc.nombre AS motivo_consulta, an.motivo_detalle, an.descripcion_paciente,
            an.enfermedad_actual, an.inicio_sintomas, an.causa_aparente, an.tratamientos_previos,
            an.respuesta_tratamientos, an.objetivos_terapeuticos, an.registrado_por, an.registrado_en,
            an.anula_a_id, an.motivo_correccion
       FROM clinico.anamnesis an
       LEFT JOIN catalogo.motivo_consulta mc ON mc.id = an.motivo_consulta_id
      WHERE an.paciente_id = $1
      ORDER BY an.registrado_en DESC`,
    [pacienteId],
  );
  return r.rows.map((f) => ({
    id: Number(f.id),
    reservaId: f.reserva_id !== null ? Number(f.reserva_id) : null,
    motivoConsulta: f.motivo_consulta,
    motivoDetalle: f.motivo_detalle,
    descripcionPaciente: f.descripcion_paciente,
    enfermedadActual: f.enfermedad_actual,
    inicioSintomas: f.inicio_sintomas,
    causaAparente: f.causa_aparente,
    tratamientosPrevios: f.tratamientos_previos,
    respuestaTratamientos: f.respuesta_tratamientos,
    objetivosTerapeuticos: f.objetivos_terapeuticos,
    registradoPor: f.registrado_por,
    registradoEn: f.registrado_en,
    anulaAId: f.anula_a_id !== null ? Number(f.anula_a_id) : null,
    motivoCorreccion: f.motivo_correccion,
  }));
}

export interface CrearAnamnesisInput {
  reservaId?: number | null | undefined;
  motivoConsultaId?: number | null | undefined;
  motivoDetalle?: string | null | undefined;
  descripcionPaciente?: string | null | undefined;
  enfermedadActual?: string | null | undefined;
  inicioSintomas?: string | null | undefined;
  causaAparente?: string | null | undefined;
  tratamientosPrevios?: string | null | undefined;
  respuestaTratamientos?: string | null | undefined;
  objetivosTerapeuticos?: string | null | undefined;
  anulaAId?: number | null | undefined;
  motivoCorreccion?: string | null | undefined;
}

export async function crearAnamnesis(
  db: Db,
  pacienteId: number,
  input: CrearAnamnesisInput,
  registradoPor: string,
): Promise<{ id: number }> {
  try {
    const r = await db.query<{ id: number }>(
      `INSERT INTO clinico.anamnesis
         (paciente_id, reserva_id, motivo_consulta_id, motivo_detalle, descripcion_paciente,
          enfermedad_actual, inicio_sintomas, causa_aparente, tratamientos_previos,
          respuesta_tratamientos, objetivos_terapeuticos, registrado_por, anula_a_id, motivo_correccion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        pacienteId,
        input.reservaId ?? null,
        input.motivoConsultaId ?? null,
        input.motivoDetalle ?? null,
        input.descripcionPaciente ?? null,
        input.enfermedadActual ?? null,
        input.inicioSintomas ?? null,
        input.causaAparente ?? null,
        input.tratamientosPrevios ?? null,
        input.respuestaTratamientos ?? null,
        input.objetivosTerapeuticos ?? null,
        registradoPor,
        input.anulaAId ?? null,
        input.motivoCorreccion ?? null,
      ],
    );
    return { id: Number(r.rows[0]!.id) };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

// --- Signos vitales (inmutable) --------------------------------------------

export interface SignosVitalesRegistro {
  id: number;
  sistolica: number | null;
  diastolica: number | null;
  frecuenciaCardiaca: number | null;
  frecuenciaRespiratoria: number | null;
  saturacionO2: number | null;
  pesoKg: number | null;
  tallaCm: number | null;
  imc: number | null;
  estadoTension: string | null;
  estadoFrecuenciaCardiaca: string | null;
  estadoFrecuenciaRespiratoria: string | null;
  estadoSaturacion: string | null;
  estadoImc: string | null;
  requiereAtencion: boolean;
  tomadoEn: string;
  tomadoPor: string | null;
}

export async function listarSignosVitales(db: Db, pacienteId: number): Promise<SignosVitalesRegistro[]> {
  const r = await db.query<{
    id: number;
    sistolica: number | null;
    diastolica: number | null;
    frecuencia_cardiaca: number | null;
    frecuencia_respiratoria: number | null;
    saturacion_o2: number | null;
    peso_kg: string | null;
    talla_cm: string | null;
    imc: string | null;
    estado_tension: string | null;
    estado_frecuencia_cardiaca: string | null;
    estado_frecuencia_respiratoria: string | null;
    estado_saturacion: string | null;
    estado_imc: string | null;
    requiere_atencion: boolean;
    tomado_en: string;
    tomado_por: string | null;
  }>(`SELECT * FROM clinico.v_signos_vitales WHERE paciente_id = $1 ORDER BY tomado_en DESC`, [pacienteId]);
  return r.rows.map((f) => ({
    id: Number(f.id),
    sistolica: f.sistolica,
    diastolica: f.diastolica,
    frecuenciaCardiaca: f.frecuencia_cardiaca,
    frecuenciaRespiratoria: f.frecuencia_respiratoria,
    saturacionO2: f.saturacion_o2,
    pesoKg: f.peso_kg !== null ? Number(f.peso_kg) : null,
    tallaCm: f.talla_cm !== null ? Number(f.talla_cm) : null,
    imc: f.imc !== null ? Number(f.imc) : null,
    estadoTension: f.estado_tension,
    estadoFrecuenciaCardiaca: f.estado_frecuencia_cardiaca,
    estadoFrecuenciaRespiratoria: f.estado_frecuencia_respiratoria,
    estadoSaturacion: f.estado_saturacion,
    estadoImc: f.estado_imc,
    // OR con NULL en SQL da NULL, no false, cuando falta algún signo vital
    // (ej. sin saturación registrada). Sin evidencia de alerta, no se marca.
    requiereAtencion: f.requiere_atencion ?? false,
    tomadoEn: f.tomado_en,
    tomadoPor: f.tomado_por,
  }));
}

export interface CrearSignosVitalesInput {
  reservaId?: number | null | undefined;
  sistolica?: number | null | undefined;
  diastolica?: number | null | undefined;
  frecuenciaCardiaca?: number | null | undefined;
  frecuenciaRespiratoria?: number | null | undefined;
  saturacionO2?: number | null | undefined;
  pesoKg?: number | null | undefined;
  tallaCm?: number | null | undefined;
}

export async function crearSignosVitales(
  db: Db,
  pacienteId: number,
  input: CrearSignosVitalesInput,
  tomadoPor: string,
): Promise<{ id: number }> {
  try {
    const r = await db.query<{ id: number }>(
      `INSERT INTO clinico.signos_vitales
         (paciente_id, reserva_id, sistolica, diastolica, frecuencia_cardiaca,
          frecuencia_respiratoria, saturacion_o2, peso_kg, talla_cm, tomado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        pacienteId,
        input.reservaId ?? null,
        input.sistolica ?? null,
        input.diastolica ?? null,
        input.frecuenciaCardiaca ?? null,
        input.frecuenciaRespiratoria ?? null,
        input.saturacionO2 ?? null,
        input.pesoKg ?? null,
        input.tallaCm ?? null,
        tomadoPor,
      ],
    );
    return { id: Number(r.rows[0]!.id) };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

// --- Evaluación de dolor (inmutable) ----------------------------------------

export interface EvaluacionDolorRegistro {
  id: number;
  intensidad: number;
  clasificacion: string;
  comportamiento: string | null;
  localizacion: string | null;
  zona: string | null;
  tiposDolor: string[];
  evaluadoEn: string;
  evaluadoPor: string | null;
}

export async function listarEvaluacionesDolor(db: Db, pacienteId: number): Promise<EvaluacionDolorRegistro[]> {
  const r = await db.query<{
    id: number;
    intensidad: number;
    clasificacion: string;
    comportamiento: string | null;
    localizacion: string | null;
    zona: string | null;
    tipos_dolor: string[] | null;
    evaluado_en: string;
    evaluado_por: string | null;
  }>(
    `SELECT ed.id, ed.intensidad, v.clasificacion, ed.comportamiento, ed.localizacion,
            za.nombre AS zona, v.tipos_dolor, ed.evaluado_en, ed.evaluado_por
       FROM clinico.evaluacion_dolor ed
       JOIN clinico.v_evaluacion_dolor v ON v.id = ed.id
       LEFT JOIN catalogo.zona_anatomica za ON za.id = ed.zona_id
      WHERE ed.paciente_id = $1
      ORDER BY ed.evaluado_en DESC`,
    [pacienteId],
  );
  return r.rows.map((f) => ({
    id: Number(f.id),
    intensidad: f.intensidad,
    clasificacion: f.clasificacion,
    comportamiento: f.comportamiento,
    localizacion: f.localizacion,
    zona: f.zona,
    tiposDolor: f.tipos_dolor ?? [],
    evaluadoEn: f.evaluado_en,
    evaluadoPor: f.evaluado_por,
  }));
}

export interface CrearEvaluacionDolorInput {
  reservaId?: number | null | undefined;
  intensidad: number;
  comportamiento?: string | null | undefined;
  localizacion?: string | null | undefined;
  zonaId?: number | null | undefined;
  tiposDolorIds?: number[] | undefined;
}

export async function crearEvaluacionDolor(
  db: Db,
  pacienteId: number,
  input: CrearEvaluacionDolorInput,
  evaluadoPor: string,
): Promise<{ id: number }> {
  try {
    return await db.tx(async (tx) => {
      const r = await tx.query<{ id: number }>(
        `INSERT INTO clinico.evaluacion_dolor
           (paciente_id, reserva_id, intensidad, comportamiento, localizacion, zona_id, evaluado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          pacienteId,
          input.reservaId ?? null,
          input.intensidad,
          input.comportamiento ?? null,
          input.localizacion ?? null,
          input.zonaId ?? null,
          evaluadoPor,
        ],
      );
      const id = Number(r.rows[0]!.id);
      for (const tipoDolorId of input.tiposDolorIds ?? []) {
        await tx.query(
          `INSERT INTO clinico.evaluacion_dolor_tipo (evaluacion_id, tipo_dolor_id) VALUES ($1, $2)`,
          [id, tipoDolorId],
        );
      }
      return { id };
    });
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

// --- Evolución / nota SOAP por sesión (inmutable) --------------------------

export interface EvolucionRegistro {
  id: number;
  reservaId: number;
  subjetivo: string | null;
  objetivo: string | null;
  analisis: string | null;
  plan: string | null;
  tecnicasAplicadas: string | null;
  registradoPor: string;
  registradoEn: string;
  anulaAId: number | null;
  motivoCorreccion: string | null;
}

export async function listarEvoluciones(db: Db, pacienteId: number): Promise<EvolucionRegistro[]> {
  const r = await db.query<{
    id: number;
    reserva_id: number;
    subjetivo: string | null;
    objetivo: string | null;
    analisis: string | null;
    plan: string | null;
    tecnicas_aplicadas: string | null;
    registrado_por: string;
    registrado_en: string;
    anula_a_id: number | null;
    motivo_correccion: string | null;
  }>(
    `SELECT id, reserva_id, subjetivo, objetivo, analisis, plan, tecnicas_aplicadas,
            registrado_por, registrado_en, anula_a_id, motivo_correccion
       FROM clinico.evolucion
      WHERE paciente_id = $1
      ORDER BY registrado_en DESC`,
    [pacienteId],
  );
  return r.rows.map((f) => ({
    id: Number(f.id),
    reservaId: Number(f.reserva_id),
    subjetivo: f.subjetivo,
    objetivo: f.objetivo,
    analisis: f.analisis,
    plan: f.plan,
    tecnicasAplicadas: f.tecnicas_aplicadas,
    registradoPor: f.registrado_por,
    registradoEn: f.registrado_en,
    anulaAId: f.anula_a_id !== null ? Number(f.anula_a_id) : null,
    motivoCorreccion: f.motivo_correccion,
  }));
}

export interface CrearEvolucionInput {
  reservaId: number;
  subjetivo?: string | null | undefined;
  objetivo?: string | null | undefined;
  analisis?: string | null | undefined;
  plan?: string | null | undefined;
  tecnicasAplicadas?: string | null | undefined;
  anulaAId?: number | null | undefined;
  motivoCorreccion?: string | null | undefined;
}

export async function crearEvolucion(
  db: Db,
  pacienteId: number,
  input: CrearEvolucionInput,
  registradoPor: string,
): Promise<{ id: number }> {
  try {
    const r = await db.query<{ id: number }>(
      `INSERT INTO clinico.evolucion
         (paciente_id, reserva_id, subjetivo, objetivo, analisis, plan, tecnicas_aplicadas,
          registrado_por, anula_a_id, motivo_correccion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        pacienteId,
        input.reservaId,
        input.subjetivo ?? null,
        input.objetivo ?? null,
        input.analisis ?? null,
        input.plan ?? null,
        input.tecnicasAplicadas ?? null,
        registradoPor,
        input.anulaAId ?? null,
        input.motivoCorreccion ?? null,
      ],
    );
    return { id: Number(r.rows[0]!.id) };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

// --- Citas del paciente (historial completo, sin límite de fechas) --------

export interface CitaPacienteAdmin {
  reservaId: number;
  estado: string;
  iniciaEn: string;
  terminaEn: string;
  servicio: string | null;
  sede: string;
  canal: string;
}

export async function listarCitasDePaciente(db: Db, pacienteId: number): Promise<CitaPacienteAdmin[]> {
  const r = await db.query<{
    reserva_id: number;
    estado: string;
    inicia_en: string;
    termina_en: string;
    servicio_nombre: string | null;
    sede_nombre: string;
    canal_origen: string;
  }>(
    `SELECT reserva_id, estado, inicia_en, termina_en, servicio_nombre, sede_nombre, canal_origen
       FROM agenda.v_cita
      WHERE paciente_id = $1
      ORDER BY inicia_en DESC`,
    [pacienteId],
  );
  return r.rows.map((f) => ({
    reservaId: Number(f.reserva_id),
    estado: f.estado,
    iniciaEn: f.inicia_en,
    terminaEn: f.termina_en,
    servicio: f.servicio_nombre,
    sede: f.sede_nombre,
    canal: f.canal_origen,
  }));
}

// --- Agendar la próxima cita, ya confirmada (sin pago pendiente: la      --
// --- paciente está físicamente presente y Lina la confirma directamente) --

export async function agendarProximaCitaAdmin(
  db: Db,
  opts: { pacienteId: number; servicioId: number; sedeId: number; iniciaEnIso: string; creadoPor: string },
): Promise<{ reservaId: number }> {
  const { reservaId } = await agenda.crearSesion(db, {
    pacienteId: opts.pacienteId,
    servicioId: opts.servicioId,
    sedeId: opts.sedeId,
    iniciaEnIso: opts.iniciaEnIso,
    creadoPor: opts.creadoPor,
  });
  await confirmarCita(db, reservaId);
  return { reservaId };
}
