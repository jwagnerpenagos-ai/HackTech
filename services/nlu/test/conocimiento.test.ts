import { describe, it, expect } from "vitest";
import { tokenizar, raiz, partirEnFragmentos, puntuarYOrdenar, buscarContexto, type Fragmento } from "../src/conocimiento.js";

function fragmento(archivo: string, texto: string): Fragmento {
  return { archivo, texto, raices: new Set(tokenizar(texto).map(raiz)) };
}

describe("tokenizar", () => {
  it("normaliza tildes y mayúsculas", () => {
    expect(tokenizar("¿Cuál es la política de cancelación?")).toEqual(["politica", "cancelacion"]);
  });

  it("descarta stopwords y palabras de una letra", () => {
    expect(tokenizar("y o a e i")).toEqual([]);
  });
});

describe("partirEnFragmentos", () => {
  it("parte por encabezado ## y descarta lo previo al primero", () => {
    const md = "<!-- plantilla -->\n\n## Uno\n\nTexto uno.\n\n## Dos\n\nTexto dos.\n";
    const r = partirEnFragmentos("x.md", md);
    expect(r).toHaveLength(2);
    expect(r[0]?.texto).toContain("Uno");
    expect(r[0]?.texto).toContain("Texto uno.");
    expect(r[1]?.texto).toContain("Dos");
  });

  it("un archivo sin encabezados no produce fragmentos vacíos espurios", () => {
    const r = partirEnFragmentos("x.md", "<!-- solo comentario -->\n");
    expect(r).toEqual([]);
  });
});

describe("puntuarYOrdenar", () => {
  const fragmentos = [
    fragmento("a.md", "Sobre cancelaciones y reprogramación de citas."),
    fragmento("b.md", "Qué llevar a tu primera valoración."),
    fragmento("c.md", "Contenido totalmente ajeno al tema."),
  ];

  it("devuelve el fragmento más relevante primero", () => {
    const r = puntuarYOrdenar("¿cómo cancelo mi cita?", fragmentos, 3);
    expect(r[0]).toContain("cancelaciones");
  });

  it("sin ninguna coincidencia, devuelve vacío (no inventa contexto)", () => {
    const r = puntuarYOrdenar("xyz completamente irrelevante", fragmentos, 3);
    expect(r).toEqual([]);
  });

  it("respeta el máximo de fragmentos pedido", () => {
    const r = puntuarYOrdenar("cita valoración cancelación", fragmentos, 1);
    expect(r).toHaveLength(1);
  });
});

describe("buscarContexto (contra los .md reales del servicio)", () => {
  it("una pregunta sobre la primera cita encuentra contexto relevante", () => {
    const r = buscarContexto("¿qué debo llevar a mi primera cita?");
    expect(r.length).toBeGreaterThan(0);
    expect(r.join(" ").toLowerCase()).toContain("primera cita");
  });

  it("un mensaje sin relación no devuelve contexto forzado", () => {
    const r = buscarContexto("blablabla xyzxyz asdasd");
    expect(r).toEqual([]);
  });
});
