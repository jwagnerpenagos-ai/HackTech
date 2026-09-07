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

  it("consultar_catalogo lista servicios; sin identidad (web/admin) marca registrado=true", async () => {
    const { db } = crearDbFalsa([
      [{ nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45, valor_total: "80000.00", moneda: "COP", sesiones_incluidas: 1 }],
    ]);
    const r = await ejecutarComando(db, "consultar_catalogo", {});
    expect(r.ok).toBe(true);
    expect(r.datos).toMatchObject({ servicios: [{ nombre: "Punción Seca", precio: 80000 }], registrado: true });
  });

  it("consultar_catalogo desde un chat sin paciente vinculado marca registrado=false", async () => {
    const { db } = crearDbFalsa([
      [{ nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45, valor_total: "80000.00", moneda: "COP" }],
      [], // resolverPorChatId: desconocido
    ]);
    const r = await ejecutarComando(db, "consultar_catalogo", {}, { creadoPor: "555" });
    expect(r.ok).toBe(true);
    expect((r.datos as { registrado: boolean }).registrado).toBe(false);
    expect((r.datos as { valoracionRealizada: boolean }).valoracionRealizada).toBe(false);
    // La lista igual va completa: es información.
    expect((r.datos as { servicios: unknown[] }).servicios).toHaveLength(1);
  });

  it("consultar_catalogo: chat conocido con valoración atendida marca valoracionRealizada=true", async () => {
    const { db } = crearDbFalsa([
      [{ nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45, valor_total: "80000.00", moneda: "COP", reservable: true }],
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: null, email: null }], // resolverPorChatId: conocido
      [{ existe: true }], // tieneValoracionAtendida
    ]);
    const r = await ejecutarComando(db, "consultar_catalogo", {}, { creadoPor: "555" });
    expect(r.ok).toBe(true);
    expect(r.datos).toMatchObject({ registrado: true, valoracionRealizada: true });
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

  it("consultar_disponibilidad sin sede: la deriva del día (entre semana -> Tunja)", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      [{ id: 1, nombre: "Tunja" }],
      [{ slot_inicio: "2026-09-16T15:00:00-05:00", slot_fin: "2026-09-16T15:40:00-05:00" }],
    ]);
    const r = await ejecutarComando(db, "consultar_disponibilidad", {
      servicio: "punción",
      fecha: "2026-09-16", // miércoles
    });
    expect(r.ok).toBe(true);
    expect((r.datos as { sede: string }).sede).toBe("Tunja");
    expect(llamadas).toHaveLength(3);
  });

  it("consultar_disponibilidad SIN fecha devuelve los próximos horarios (modo 'proximos')", async () => {
    const futuro = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const { db } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }], // resolverServicio
      [{ id: 1, nombre: "Tunja" }], // resolverSede Tunja
      [{ id: 2, nombre: "Turmequé" }], // resolverSede Turmequé
      [{ slot_inicio: futuro, slot_fin: futuro }], // día 1
      [{ slot_inicio: futuro, slot_fin: futuro }], // día 2
      [{ slot_inicio: futuro, slot_fin: futuro }], // día 3
      [{ slot_inicio: futuro, slot_fin: futuro }], // día 4
      [{ slot_inicio: futuro, slot_fin: futuro }], // día 5
      [{ slot_inicio: futuro, slot_fin: futuro }], // día 6
    ]);
    const r = await ejecutarComando(db, "consultar_disponibilidad", { servicio: "punción" });
    expect(r.ok).toBe(true);
    const d = r.datos as { modo: string; slots: unknown[] };
    expect(d.modo).toBe("proximos");
    expect(d.slots).toHaveLength(6);
    expect(d.slots[0]).toMatchObject({ sede: expect.stringContaining("Sede") as unknown });
  });

  // Orden en crear_sesion: resolverServicio -> resolverTarifaIndividual -> (identidad)
  //   -> [registro] -> resolverSede -> agenda.crearSesion(tx: crear_reserva, INSERT compra,
  //   UPDATE participante, UPDATE reserva).
  const TARIFA = [{ id: 29, nombre: "Sesión individual", valor_total: "120000.00", moneda: "COP" }];
  const COLA_CREAR = [[{ id: 500 }], [], []]; // compra, participante, reserva_expira
  const FECHA_HABIL = { fecha: "2027-01-15", hora: "15:00" }; // viernes, lejos en el futuro
  const FECHA_FINDE = { fecha: "2027-01-16", hora: "10:00" }; // sábado

  it("crear_sesion sin sede un fin de semana: la deriva a Turmequé", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      TARIFA,
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: "3001234567", email: null }], // resolverPorChatId
      [{ existe: true }], // tieneValoracionAtendida
      [{ id: 2, nombre: "Turmequé" }],
      [{ crear_reserva: 77 }],
      ...COLA_CREAR,
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      { servicio: "Punción", ...FECHA_FINDE },
      { creadoPor: "111" },
    );
    expect(r.ok).toBe(true);
    expect(llamadas.some((l) => l.valores.some((v) => String(v).includes("Turmequé")))).toBe(true);
  });

  it("crear_sesion feliz: crea la reserva + compra pendiente_pago y devuelve el monto", async () => {
    const { db } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      TARIFA,
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: null }], // buscarPaciente
      [{ id: 1, nombre: "Tunja" }],
      [{ crear_reserva: 77 }],
      ...COLA_CREAR,
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      { cliente: "Laura", servicio: "Punción", sede: "Tunja", ...FECHA_HABIL },
      { creadoPor: "bot-telegram" },
    );
    expect(r).toEqual({ ok: true, datos: { reservaId: 77, compraId: 500, montoTotal: 120000, moneda: "COP" } });
  });

  it("crear_sesion de un chat conocido no pide 'cliente' y reserva a su nombre", async () => {
    const { db } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      TARIFA,
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: "3001234567", email: null }], // resolverPorChatId
      [{ existe: true }], // tieneValoracionAtendida
      [{ id: 1, nombre: "Tunja" }],
      [{ crear_reserva: 77 }],
      ...COLA_CREAR,
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      { servicio: "Punción", sede: "Tunja", ...FECHA_HABIL },
      { creadoPor: "111" },
    );
    expect(r).toEqual({
      ok: true,
      datos: { reservaId: 77, compraId: 500, montoTotal: 120000, moneda: "COP", pacienteId: 5 },
    });
  });

  it("crear_sesion de un chat conocido SIN valoración atendida rechaza otros servicios", async () => {
    const { db } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      TARIFA,
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: "3001234567", email: null }], // resolverPorChatId
      [{ existe: false }], // tieneValoracionAtendida
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      { servicio: "Punción", sede: "Tunja", ...FECHA_HABIL },
      { creadoPor: "111" },
    );
    expect(r.ok).toBe(false);
    expect((r as { error: { codigo: string } }).error.codigo).toBe("valoracion_requerida");
  });

  it("crear_sesion rechaza citas con menos de 24 h de anticipación", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
    ]);
    // dentro de ~3 h, expresado como fecha/hora de Bogotá (UTC-5)
    const bogota = new Date(Date.now() + 3 * 3_600_000 - 5 * 3_600_000);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      {
        servicio: "Punción",
        sede: "Tunja",
        fecha: bogota.toISOString().slice(0, 10),
        hora: bogota.toISOString().slice(11, 16),
      },
      { creadoPor: "111" },
    );
    expect(r.error).toMatchObject({ codigo: "anticipacion_insuficiente", status: 422 });
    expect(llamadas).toHaveLength(1); // solo resolvió el servicio
  });

  it("crear_sesion de un chat NUEVO solo permite la valoración inicial", async () => {
    const { db, llamadas } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      TARIFA,
      [], // resolverPorChatId: desconocido
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      { servicio: "Punción", sede: "Tunja", ...FECHA_HABIL },
      { creadoPor: "555" },
    );
    expect(r.error).toMatchObject({ codigo: "valoracion_requerida", status: 422 });
    expect(llamadas).toHaveLength(3); // servicio + tarifa + identidad
  });

  it("crear_sesion de un chat NUEVO con la valoración y sin nombre/teléfono pide registro", async () => {
    const { db } = crearDbFalsa([
      [{ id: 7, nombre: "Valoración inicial", duracion_min_minutos: 60, duracion_max_minutos: 60 }],
      TARIFA,
      [], // resolverPorChatId: desconocido
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      { servicio: "Valoración inicial", sede: "Tunja", ...FECHA_HABIL },
      { creadoPor: "555" },
    );
    expect(r.error).toMatchObject({ codigo: "registro_requerido", status: 422 });
    expect((r.datos as { camposFaltantes: string[] }).camposFaltantes).toEqual([
      "cliente",
      "telefono",
      "email",
      "documento",
      "eps",
    ]);
  });

  it("crear_sesion de un chat NUEVO con la valoración + nombre/teléfono/correo se registra y reserva", async () => {
    const { db } = crearDbFalsa([
      [{ id: 7, nombre: "Valoración inicial", duracion_min_minutos: 60, duracion_max_minutos: 60 }],
      TARIFA,
      [], // resolverPorChatId: desconocido
      [], // crearPacienteConVinculo: SELECT por numero_documento -> no existe
      [{ id: 9 }], // insert personas.paciente
      [], // insert personas.vinculo_telegram
      [{ id: 1, nombre: "Tunja" }],
      [{ crear_reserva: 78 }],
      ...COLA_CREAR,
      [{ id: 900 }], // enviarCorreo: INSERT integracion.outbox (acuse por correo)
    ]);
    const r = await ejecutarComando(
      db,
      "crear_sesion",
      {
        cliente: "Ana Ríos",
        telefono: "3009998877",
        email: "ana@correo.com",
        documento: "1122334455",
        eps: "Sura",
        servicio: "Valoración inicial",
        sede: "Tunja",
        ...FECHA_HABIL,
      },
      { creadoPor: "555" },
    );
    expect(r).toMatchObject({ ok: true, datos: { reservaId: 78, compraId: 500, pacienteId: 9 } });
  });

  it("crear_sesion con cliente ambiguo devuelve 409 y los candidatos", async () => {
    const { db } = crearDbFalsa([
      [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
      TARIFA,
      [
        { id: 1, nombre_completo: "Laura Gómez", telefono: null },
        { id: 2, nombre_completo: "Laura Pérez", telefono: null },
      ],
    ]);
    const r = await ejecutarComando(db, "crear_sesion", {
      cliente: "Laura",
      servicio: "Punción",
      sede: "Tunja",
      ...FECHA_HABIL,
    });
    expect(r.error).toMatchObject({ codigo: "cliente_ambiguo", status: 409 });
    expect((r.datos as { candidatos: unknown[] }).candidatos).toHaveLength(2);
  });

  it("crear_sesion propaga un conflicto de doble reserva de Postgres como 409", async () => {
    const { db } = crearDbFalsaConError(
      [
        [{ id: 3, nombre: "Punción Seca", duracion_min_minutos: 30, duracion_max_minutos: 45 }],
        TARIFA,
        [{ id: 5, nombre_completo: "Laura Gómez", telefono: null }], // buscarPaciente
        [{ id: 1, nombre: "Tunja" }],
      ],
      4, // agenda.crear_reserva
      { code: "23505", message: "El horario ya fue tomado." },
    );
    const r = await ejecutarComando(db, "crear_sesion", {
      cliente: "Laura",
      servicio: "Punción",
      sede: "Tunja",
      ...FECHA_HABIL,
    });
    expect(r.error).toMatchObject({ codigo: "conflicto", status: 409 });
  });

  it("cancelar_sesion delega en agenda.cancelar_reserva", async () => {
    const { db } = crearDbFalsa([[{ estado: "cancelada_a_tiempo" }]]);
    const r = await ejecutarComando(db, "cancelar_sesion", { sesion_id: 9 });
    expect(r).toEqual({ ok: true, datos: { estado: "cancelada_a_tiempo" } });
  });

  it("cancelar_sesion de un paciente: solo si la cita es suya", async () => {
    // dueño: resolverPorChatId -> paciente 5; reservaEsDelPaciente -> 1 fila; cancelar_reserva
    const propia = crearDbFalsa([
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: null, email: null }],
      [{ "?column?": 1 }],
      [{ estado: "cancelada_a_tiempo" }],
    ]);
    const r1 = await ejecutarComando(propia.db, "cancelar_sesion", { sesion_id: 9 }, { creadoPor: "111" });
    expect(r1).toMatchObject({ ok: true, datos: { estado: "cancelada_a_tiempo" } });

    // ajena: reservaEsDelPaciente -> sin filas -> 403
    const ajena = crearDbFalsa([
      [{ id: 5, nombre_completo: "Laura Gómez", telefono: null, email: null }],
      [], // no es participante
    ]);
    const r2 = await ejecutarComando(ajena.db, "cancelar_sesion", { sesion_id: 99 }, { creadoPor: "111" });
    expect(r2.error).toMatchObject({ codigo: "no_autorizado", status: 403 });
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
