import { describe, it, expect } from "vitest";
import { crearDbFalsa } from "./fakeDb.js";
import { codigoDeSlug, slugDeCodigo } from "../src/web/slugs.js";
import { firmarToken, verificarToken } from "../src/web/token.js";
import { listarServiciosWeb, disponibilidadWeb, crearReservaWeb } from "../src/web/publico.js";
import { iniciarPagoWeb } from "../src/dominio/pagos.js";

describe("web/slugs", () => {
  it("traduce slug <-> codigo en ambos sentidos", () => {
    expect(codigoDeSlug("puncion-seca")).toBe("PUNCION");
    expect(codigoDeSlug("valoracion-inicial")).toBe("VALORACION");
    expect(codigoDeSlug("no-existe")).toBeNull();
    expect(slugDeCodigo("PUNCION")).toBe("puncion-seca");
    expect(slugDeCodigo("RARO")).toBe("raro");
  });
});

describe("web/token", () => {
  it("firma y verifica un token válido", () => {
    const { token } = firmarToken("secreto-de-prueba-1234567890", "admin", 60);
    expect(verificarToken("secreto-de-prueba-1234567890", token)?.sub).toBe("admin");
  });

  it("rechaza token con otro secreto, corrupto o vencido", () => {
    const { token } = firmarToken("secreto-a-1234567890", "admin", 60);
    expect(verificarToken("secreto-b-1234567890", token)).toBeNull();
    expect(verificarToken("secreto-a-1234567890", token + "x")).toBeNull();
    expect(verificarToken("secreto-a-1234567890", "basura")).toBeNull();
    const { token: viejo } = firmarToken("secreto-a-1234567890", "admin", -1);
    expect(verificarToken("secreto-a-1234567890", viejo)).toBeNull();
  });
});

describe("web/publico", () => {
  it("listarServiciosWeb mapea codigo a slug y precio", async () => {
    const { db } = crearDbFalsa([
      [
        { codigo: "VALORACION", nombre: "Valoración inicial", descripcion: "…", duracion_min_minutos: 60, valor_total: "100000.00", moneda: "COP" },
        { codigo: "PUNCION", nombre: "Punción seca", descripcion: null, duracion_min_minutos: 60, valor_total: "120000.00", moneda: "COP" },
      ],
    ]);
    const r = await listarServiciosWeb(db);
    expect(r[0]).toMatchObject({ slug: "valoracion-inicial", codigo: "VALORACION", precio: 100000 });
    expect(r[1]).toMatchObject({ slug: "puncion-seca", precio: 120000 });
  });

  it("disponibilidadWeb devuelve horas HH:MM y descarta lo que caiga a <24h", async () => {
    const enDosDias = new Date(Date.now() + 48 * 3600_000).toISOString();
    const enUnaHora = new Date(Date.now() + 3600_000).toISOString();
    const { db } = crearDbFalsa([
      [{ id: 3, nombre: "Valoración inicial", duracion_min_minutos: 60, duracion_max_minutos: 60 }], // resolverServicio
      [{ id: 1, nombre: "Sede Tunja" }], // resolverSede
      [
        { slot_inicio: enUnaHora, slot_fin: enUnaHora },
        { slot_inicio: enDosDias, slot_fin: enDosDias },
      ],
    ]);
    const r = await disponibilidadWeb(db, { slug: "valoracion-inicial", sedeCodigo: "TUNJA", fecha: "2026-09-20" });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/^\d{2}:\d{2}$/);
  });

  it("crearReservaWeb: reserva repetida con misma Idempotency-Key devuelve la misma + enlace a Telegram", async () => {
    const { db } = crearDbFalsa([
      [{ id: 77, uuid: "11111111-1111-1111-1111-111111111111", estado: "pendiente_pago" }], // idempotencia: ya existe
      [{ valor_total: "100000.00", moneda: "COP" }], // compra ligada
    ]);
    const r = await crearReservaWeb(db, "FisioLiiBot", {
      slug: "valoracion-inicial", sedeCodigo: "TUNJA", fecha: "2026-12-01", hora: "09:00",
      paciente: { nombre: "Ana Torres" }, idempotencyKey: "clave-repetida-123",
    });
    expect(r).toMatchObject({ reservaId: 77, estado: "pendiente_pago", monto: 100000 });
    expect(r.telegramPago).toBe(
      "https://t.me/FisioLiiBot?start=pago_11111111-1111-1111-1111-111111111111",
    );
  });
});

describe("iniciarPagoWeb", () => {
  it("busca la reserva por uuid, vincula el chat y devuelve los datos del pago", async () => {
    const { db, llamadas } = crearDbFalsa([
      [
        {
          id: 42,
          estado: "pendiente_pago",
          compra_id: 9,
          paciente_id: 5,
          valor_total: "100000.00",
          moneda: "COP",
          servicio: "Valoración inicial",
          inicia_en: "2026-12-01T14:00:00.000Z",
        },
      ],
      [], // INSERT vinculo_telegram ON CONFLICT DO NOTHING
    ]);
    const r = await iniciarPagoWeb(db, { reservaUuid: "11111111-1111-1111-1111-111111111111", chatId: 999 });
    expect(r).toMatchObject({ encontrada: true, reservaId: 42, compraId: 9, monto: 100000, estado: "pendiente_pago" });
    expect(llamadas.some((l) => l.texto.includes("personas.vinculo_telegram"))).toBe(true);
  });

  it("uuid inexistente -> 404", async () => {
    const { db } = crearDbFalsa([[]]);
    await expect(
      iniciarPagoWeb(db, { reservaUuid: "22222222-2222-2222-2222-222222222222", chatId: 1 }),
    ).rejects.toMatchObject({ codigo: "no_encontrado" });
  });
});
