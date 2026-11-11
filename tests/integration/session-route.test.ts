import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/admin/session-constants";
import { ACCOUNT_FAILURE_LIMIT, resetSignInThrottle } from "@/lib/admin/sign-in-throttle";
import { listAudit } from "@/lib/cms/audit";
import { POST } from "@/app/(admin)/admin/api/session/route";
import { setSeedPassword, upsertMember } from "../support/store";

const PASSWORD = "editor-password-ok";

function request(body: unknown, origin = "http://localhost:3000"): NextRequest {
  return new NextRequest("http://localhost:3000/admin/api/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: "localhost:3000" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /admin/api/session", () => {
  beforeEach(async () => {
    resetSignInThrottle();
    await upsertMember({ email: "editor@bueno-test.example.com", role: "editor" });
    await setSeedPassword("editor@bueno-test.example.com", PASSWORD);
    await upsertMember({ email: "former@bueno-test.example.com", role: "editor", active: false });
    await setSeedPassword("former@bueno-test.example.com", PASSWORD);
  });

  it("sets a scoped httpOnly session cookie for team members and audits the sign-in", async () => {
    const response = await POST(request({ email: "editor@bueno-test.example.com", password: PASSWORD }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/admin/);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect((await listAudit({ limit: 5 }))[0]).toMatchObject({ action: "auth.sign_in", entity: { id: "editor@bueno-test.example.com" } });
  });

  it("returns 401 invalid_credentials for unknown addresses and wrong passwords", async () => {
    const stranger = await POST(request({ email: "stranger@example.example.com", password: PASSWORD }));
    expect(stranger.status).toBe(401);
    expect(await stranger.json()).toEqual({ ok: false, error: "invalid_credentials" });
    const wrong = await POST(request({ email: "editor@bueno-test.example.com", password: "not-the-password" }));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ ok: false, error: "invalid_credentials" });
    expect(await listAudit({ limit: 5 })).toHaveLength(0);
  });

  it("returns 403 for accounts whose access was removed", async () => {
    const response = await POST(request({ email: "former@bueno-test.example.com", password: PASSWORD }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "not_authorized" });
  });

  it("rejects cross-site posts and bad bodies", async () => {
    expect((await POST(request({ email: "editor@bueno-test.example.com", password: PASSWORD }, "https://evil.test"))).status).toBe(403);
    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request({ nope: true }))).status).toBe(400);
    expect((await POST(request({ email: "editor@bueno-test.example.com", password: "" }))).status).toBe(400);
  });
});

describe("POST /admin/api/session throttling", () => {
  beforeEach(async () => {
    resetSignInThrottle();
    await upsertMember({ email: "editor@bueno-test.example.com", role: "editor" });
    await setSeedPassword("editor@bueno-test.example.com", PASSWORD);
  });

  it("locks the account after repeated wrong passwords, even for the right one, and says when to retry", async () => {
    for (let attempt = 0; attempt < ACCOUNT_FAILURE_LIMIT; attempt++) {
      expect((await POST(request({ email: "editor@bueno-test.example.com", password: "wrong-guess-00" }))).status).toBe(401);
    }
    const locked = await POST(request({ email: "Editor@Bueno-Test.Example.com", password: PASSWORD }));
    expect(locked.status).toBe(429);
    expect(await locked.json()).toEqual({ ok: false, error: "too_many_attempts" });
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(locked.headers.get("set-cookie")).toBeNull();
  });

  it("does not lock one account because of failures on another", async () => {
    for (let attempt = 0; attempt < ACCOUNT_FAILURE_LIMIT; attempt++) {
      await POST(request({ email: "someone@bueno-test.example.com", password: "wrong-guess-00" }));
    }
    expect((await POST(request({ email: "editor@bueno-test.example.com", password: PASSWORD }))).status).toBe(200);
  });

  it("forgets earlier failures after a successful sign-in", async () => {
    for (let attempt = 0; attempt < ACCOUNT_FAILURE_LIMIT - 1; attempt++) {
      await POST(request({ email: "editor@bueno-test.example.com", password: "wrong-guess-00" }));
    }
    expect((await POST(request({ email: "editor@bueno-test.example.com", password: PASSWORD }))).status).toBe(200);
    expect((await POST(request({ email: "editor@bueno-test.example.com", password: "wrong-guess-00" }))).status).toBe(401);
    expect((await POST(request({ email: "editor@bueno-test.example.com", password: PASSWORD }))).status).toBe(200);
  });
});
