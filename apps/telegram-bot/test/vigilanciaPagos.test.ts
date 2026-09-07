import { describe, it, expect, vi } from "vitest";
import type { Bot } from "grammy";
import { loadConfig } from "../src/config.js";
import type { ClienteCoreApi, PagoPendiente } from "../src/coreApiClient.js";
import type { MiContexto } from "../src/telegram/contexto.js";
import { iniciarVigilanciaPagos } from "../src/telegram/vigilanciaPagos.js";

const cfg = loadConfig(); // allowlist de pruebas: 111, 222

function pago(pagoId: number): PagoPendiente {
  return {
    pagoId,
    valor: 100000,
    referencia: null,
    comprobanteRef: null,
    reportadoEn: "2026-11-01T10:00:00.000Z",
    reservaId: 500 + pagoId,
    iniciaEn: "2026-12-01T14:00:00.000Z",
    servicio: "Valoración inicial",
    sede: "Sede Tunja",
    paciente: "Ana Torres",
  };
}

function armar(pendientes: () => PagoPendiente[]) {
  const enviados: { chatId: number | string; texto: string }[] = [];
  const bot = {
    api: {
      sendMessage: (chatId: number | string, texto: string) => {
        enviados.push({ chatId, texto });
        return Promise.resolve({});
      },
    },
  } as unknown as Bot<MiContexto>;
  const cApi = {
    pagosPendientes: () => Promise.resolve({ ok: true as const, datos: { pagos: pendientes() } }),
  } as unknown as ClienteCoreApi;
  return { bot, cApi, enviados };
}

describe("iniciarVigilanciaPagos", () => {
  it("no repite el histórico: la primera vuelta solo siembra", async () => {
    vi.useFakeTimers();
    try {
      const { bot, cApi, enviados } = armar(() => [pago(1), pago(2)]);
      const detener = iniciarVigilanciaPagos(bot, { cfg, cApi }, { intervaloMs: 1000 });
      await vi.advanceTimersByTimeAsync(0); // siembra inmediata
      expect(enviados).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1000); // otra vuelta, nada nuevo
      expect(enviados).toHaveLength(0);
      detener();
    } finally {
      vi.useRealTimers();
    }
  });

  it("avisa a cada chat de staff cuando entra un pago nuevo", async () => {
    vi.useFakeTimers();
    try {
      let lista = [pago(1)];
      const { bot, cApi, enviados } = armar(() => lista);
      const detener = iniciarVigilanciaPagos(bot, { cfg, cApi }, { intervaloMs: 1000 });
      await vi.advanceTimersByTimeAsync(0); // siembra con el pago 1

      lista = [pago(1), pago(9)];
      await vi.advanceTimersByTimeAsync(1000);

      expect(enviados.map((e) => e.chatId).sort()).toEqual([111, 222]);
      expect(enviados[0]?.texto).toContain("Pago #9");
      expect(enviados[0]?.texto).toContain("web");

      // no lo repite en la siguiente vuelta
      await vi.advanceTimersByTimeAsync(1000);
      expect(enviados).toHaveLength(2);
      detener();
    } finally {
      vi.useRealTimers();
    }
  });
});
