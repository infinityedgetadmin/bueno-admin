import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/admin/session-constants";
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
