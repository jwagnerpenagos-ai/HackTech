import { describe, it, expect, beforeEach } from "vitest";
import type { Update, UserFromGetMe } from "grammy/types";
import { loadConfig } from "../src/config.js";
import { crearBot } from "../src/bot.js";
import type { ResultadoNlu } from "../src/nluClient.js";
import type { ResultadoEjecucion } from "../src/n8nClient.js";
import { otorgarConsentimientoParaPruebas } from "../src/telegram/flujoConsentimiento.js";

// Chats de paciente que usan las pruebas de todo el archivo: se les da por
// otorgado el consentimiento de datos de una vez, para no tener que resolver
// el aviso en cada prueba que no es sobre ese flujo en particular (que sí se
// prueba aparte, con un chat nuevo, más abajo).
for (const chatId of [500, 777, 999]) otorgarConsentimientoParaPruebas(chatId);

const cfg = loadConfig(); // allowlist de pruebas: 111,222

const botInfo = {
  id: 42,
  is_bot: true,
  first_name: "test",
  username: "fisio_test_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business_account: false,
  has_main_web_app: false,
} as unknown as UserFromGetMe;

type ClienteN8nPrueba = (
  c: unknown,
  intencion: string,
  entidades: Record<string, string | number>,
  creadoPor: string,
) => Promise<ResultadoEjecucion>;

function crearBotDePrueba(
  nlu?: (c: unknown, m: string) => Promise<ResultadoNlu>,
  n8n?: ClienteN8nPrueba,
  coreApi?: import("../src/coreApiClient.js").ClienteCoreApi,
) {
  const enviados: string[] = [];
  const bot = crearBot(cfg, {
    botInfo,
    ...(nlu ? { nlu } : {}),
    ...(n8n ? { n8n } : {}),
    ...(coreApi ? { coreApi } : {}),
  });
  bot.api.config.use((_prev, method, payload) => {
    if (["sendMessage", "editMessageText", "editMessageCaption", "sendPhoto"].includes(method)) {
      const p = payload as { text?: string; caption?: string };
      enviados.push(p.text ?? p.caption ?? "");
    }
    return Promise.resolve({ ok: true, result: {} } as never);
  });
  return { bot, enviados };
}

/** n8n de prueba que responde coherente por intención: catálogo, disponibilidad, reserva. */
const n8nGuiado: ClienteN8nPrueba = (_c, intencion, entidades) => {
  if (intencion === "consultar_catalogo") {
    return Promise.resolve({
      tipo: "ok",
      datos: {
        servicios: [
          { nombre: "Valoración inicial", duracionMinMinutos: 60, precio: 100000, moneda: "COP" },
          { nombre: "Punción seca", duracionMinMinutos: 60, precio: 120000, moneda: "COP" },
        ],
      },
    } as ResultadoEjecucion);
  }
  if (intencion === "consultar_disponibilidad") {
    // sin fecha -> modo "proximos" (varios días); con fecha -> ese día.
    if (entidades["fecha"] === undefined) {
      return Promise.resolve({
        tipo: "ok",
        datos: {
          servicio: entidades["servicio"],
          modo: "proximos",
          slots: [
            { inicio: "2026-11-18T15:00:00.000Z", fecha: "2026-11-18", sede: "Sede Tunja" }, // 10:00
            { inicio: "2026-11-19T14:00:00.000Z", fecha: "2026-11-19", sede: "Sede Tunja" }, // 09:00
          ],
        },
      } as ResultadoEjecucion);
    }
    return Promise.resolve({
      tipo: "ok",
      datos: {
        servicio: entidades["servicio"],
        sede: "Sede Tunja",
        modo: "dia",
        slots: [
          { inicio: "2026-11-18T12:00:00.000Z" }, // 07:00 Bogotá
          { inicio: "2026-11-18T15:00:00.000Z" }, // 10:00 Bogotá
        ],
      },
    } as ResultadoEjecucion);
  }
  if (intencion === "crear_sesion") {
    return Promise.resolve({
      tipo: "ok",
      datos: { reservaId: 99, compraId: 55, montoTotal: 120000, moneda: "COP" },
    } as ResultadoEjecucion);
  }
  return Promise.resolve({ tipo: "ok", datos: {} } as ResultadoEjecucion);
};

