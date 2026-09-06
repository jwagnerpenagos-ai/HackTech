/**
 * Errores de dominio con un código estable (para el cliente) y un status
 * HTTP asociado. `normalizarErrorDb` traduce las excepciones que lanzan las
 * funciones PL/pgSQL de `db/migrations/schema.sql` (que ya vienen con un
 * ERRCODE con intención semántica, ver comentarios en `agenda.crear_reserva`
 * y compañía) a este mismo formato, para que nada específico de Postgres
 * se filtre hacia el bot o hacia n8n.
 */
export class ErrorDominio extends Error {
  readonly codigo: string;
  readonly status: number;

  constructor(mensaje: string, codigo: string, status: number) {
    super(mensaje);
    this.name = "ErrorDominio";
    this.codigo = codigo;
    this.status = status;
  }
}

interface MapeoSqlstate {
  codigo: string;
  status: number;
}

// SQLSTATE ↔ nombre de condición PL/pgSQL usados en schema.sql:
//   no_data_found        -> P0002  (RAISE ... USING ERRCODE = 'no_data_found')
//   null_value_not_allowed -> 22004
//   check_violation       -> 23514
//   unique_violation      -> 23505
//   exclusion_violation   -> 23P01 (crear_reserva la re-lanza como unique_violation)
const MAPA_SQLSTATE: Record<string, MapeoSqlstate> = {
  P0002: { codigo: "no_encontrado", status: 404 },
  "22004": { codigo: "datos_incompletos", status: 422 },
  "23514": { codigo: "regla_de_negocio", status: 409 },
  "23505": { codigo: "conflicto", status: 409 },
  "23P01": { codigo: "conflicto", status: 409 },
};

function tieneCodigo(err: unknown): err is { code: unknown; message?: unknown } {
  return typeof err === "object" && err !== null && "code" in err;
}

export function normalizarErrorDb(err: unknown): ErrorDominio {
  if (err instanceof ErrorDominio) return err; // ya normalizado: pasa tal cual
  if (tieneCodigo(err)) {
    const codigoSql = typeof err.code === "string" ? err.code : "";
    const mensaje = typeof err.message === "string" ? err.message : "Error de base de datos.";
    const mapeo = MAPA_SQLSTATE[codigoSql];
    if (mapeo) return new ErrorDominio(mensaje, mapeo.codigo, mapeo.status);
    return new ErrorDominio(mensaje, "error_bd", 500);
  }
  const mensaje = err instanceof Error ? err.message : String(err);
  return new ErrorDominio(mensaje, "error_interno", 500);
}
