import type { Db } from "../db.js";
import { ErrorDominio, normalizarErrorDb } from "../errores.js";
import { profesionalPorDefecto } from "./catalogo.js";
import * as integraciones from "./integraciones.js";

/**
 * Capa fina sobre las funciones de negocio de `agenda.*` en
 * `db/migrations/schema.sql`. A propósito NO reimplementa reglas (duración,
 * buffers, ventana de cancelación, anti-solapamiento): todo eso ya vive en
 * el motor. Esta capa solo traduce nombres en español ↔ parámetros SQL y
 * homogeneiza errores con `normalizarErrorDb`.
 */

export interface Cita {
  reservaId: number;
  reservaUuid: string;
  estado: string;
  iniciaEn: string;
  terminaEn: string;
  sede: string;
  servicio: string | null;
  paciente: string | null;
}

interface FilaCita {
  reserva_id: number;
  reserva_uuid: string;
  estado: string;
  inicia_en: string;
  termina_en: string;
  sede_nombre: string;
  servicio_nombre: string | null;
  paciente_nombre: string | null;
}

function filaACita(f: FilaCita): Cita {
  return {
    reservaId: f.reserva_id,
    reservaUuid: f.reserva_uuid,
    estado: f.estado,
    iniciaEn: f.inicia_en,
    terminaEn: f.termina_en,
    sede: f.sede_nombre,
    servicio: f.servicio_nombre,
    paciente: f.paciente_nombre,
  };
}

export async function consultarAgenda(
  db: Db,
  opts: { desdeIso: string; hastaIso: string; sedeNombre?: string | null; pacienteId?: number | null },
): Promise<Cita[]> {
  const r = await db.query<FilaCita>(
    `SELECT reserva_id, reserva_uuid, estado, inicia_en, termina_en, sede_nombre, servicio_nombre, paciente_nombre
       FROM agenda.v_cita
      WHERE inicia_en >= $1 AND inicia_en < $2
        AND ($3::text IS NULL OR sede_nombre ILIKE $3)
        AND ($4::bigint IS NULL OR paciente_id = $4)
        AND estado NOT IN ('rechazada', 'expirada', 'cancelada_a_tiempo', 'cancelada_tarde')
      ORDER BY inicia_en`,
    [opts.desdeIso, opts.hastaIso, opts.sedeNombre ? `%${opts.sedeNombre}%` : null, opts.pacienteId ?? null],
  );
  return r.rows.map(filaACita);
}

