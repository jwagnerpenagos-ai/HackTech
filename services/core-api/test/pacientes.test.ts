import { describe, it, expect } from "vitest";
import { crearDbFalsa } from "./fakeDb.js";
import {
  buscarPaciente,
  resolverPorChatId,
  crearPacienteConVinculo,
  tieneValoracionAtendida,
} from "../src/dominio/pacientes.js";

describe("dominio/pacientes", () => {
  it("un solo resultado → tipo unico", async () => {
    const { db } = crearDbFalsa([[{ id: 1, nombre_completo: "Laura Gómez", telefono: "3001234567" }]]);
    const r = await buscarPaciente(db, "laura");
    expect(r).toEqual({
      tipo: "unico",
      paciente: { id: 1, nombreCompleto: "Laura Gómez", telefono: "3001234567", email: null },
    });
  });

  it("varios resultados → tipo ambiguo con todos los candidatos", async () => {
    const { db } = crearDbFalsa([
      [
        { id: 1, nombre_completo: "Laura Gómez", telefono: null },
        { id: 2, nombre_completo: "Laura Pérez", telefono: null },
      ],
    ]);
    const r = await buscarPaciente(db, "laura");
    expect(r.tipo).toBe("ambiguo");
    if (r.tipo === "ambiguo") {
      expect(r.candidatos).toHaveLength(2);
    }
  });

  it("sin resultados → tipo no_encontrado", async () => {
    const { db } = crearDbFalsa([[]]);
    const r = await buscarPaciente(db, "nadie-existe");
    expect(r).toEqual({ tipo: "no_encontrado" });
  });
});

describe("resolverPorChatId", () => {
  it("chat vinculado → conocido", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: "3001234567", email: "laura@correo.com" }],
    ]);
    const r = await resolverPorChatId(db, 111);
    expect(r).toEqual({
      tipo: "conocido",
      paciente: { id: 5, nombreCompleto: "Laura Gómez", telefono: "3001234567", email: "laura@correo.com" },
    });
    expect(llamadas[0]?.texto).toContain("personas.vinculo_telegram");
  });

  it("chat sin vínculo → desconocido", async () => {
    const { db } = crearDbFalsa([[]]);
    const r = await resolverPorChatId(db, 999);
    expect(r).toEqual({ tipo: "desconocido" });
  });
});

describe("crearPacienteConVinculo", () => {
  it("crea el paciente y el vínculo en una transacción", async () => {
    const { db, llamadas } = crearDbFalsa([[{ id: 42 }], []]);
    const r = await crearPacienteConVinculo(db, {
      nombreCompleto: "Laura Gómez",
      telefono: "3001234567",
      email: "laura@correo.com",
      chatId: 111,
    });
    expect(r).toEqual({
      id: 42,
      nombreCompleto: "Laura Gómez",
      telefono: "3001234567",
      email: "laura@correo.com",
    });
    expect(llamadas[0]?.texto).toContain("personas.paciente");
    expect(llamadas[0]?.valores).toEqual(["Laura", "Gómez", "3001234567", "laura@correo.com"]);
    expect(llamadas[1]?.texto).toContain("personas.vinculo_telegram");
    expect(llamadas[1]?.valores).toEqual([111, 42]);
  });

  it("nombre sin apellido: apellidos repite nombres", async () => {
    const { db, llamadas } = crearDbFalsa([[{ id: 43 }], []]);
    await crearPacienteConVinculo(db, { nombreCompleto: "Laura", telefono: "3001234567", chatId: 222 });
    expect(llamadas[0]?.valores).toEqual(["Laura", "Laura", "3001234567", null]);
  });
});

describe("tieneValoracionAtendida", () => {
  it("true cuando existe una valoración atendida (o inasistencia)", async () => {
    const { db, llamadas } = crearDbFalsa([[{ existe: true }]]);
    expect(await tieneValoracionAtendida(db, 5)).toBe(true);
    expect(llamadas[0]?.valores).toEqual([5]);
    expect(llamadas[0]?.texto).toContain("'VALORACION'");
  });

  it("false cuando no existe", async () => {
    const { db } = crearDbFalsa([[{ existe: false }]]);
    expect(await tieneValoracionAtendida(db, 5)).toBe(false);
  });
});
