import type { Db } from "../db.js";

/**
 * Búsqueda de pacientes por nombre escrito a mano (con errores de
 * digitación y sin tildes) usando `personas.v_paciente` y el índice trigram
 * que ya define `db/migrations/schema.sql` sobre nombres + apellidos.
 */

export interface Paciente {
  id: number;
  nombreCompleto: string;
  telefono: string | null;
  email: string | null;
}

export type ResultadoBusquedaPaciente =
  | { tipo: "unico"; paciente: Paciente }
  | { tipo: "ambiguo"; candidatos: Paciente[] }
  | { tipo: "no_encontrado" };

export type ResultadoIdentidadChat =
  | { tipo: "conocido"; paciente: Paciente }
  | { tipo: "desconocido" };

interface FilaPaciente {
  id: number;
  nombre_completo: string;
  telefono: string | null;
  email: string | null;
}

export async function buscarPaciente(db: Db, nombre: string): Promise<ResultadoBusquedaPaciente> {
  const r = await db.query<FilaPaciente>(
    `SELECT id, nombre_completo, telefono, email
       FROM personas.v_paciente
      WHERE activo
        AND sin_tildes(lower(nombre_completo)) % sin_tildes(lower($1))
      ORDER BY similarity(sin_tildes(lower(nombre_completo)), sin_tildes(lower($1))) DESC
      LIMIT 5`,
    [nombre],
  );

  const candidatos: Paciente[] = r.rows.map((f) => ({
    id: f.id,
    nombreCompleto: f.nombre_completo,
    telefono: f.telefono,
    email: f.email ?? null,
  }));

  const [primero] = candidatos;
  if (primero === undefined) return { tipo: "no_encontrado" };
  if (candidatos.length === 1) return { tipo: "unico", paciente: primero };
  return { tipo: "ambiguo", candidatos };
}

/**
 * Identidad por canal: `personas.vinculo_telegram` vincula un chat_id de
 * Telegram con un paciente (schema.sql: "un chat sin paciente vinculado es
 * un desconocido: puede consultar el catálogo pero no ver ni agendar nada a
 * nombre de otro"). Esto es lo que permite reconocer a un paciente que
 * vuelve a escribir sin pedirle sus datos de nuevo.
 */
export async function resolverPorChatId(db: Db, chatId: number): Promise<ResultadoIdentidadChat> {
  const r = await db.query<FilaPaciente>(
    `SELECT p.id, p.nombres || ' ' || p.apellidos AS nombre_completo, p.telefono, p.email
       FROM personas.vinculo_telegram v
       JOIN personas.paciente p ON p.id = v.paciente_id
      WHERE v.chat_id = $1 AND NOT v.bloqueado AND p.activo`,
    [chatId],
  );
  const fila = r.rows[0];
  if (fila === undefined) return { tipo: "desconocido" };
  return {
    tipo: "conocido",
    paciente: { id: fila.id, nombreCompleto: fila.nombre_completo, telefono: fila.telefono, email: fila.email ?? null },
  };
}

/**
 * ¿Este paciente ya ASISTIÓ a una valoración inicial? No basta con haberla
 * reservado o pagado: la regla del consultorio es que solo después de la
 * consulta de valoración se habilitan los demás servicios. Una inasistencia
 * (`no_asistio`) cuenta como realizada, igual que en la política de cancelación.
 */
export async function tieneValoracionAtendida(db: Db, pacienteId: number): Promise<boolean> {
  const r = await db.query<{ existe: boolean }>(
    `SELECT EXISTS (
        SELECT 1
          FROM agenda.reserva r
          JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
          JOIN catalogo.servicio s ON s.id = r.servicio_id
         WHERE rp.paciente_id = $1
           AND r.tipo = 'cita'
           AND s.codigo = 'VALORACION'
           AND r.estado IN ('atendida', 'no_asistio')
     ) AS existe`,
    [pacienteId],
  );
  return r.rows[0]?.existe === true;
}

/**
 * Primera cita: crea el paciente y su vínculo con el chat en una sola
 * transacción, para no dejar un chat "a medio registrar" si algo falla.
 * `nombreCompleto` se parte en nombres/apellidos por el primer espacio; sin
 * segundo token, apellidos repite nombres (mejor que dejarlo vacío para el
 * MVP — Lina puede completar la ficha después).
 */
export async function crearPacienteConVinculo(
  db: Db,
  opts: { nombreCompleto: string; telefono: string; email?: string | null; chatId: number },
): Promise<Paciente> {
  return db.tx(async (tx) => {
    const partes = opts.nombreCompleto.trim().split(/\s+/);
    const nombres = partes[0] ?? opts.nombreCompleto;
    const apellidos = partes.slice(1).join(" ") || nombres;

    const r = await tx.query<{ id: number }>(
      `INSERT INTO personas.paciente (nombres, apellidos, telefono, email)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [nombres, apellidos, opts.telefono, opts.email ?? null],
    );
    const pacienteId = (r.rows[0] as { id: number }).id;

    await tx.query(
      `INSERT INTO personas.vinculo_telegram (chat_id, paciente_id, verificado_en)
       VALUES ($1, $2, now())`,
      [opts.chatId, pacienteId],
    );

    return {
      id: pacienteId,
      nombreCompleto: `${nombres} ${apellidos}`.trim(),
      telefono: opts.telefono,
      email: opts.email ?? null,
    };
  });
}
