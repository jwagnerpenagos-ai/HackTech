import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Token de sesión del panel admin: firma HMAC-SHA256 sin dependencias.
 * Formato `<payloadB64url>.<sigB64url>`, payload = `{ sub, exp }` (exp en
 * segundos epoch). No es revocable ni tiene refresh — vida corta, un solo
 * usuario (Lina). Suficiente para el MVP; una sesión real es trabajo aparte.
 */

const b64url = (b: Buffer): string => b.toString("base64url");

interface Payload {
  sub: string;
  exp: number;
}

export function firmarToken(secreto: string, sub: string, ttlSegundos: number): { token: string; expiraEn: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSegundos;
  const payload: Payload = { sub, exp };
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secreto).update(p).digest());
  return { token: `${p}.${sig}`, expiraEn: new Date(exp * 1000).toISOString() };
}

export function verificarToken(secreto: string, token: string | undefined): Payload | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [p, sig] = token.split(".");
  if (p === undefined || sig === undefined) return null;

  const esperada = b64url(createHmac("sha256", secreto).update(p).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString()) as Payload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Secreto efímero para desarrollo cuando no se configuró WEB_SESSION_SECRET. */
export function secretoEfimero(): string {
  return randomBytes(32).toString("hex");
}
