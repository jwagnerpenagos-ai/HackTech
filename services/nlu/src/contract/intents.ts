import { z } from "zod";

/**
 * Espejo en Zod de `contracts/intents.schema.json`.
 *
 * El JSON Schema es la fuente de verdad del contrato entre servicios; este
 * módulo es su implementación para validar en TypeScript. `test/contract.test.ts`
 * comprueba que ambos coinciden: si divergen, el test falla.
 */

export const INTENCIONES = [
  "charla_general",
  "consultar_catalogo",
  "consultar_agenda",
  "consultar_disponibilidad",
  "crear_sesion",
  "modificar_sesion",
  "cancelar_sesion",
  "buscar_cliente",
  "enviar_correo",
  "crear_carpeta",
  "buscar_archivo",
  "bloquear_horario",
  "desconocida",
] as const;

export const NOMBRES_ENTIDAD = [
  "cliente",
  "servicio",
  "sede",
  "fecha",
  "hora",
  "sesion_id",
  "destinatario",
  "asunto",
  "texto",
  "carpeta",
  "consulta",
  "telefono",
  "email",
] as const;

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

export const EntidadesSchema = z
  .object({
    cliente: z.string().max(120).nullable().optional(),
    servicio: z.string().max(120).nullable().optional(),
    sede: z.string().max(120).nullable().optional(),
    fecha: z.string().regex(FECHA_ISO).nullable().optional(),
    hora: z.string().regex(HORA_24H).nullable().optional(),
    sesion_id: z.number().int().min(1).nullable().optional(),
    destinatario: z.string().max(254).nullable().optional(),
    asunto: z.string().max(200).nullable().optional(),
    texto: z.string().max(2000).nullable().optional(),
    carpeta: z.string().max(200).nullable().optional(),
    consulta: z.string().max(500).nullable().optional(),
    telefono: z.string().max(30).nullable().optional(),
    email: z.string().max(254).nullable().optional(),
  })
  .strict();

export const IntencionSchema = z
  .object({
    intencion: z.enum(INTENCIONES),
    entidades: EntidadesSchema,
    confianza: z.number().min(0).max(1),
    faltantes: z.array(z.enum(NOMBRES_ENTIDAD)).max(13),
    // Solo relevante para intencion="charla_general" (respuesta conversacional
    // grounded en services/nlu/conocimiento/). Para el resto va null/omitido.
    respuesta: z.string().max(600).nullable().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (new Set(val.faltantes).size !== val.faltantes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["faltantes"],
        message: "no puede tener entradas repetidas",
      });
    }
  });

export type Intencion = z.infer<typeof IntencionSchema>;
export type Entidades = z.infer<typeof EntidadesSchema>;
export type NombreIntencion = (typeof INTENCIONES)[number];

/** Resultado neutro que se devuelve cuando no se pudo interpretar con garantías. */
export function desconocida(confianza = 0): Intencion {
  return { intencion: "desconocida", entidades: {}, confianza, faltantes: [] };
}
