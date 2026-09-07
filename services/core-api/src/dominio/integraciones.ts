import type { Db } from "../db.js";
import { ErrorDominio, normalizarErrorDb } from "../errores.js";

/**
 * Acciones que no le pertenecen a core-api ejecutar directamente: enviar
 * correo y crear carpetas requieren las credenciales OAuth de Google, que
 * viven únicamente en `services/google-adapter` (regla 4 del README: "el
 * modelo de IA no tiene credenciales", y por extensión tampoco las tiene
 * quien orquesta la intención sin ser el adaptador).
 *
 * Por eso estas dos escriben en `integracion.outbox` y devuelven de
 * inmediato: n8n las toma con `integracion.tomar_pendientes()` y
 * google-adapter las ejecuta. `agregado_id = 0` porque, a diferencia de una
 * reserva, esto no está atado a una entidad de negocio existente.
 */

export async function enviarCorreo(
  db: Db,
  opts: { destinatario: string; asunto: string; texto: string },
): Promise<{ outboxId: number }> {
  try {
    const r = await db.query<{ id: number }>(
      `INSERT INTO integracion.outbox (agregado_tipo, agregado_id, tipo_evento, destino, payload)
       VALUES ('correo_manual', 0, 'correo.enviar', 'gmail', $1::jsonb)
       RETURNING id`,
      [JSON.stringify({ destinatario: opts.destinatario, asunto: opts.asunto, texto: opts.texto })],
    );
    return { outboxId: (r.rows[0] as { id: number }).id };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

const ETIQUETAS_ESTADO_RESERVA: Record<string, string> = {
  propuesta: "Propuesta",
  pendiente_pago: "Pendiente de pago",
  confirmada: "Confirmada",
  en_curso: "En curso",
  atendida: "Atendida",
  no_asistio: "No asistió",
  cancelada_tarde: "Cancelada (tarde)",
  cancelada_a_tiempo: "Cancelada (a tiempo)",
  expirada: "Expirada",
  rechazada: "Rechazada",
};

/**
 * Respaldo en Sheets del estado de una cita (ver services/google-adapter,
 * destino='sheets'): confirmación, cancelación, asistencia registrada, etc.
 * Cada reserva ocupa UNA fila que se sobreescribe en cada cambio — el
 * mapeo fila↔reserva lo lleva `integracion.google_recurso` del lado del
 * adaptador, acá solo se encola el evento con el estado ya legible.
 *
 * Si la reserva ya no existe o no tiene participante (no debería pasar,
 * pero no es motivo para tumbar la operación que disparó esto), simplemente
 * no encola nada.
 */
export async function sincronizarEstadoReservaEnSheet(db: Db, reservaId: number, estado: string): Promise<void> {
  try {
    const r = await db.query<{
      paciente: string;
      servicio: string | null;
      sede: string | null;
      inicia_en: string;
    }>(
      `SELECT (pa.nombres || ' ' || pa.apellidos) AS paciente,
              s.nombre AS servicio, se.nombre AS sede,
              lower(r.franja_clinica) AS inicia_en
         FROM agenda.reserva r
         JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
         JOIN personas.paciente pa ON pa.id = rp.paciente_id
         LEFT JOIN catalogo.servicio s ON s.id = r.servicio_id
         LEFT JOIN catalogo.sede se ON se.id = r.sede_id
        WHERE r.id = $1
        LIMIT 1`,
      [reservaId],
    );
    const f = r.rows[0];
    if (!f) return;
    await db.query(
      `INSERT INTO integracion.outbox (agregado_tipo, agregado_id, tipo_evento, destino, payload)
       VALUES ('reserva', $1, 'reserva.estado_cambiado', 'sheets', $2::jsonb)`,
      [
        reservaId,
        JSON.stringify({
          fecha: f.inicia_en,
          paciente: f.paciente,
          servicio: f.servicio ?? "",
          sede: f.sede ?? "",
          estado: ETIQUETAS_ESTADO_RESERVA[estado] ?? estado,
        }),
      ],
    );
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

export async function crearCarpeta(db: Db, opts: { carpeta: string }): Promise<{ outboxId: number }> {
  try {
    const r = await db.query<{ id: number }>(
      `INSERT INTO integracion.outbox (agregado_tipo, agregado_id, tipo_evento, destino, payload)
       VALUES ('carpeta_manual', 0, 'drive.crear_carpeta', 'drive', $1::jsonb)
       RETURNING id`,
      [JSON.stringify({ carpeta: opts.carpeta })],
    );
    return { outboxId: (r.rows[0] as { id: number }).id };
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

/**
 * GAP CONOCIDO: buscar un archivo por nombre requiere consultar Drive en
 * vivo (`integracion.google_recurso` es un espejo de sincronización, no un
 * índice de nombres de archivo) y `services/google-adapter` todavía no
 * existe. Se deja el error explícito en vez de fingir un resultado vacío.
 */
export function buscarArchivo(): never {
  throw new ErrorDominio(
    "Buscar archivos en Drive requiere el adaptador de Google, que todavía no está implementado.",
    "no_implementado",
    501,
  );
}
