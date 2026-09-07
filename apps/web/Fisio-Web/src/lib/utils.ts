import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCOP(value: number) {
  return cop.format(value);
}

// El backend guarda el contacto de emergencia como "Nombre (Parentesco) · Teléfono"
// en un solo campo. Pedirle ese formato exacto a mano (con el carácter "·", que
// nadie sabe teclear) hacía que se guardara mal en silencio — por eso cualquier
// formulario que lo edite usa 3 casillas separadas y esto arma/desarma el texto.
const RE_CONTACTO_COMBINADO = /^(.+?)\s*\((.+?)\)\s*·\s*(.+)$/;

export interface PartesContacto {
  nombre: string;
  parentesco: string;
  telefono: string;
}

export function partesDeContacto(combinado: string | null): PartesContacto {
  const m = combinado ? RE_CONTACTO_COMBINADO.exec(combinado) : null;
  if (!m) return { nombre: "", parentesco: "", telefono: "" };
  return { nombre: m[1] ?? "", parentesco: m[2] ?? "", telefono: m[3] ?? "" };
}

/** Compone el texto combinado, o null si las 3 partes están vacías. Lanza si están parcialmente llenas. */
export function combinarContacto(partes: PartesContacto): string | null {
  const nombre = partes.nombre.trim();
  const parentesco = partes.parentesco.trim();
  const telefono = partes.telefono.trim();
  const llenos = [nombre, parentesco, telefono].filter((c) => c.length > 0).length;
  if (llenos === 0) return null;
  if (llenos < 3) {
    throw new Error("Completa los 3 campos del contacto de emergencia (nombre, parentesco y teléfono), o déjalos todos vacíos.");
  }
  return `${nombre} (${parentesco}) · ${telefono}`;
}
