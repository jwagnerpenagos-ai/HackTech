import { z } from "zod";

/**
 * Espejo en Zod de `contracts/intents.schema.json`, del lado de quien
 * EJECUTA la intención (no quien la interpreta). `test/contract.test.ts`
 * comprueba que este módulo coincide con el JSON Schema, igual que en
 * services/nlu/src/contract/intents.ts.
 *
 * "desconocida" queda fuera de `IntencionEjecutable`: el bot nunca debe
 * reenviarla, y si llega de todos modos el body no valida.
 */

export const INTENCIONES_EJECUTABLES = [
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
  "documento",
  "eps",
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
    documento: z.string().max(20).nullable().optional(),
    eps: z.string().max(120).nullable().optional(),
  })
  .strict();

/** Cuerpo de `POST /comandos`: la intención ya interpretada y confirmada. */
export const ComandoSchema = z
  .object({
    intencion: z.enum(INTENCIONES_EJECUTABLES),
    entidades: EntidadesSchema,
    // Quién originó la orden, para `creado_por` / `operacion_log`. No es
    // credencial: la autenticación real es la cabecera X-Internal-Key.
    creado_por: z.string().max(120).optional(),
  })
  .strict();

export type IntencionEjecutable = (typeof INTENCIONES_EJECUTABLES)[number];
export type Entidades = z.infer<typeof EntidadesSchema>;
export type Comando = z.infer<typeof ComandoSchema>;
