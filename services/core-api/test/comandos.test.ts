import { describe, it, expect } from "vitest";
import { crearDbFalsa, crearDbFalsaConError } from "./fakeDb.js";
import { ejecutarComando } from "../src/comandos.js";

describe("ejecutarComando", () => {
  it("intención con datos faltantes no toca la base y devuelve 422", async () => {
    const { db, llamadas } = crearDbFalsa();
    const r = await ejecutarComando(db, "crear_sesion", { cliente: "Laura" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ codigo: "datos_incompletos", status: 422 });
    expect(llamadas).toHaveLength(0);
  });

  it("consultar_catalogo lista servicios sin requerir identidad", async () => {
    const { db } = crearDbFalsa([
      [{ nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45, valor_total: "80000.00", moneda: "COP", sesiones_incluidas: 1 }],
    ]);
    const r = await ejecutarComando(db, "consultar_catalogo", {});
    expect(r.ok).toBe(true);
    expect(r.datos).toMatchObject({ servicios: [{ nombre: "Punción Seca", precio: 80000 }] });
  });

  it("consultar_agenda de un chat no-admin desconocido devuelve vacío sin filtrar por sede/fecha", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    const r = await ejecutarComando(db, "consultar_agenda", {}, { creadoPor: "555" });
    expect(r).toEqual({ ok: true, datos: { citas: [] } });
    expect(llamadas).toHaveLength(1); // solo resolverPorChatId, nunca llega a agenda.v_cita
  });

  it("consultar_agenda de un chat no-admin conocido filtra por su pacienteId", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: null, email: null }],
      [
        {
          reserva_id: 1,
          reserva_uuid: "u1",
          estado: "confirmada",
          inicia_en: "2026-09-05T15:00:00-05:00",
          termina_en: "2026-09-05T15:40:00-05:00",
          sede_nombre: "Tunja",
          servicio_nombre: "Punción Seca",
          paciente_nombre: "Laura Gómez",
        },
      ],
    ]);
    const r = await ejecutarComando(db, "consultar_agenda", {}, { creadoPor: "111" });
    expect(r.ok).toBe(true);
    expect(llamadas[1]?.valores[3]).toBe(5);
  });

  it("consultar_agenda de un admin ve todo, aunque el chat_id sea numérico", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    const r = await ejecutarComando(db, "consultar_agenda", {}, { creadoPor: "111", esAdmin: true });
    expect(r.ok).toBe(true);
    expect(llamadas).toHaveLength(1);
  });

  it("consultar_agenda sin filtros consulta agenda.v_cita", async () => {
    const { db } = crearDbFalsa([
      [
        {
          reserva_id: 1,
          reserva_uuid: "u1",
          estado: "confirmada",
          inicia_en: "2026-09-05T15:00:00-05:00",
          termina_en: "2026-09-05T15:40:00-05:00",
          sede_nombre: "Tunja",
          servicio_nombre: "Punción Seca",
          paciente_nombre: "Laura Gómez",
        },
      ],
    ]);
    const r = await ejecutarComando(db, "consultar_agenda", {});
    expect(r.ok).toBe(true);
    expect(r.datos).toMatchObject({ citas: [{ reservaId: 1, sede: "Tunja" }] });
  });

  it("consultar_disponibilidad resuelve servicio y sede antes de pedir los slots", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      [{ id: 1, nombre: "Tunja" }],
      [{ slot_inicio: "2026-09-05T15:00:00-05:00", slot_fin: "2026-09-05T15:40:00-05:00" }],
    ]);
    const r = await ejecutarComando(db, "consultar_disponibilidad", {
      servicio: "punción",
      sede: "tunja",
      fecha: "2026-09-05",
    });
    expect(r.ok).toBe(true);
    expect(llamadas).toHaveLength(3);
  });

  it("consultar_disponibilidad con servicio inexistente devuelve 404 sin seguir a la sede", async () => {
    const { db, llamadas } = crearDbFalsa([[]]);
    const r = await ejecutarComando(db, "consultar_disponibilidad", {
      servicio: "no existe",
      sede: "tunja",
      fecha: "2026-09-05",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ codigo: "no_encontrado", status: 404 });
    expect(llamadas).toHaveLength(1);
  });

  it("crear_sesion feliz: resuelve cliente, servicio y sede, y crea la reserva", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: null }],
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      [{ id: 1, nombre: "Tunja" }],
      [{ crear_reserva: 77 }],
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      { cliente: "Laura", servicio: "Punción", sede: "Tunja", fecha: "2026-09-05", hora: "15:00" },
      { creadoPor: "bot-telegram" },
    );
    expect(r).toEqual({ ok: true, datos: { reservaId: 77 } });
    expect(llamadas).toHaveLength(4);
  });

  it("crear_sesion de un chat conocido no pide 'cliente' y reserva a nombre de ese paciente", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: "3001234567", email: null }], // resolverPorChatId
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      [{ id: 1, nombre: "Tunja" }],
      [{ crear_reserva: 77 }],
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      { servicio: "Punción", sede: "Tunja", fecha: "2026-09-05", hora: "15:00" },
      { creadoPor: "111" },
    );
    expect(r).toEqual({ ok: true, datos: { reservaId: 77, pacienteId: 5 } });
    expect(llamadas).toHaveLength(4);
  });

  it("crear_sesion de un chat desconocido sin nombre/teléfono pide registro_requerido", async () => {
    const { db, llamadas } = crearDbFalsa([[]]); // resolverPorChatId: desconocido
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      { servicio: "Punción", sede: "Tunja", fecha: "2026-09-05", hora: "15:00" },
      { creadoPor: "555" },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ codigo: "registro_requerido", status: 422 });
    expect((r.datos as { camposFaltantes: string[] }).camposFaltantes).toEqual(["cliente", "telefono"]);
    expect(llamadas).toHaveLength(1); // no crea nada mientras falten datos
  });

  it("crear_sesion de un chat desconocido con nombre/teléfono se registra y reserva", async () => {
    const { db, llamadas } = crearDbFalsa([
      [], // resolverPorChatId: desconocido
      [{ id: 9 }], // insert personas.paciente
      [], // insert personas.vinculo_telegram
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      [{ id: 1, nombre: "Tunja" }],
      [{ crear_reserva: 78 }],
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      {
        cliente: "Ana Ríos",
        telefono: "3009998877",
        servicio: "Punción",
        sede: "Tunja",
        fecha: "2026-09-05",
        hora: "15:00",
      },
      { creadoPor: "555" },
    );
    expect(r).toEqual({ ok: true, datos: { reservaId: 78, pacienteId: 9 } });
    expect(llamadas).toHaveLength(6);
  });

  it("crear_sesion con cliente ambiguo devuelve 409 y los candidatos", async () => {
    const { db, llamadas } = crearDbFalsa([
      [
        { id: 1, nombre_completo: "Laura Gómez", telefono: null },
        { id: 2, nombre_completo: "Laura Pérez", telefono: null },
      ],
    ]);
    const r = await ejecutarComando(db, "crear_sesion", {
      cliente: "Laura",
      servicio: "Punción",
      sede: "Tunja",
      fecha: "2026-09-05",
      hora: "15:00",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ codigo: "cliente_ambiguo", status: 409 });
    expect((r.datos as { candidatos: unknown[] }).candidatos).toHaveLength(2);
    expect(llamadas).toHaveLength(1); // no llegó a resolver servicio/sede
  });

  it("crear_sesion propaga un conflicto de doble reserva de Postgres como 409", async () => {
    const { db } = crearDbFalsaConError(
      [
        [{ id: 5, nombre_completo: "Laura Gómez", telefono: null }],
        [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
        [{ id: 1, nombre: "Tunja" }],
      ],
      3,
      { code: "23505", message: "El horario ya fue tomado." },
    );
    const r = await ejecutarComando(db, "crear_sesion", {
      cliente: "Laura",
      servicio: "Punción",
      sede: "Tunja",
      fecha: "2026-09-05",
      hora: "15:00",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ codigo: "conflicto", status: 409 });
  });

  it("cancelar_sesion delega en agenda.cancelar_reserva", async () => {
    const { db } = crearDbFalsa([[{ estado: "cancelada_a_tiempo" }]]);
    const r = await ejecutarComando(db, "cancelar_sesion", { sesion_id: 9 });
    expect(r).toEqual({ ok: true, datos: { estado: "cancelada_a_tiempo" } });
  });

  it("buscar_cliente devuelve la lista de candidatos aunque esté vacía", async () => {
    const { db } = crearDbFalsa([[]]);
    const r = await ejecutarComando(db, "buscar_cliente", { cliente: "nadie" });
    expect(r).toEqual({ ok: true, datos: { candidatos: [] } });
  });

  it("enviar_correo inserta en el outbox, nunca llama a Gmail directamente", async () => {
    const { db, llamadas } = crearDbFalsa([[{ id: 12 }]]);
    const r = await ejecutarComando(db, "enviar_correo", {
      destinatario: "paciente@correo.com",
      asunto: "Recordatorio",
      texto: "Tu cita es mañana.",
    });
    expect(r).toEqual({ ok: true, datos: { outboxId: 12 } });
    expect(llamadas[0]?.texto).toContain("integracion.outbox");
  });

  it("buscar_archivo devuelve 501 sin tocar la base: falta el adaptador de Google", async () => {
    const { db, llamadas } = crearDbFalsa();
    const r = await ejecutarComando(db, "buscar_archivo", { consulta: "consentimiento Laura" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatchObject({ codigo: "no_implementado", status: 501 });
    expect(llamadas).toHaveLength(0);
  });

  it("bloquear_horario resuelve la sede y crea la reserva tipo bloqueo", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 1, nombre: "Tunja" }],
      [{ id: 2 }], // profesional por defecto
      [{ id: 55 }], // insert
    ]);
    const r = await ejecutarComando(db, "bloquear_horario", {
      sede: "Tunja",
      fecha: "2026-12-24",
      hora: "00:00",
      texto: "Festivo",
    });
    expect(r).toEqual({ ok: true, datos: { reservaId: 55 } });
    expect(llamadas).toHaveLength(3);
  });
});
