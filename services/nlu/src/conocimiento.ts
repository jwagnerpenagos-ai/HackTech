import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Base de conocimiento para `charla_general` (ver contracts/intents.schema.json):
 * unos `.md` cortos en `conocimiento/` (al lado de este servicio, no dentro
 * de `src/`), partidos en fragmentos por encabezado `##`. El retrieval es
 * por coincidencia de palabras clave — sin embeddings ni vector DB: el
 * corpus es el de un solo consultorio, no hace falta más para esto.
 *
 * Deliberadamente NO cubre servicios/precios/horarios (eso es
 * `consultar_catalogo`/`consultar_disponibilidad`, datos exactos de la
 * base) — es para preguntas generales, políticas, "quién sos", etc.
 */

const DIR_CONOCIMIENTO = fileURLToPath(new URL("../conocimiento", import.meta.url));

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a", "en", "y", "o", "u",
  "que", "qué", "es", "son", "con", "para", "por", "se", "su", "sus", "tu", "tus", "mi", "mis",
  "me", "te", "le", "les", "lo", "como", "cómo", "cuál", "cual", "cuáles", "cuales", "cuánto",
  "cuanto", "este", "esta", "esto", "estos", "estas", "ese", "esa", "eso", "esos", "esas",
  "yo", "vos", "tú", "usted", "ustedes", "si", "sí", "no", "ya", "muy", "más", "mas", "pero",
  "porque", "cuando", "cuándo", "donde", "dónde", "quien", "quién", "hay", "soy", "eres",
  "ser", "estar", "tener", "hace", "hacer", "desde", "hasta", "sobre", "entre", "sin",
]);

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

function normalizar(s: string): string {
  return s.normalize("NFD").replace(MARCAS_DIACRITICAS, "").toLowerCase();
}

export function tokenizar(s: string): string[] {
  return normalizar(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Raíz aproximada de un token para que el matching tolere formas distintas
 * de la misma palabra (cancelo/cancelación/cancelaciones, cita/citas): quita
 * un plural simple en "-s" y trunca a 6 caracteres. No es un stemmer de
 * verdad, pero para palabras clave en español alcanza y es cero-dependencias.
 */
export function raiz(token: string): string {
  const singular = token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
  return singular.length > 6 ? singular.slice(0, 6) : singular;
}

export interface Fragmento {
  archivo: string;
  texto: string;
  raices: Set<string>;
}

/** Parte un .md en fragmentos por encabezado `##`, descartando lo que quede antes del primero (comentarios HTML, etc.). */
export function partirEnFragmentos(archivo: string, contenido: string): Fragmento[] {
  return contenido
    .split(/^##\s+/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("<!--"))
    .map((texto) => ({ archivo, texto, raices: new Set(tokenizar(texto).map(raiz)) }));
}

let fragmentosCache: Fragmento[] | null = null;

function cargarFragmentos(): Fragmento[] {
  if (fragmentosCache) return fragmentosCache;

  let archivos: string[] = [];
  try {
    archivos = readdirSync(DIR_CONOCIMIENTO).filter(
      (f) => f.toLowerCase().endsWith(".md") && f.toUpperCase() !== "README.MD",
    );
  } catch {
    archivos = [];
  }

  const fragmentos: Fragmento[] = [];
  for (const archivo of archivos) {
    try {
      const contenido = readFileSync(`${DIR_CONOCIMIENTO}/${archivo}`, "utf8");
      fragmentos.push(...partirEnFragmentos(archivo, contenido));
    } catch {
      // Un archivo ilegible no debe tumbar la interpretación: se ignora.
    }
  }
  fragmentosCache = fragmentos;
  return fragmentos;
}

/** Puntúa fragmentos por cantidad de palabras clave compartidas con el mensaje y devuelve los mejores. Puro, sin tocar disco: para pruebas. */
export function puntuarYOrdenar(mensaje: string, fragmentos: Fragmento[], maxFragmentos: number): string[] {
  const raicesMensaje = new Set(tokenizar(mensaje).map(raiz));
  if (raicesMensaje.size === 0) return [];

  const puntuados = fragmentos
    .map((f) => {
      let puntaje = 0;
      for (const r of raicesMensaje) if (f.raices.has(r)) puntaje += 1;
      return { f, puntaje };
    })
    .filter((x) => x.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje);

  return puntuados.slice(0, maxFragmentos).map((x) => x.f.texto);
}

/** Punto de entrada real: busca contexto relevante en los `.md` de `conocimiento/`. */
export function buscarContexto(mensaje: string, maxFragmentos = 3): string[] {
  return puntuarYOrdenar(mensaje, cargarFragmentos(), maxFragmentos);
}

/** Solo para pruebas: descarta la caché para forzar releer los archivos. */
export function _resetConocimientoParaTests(): void {
  fragmentosCache = null;
}
