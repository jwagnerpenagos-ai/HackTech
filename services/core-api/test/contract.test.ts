import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import { INTENCIONES_EJECUTABLES, NOMBRES_ENTIDAD, EntidadesSchema } from "../src/contract/comando.js";

const schemaPath = fileURLToPath(new URL("../../../contracts/intents.schema.json", import.meta.url));
const jsonSchema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
  properties: {
    intencion: { enum: string[] };
    entidades: { properties: Record<string, unknown> };
  };
};

interface AjvLike {
  compile: (schema: unknown) => (data: unknown) => boolean;
}
type AjvCtor = new (opts?: { allErrors?: boolean; strict?: boolean }) => AjvLike;

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js") as AjvCtor;
const ajv = new Ajv2020({ allErrors: true, strict: false });
// El sub-esquema de "entidades" es el mismo que valida este servicio: lo
// que el bot manda en POST /comandos son exactamente esas entidades.
const validarEntidadesConJsonSchema = ajv.compile(jsonSchema.properties.entidades);

describe("contrato: intents.schema.json ↔ comando.ts (lado ejecución)", () => {
  it("las intenciones ejecutables son exactamente las del JSON Schema menos 'desconocida' y 'charla_general'", () => {
    const enJson = jsonSchema.properties.intencion.enum
      .filter((i) => i !== "desconocida" && i !== "charla_general")
      .sort();
    const enZod = [...INTENCIONES_EJECUTABLES].sort();
    expect(enZod).toEqual(enJson);
  });

  it("los nombres de entidad coinciden con los del JSON Schema", () => {
    const enJson = Object.keys(jsonSchema.properties.entidades.properties).sort();
    const enZod = [...NOMBRES_ENTIDAD].sort();
    expect(enZod).toEqual(enJson);
  });

  const ejemplosValidos: unknown[] = [
    {},
    { cliente: "Laura", servicio: null, fecha: "2026-09-05", hora: "15:00" },
    { fecha: "2026-09-01" },
    { sesion_id: 42, destinatario: "a@b.com", asunto: "Recordatorio", texto: "hola" },
  ];

  it.each(ejemplosValidos)("acepta en ambos validadores: %o", (ej) => {
    expect(EntidadesSchema.safeParse(ej).success).toBe(true);
    expect(validarEntidadesConJsonSchema(ej)).toBe(true);
  });

  const ejemplosInvalidos: unknown[] = [
    { color: "rojo" },
    { fecha: "05/09/2026" },
    { hora: "25:00" },
    { sesion_id: 0 },
  ];

  it.each(ejemplosInvalidos)("rechaza en ambos validadores: %o", (ej) => {
    expect(EntidadesSchema.safeParse(ej).success).toBe(false);
    expect(validarEntidadesConJsonSchema(ej)).toBe(false);
  });
});
