/**
 * El sitio web (`apps/web`) identifica los servicios por un `slug` legible
 * (deep-links tipo `/reservar?servicio=puncion-seca`). La base los identifica
 * por `catalogo.servicio.codigo`. Este es el único punto donde se traduce.
 */
const SLUG_A_CODIGO: Record<string, string> = {
  "valoracion-inicial": "VALORACION",
  "rehabilitacion-fisica": "REHAB",
  "prescripcion-individual": "EJERCICIO_IND",
  "descarga-espalda": "DESC_ESPALDA",
  "descarga-miembros-inferiores": "DESC_MMII",
  "descarga-cuerpo-completo": "DESC_TOTAL",
  "puncion-seca": "PUNCION",
  "terapia-neural": "NEURAL",
  prp: "PRP",
  sueroterapia: "SUEROTERAPIA",
};

const CODIGO_A_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_A_CODIGO).map(([slug, codigo]) => [codigo, slug]),
);

export function codigoDeSlug(slug: string): string | null {
  return SLUG_A_CODIGO[slug] ?? null;
}

export function slugDeCodigo(codigo: string): string {
  return CODIGO_A_SLUG[codigo] ?? codigo.toLowerCase();
}