export async function consultarDisponibilidad(
  db: Db,
  opts: { servicioId: number; sedeId: number; fecha: string; profesionalId?: number | null },
): Promise<{ inicio: string; fin: string }[]> {
  try {
    const r = await db.query<{ slot_inicio: string; slot_fin: string }>(
      `SELECT slot_inicio, slot_fin FROM agenda.slots_disponibles($1, $2, $3, $4)`,
      [opts.servicioId, opts.sedeId, opts.fecha, opts.profesionalId ?? null],
    );
    return r.rows.map((f) => ({ inicio: f.slot_inicio, fin: f.slot_fin }));
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

export interface SlotConSede {
  inicio: string;
  fin: string;
  fecha: string; // AAAA-MM-DD
  sede: string;
}

const MS_24H = 24 * 60 * 60 * 1000;

/**
 * Los próximos `limite` horarios disponibles desde `desdeFecha` (AAAA-MM-DD),
 * en orden cronológico, recorriendo día por día hasta `horizonteDias`. Si un
 * día tiene muchos huecos, todos los `limite` pueden salir de ese día (son los
 * más próximos). La sede de cada día la fija la regla del consultorio (Tunja
 * L-V, Turmequé S-D). Descarta lo que caiga a menos de 24 h.
 */
export async function proximosSlots(
  db: Db,
  opts: {
    servicioId: number;
    desdeFecha: string;
    limite: number;
    horizonteDias: number;
    sedes: { tunja: number; turmeque: number };
  },
): Promise<SlotConSede[]> {
  const out: SlotConSede[] = [];
  const cursor = new Date(`${opts.desdeFecha}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return out;

  for (let i = 0; i < opts.horizonteDias && out.length < opts.limite; i += 1) {
    const fecha = cursor.toISOString().slice(0, 10);
    const finde = cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6;
    const sedeId = finde ? opts.sedes.turmeque : opts.sedes.tunja;
    const sedeNombre = finde ? "Sede Turmequé" : "Sede Tunja";
    try {
      const slots = await consultarDisponibilidad(db, { servicioId: opts.servicioId, sedeId, fecha });
      for (const s of slots) {
        if (out.length >= opts.limite) break;
        if (new Date(s.inicio).getTime() - Date.now() >= MS_24H) {
          out.push({ inicio: s.inicio, fin: s.fin, fecha, sede: sedeNombre });
        }
      }
    } catch {
      // un día sin horario / error puntual no corta la búsqueda
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export interface ResultadoCrearSesion {
  reservaId: number;
  compraId?: number;
  montoTotal?: number;
  moneda?: string;
}

export async function crearSesion(
  db: Db,
  opts: {
    pacienteId: number;
    servicioId: number;
    sedeId: number;
    iniciaEnIso: string;
    creadoPor?: string | null;
    /**
     * Si se pasa, la cita nace ligada a una `comercial.compra` de 1 sesión
     * con este precio, en estado `pendiente_pago`, y `reserva_expira_en` se
     * fija en LEAST(now()+24h, inicia−24h). El pago se reporta y verifica
     * aparte (ver dominio/pagos.ts). Sin tarifa: comportamiento antiguo,
     * sin compra (lo usa `modificarSesion`).
     */
    tarifa?: { id: number; nombre: string; valorTotal: number; moneda: string };
  },
): Promise<ResultadoCrearSesion> {
  try {
    return await db.tx(async (tx) => {
      const r = await tx.query<{ crear_reserva: number }>(
        `SELECT agenda.crear_reserva(
           p_paciente_id := $1, p_servicio_id := $2, p_sede_id := $3,
           p_inicia_en := $4, p_canal := 'telegram', p_creado_por := $5
         ) AS crear_reserva`,
        [opts.pacienteId, opts.servicioId, opts.sedeId, opts.iniciaEnIso, opts.creadoPor ?? null],
      );
      const reservaId = Number((r.rows[0] as { crear_reserva: number | string }).crear_reserva);
      const tarifa = opts.tarifa;
      if (!tarifa) return { reservaId };

      const c = await tx.query<{ id: number }>(
        `INSERT INTO comercial.compra
           (paciente_id, tarifa_id, servicio_id, servicio_nombre, tarifa_nombre,
            sesiones_incluidas, cupo_personas, valor_total, moneda, estado, canal_origen)
         SELECT $1, $2, $3, s.nombre, $4, 1, 1, $5, $6, 'pendiente_pago', 'telegram'
           FROM catalogo.servicio s WHERE s.id = $3
         RETURNING id`,
        [opts.pacienteId, tarifa.id, opts.servicioId, tarifa.nombre, tarifa.valorTotal, tarifa.moneda],
      );
      const compraId = Number((c.rows[0] as { id: number | string }).id);

      await tx.query(`UPDATE agenda.reserva_participante SET compra_id = $1 WHERE reserva_id = $2`, [
        compraId,
        reservaId,
      ]);
      await tx.query(
        `UPDATE agenda.reserva
            SET reserva_expira_en = LEAST(now() + interval '24 hours',
                                          lower(franja_clinica) - interval '24 hours')
          WHERE id = $1 AND estado = 'pendiente_pago'`,
        [reservaId],
      );
      return { reservaId, compraId, montoTotal: tarifa.valorTotal, moneda: tarifa.moneda };
    });
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

/** ¿La reserva tiene a ese paciente como participante? (para el candado de "solo cancelo lo mío"). */
export async function reservaEsDelPaciente(db: Db, reservaId: number, pacienteId: number): Promise<boolean> {
  const r = await db.query(
    `SELECT 1 FROM agenda.reserva_participante WHERE reserva_id = $1 AND paciente_id = $2 LIMIT 1`,
    [reservaId, pacienteId],
  );
  return r.rows.length > 0;
}

export async function cancelarSesion(
  db: Db,
  opts: { reservaId: number; motivo: string; por?: string | null },
): Promise<{ estado: string }> {
  try {
    return await db.tx(async (tx) => {
      const r = await tx.query<{ estado: string }>(
        `SELECT agenda.cancelar_reserva($1, $2, $3) AS estado`,
        [opts.reservaId, opts.motivo, opts.por ?? null],
      );
      const estado = (r.rows[0] as { estado: string }).estado;
      await integraciones.sincronizarEstadoReservaEnSheet(tx, opts.reservaId, estado);
      return { estado };
    });
  } catch (err) {
    throw normalizarErrorDb(err);
  }
}

/**
 * Reprograma una cita. `schema.sql` todavía no tiene una función atómica
 * `agenda.modificar_reserva`: se compone cancelando la reserva original y
 * creando una nueva con la misma paciente/servicio/sede, dentro de una sola
 * transacción para no perder la cita si el nuevo horario ya no está libre.
 *
 * GAP CONOCIDO (para coordinar con Simón / db/): esto pierde el historial
 * de la reserva original como "la misma cita reprogramada" — queda como
 * "cancelada_a_tiempo" + una reserva nueva, en vez de un solo registro
 * actualizado. Suficiente para el MVP; una función SQL dedicada sería la
 * forma correcta de resolverlo.
 */
export async function modificarSesion(
  db: Db,
  opts: { reservaId: number; nuevaIniciaEnIso: string; motivo: string; por?: string | null },
): Promise<{ reservaId: number; estado: string; compraId: number | null; montoTotal: number | null }> {
  const actual = await db.query<{
    paciente_id: number;
    servicio_id: number | null;
    sede_id: number;
    estado: string;
    compra_id: number | string | null;
  }>(
    `SELECT rp.paciente_id, r.servicio_id, r.sede_id, r.estado, rp.compra_id
       FROM agenda.reserva r
       JOIN agenda.reserva_participante rp ON rp.reserva_id = r.id
      WHERE r.id = $1
      LIMIT 1`,
    [opts.reservaId],
  );
  const fila = actual.rows[0];
  if (fila === undefined) {
    throw new ErrorDominio("La sesión no existe.", "no_encontrado", 404);
  }
  if (fila.servicio_id === null) {
    throw new ErrorDominio("La sesión no tiene un servicio asociado.", "no_encontrado", 404);
  }
  // Variables locales (no accesos a propiedad) para que la reducción de
  // null/undefined siga siendo válida dentro del closure de `db.tx`.
  const { paciente_id: pacienteId, servicio_id: servicioId, sede_id: sedeId } = fila;
  const estadoViejo = fila.estado;
  const compraId = fila.compra_id === null ? null : Number(fila.compra_id);

  return db.tx(async (tx) => {
    await cancelarSesion(tx, { reservaId: opts.reservaId, motivo: opts.motivo, por: opts.por ?? null });
    const { reservaId: nueva } = await crearSesion(tx, {
      pacienteId,
      servicioId,
      sedeId,
      iniciaEnIso: opts.nuevaIniciaEnIso,
      creadoPor: opts.por ?? null,
    });

    let estado = "pendiente_pago";
    let montoTotal: number | null = null;
    if (compraId !== null) {
      // Se mueve la compra (y su pago) de la cita vieja a la nueva.
      await tx.query(`UPDATE agenda.reserva_participante SET compra_id = NULL WHERE reserva_id = $1`, [opts.reservaId]);
      await tx.query(`UPDATE agenda.reserva_participante SET compra_id = $1 WHERE reserva_id = $2`, [compraId, nueva]);
      if (estadoViejo === "confirmada") {
        // Ya estaba pagada: la nueva nace confirmada, sin nuevo hold.
        await tx.query(`UPDATE agenda.reserva SET estado = 'confirmada', reserva_expira_en = NULL WHERE id = $1`, [nueva]);
        estado = "confirmada";
        await integraciones.sincronizarEstadoReservaEnSheet(tx, nueva, "confirmada");
      }
      const m = await tx.query<{ valor_total: string }>(`SELECT valor_total FROM comercial.compra WHERE id = $1`, [compraId]);
      montoTotal = m.rows[0] ? Number(m.rows[0].valor_total) : null;
    }
    return { reservaId: nueva, estado, compraId, montoTotal };
  });
}

export async function bloquearHorario(
  db: Db,
  opts: {
    sedeId: number;
    profesionalId?: number | null;
    iniciaEnIso: string;
    duracionMinutos: number;
    motivo: string;
    creadoPor?: string | null;
  },
): Promise<{ reservaId: number }> {
  try {
    const profesionalId = opts.profesionalId ?? (await profesionalPorDefecto(db));
    if (profesionalId === null) {
      throw new ErrorDominio("No hay ningún profesional activo registrado.", "no_encontrado", 404);
    }
    const r = await db.query<{ id: number }>(
      `INSERT INTO agenda.reserva (
         tipo, estado, profesional_id, sede_id,
         franja_clinica, franja_bloqueo,
         motivo_bloqueo, canal_origen, creado_por
       ) VALUES (
         'bloqueo', 'confirmada', $1, $2,
         tstzrange($3::timestamptz, $3::timestamptz + make_interval(mins => $4::integer), '[)'),
         tstzrange($3::timestamptz, $3::timestamptz + make_interval(mins => $4::integer), '[)'),
         $5, 'admin', $6
       )
       RETURNING id`,
      [profesionalId, opts.sedeId, opts.iniciaEnIso, opts.duracionMinutos, opts.motivo, opts.creadoPor ?? null],
    );
    return { reservaId: (r.rows[0] as { id: number }).id };
  } catch (err) {
    if (err instanceof ErrorDominio) throw err;
    throw normalizarErrorDb(err);
  }
}
