import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Base de conocimiento para `charla_general` (ver contracts/intents.schema.json):
 * unos `.md` cortos en `conocimiento/` (al lado de este servicio, no dentro de
 * `src/`), partidos en fragmentos por encabezado `##`.
 *
 * NO hay retrieval (ni embeddings ni scoring por palabras clave): el corpus es
 * el de un solo consultorio y cabe entero en el prompt, así que se cargan
 * TODOS los fragmentos y el modelo decide qué usar para redactar `respuesta`.
 * Si algún día el contenido pasa de unos pocos miles de tokens, subir
 * `num_ctx` (ver ollama.ts) antes de pensar en un índice vectorial.
 *
 * Deliberadamente NO cubre servicios/precios/sedes/horarios (eso es
 * `consultar_catalogo`/`consultar_disponibilidad`, datos exactos de la base).
 */

const DIR_CONOCIMIENTO = fileURLToPath(new URL("../conocimiento", import.meta.url));

/** Parte un .md en fragmentos por encabezado `##`, descartando lo que quede antes del primero (comentarios HTML, etc.). */
export function partirEnFragmentos(contenido: string): string[] {
  return contenido
    .split(/^##\s+/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("<!--"));
}

let cache: string[] | null = null;

/** Todos los fragmentos de `conocimiento/*.md` (sin README), en orden de archivo, cacheados. */
export function cargarConocimiento(): string[] {
  if (cache) return cache;

  let archivos: string[] = [];
  try {
    archivos = readdirSync(DIR_CONOCIMIENTO)
      .filter((f) => f.toLowerCase().endsWith(".md") && f.toUpperCase() !== "README.MD")
      .sort();
  } catch {
    archivos = [];
  }

  const fragmentos: string[] = [];
  for (const archivo of archivos) {
    try {
      fragmentos.push(...partirEnFragmentos(readFileSync(`${DIR_CONOCIMIENTO}/${archivo}`, "utf8")));
    } catch {
      // Un archivo ilegible no debe tumbar la interpretación: se ignora.
    }
  }
  cache = fragmentos;
  return fragmentos;
}

/** Solo para pruebas: descarta la caché para forzar releer los archivos. */
export function _resetConocimientoParaTests(): void {
  cache = null;
}
