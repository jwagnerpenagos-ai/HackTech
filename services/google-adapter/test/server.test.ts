import { describe, it, expect, vi } from "vitest";
import { construirServidor, type DepsOAuthPaciente } from "../src/server.js";
import type { Db } from "../src/db.js";
import { loadConfig } from "../src/config.js";
import type { TokensIntercambiados } from "../src/googleClients.js";
import { crearDbFalsa } from "./fakeDb.js";

const cfg = loadConfig();

function depsFalsas(overrides: Partial<DepsOAuthPaciente> = {}): DepsOAuthPaciente {
  return {
    construirCliente: () => ({}),
    generarUrl: () => "https://accounts.google.com/o/oauth2/auth?fake=1",
    intercambiarCodigo: () =>
      Promise.resolve({ accessToken: "acc", refreshToken: "ref", scope: "calendar.events", expiraEn: null } as TokensIntercambiados),
    construirCalendar: () => ({
      crearEvento: vi.fn().mockResolvedValue({ id: "evt-paciente" }),
      actualizarEvento: vi.fn(),
      eliminarEvento: vi.fn(),
    }),
    ...overrides,
  };
}

const CITA_TUNJA = {
  reserva_id: 5,
  estado: "confirmada",
  inicia_en: "2026-09-05T15:00:00-05:00",
  termina_en: "2026-09-05T15:40:00-05:00",
  sede_nombre: "Tunja",
  google_calendar_id: "cal@tunja",
  servicio_nombre: "Punción Seca",
  paciente_nombre: "Laura Gómez",
};

function estadoValido(): string {
  return Buffer.from(JSON.stringify({ reserva_id: 5, paciente_id: 9 })).toString("base64url");
}

describe("servidor google-adapter", () => {
  it("GET /health responde ok cuando la base responde", async () => {
    const app = construirServidor(crearDbFalsa().db);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ servicio: "google-adapter", ok: true, db: { ok: true } });
    await app.close();
  });

  it("GET /health responde 503 cuando la base falla", async () => {
    const dbQueFalla: Db = { query: () => Promise.reject(new Error("conexión rechazada")) };
    const app = construirServidor(dbQueFalla);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false });
    await app.close();
  });
});

describe("GET /oauth/paciente/iniciar", () => {
  it("sin cfg (credenciales de Google no configuradas) → 503", async () => {
    const app = construirServidor(crearDbFalsa().db);
    const res = await app.inject({ method: "GET", url: "/oauth/paciente/iniciar?reserva_id=5&paciente_id=9" });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it("sin paciente_id → 400", async () => {
    const app = construirServidor(crearDbFalsa().db, cfg, depsFalsas());
    const res = await app.inject({ method: "GET", url: "/oauth/paciente/iniciar?reserva_id=5" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("con parámetros válidos, redirige a la URL de autorización", async () => {
    const app = construirServidor(crearDbFalsa().db, cfg, depsFalsas());
    const res = await app.inject({ method: "GET", url: "/oauth/paciente/iniciar?reserva_id=5&paciente_id=9" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://accounts.google.com/o/oauth2/auth?fake=1");
    await app.close();
  });
});

describe("GET /oauth/callback", () => {
  it("con error de Google → 200 con página avisando, sin tocar la base", async () => {
    const { db, llamadas } = crearDbFalsa();
    const app = construirServidor(db, cfg, depsFalsas());
    const res = await app.inject({ method: "GET", url: "/oauth/callback?error=access_denied" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Tu cita sigue confirmada");
    expect(llamadas).toHaveLength(0);
    await app.close();
  });

  it("sin code/state → 400", async () => {
    const app = construirServidor(crearDbFalsa().db, cfg, depsFalsas());
    const res = await app.inject({ method: "GET", url: "/oauth/callback" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("con state corrupto → 400 state_invalido", async () => {
    const app = construirServidor(crearDbFalsa().db, cfg, depsFalsas());
    const res = await app.inject({ method: "GET", url: "/oauth/callback?code=abc&state=no-es-base64-json" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "state_invalido" });
    await app.close();
  });

  it("camino feliz: guarda la autorización y crea el evento en el Calendar del paciente", async () => {
    const { db, llamadas } = crearDbFalsa([
      [], // guardarAutorizacion
      [CITA_TUNJA], // obtenerCita
      [], // guardarEventoCalendarPaciente
    ]);
    const calendarFalso = {
      crearEvento: vi.fn().mockResolvedValue({ id: "evt-paciente" }),
      actualizarEvento: vi.fn(),
      eliminarEvento: vi.fn(),
    };
    const deps = depsFalsas({ construirCalendar: () => calendarFalso });
    const app = construirServidor(db, cfg, deps);
    const res = await app.inject({ method: "GET", url: `/oauth/callback?code=abc&state=${estadoValido()}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Ya quedó en tu Google Calendar");
    expect(llamadas[0]?.texto).toContain("autorizacion_calendar_paciente");
    expect(llamadas[0]?.valores).toEqual([9, "acc", "ref", "calendar.events", null]);
    expect(calendarFalso.crearEvento).toHaveBeenCalledWith(
      "primary",
      expect.objectContaining({ resumen: "Punción Seca — La Fisioterapeuta Li" }),
    );
    expect(llamadas[2]?.valores).toEqual(["reserva_paciente", 5, "evt-paciente"]);
    await app.close();
  });

  it("sin refresh_token (ya había autorizado antes) → avisa, no guarda nada", async () => {
    const { db, llamadas } = crearDbFalsa();
    const deps = depsFalsas({
      intercambiarCodigo: () =>
        Promise.resolve({ accessToken: "acc", refreshToken: null, scope: "calendar.events", expiraEn: null }),
    });
    const app = construirServidor(db, cfg, deps);
    const res = await app.inject({ method: "GET", url: `/oauth/callback?code=abc&state=${estadoValido()}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("ya habías autorizado antes");
    expect(llamadas).toHaveLength(0);
    await app.close();
  });

  it("si falla el intercambio de código, avisa sin filtrar el error técnico", async () => {
    const { db, llamadas } = crearDbFalsa();
    const deps = depsFalsas({ intercambiarCodigo: () => Promise.reject(new Error("invalid_grant")) });
    const app = construirServidor(db, cfg, deps);
    const res = await app.inject({ method: "GET", url: `/oauth/callback?code=abc&state=${estadoValido()}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("invalid_grant");
    expect(llamadas).toHaveLength(0);
    await app.close();
  });

  it("si la reserva ya no existe, igual guarda la autorización pero no crea evento", async () => {
    const { db, llamadas } = crearDbFalsa([
      [], // guardarAutorizacion
      [], // obtenerCita -> nada
    ]);
    const app = construirServidor(db, cfg, depsFalsas());
    const res = await app.inject({ method: "GET", url: `/oauth/callback?code=abc&state=${estadoValido()}` });
    expect(res.statusCode).toBe(200);
    expect(llamadas).toHaveLength(2);
    await app.close();
  });
});
