import type { Tono } from "@/components/admin/kit";

// Color de la insignia según el estado de la reserva.
export function estadoReservaTono(estado: string): Tono {
  if (estado === "confirmada") return "verde";
  if (estado === "pendiente") return "ambar";
  if (estado === "cancelada") return "rojo";
  return "gris";
}