/** Cliente de pagos de prueba: registra siempre, verifica confirmando la cita. */
function coreApiDePrueba() {
  const registrados: { compraId: number; comprobanteRef?: string | null | undefined }[] = [];
  const coreApi: import("../src/coreApiClient.js").ClienteCoreApi = {
    registrarPago: (_c, p) => {
      registrados.push({ compraId: p.compraId, comprobanteRef: p.comprobanteRef });
      return Promise.resolve({ ok: true, datos: { pagoId: 7 } });
    },
    pagosPendientes: () =>
      Promise.resolve({
        ok: true,
        datos: {
          pagos: [
            {
              pagoId: 7,
              valor: 120000,
              referencia: null,
              comprobanteRef: "tgfile",
              reportadoEn: "2026-11-01T10:00:00.000Z",
              reservaId: 99,
              iniciaEn: "2026-11-18T15:00:00.000Z",
              servicio: "Punción seca",
              sede: "Sede Tunja",
              paciente: "Ana Ríos",
            },
          ],
        },
      }),
    verificarPago: () =>
      Promise.resolve({
        ok: true,
        datos: {
          reservasConfirmadas: [
            { reservaId: 99, servicio: "Punción seca", iniciaEn: "2026-11-18T15:00:00.000Z", chatId: "500" },
          ],
        },
      }),
    rechazarPago: () =>
      Promise.resolve({
        ok: true,
        datos: { reservaId: 99, servicio: "Punción seca", iniciaEn: "2026-11-18T15:00:00.000Z", chatId: "500" },
      }),
    citasPorAsistir: () =>
      Promise.resolve({
        ok: true,
        datos: {
          citas: [
            {
              reservaId: 99,
              iniciaEn: "2026-11-18T15:00:00.000Z",
              servicio: "Valoración inicial",
              sede: "Sede Tunja",
              paciente: "Ana Ríos",
            },
          ],
        },
      }),
    registrarAsistencia: (_c, p) =>
      Promise.resolve({
        ok: true,
        datos: {
          reservaId: p.reservaId,
          estado: p.asistio ? "atendida" : "no_asistio",
          servicio: "Valoración inicial",
          iniciaEn: "2026-11-18T15:00:00.000Z",
          chatId: "500",
        },
      }),
    recordatoriosReclamar: () => Promise.resolve({ ok: true, datos: { recordatorios: [] } }),
    recordatorioMarcarEnviado: () => Promise.resolve({ ok: true, datos: { ok: true } }),
    recordatorioEnviarEmail: () => Promise.resolve({ ok: true, datos: { enviado: true } }),
    citasHoy: () => Promise.resolve({ ok: true, datos: { citas: [] } }),
    historiaResumen: () => Promise.resolve({ ok: true, datos: { tipo: "no_encontrado" } }),
  };
  return { coreApi, registrados };
}

let updateId = 0;
function updateTexto(text: string, chatId: number): Update {
  updateId += 1;
  const esComando = text.startsWith("/");
  // La entidad bot_command cubre solo el token del comando, no los argumentos
  // (así lo manda Telegram; si no, ctx.match / bot.command no funcionan).
  const cmdLen = text.split(/\s/, 1)[0]?.length ?? text.length;
  const update = {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "private", first_name: "Persona" },
      from: { id: chatId, is_bot: false, first_name: "Persona" },
      text,
      ...(esComando
        ? { entities: [{ type: "bot_command", offset: 0, length: cmdLen }] }
        : {}),
    },
  };
  return update as unknown as Update;
}

function updateFoto(fileId: string, chatId: number): Update {
  updateId += 1;
  const update = {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "private", first_name: "Persona" },
      from: { id: chatId, is_bot: false, first_name: "Persona" },
      photo: [{ file_id: fileId, file_unique_id: fileId, width: 100, height: 100 }],
    },
  };
  return update as unknown as Update;
}

function updateCallback(data: string, chatId: number): Update {
  updateId += 1;
  const update = {
    update_id: updateId,
    callback_query: {
      id: String(updateId),
      from: { id: chatId, is_bot: false, first_name: "Persona" },
      chat_instance: "x",
      data,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private", first_name: "Persona" },
        from: botInfo,
        text: "…",
      },
    },
  };
  return update as unknown as Update;
}

beforeEach(() => {
  updateId = 0;
});

describe("consentimiento de datos", () => {
  it("un chat de paciente nuevo ve el aviso de datos antes que nada más, incluso /ping", async () => {
    const { bot, enviados } = crearBotDePrueba();
    await bot.handleUpdate(updateTexto("hola", 111222));
    expect(enviados[0]).toContain("Ley 1581 de 2012");
    await bot.handleUpdate(updateTexto("/ping", 111222));
    expect(enviados[1]).toContain("Ley 1581 de 2012"); // sigue bloqueado, ni /ping pasa
  });

  it("al aceptar, se muestra el menú principal y ya no vuelve a pedirse", async () => {
    const { bot, enviados } = crearBotDePrueba();
    await bot.handleUpdate(updateTexto("hola", 111223));
    await bot.handleUpdate(updateCallback("consentimiento:si", 111223));
    expect(enviados[1]).toContain("La Fisioterapeuta Li");
    await bot.handleUpdate(updateTexto("/ping", 111223));
    expect(enviados[2]).toBe("pong"); // ya no lo vuelve a interceptar
  });

  it("al rechazar, no se muestra el menú y se sigue pidiendo consentimiento después", async () => {
    const { bot, enviados } = crearBotDePrueba();
    await bot.handleUpdate(updateTexto("hola", 111224));
    await bot.handleUpdate(updateCallback("consentimiento:no", 111224));
    expect(enviados[1]).toContain("Sin esa autorización");
    await bot.handleUpdate(updateTexto("/ping", 111224));
    expect(enviados[2]).toContain("Ley 1581 de 2012");
  });

  it("un chat administrativo no ve el aviso de datos", async () => {
    const { bot, enviados } = crearBotDePrueba();
    await bot.handleUpdate(updateTexto("/ping", 111)); // staff (allowlist de pruebas)
    expect(enviados[0]).toBe("pong");
  });
});

