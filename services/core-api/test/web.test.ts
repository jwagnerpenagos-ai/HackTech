import { describe, it, expect } from "vitest";
import { crearDbFalsa } from "./fakeDb.js";
import { codigoDeSlug, slugDeCodigo } from "../src/web/slugs.js";
import { firmarToken, verificarToken } from "../src/web/token.js";
import { listarServiciosWeb, disponibilidadWeb, crearReservaWeb, resolverPagoMock } from "../src/web/publico.js";
import { firmaIntegridad, urlCheckout, type Wompi } from "../src/web/wompi.js";

const WOMPI_OFF: Wompi = {
  habilitado: false,
  mock: false,
  publicKey: "",
  integritySecret: "",
  apiBase: "https://sandbox.wompi.co/v1",
  checkoutBase: "https://checkout.wompi.co/p/",
  redirectBase: "http://localhost:3000/reservar/resultado",
};

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

  it("crearReservaWeb: reserva repetida con misma Idempotency-Key devuelve la misma", async () => {
    const { db } = crearDbFalsa([
      [{ id: 77, estado: "pendiente_pago" }], // SELECT ... WHERE creado_por (idempotencia: ya existe)
      [{ valor_total: "100000.00", moneda: "COP", pago_ref: null }], // compra ligada
    ]);
    const r = await crearReservaWeb(db, WOMPI_OFF, {
      slug: "valoracion-inicial", sedeCodigo: "TUNJA", fecha: "2026-12-01", hora: "09:00",
      paciente: { nombre: "Ana Torres" }, idempotencyKey: "clave-repetida-123",
    });
    expect(r).toMatchObject({ reservaId: 77, estado: "pendiente_pago", monto: 100000 });
    expect(r.checkoutUrl).toBeUndefined();
  });
});

describe("web/wompi", () => {
  it("firmaIntegridad: SHA256 hex de 64 chars, determinista y sensible al secreto", () => {
    const a = firmaIntegridad("FISIO-42-abcd1234", 9500000, "COP", "test_integrity_xxx");
    const b = firmaIntegridad("FISIO-42-abcd1234", 9500000, "COP", "test_integrity_xxx");
    const c = firmaIntegridad("FISIO-42-abcd1234", 9500000, "COP", "test_integrity_yyy");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("urlCheckout en mock apunta al checkout simulado del sitio, sin firma", () => {
    const w: Wompi = {
      habilitado: true,
      mock: true,
      publicKey: "",
      integritySecret: "",
      apiBase: "https://sandbox.wompi.co/v1",
      checkoutBase: "http://localhost:3000/reservar/pago-simulado",
      redirectBase: "http://localhost:3000/reservar/resultado",
    };
    const url = urlCheckout(w, { referencia: "FISIO-9-abcd1234", montoCents: 10000000, moneda: "COP" });
    expect(url).toContain("/reservar/pago-simulado?");
    expect(url).toContain("ref=FISIO-9-abcd1234");
    expect(url).toContain("monto=10000000");
    expect(url).not.toContain("signature");
  });
});

describe("resolverPagoMock", () => {
  it("aprobar verifica el pago", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 5, estado: "registrado", reserva_id: 42 }], // SELECT pago por referencia
      [], // verificar_pago (SELECT comercial.verificar_pago)
      [], // SELECT reservas confirmadas (dentro de verificarPago)
    ]);
    const r = await resolverPagoMock(db, "FISIO-42-abcd1234", true);
    expect(r).toEqual({ estado: "aprobado", reservaId: 42 });
    expect(llamadas.some((l) => l.texto.includes("comercial.verificar_pago"))).toBe(true);
  });

  it("rechazar marca el pago rechazado", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 5, estado: "registrado", reserva_id: 42 }],
      [{ compra_id: 9 }], // UPDATE comercial.pago ... RETURNING compra_id (rechazarPago)
      [], // SELECT datos de la reserva (rechazarPago)
    ]);
    const r = await resolverPagoMock(db, "FISIO-42-abcd1234", false);
    expect(r.estado).toBe("rechazado");
    expect(llamadas.some((l) => l.texto.includes("estado = 'rechazado'"))).toBe(true);
  });
});
