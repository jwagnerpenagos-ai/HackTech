import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import {
  IntencionSchema,
  INTENCIONES,
  NOMBRES_ENTIDAD,
  desconocida,
} from "../src/contract/intents.js";

const schemaPath = fileURLToPath(
  new URL("../../../contracts/intents.schema.json", import.meta.url),
);
const jsonSchema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;

interface AjvLike {
  compile: (schema: unknown) => (data: unknown) => boolean;
}
type AjvCtor = new (opts?: { allErrors?: boolean; strict?: boolean }) => AjvLike;

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js") as AjvCtor;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validarConJsonSchema = ajv.compile(jsonSchema);

describe("contrato: intents.schema.json ↔ Zod", () => {
  it("las intenciones del JSON Schema y del módulo Zod coinciden exactamente", () => {
    const props = jsonSchema["properties"] as Record<string, { enum?: string[] }>;
    const enJson = [...(props["intencion"]?.enum ?? [])].sort();
    const enZod = [...INTENCIONES].sort();
    expect(enZod).toEqual(enJson);
  });

  it("los nombres de entidad del JSON Schema y de Zod coinciden", () => {
    const props = jsonSchema["properties"] as Record<
      string,
      { properties?: Record<string, unknown> }
    >;
    const enJson = Object.keys(props["entidades"]?.properties ?? {}).sort();
    const enZod = [...NOMBRES_ENTIDAD].sort();
    expect(enZod).toEqual(enJson);
  });

  const ejemplosValidos: unknown[] = [
    desconocida(),
    {
      intencion: "crear_sesion",
      entidades: { cliente: "Laura", servicio: null, fecha: "2026-09-05", hora: "15:00" },
      confianza: 0.86,
      faltantes: ["servicio"],
    },
    {
      intencion: "consultar_agenda",
      entidades: { fecha: "2026-09-01" },
      confianza: 1,
      faltantes: [],
    },
    {
      intencion: "charla_general",
      entidades: {},
      confianza: 0.9,
      faltantes: [],
      respuesta: "¡Hola! Soy el asistente de La Fisioterapeuta Li.",
    },
  ];

  it.each(ejemplosValidos)("acepta en ambos validadores: %o", (ej) => {
    expect(IntencionSchema.safeParse(ej).success).toBe(true);
    expect(validarConJsonSchema(ej)).toBe(true);
  });

  const ejemplosInvalidos: unknown[] = [
    { intencion: "borrar_todo", entidades: {}, confianza: 1, faltantes: [] },
    { intencion: "crear_sesion", entidades: {}, confianza: 2, faltantes: [] },
    { intencion: "crear_sesion", entidades: { color: "rojo" }, confianza: 0.5, faltantes: [] },
    { intencion: "crear_sesion", entidades: {}, confianza: 0.5, faltantes: ["color"] },
    { intencion: "crear_sesion", entidades: { fecha: "05/09/2026" }, confianza: 0.5, faltantes: [] },
    { entidades: {}, confianza: 0.5, faltantes: [] },
    { intencion: "charla_general", entidades: {}, confianza: 0.9, faltantes: [], respuesta: "x".repeat(601) },
  ];

  it.each(ejemplosInvalidos)("rechaza en ambos validadores: %o", (ej) => {
    expect(IntencionSchema.safeParse(ej).success).toBe(false);
    expect(validarConJsonSchema(ej)).toBe(false);
  });
});
