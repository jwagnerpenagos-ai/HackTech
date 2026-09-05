/* eslint-disable no-console -- script interactivo de un solo uso, pensado para correrse a mano en la terminal. */
import { createServer } from "node:http";
import { google } from "googleapis";
import { loadConfig } from "./config.js";

/**
 * `npm run setup-oauth` — obtiene UNA vez el refresh token de la cuenta de
 * Google de Lina (Workspace). Necesario porque el consumidor del outbox
 * corre sin nadie presente para hacer login: se autoriza una sola vez acá,
 * el refresh token queda en `.env.local` (`GOOGLE_REFRESH_TOKEN`) y
 * `googleapis` renueva el access token solo de ahí en adelante.
 *
 * No se puede automatizar más allá de esto: Google exige el consentimiento
 * explícito de una persona en el navegador.
 */

const SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/calendar.events"];

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.GOOGLE_CLIENT_ID || !cfg.GOOGLE_CLIENT_SECRET) {
    console.error("Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env.local. Configuralos primero (ver README.md).");
    process.exit(1);
    return;
  }

  const redirectUrl = new URL(cfg.GOOGLE_REDIRECT_URI);
  const client = new google.auth.OAuth2(cfg.GOOGLE_CLIENT_ID, cfg.GOOGLE_CLIENT_SECRET, cfg.GOOGLE_REDIRECT_URI);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // fuerza que Google reemita el refresh_token aunque ya se haya autorizado antes.
    scope: SCOPES,
  });

  console.log("\n1. Inicie sesión con LA CUENTA DE GOOGLE DE LINA y abra este enlace:\n");
  console.log(authUrl);
  console.log(`\n2. Esperando el redirect en ${cfg.GOOGLE_REDIRECT_URI} …\n`);

  const codigo = await esperarCodigo(redirectUrl);
  const { tokens } = await client.getToken(codigo);

  if (!tokens.refresh_token) {
    console.error(
      "\nGoogle no devolvió un refresh_token. Probablemente esta cuenta ya había autorizado la app antes.",
    );
    console.error(
      "Revocá el acceso en https://myaccount.google.com/permissions y volvé a correr este script.\n",
    );
    process.exit(1);
    return;
  }

  console.log("\nListo. Pegá esto en services/google-adapter/.env.local:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

function esperarCodigo(redirectUrl: URL): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname !== redirectUrl.pathname) {
        res.writeHead(404).end();
        return;
      }
      const codigo = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(error ? `<p>Error: ${error}. Cierre esta pestaña.</p>` : "<p>Listo, ya puede cerrar esta pestaña.</p>");
      server.close();
      if (error) reject(new Error(error));
      else if (codigo) resolve(codigo);
      else reject(new Error("Google no mandó ni 'code' ni 'error' en el redirect."));
    });
    server.listen(Number(redirectUrl.port), redirectUrl.hostname);
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