describe("bot (integración)", () => {
  it("/ping responde pong a cualquiera", async () => {
    const { bot, enviados } = crearBotDePrueba();
    await bot.handleUpdate(updateTexto("/ping", 999));
    expect(enviados).toEqual(["pong"]);
  });

  it("/id devuelve el chat_id", async () => {
    const { bot, enviados } = crearBotDePrueba();
    await bot.handleUpdate(updateTexto("/id", 777));
    expect(enviados[0]).toContain("777");
  });

  it("un chat NO autorizado sí puede usar una intención no administrativa (ej. crear_sesion)", async () => {
    let nluLlamado = false;
    const nlu = () => {
      nluLlamado = true;
      return Promise.resolve({
        ok: true,
        intencion: { intencion: "consultar_agenda", entidades: {}, confianza: 1, faltantes: [] },
      } as ResultadoNlu);
    };
    const n8n: ClienteN8nPrueba = () => Promise.resolve({ tipo: "ok", datos: { citas: [] } } as ResultadoEjecucion);
    const { bot, enviados } = crearBotDePrueba(nlu, n8n);
    await bot.handleUpdate(updateTexto("¿qué citas hay hoy?", 500));
    expect(nluLlamado).toBe(true);
    expect(enviados[0]).toBe("No tiene citas programadas.");
  });

  it("un chat NO autorizado es rechazado en una intención administrativa (bloquear_horario)", async () => {
    let n8nLlamado = false;
    const nlu = () =>
      Promise.resolve({
        ok: true,
        intencion: {
          intencion: "bloquear_horario",
          entidades: { sede: "Tunja", fecha: "2026-12-24", hora: "00:00" },
          confianza: 1,
          faltantes: [],
        },
      } as ResultadoNlu);
    const n8n: ClienteN8nPrueba = () => {
      n8nLlamado = true;
      return Promise.resolve({ tipo: "ok", datos: {} } as ResultadoEjecucion);
    };
    const { bot, enviados } = crearBotDePrueba(nlu, n8n);
    await bot.handleUpdate(updateTexto("bloqueame el 24 de diciembre en Tunja", 500));
    expect(n8nLlamado).toBe(false);
    expect(enviados[0]).toContain("no tiene permiso");
  });

  it("texto libre de un chat autorizado sí pasa por el NLU y ejecuta vía n8n", async () => {
    const nlu = () =>
      Promise.resolve({
        ok: true,
        intencion: { intencion: "consultar_agenda", entidades: { fecha: "2026-09-01" }, confianza: 0.95, faltantes: [] },
      } as ResultadoNlu);
    let n8nLlamadoCon: unknown = null;
    const n8n: ClienteN8nPrueba = (_c, intencion, entidades) => {
      n8nLlamadoCon = { intencion, entidades };
      return Promise.resolve({ tipo: "ok", datos: { citas: [] } } as ResultadoEjecucion);
    };
    const { bot, enviados } = crearBotDePrueba(nlu, n8n);
    await bot.handleUpdate(updateTexto("¿qué tengo hoy?", 111));
    expect(n8nLlamadoCon).toEqual({ intencion: "consultar_agenda", entidades: { fecha: "2026-09-01" } });
    expect(enviados[0]).toBe("No tiene citas programadas.");
  });

  it("una intención sensible (crear_sesion) pide confirmación y solo llama a n8n tras el sí", async () => {
    const nlu = () =>
      Promise.resolve({
        ok: true,
        intencion: {
          intencion: "cancelar_sesion",
          entidades: { sesion_id: 9 },
          confianza: 0.95,
          faltantes: [],
        },
      } as ResultadoNlu);
    let n8nLlamado = false;
    const n8n: ClienteN8nPrueba = () => {
      n8nLlamado = true;
      return Promise.resolve({ tipo: "ok", datos: { estado: "cancelada_a_tiempo" } } as ResultadoEjecucion);
    };
    const { bot, enviados } = crearBotDePrueba(nlu, n8n);

    await bot.handleUpdate(updateTexto("cancela mi cita 9", 111));
    expect(n8nLlamado).toBe(false); // todavía no confirmó
    expect(enviados[0]).toContain("¿Confirma?");

    await bot.handleUpdate(updateTexto("sí", 111));
    expect(n8nLlamado).toBe(true);
    expect(enviados[1]).toContain("cancelada_a_tiempo");
  });

  it("si n8n falla (transporte), avisa sin filtrar detalles técnicos", async () => {
    const nlu = () =>
      Promise.resolve({
        ok: true,
        intencion: { intencion: "consultar_agenda", entidades: {}, confianza: 0.95, faltantes: [] },
      } as ResultadoNlu);
    const n8n: ClienteN8nPrueba = () => Promise.resolve({ tipo: "error_transporte", motivo: "red" } as ResultadoEjecucion);
    const { bot, enviados } = crearBotDePrueba(nlu, n8n);
    await bot.handleUpdate(updateTexto("¿qué tengo hoy?", 111));
    expect(enviados[0]).toContain("No pude completar la acción");
  });

  const fechaFutura = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  it("reserva guiada: servicio -> elige un horario propuesto -> confirmar -> reservada + pide pago", async () => {
    const { coreApi } = coreApiDePrueba();
    const { bot, enviados } = crearBotDePrueba(undefined, n8nGuiado, coreApi);

    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    expect(enviados[0]).toContain("¿Qué servicio desea agendar?");

    await bot.handleUpdate(updateCallback("rsv:svc:1", 500)); // Punción seca
    expect(enviados[1]).toContain("próximos horarios");
    expect(enviados[1]).toContain("Punción seca");

    await bot.handleUpdate(updateCallback("rsv:slot:0", 500)); // primer horario propuesto
    expect(enviados[2]).toContain("Confirme los datos de su cita");

    await bot.handleUpdate(updateCallback("rsv:ok", 500));
    expect(enviados[3]).toContain("quedó reservada");
    expect(enviados[4]).toContain("transfiera");
    expect(enviados[4]).toContain("$120.000");
  });

  it("reserva guiada: 'elegir otro día' -> escribe fecha -> horarios del día -> confirmar", async () => {
    const { coreApi } = coreApiDePrueba();
    const { bot, enviados } = crearBotDePrueba(undefined, n8nGuiado, coreApi);

    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    await bot.handleUpdate(updateCallback("rsv:svc:1", 500));
    await bot.handleUpdate(updateCallback("rsv:fecha", 500));
    expect(enviados.at(-1)).toContain("qué día");

    await bot.handleUpdate(updateTexto(fechaFutura, 500));
    expect(enviados.at(-1)).toContain("Horarios libres");

    await bot.handleUpdate(updateCallback("rsv:hora:10:00", 500));
    expect(enviados.at(-1)).toContain("Confirme los datos de su cita");
  });

  it("reserva guiada: 'volver' desde 'otro día' regresa a los próximos horarios", async () => {
    const { bot, enviados } = crearBotDePrueba(undefined, n8nGuiado);
    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    await bot.handleUpdate(updateCallback("rsv:svc:1", 500));
    await bot.handleUpdate(updateCallback("rsv:fecha", 500));
    expect(enviados.at(-1)).toContain("qué día");
    await bot.handleUpdate(updateCallback("rsv:volver", 500));
    expect(enviados.at(-1)).toContain("próximos horarios");
  });

  it("/agendar y /miscitas funcionan igual que los botones", async () => {
    const { coreApi } = coreApiDePrueba();
    const n8n: ClienteN8nPrueba = (_c, intencion, e, c) =>
      intencion === "consultar_agenda"
        ? Promise.resolve({ tipo: "ok", datos: { citas: [] } } as ResultadoEjecucion)
        : n8nGuiado(_c, intencion, e, c);
    const { bot, enviados } = crearBotDePrueba(undefined, n8n, coreApi);

    await bot.handleUpdate(updateTexto("/miscitas", 500));
    expect(enviados.at(-1)).toContain("No tiene citas");

    await bot.handleUpdate(updateTexto("/agendar", 500));
    expect(enviados.at(-1)).toContain("¿Qué servicio desea agendar?");
  });

  it("reserva guiada: rechaza una fecha con menos de 24 h", async () => {
    const { bot, enviados } = crearBotDePrueba(undefined, n8nGuiado);
    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    await bot.handleUpdate(updateCallback("rsv:svc:1", 500));
    await bot.handleUpdate(updateCallback("rsv:fecha", 500));
    await bot.handleUpdate(updateTexto("hoy", 500));
    expect(enviados.at(-1)).toContain("24 horas de anticipación");
  });

  it("reserva guiada: un paciente nuevo solo puede agendar la valoración inicial", async () => {
    const n8n: ClienteN8nPrueba = (_c, intencion, entidades, creadoPor) => {
      if (intencion === "consultar_catalogo") {
        return Promise.resolve({
          tipo: "ok",
          datos: {
            registrado: false,
            valoracionRealizada: false,
            servicios: [
              { nombre: "Valoración inicial", duracionMinMinutos: 60, precio: 100000, moneda: "COP" },
              { nombre: "Punción seca", duracionMinMinutos: 60, precio: 120000, moneda: "COP" },
            ],
          },
        } as ResultadoEjecucion);
      }
      return n8nGuiado(_c, intencion, entidades, creadoPor);
    };
    const { bot, enviados } = crearBotDePrueba(undefined, n8n);

    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    // Sin menú de servicios: directo a la valoración y sus próximos horarios.
    expect(enviados[0]).toContain("Valoración inicial");
    expect(enviados[0]).toContain("primera cita");
    expect(enviados[0]).not.toContain("Punción seca");
  });

  it("reserva guiada: primera cita pide nombre y teléfono y luego reserva", async () => {
    const llamadas: Record<string, string | number>[] = [];
    const n8n: ClienteN8nPrueba = (_c, intencion, entidades, creadoPor) => {
      if (intencion === "crear_sesion") {
        llamadas.push(entidades);
        if (entidades["cliente"] === undefined || entidades["telefono"] === undefined) {
          return Promise.resolve({
            tipo: "error_negocio",
            codigo: "registro_requerido",
            mensaje: "Es su primera cita: necesito su nombre completo y su teléfono para registrarlo.",
            datos: { camposFaltantes: ["cliente", "telefono"] },
          } as ResultadoEjecucion);
        }
      }
      return n8nGuiado(_c, intencion, entidades, creadoPor);
    };
    const { coreApi } = coreApiDePrueba();
    const { bot, enviados } = crearBotDePrueba(undefined, n8n, coreApi);

    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    await bot.handleUpdate(updateCallback("rsv:svc:0", 500)); // Valoración inicial
    await bot.handleUpdate(updateTexto(fechaFutura, 500));
    await bot.handleUpdate(updateCallback("rsv:hora:10:00", 500));
    await bot.handleUpdate(updateCallback("rsv:ok", 500));
    expect(enviados.at(-1)).toContain("nombre del paciente");

    await bot.handleUpdate(updateTexto("Ana Ríos", 500));
    expect(enviados.at(-1)).toContain("teléfono");

    await bot.handleUpdate(updateTexto("3009998877", 500));
    expect(llamadas.at(-1)).toMatchObject({ cliente: "Ana Ríos", telefono: "3009998877" });
    expect(enviados.some((t) => t.includes("quedó agendada"))).toBe(true);
    expect(enviados.at(-1)).toContain("transfiera");
  });

  it("cancelar guiado: lista las citas del paciente, elige y cancela", async () => {
    const futuro = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const n8n: ClienteN8nPrueba = (_c, intencion, e, c) => {
      if (intencion === "consultar_agenda") {
        return Promise.resolve({
          tipo: "ok",
          datos: {
            citas: [
              { reservaId: 30, iniciaEn: futuro, servicio: "Punción seca", sede: "Sede Tunja", estado: "confirmada" },
            ],
          },
        } as ResultadoEjecucion);
      }
      if (intencion === "cancelar_sesion") {
        return Promise.resolve({ tipo: "ok", datos: { estado: "cancelada_a_tiempo" } } as ResultadoEjecucion);
      }
      return n8nGuiado(_c, intencion, e, c);
    };
    const { bot, enviados } = crearBotDePrueba(undefined, n8n);

    await bot.handleUpdate(updateTexto("/cancelarcita", 500));
    expect(enviados.at(-1)).toContain("¿Qué cita desea cancelar?");

    await bot.handleUpdate(updateCallback("cxl:pick:0", 500));
    expect(enviados.at(-1)).toContain("¿Qué desea hacer?");
    expect(enviados.at(-1)).toContain("Punción seca");

    await bot.handleUpdate(updateCallback("cxl:ok", 500));
    expect(enviados.at(-1)).toContain("quedó cancelada");
    expect(enviados.at(-1)).toContain("sin ningún cargo");
  });

  it("cancelar guiado: 'pasar a otro día' de una cita pagada la reprograma sin cargo", async () => {
    const futuro = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const llamadas: { intencion: string; entidades: Record<string, string | number> }[] = [];
    const n8n: ClienteN8nPrueba = (_c, intencion, e, c) => {
      llamadas.push({ intencion, entidades: e });
      if (intencion === "consultar_agenda") {
        return Promise.resolve({
          tipo: "ok",
          datos: {
            citas: [
              { reservaId: 40, iniciaEn: futuro, servicio: "Punción seca", sede: "Sede Tunja", estado: "confirmada" },
            ],
          },
        } as ResultadoEjecucion);
      }
      if (intencion === "modificar_sesion") {
        return Promise.resolve({
          tipo: "ok",
          datos: { reservaId: 88, estado: "confirmada", compraId: 20, montoTotal: 120000 },
        } as ResultadoEjecucion);
      }
      return n8nGuiado(_c, intencion, e, c);
    };
    const { bot, enviados } = crearBotDePrueba(undefined, n8n);

    await bot.handleUpdate(updateTexto("/cancelarcita", 500));
    await bot.handleUpdate(updateCallback("cxl:pick:0", 500));
    expect(enviados.at(-1)).toContain("conservar su pago");

    await bot.handleUpdate(updateCallback("cxl:mover", 500));
    expect(enviados.at(-1)).toContain("Va a reprogramar");

    await bot.handleUpdate(updateCallback("rsv:slot:0", 500));
    expect(enviados.at(-1)).toContain("Confirme el nuevo horario");

    await bot.handleUpdate(updateCallback("rsv:ok", 500));
    expect(enviados.at(-1)).toContain("reprogramada");
    expect(enviados.at(-1)).toContain("ningún cargo adicional");
    expect(
      llamadas.some((l) => l.intencion === "modificar_sesion" && l.entidades["sesion_id"] === 40),
    ).toBe(true);
  });

  it("cancelar guiado: 'pasar a otro día' de una cita sin pagar la reprograma y vuelve a pedir el comprobante", async () => {
    const futuro = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const n8n: ClienteN8nPrueba = (_c, intencion, e, c) => {
      if (intencion === "consultar_agenda") {
        return Promise.resolve({
          tipo: "ok",
          datos: {
            citas: [
              { reservaId: 41, iniciaEn: futuro, servicio: "Punción seca", sede: "Sede Tunja", estado: "pendiente_pago" },
            ],
          },
        } as ResultadoEjecucion);
      }
      if (intencion === "modificar_sesion") {
        return Promise.resolve({
          tipo: "ok",
          datos: { reservaId: 88, estado: "pendiente_pago", compraId: 55, montoTotal: 120000 },
        } as ResultadoEjecucion);
      }
      return n8nGuiado(_c, intencion, e, c);
    };
    const { bot, enviados } = crearBotDePrueba(undefined, n8n);

    await bot.handleUpdate(updateTexto("/cancelarcita", 500));
    await bot.handleUpdate(updateCallback("cxl:pick:0", 500));
    await bot.handleUpdate(updateCallback("cxl:mover", 500));
    await bot.handleUpdate(updateCallback("rsv:slot:0", 500));
    await bot.handleUpdate(updateCallback("rsv:ok", 500));
    expect(enviados.some((t) => t.includes("reprogramada"))).toBe(true);
    expect(enviados.at(-1)).toContain("transfiera");
  });

  it("cancelar guiado: cita tardía (confirmada, <24h) avisa que se pierde el pago", async () => {
    const pronto = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const n8n: ClienteN8nPrueba = (_c, intencion, e, c) =>
      intencion === "consultar_agenda"
        ? Promise.resolve({
            tipo: "ok",
            datos: {
              citas: [
                { reservaId: 31, iniciaEn: pronto, servicio: "Terapia neural", sede: "Sede Tunja", estado: "confirmada" },
              ],
            },
          } as ResultadoEjecucion)
        : n8nGuiado(_c, intencion, e, c);
    const { bot, enviados } = crearBotDePrueba(undefined, n8n);

    await bot.handleUpdate(updateTexto("/cancelarcita", 500));
    await bot.handleUpdate(updateCallback("cxl:pick:0", 500));
    expect(enviados.at(-1)).toContain("menos de 24 h");
    expect(enviados.at(-1)).toContain("se pierde el valor");
  });

  it("cancelar por texto (paciente) arranca el flujo guiado", async () => {
    const nlu = () =>
      Promise.resolve({
        ok: true,
        intencion: { intencion: "cancelar_sesion", entidades: {}, confianza: 0.9, faltantes: ["sesion_id"] },
      } as ResultadoNlu);
    const n8n: ClienteN8nPrueba = () =>
      Promise.resolve({ tipo: "ok", datos: { citas: [] } } as ResultadoEjecucion);
    const { bot, enviados } = crearBotDePrueba(nlu, n8n);

    await bot.handleUpdate(updateTexto("quiero cancelar mi cita", 500)); // chat 500 = no staff
    expect(enviados.at(-1)).toContain("No tiene citas próximas para cancelar");
  });

  it("reprogramar por texto (paciente) arranca el mismo flujo guiado de cancelar", async () => {
    const nlu = () =>
      Promise.resolve({
        ok: true,
        intencion: { intencion: "modificar_sesion", entidades: {}, confianza: 0.9, faltantes: ["sesion_id", "fecha", "hora"] },
      } as ResultadoNlu);
    const n8n: ClienteN8nPrueba = () =>
      Promise.resolve({ tipo: "ok", datos: { citas: [] } } as ResultadoEjecucion);
    const { bot, enviados } = crearBotDePrueba(nlu, n8n);

    await bot.handleUpdate(updateTexto("necesito mover mi cita para otro día", 500));
    expect(enviados.at(-1)).toContain("No tiene citas próximas para cancelar");
  });

  it("reserva guiada: recibe la foto del comprobante y la registra", async () => {
    const { coreApi, registrados } = coreApiDePrueba();
    const { bot, enviados } = crearBotDePrueba(undefined, n8nGuiado, coreApi);

    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    await bot.handleUpdate(updateCallback("rsv:svc:1", 500));
    await bot.handleUpdate(updateTexto(fechaFutura, 500));
    await bot.handleUpdate(updateCallback("rsv:hora:10:00", 500));
    await bot.handleUpdate(updateCallback("rsv:ok", 500));

    await bot.handleUpdate(updateFoto("AABBCC", 500));
    expect(registrados).toEqual([{ compraId: 55, comprobanteRef: "AABBCC" }]);
    expect(enviados.at(-1)).toContain("Recibí su comprobante");
  });

  it("staff verifica un pago y el paciente recibe la confirmación", async () => {
    const { coreApi } = coreApiDePrueba();
    const { bot, enviados } = crearBotDePrueba(undefined, n8nGuiado, coreApi);

    await bot.handleUpdate(updateTexto("/pagos", 111)); // 111 = staff
    expect(enviados.some((t) => t.includes("Pago #7"))).toBe(true);

    await bot.handleUpdate(updateCallback("pago:ok:7", 111));
    expect(enviados.some((t) => t.includes("verificado"))).toBe(true);
    expect(enviados.some((t) => t.includes("quedó confirmada"))).toBe(true);
  });

  it("/pagos es solo para el staff", async () => {
    const { coreApi } = coreApiDePrueba();
    const { bot, enviados } = crearBotDePrueba(undefined, n8nGuiado, coreApi);
    await bot.handleUpdate(updateTexto("/pagos", 500)); // no autorizado
    expect(enviados[0]).toContain("solo para el personal");
  });

  it("un chat administrativo no puede usar los atajos de paciente (/agendar, /miscitas, ...)", async () => {
    const { bot, enviados } = crearBotDePrueba();
    await bot.handleUpdate(updateTexto("/agendar", 111)); // staff
    expect(enviados[0]).toContain("uso administrativo");
    await bot.handleUpdate(updateTexto("/miscitas", 111));
    expect(enviados[1]).toContain("uso administrativo");
    await bot.handleUpdate(updateTexto("/servicios", 111));
    expect(enviados[2]).toContain("uso administrativo");
  });

  it("un paciente normal sí puede usar /agendar", async () => {
    const { bot, enviados } = crearBotDePrueba();
    await bot.handleUpdate(updateTexto("/agendar", 500)); // no autorizado
    expect(enviados[0]).not.toContain("uso administrativo");
  });

  it("paciente registrado sin valoración atendida: sigue en valoración-only", async () => {
    const n8n: ClienteN8nPrueba = (_c, intencion, entidades, creadoPor) => {
      if (intencion === "consultar_catalogo") {
        return Promise.resolve({
          tipo: "ok",
          datos: {
            registrado: true,
            valoracionRealizada: false,
            servicios: [
              { nombre: "Valoración inicial", duracionMinMinutos: 60, precio: 100000, moneda: "COP" },
              { nombre: "Punción seca", duracionMinMinutos: 60, precio: 120000, moneda: "COP" },
            ],
          },
        } as ResultadoEjecucion);
      }
      return n8nGuiado(_c, intencion, entidades, creadoPor);
    };
    const { bot, enviados } = crearBotDePrueba(undefined, n8n);
    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    expect(enviados[0]).toContain("valoración inicial todavía no se ha realizado");
    expect(enviados[0]).not.toContain("Punción seca");
  });

  it("los servicios no reservables quedan fuera del menú de reserva", async () => {
    const n8n: ClienteN8nPrueba = (_c, intencion, entidades, creadoPor) => {
      if (intencion === "consultar_catalogo") {
        return Promise.resolve({
          tipo: "ok",
          datos: {
            registrado: true,
            valoracionRealizada: true,
            servicios: [
              { nombre: "Valoración inicial", duracionMinMinutos: 60, precio: 100000, moneda: "COP", reservable: true },
              { nombre: "Prescripción de ejercicio grupal", duracionMinMinutos: 60, precio: 150000, moneda: "COP", reservable: false },
            ],
          },
        } as ResultadoEjecucion);
      }
      return n8nGuiado(_c, intencion, entidades, creadoPor);
    };
    const { bot, enviados } = crearBotDePrueba(undefined, n8n);
    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    expect(enviados.join("\n")).not.toContain("grupal");
  });

  it("reserva guiada: sin horarios ese día pide otra fecha", async () => {
    const n8n: ClienteN8nPrueba = (_c, intencion, entidades, creadoPor) =>
      intencion === "consultar_disponibilidad"
        ? Promise.resolve({ tipo: "ok", datos: { servicio: "Punción seca", sede: "Sede Tunja", slots: [] } } as ResultadoEjecucion)
        : n8nGuiado(_c, intencion, entidades, creadoPor);
    const { bot, enviados } = crearBotDePrueba(undefined, n8n);

    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    await bot.handleUpdate(updateCallback("rsv:svc:1", 500));
    await bot.handleUpdate(updateTexto(fechaFutura, 500));
    expect(enviados.at(-1)).toContain("No hay horarios libres");
  });

  it("un admin agenda por texto (flujo rápido, sin botones)", async () => {
    const nlu = () =>
      Promise.resolve({
        ok: true,
        intencion: {
          intencion: "crear_sesion",
          entidades: { cliente: "Laura", servicio: "Punción", sede: "Tunja", fecha: "2026-11-18", hora: "15:00" },
          confianza: 0.95,
          faltantes: [],
        },
      } as ResultadoNlu);
    const n8n: ClienteN8nPrueba = () =>
      Promise.resolve({ tipo: "ok", datos: { reservaId: 99, compraId: 55, montoTotal: 120000 } } as ResultadoEjecucion);
    const { coreApi } = coreApiDePrueba();
    const { bot, enviados } = crearBotDePrueba(nlu, n8n, coreApi);

    await bot.handleUpdate(updateTexto("agenda a Laura", 111));
    expect(enviados[0]).toContain("quedó agendada");
    expect(enviados[1]).toContain("transfiera");
  });

  it("saluda/charla sin llamar a n8n, incluso desde un chat no autorizado", async () => {
    const nlu = () =>
      Promise.resolve({
        ok: true,
        intencion: {
          intencion: "charla_general",
          entidades: {},
          confianza: 0.95,
          faltantes: [],
          respuesta: "¡Hola! Soy el asistente de La Fisioterapeuta Li.",
        },
      } as ResultadoNlu);
    let n8nLlamado = false;
    const n8n: ClienteN8nPrueba = () => {
      n8nLlamado = true;
      return Promise.resolve({ tipo: "ok", datos: {} } as ResultadoEjecucion);
    };
    const { bot, enviados } = crearBotDePrueba(nlu, n8n);

    await bot.handleUpdate(updateTexto("hola", 500));
    expect(n8nLlamado).toBe(false);
    expect(enviados[0]).toBe("¡Hola! Soy el asistente de La Fisioterapeuta Li.");
  });

  it("staff en medio de un agendamiento por texto: una pregunta se responde y se retoma", async () => {
    const crearSesion: ResultadoNlu = {
      ok: true,
      intencion: { intencion: "crear_sesion", entidades: {}, confianza: 0.95, faltantes: ["servicio", "fecha", "hora"] },
    };
    const catalogo: ResultadoNlu = {
      ok: true,
      intencion: { intencion: "consultar_catalogo", entidades: {}, confianza: 0.95, faltantes: [] },
    };
    let llamada = 0;
    const nlu = () => {
      llamada += 1;
      return Promise.resolve(llamada === 1 ? crearSesion : catalogo);
    };
    const conCatalogo: ResultadoEjecucion = {
      tipo: "ok",
      datos: { servicios: [{ nombre: "Punción seca", duracionMinMinutos: 60, precio: 120000, moneda: "COP" }] },
    };
    const vacio: ResultadoEjecucion = { tipo: "ok", datos: {} };
    const n8n: ClienteN8nPrueba = (_c, intencion) =>
      Promise.resolve(intencion === "consultar_catalogo" ? conCatalogo : vacio);
    const { bot, enviados } = crearBotDePrueba(nlu, n8n);

    // Chat 111 = staff (allowlist de pruebas): sigue el flujo de texto, no el de botones.
    await bot.handleUpdate(updateTexto("quiero agendar una cita", 111));
    expect(enviados[0]).toContain("servicio");

    await bot.handleUpdate(updateTexto("¿qué servicios ofrecen?", 111));
    expect(enviados[1]).toContain("Punción seca");
    expect(enviados[2]).toContain("Sigamos con su cita");
    expect(enviados[2]).toContain("servicio");
  });

  it("/cancelar corta el flujo guiado en curso", async () => {
    const { bot, enviados } = crearBotDePrueba(undefined, n8nGuiado);

    await bot.handleUpdate(updateCallback("menu:agendar", 500));
    await bot.handleUpdate(updateCallback("rsv:svc:0", 500));
    await bot.handleUpdate(updateTexto("/cancelar", 500));
    expect(enviados.at(-1)).toContain("cancelé");
  });

  it("aplica rate limit por chat", async () => {
    const { bot, enviados } = crearBotDePrueba();
    for (let i = 0; i < cfg.BOT_RATE_LIMIT_POR_MINUTO + 5; i += 1) {
      await bot.handleUpdate(updateTexto("/ping", 111));
    }
    expect(enviados.length).toBe(cfg.BOT_RATE_LIMIT_POR_MINUTO);
  });
});
