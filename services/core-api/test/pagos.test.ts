import { describe, it, expect } from "vitest";
import { crearDbFalsa } from "./fakeDb.js";
import { registrarPago, listarPagosPendientes, verificarPago, rechazarPago } from "../src/dominio/pagos.js";

describe("registrarPago", () => {
  it("inserta el pago con medio Nequi y estado registrado", async () => {
    const { db, llamadas } = crearDbFalsa([[{ id: 7 }]]);
    const r = await registrarPago(db, { compraId: 3, valor: 120000, referencia: "M12345", comprobanteRef: "tgfile" });
    expect(r).toEqual({ pagoId: 7 });
    expect(llamadas[0]?.valores).toEqual([3, 1, 120000, "M12345", "tgfile", null]);
  });
});

describe("listarPagosPendientes", () => {
  it("mapea las filas al shape del bot", async () => {
    const { db } = crearDbFalsa([
      [
        {
          pago_id: 7,
          valor: "120000.00",
          referencia: "M12345",
          comprobante_ref: "tgfile",
          reportado_en: "2026-11-01T10:00:00.000Z",
          reserva_id: 20,
          inicia_en: "2026-11-20T20:00:00.000Z",
          servicio: "Punción seca",
          sede: "Sede Tunja",
          paciente: "Ana Ríos",
        },
      ],
    ]);
    const r = await listarPagosPendientes(db);
    expect(r).toEqual([
      {
        pagoId: 7,
        valor: 120000,
        referencia: "M12345",
        comprobanteRef: "tgfile",
        reportadoEn: "2026-11-01T10:00:00.000Z",
        reservaId: 20,
        iniciaEn: "2026-11-20T20:00:00.000Z",
        servicio: "Punción seca",
        sede: "Sede Tunja",
        paciente: "Ana Ríos",
      },
    ]);
  });
});

describe("verificarPago", () => {
  it("llama a la función SQL y devuelve las reservas confirmadas con su chat", async () => {
    const { db, llamadas } = crearDbFalsa([
      [], // SELECT comercial.verificar_pago(...)
      [{ reserva_id: 20, servicio: "Punción seca", inicia_en: "2026-11-20T20:00:00.000Z", chat_id: "8358399133" }],
    ]);
    const r = await verificarPago(db, { pagoId: 7, por: "8358399133" });
    expect(llamadas[0]?.texto).toContain("comercial.verificar_pago");
    expect(r.reservasConfirmadas).toEqual([
      { reservaId: 20, servicio: "Punción seca", iniciaEn: "2026-11-20T20:00:00.000Z", chatId: "8358399133" },
    ]);
  });
});

describe("rechazarPago", () => {
  it("marca rechazado y devuelve la cita/chat para avisar", async () => {
    const { db } = crearDbFalsa([
      [{ compra_id: 3 }], // UPDATE ... RETURNING
      [{ reserva_id: 20, servicio: "Punción seca", inicia_en: "2026-11-20T20:00:00.000Z", chat_id: "8358399133" }],
    ]);
    const r = await rechazarPago(db, { pagoId: 7, por: "8358399133", motivo: "monto no coincide" });
    expect(r).toMatchObject({ reservaId: 20, chatId: "8358399133" });
  });

  it("si el pago no existe o ya fue procesado, error 404", async () => {
    const { db } = crearDbFalsa([[]]); // UPDATE afecta 0 filas
    await expect(rechazarPago(db, { pagoId: 999 })).rejects.toMatchObject({ codigo: "no_encontrado" });
  });
});
