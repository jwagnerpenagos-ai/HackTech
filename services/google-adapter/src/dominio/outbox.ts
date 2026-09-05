import type { Db } from "../db.js";

/**
 * Espejo de `integracion.outbox` (schema.sql). `tomarPendientes` delega en
 * `integracion.tomar_pendientes()`, que ya marca las filas como
 * 'en_proceso' e incrementa `intentos` de forma atómica (SKIP LOCKED): dos
 * ejecuciones concurrentes de este consumidor nunca toman el mismo evento.
 */
export interface EventoOutbox {
  id: number;
  agregadoTipo: string;
  agregadoId: number;
  tipoEvento: string;
  destino: string | null;
  payload: Record<string, unknown>;
  intentos: number;
  maxIntentos: number;
}

interface FilaOutbox {
  id: number;
  agregado_tipo: string;
  agregado_id: number;
  tipo_evento: string;
  destino: string | null;
  payload: Record<string, unknown>;
  intentos: number;
  max_intentos: number;
}

export async function tomarPendientes(db: Db, limite: number): Promise<EventoOutbox[]> {
  const r = await db.query<FilaOutbox>(`SELECT * FROM integracion.tomar_pendientes($1)`, [limite]);
  return r.rows.map((f) => ({
    id: f.id,
    agregadoTipo: f.agregado_tipo,
    agregadoId: f.agregado_id,
    tipoEvento: f.tipo_evento,
    destino: f.destino,
    payload: f.payload,
    intentos: f.intentos,
    maxIntentos: f.max_intentos,
  }));
}

export async function marcarCompletado(db: Db, id: number): Promise<void> {
  await db.query(
    `UPDATE integracion.outbox SET estado = 'completado', procesado_en = now() WHERE id = $1`,
    [id],
  );
}

/**
 * `intentos`/`max_intentos` ya reflejan el intento actual (incrementado por
 * `tomar_pendientes`): si se agotaron, se descarta en vez de reintentar para
 * siempre. Un pequeño backoff lineal evita machacar la API de Google ante
 * una falla persistente (credenciales vencidas, cuota, etc.).
 */
export async function marcarFallido(
  db: Db,
  evento: Pick<EventoOutbox, "id" | "intentos" | "maxIntentos">,
  error: string,
): Promise<void> {
  const agotado = evento.intentos >= evento.maxIntentos;
  await db.query(
    `UPDATE integracion.outbox
        SET estado = $2,
            ultimo_error = $3,
            disponible_desde = now() + make_interval(secs => $4)
      WHERE id = $1`,
    [evento.id, agotado ? "descartado" : "fallido", error.slice(0, 2000), Math.min(evento.intentos * 30, 300)],
  );
}
