import { describe, it, expect } from "vitest";
import { partirEnFragmentos, cargarConocimiento } from "../src/conocimiento.js";

describe("partirEnFragmentos", () => {
  it("parte por encabezado ## y descarta lo previo al primero", () => {
    const md = "<!-- plantilla -->\n\n## Uno\n\nTexto uno.\n\n## Dos\n\nTexto dos.\n";
    const r = partirEnFragmentos(md);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain("Uno");
    expect(r[0]).toContain("Texto uno.");
    expect(r[1]).toContain("Dos");
  });

  it("un archivo sin encabezados no produce fragmentos vacíos espurios", () => {
    expect(partirEnFragmentos("<!-- solo comentario -->\n")).toEqual([]);
  });
});

describe("cargarConocimiento (contra los .md reales del servicio)", () => {
  it("carga todos los fragmentos del corpus, no solo algunos", () => {
    const r = cargarConocimiento();
    expect(r.length).toBeGreaterThanOrEqual(8);
  });

  it("incluye la presentación del consultorio y la política de cancelación", () => {
    const todo = cargarConocimiento().join("\n").toLowerCase();
    expect(todo).toContain("fisioterapeuta li");
    expect(todo).toContain("cancel");
    expect(todo).toContain("primera cita");
  });

  it("no incluye el README", () => {
    const todo = cargarConocimiento().join("\n").toLowerCase();
    expect(todo).not.toContain("base de conocimiento del asistente");
  });
});
