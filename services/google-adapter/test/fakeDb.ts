import type { QueryResultRow } from "pg";
import type { Db } from "../src/db.js";

export interface LlamadaDb {
  texto: string;
  valores: unknown[];
}

/** Misma idea que services/core-api/test/fakeDb.ts: cola de respuestas en el orden esperado. */
export function crearDbFalsa(colaRespuestas: unknown[][] = []): { db: Db; llamadas: LlamadaDb[] } {
  const llamadas: LlamadaDb[] = [];
  let indice = 0;

  const db: Db = {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- espejo del generic de Db.query
    query: <T extends QueryResultRow = QueryResultRow>(texto: string, valores: unknown[] = []) => {
      llamadas.push({ texto, valores });
      const filas = (colaRespuestas[indice] ?? []) as T[];
      indice += 1;
      return Promise.resolve({ rows: filas });
    },
  };

  return { db, llamadas };
}
