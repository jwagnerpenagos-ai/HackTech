import type { Db } from "../db.js";

export interface AutorizacionCalendarPaciente {
  pacienteId: number;
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiraEn: Date | null;
}

/**
 * `personas.autorizacion_calendar_paciente`: consentimiento OPCIONAL del
 * paciente para escribir en SU propio Calendar (distinto del calendario de
 * la sede, que se sincroniza siempre vía el outbox). Se sobrescribe si el
 * paciente vuelve a autorizar.
 */
export async function guardarAutorizacion(db: Db, a: AutorizacionCalendarPaciente): Promise<void> {
  await db.query(
    `INSERT INTO personas.autorizacion_calendar_paciente (paciente_id, access_token, refresh_token, scope, expira_en)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (paciente_id)
     DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
                   scope = EXCLUDED.scope, expira_en = EXCLUDED.expira_en, otorgado_en = now(), revocado_en = NULL`,
    [a.pacienteId, a.accessToken, a.refreshToken, a.scope, a.expiraEn],
  );
}
