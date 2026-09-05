import { Pool, type QueryResultRow } from "pg";
import type { Config } from "./config.js";

/**
 * Frontera con PostgreSQL, mismo contrato que services/core-api/src/db.ts:
 * el dominio programa contra esta interfaz, nunca contra `pg` directamente,
 * para poder inyectar una base falsa en las pruebas.
 */
export interface Db {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  query<T extends QueryResultRow = QueryResultRow>(
    texto: string,
    valores?: unknown[],
  ): Promise<{ rows: T[] }>;
}

let pool: Pool | null = null;

export function construirDb(cfg: Config): Db {
  pool ??= new Pool({ connectionString: cfg.DATABASE_URL, max: 5 });
  const p = pool;
  return {
    query: async (texto, valores = []) => p.query(texto, valores),
  };
}

/** Cierra el pool. Solo se usa al apagar el proceso. */
export async function cerrarDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Solo para pruebas: descarta el pool memorizado. */
export function _resetDbForTests(): void {
  pool = null;
}
