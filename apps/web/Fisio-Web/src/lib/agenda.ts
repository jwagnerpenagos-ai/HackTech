// =====================================================================
//  Motor de disponibilidad — versión de frontend
//  Réplica en cliente de la regla del backend (README, flujo de reserva):
//  "espacios válidos según horario laboral, duración del servicio, buffer
//  y anticipación mínima". Mientras la API no exista, el wizard usa esto
//  para comportarse de forma realista en la demo.
// =====================================================================
import { bufferPorServicio, sedes } from "@/lib/data";

// Horario general: 7:00 a 20:00 con almuerzo de 12:00 a 14:00, que se
// representa como dos ventanas (la ausencia de franja ES el almuerzo).
export const VENTANAS: [string, string][] = [
  ["07:00", "12:00"],
  ["14:00", "20:00"],
];
export const SLOT_GRANULARIDAD_MIN = 30;
export const ANTICIPACION_MIN_HORAS = 24;

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function aHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Suma minutos a una hora "HH:mm" (sin cruzar medianoche en la práctica). */
export function sumarHora(hhmm: string, minutos: number): string {
  return aHHMM(aMinutos(hhmm) + minutos);
}

/** Fecha como "YYYY-MM-DD" en hora local (no UTC, para no restar un día). */
export function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** ¿La sede atiende ese día de la semana? (getDay(): 0 domingo). */
export function sedeAtiende(sedeCodigo: string, fecha: Date): boolean {
  const sede = sedes.find((s) => s.codigo === sedeCodigo);
  if (!sede) return false;
  return sede.dias.includes(fecha.getDay());
}

/** Primera fecha reservable: ahora + anticipación mínima, al inicio del día. */
export function fechaMinimaReserva(): Date {
  const d = new Date(Date.now() + ANTICIPACION_MIN_HORAS * 60 * 60 * 1000);
  d.setHours(0, 0, 0, 0);
  return d;
}

type ServicioSlot = { slug: string; duracionMin: number };

/**
 * Horarios de inicio realmente agendables para (servicio, sede, fecha).
 * Descarta: fuera de ventanas, sin espacio para duración + buffer, antes
 * de la anticipación mínima, y los que chocan con `ocupados` (HH:mm).
 */
export function slotsDisponibles(
  servicio: ServicioSlot,
  sedeCodigo: string,
  fecha: Date,
  ocupados: string[] = []
): string[] {
  if (!sedeAtiende(sedeCodigo, fecha)) return [];

  const buffer = bufferPorServicio[servicio.slug] ?? 15;
  const ocupa = servicio.duracionMin + buffer;

  const limite = Date.now() + ANTICIPACION_MIN_HORAS * 60 * 60 * 1000;
  const ocupadosMin = ocupados.map(aMinutos);

  const slots: string[] = [];
  for (const [ini, fin] of VENTANAS) {
    const desde = aMinutos(ini);
    const hasta = aMinutos(fin);
    for (let t = desde; t + ocupa <= hasta; t += SLOT_GRANULARIDAD_MIN) {
      // Anticipación mínima
      const inicioReal = new Date(fecha);
      inicioReal.setHours(0, 0, 0, 0);
      inicioReal.setMinutes(t);
      if (inicioReal.getTime() < limite) continue;

      // Choque con una reserva ya ocupada (solape de franjas)
      const choca = ocupadosMin.some(
        (o) => t < o + servicio.duracionMin && o < t + ocupa
      );
      if (choca) continue;

      slots.push(aHHMM(t));
    }
  }
  return slots;
}

/**
 * Horas ya ocupadas de forma pseudo-aleatoria pero estable por día/sede,
 * para que en la demo algunos espacios aparezcan tomados. Sustituye al
 * `filter` mágico anterior; se reemplaza por la respuesta de la API.
 */
export function ocupadosEjemplo(fecha: Date, sedeCodigo: string): string[] {
  const semilla =
    fecha.getFullYear() * 10000 +
    (fecha.getMonth() + 1) * 100 +
    fecha.getDate() +
    (sedeCodigo === "TURMEQUE" ? 7 : 0);
  const pool = ["08:00", "09:30", "10:30", "14:30", "15:30", "16:30", "18:00"];
  return pool.filter((_, i) => (semilla + i * 3) % 5 < 2);
}
