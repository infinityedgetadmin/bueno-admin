import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/admin/session-token";

const SECRET = "a-secret-of-at-least-thirty-two-characters";
const NOW = 1_800_000_000_000;
const claims = { email: "owner@bueno.example.com", issuedAt: NOW - 1_000, expiresAt: NOW + 60_000 };

describe("session tokens", () => {
  it("round-trips the claims it signed", () => {
    const token = signSessionToken(claims, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifySessionToken(token, SECRET, NOW)).toEqual(claims);
  });

  it("rejects a token signed with another secret or altered in any way", () => {
    const token = signSessionToken(claims, SECRET);
    expect(verifySessionToken(token, `${SECRET}-other`, NOW)).toBeNull();
    const [payload, signature] = token.split(".") as [string, string];
    const otherPayload = Buffer.from(JSON.stringify({ ...claims, email: "attacker@example.com" })).toString("base64url");
    expect(verifySessionToken(`${otherPayload}.${signature}`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(`${payload}.${signature.slice(0, -1)}`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(`${payload}.${signature}x`, SECRET, NOW)).toBeNull();
  });

  it("rejects expired tokens and tokens from the future", () => {
    const token = signSessionToken(claims, SECRET);
    expect(verifySessionToken(token, SECRET, claims.expiresAt)).toBeNull();
    expect(verifySessionToken(token, SECRET, claims.issuedAt - 1)).toBeNull();
    expect(verifySessionToken(token, SECRET, claims.issuedAt)).toEqual(claims);
  });

  it("never throws on malformed input", () => {
    for (const bad of ["", ".", "a.", ".b", "abc", "a.b.c", "not base64!.sig", `${Buffer.from("[]").toString("base64url")}.x`]) {
      expect(verifySessionToken(bad, SECRET, NOW)).toBeNull();
    }
  });

  it("rejects well-signed payloads that are not session claims", () => {
    const signWith = (value: unknown) => {
      const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
      const [, signature] = signSessionToken(JSON.parse(JSON.stringify(value)) as never, SECRET).split(".");
      return `${payload}.${signature ?? ""}`;
    };
    expect(verifySessionToken(signWith(null), SECRET, NOW)).toBeNull();
    expect(verifySessionToken(signWith("string"), SECRET, NOW)).toBeNull();
    expect(verifySessionToken(signWith({ email: "", issuedAt: 1, expiresAt: NOW + 1 }), SECRET, NOW)).toBeNull();
    expect(verifySessionToken(signWith({ email: "a@b.c", issuedAt: "1", expiresAt: NOW + 1 }), SECRET, NOW)).toBeNull();
    expect(verifySessionToken(signWith({ email: "a@b.c", issuedAt: 1 }), SECRET, NOW)).toBeNull();
    expect(verifySessionToken(signWith({ email: "a@b.c", issuedAt: 1, expiresAt: Number.NaN }), SECRET, NOW)).toBeNull();
  });
});

describe("session token payloads that are signed but unreadable", () => {
  it("rejects a genuinely signed payload that is not JSON", async () => {
    const { createHmac } = await import("node:crypto");
    const payload = Buffer.from("not json at all", "utf8").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(verifySessionToken(`${payload}.${signature}`, SECRET, NOW)).toBeNull();
  });
});
