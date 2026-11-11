import { createHmac, timingSafeEqual } from "node:crypto";

/** What a session cookie carries. Times are Unix milliseconds. */
export interface SessionClaims {
  email: string;
  issuedAt: number;
  expiresAt: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** `<base64url claims>.<base64url HMAC-SHA256>`: opaque to the browser, verifiable by the server. */
export function signSessionToken(claims: SessionClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function isClaims(value: unknown): value is SessionClaims {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.email === "string" &&
    record.email.length > 0 &&
    typeof record.issuedAt === "number" &&
    Number.isFinite(record.issuedAt) &&
    typeof record.expiresAt === "number" &&
    Number.isFinite(record.expiresAt)
  );
}

/** The claims of a genuine, unexpired token; null for anything else (never throws). */
export function verifySessionToken(token: string, secret: string, nowMs: number): SessionClaims | null {
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1 || token.indexOf(".", separator + 1) !== -1) return null;
  const payload = token.slice(0, separator);
  const signature = Buffer.from(token.slice(separator + 1), "base64url");
  const expected = Buffer.from(sign(payload, secret), "base64url");
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isClaims(claims)) return null;
  if (claims.expiresAt <= nowMs || claims.issuedAt > nowMs) return null;
  return claims;
}
