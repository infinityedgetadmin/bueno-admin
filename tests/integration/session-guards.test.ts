import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "@/lib/admin/session-constants";
import { setSeedPassword, upsertMember } from "../support/store";

/** Recognisable signal thrown by the mocked `redirect()`, carrying the target URL. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

const cookiesMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new RedirectSignal(url);
});

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const PASSWORD = "guards-password-ok";

function cookieJar(value: string | undefined) {
  return { get: () => (value === undefined ? undefined : { name: SESSION_COOKIE, value }) };
}

/**
 * `getAdminActor` is wrapped in React's `cache()`, which memoises for the lifetime of the
 * module instance — outside a real Next.js request render there is no automatic per-request
 * reset. Force a fresh module (and so a fresh cache) per test via `vi.resetModules()` plus a
 * dynamic import.
 */
async function freshSession() {
  vi.resetModules();
  return import("@/lib/admin/session");
}

async function member(email: string, role: "admin" | "editor" | "viewer") {
  await upsertMember({ email, role });
  await setSeedPassword(email, PASSWORD);
}

describe("session guards", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    redirectMock.mockClear();
  });

  it("lets an admin through requireAdminAction('team.manage') and returns the actor", async () => {
    await member("admin@bueno-test.example.com", "admin");
    const session = await freshSession();
    const { cookie } = await session.signInWithPassword({ email: "admin@bueno-test.example.com", password: PASSWORD });

    cookiesMock.mockResolvedValue(cookieJar(cookie));
    await expect(session.requireAdminAction("team.manage")).resolves.toMatchObject({
      email: "admin@bueno-test.example.com",
      role: "admin",
    });
  });

  it("blocks an editor from requireAdminAction('team.manage')", async () => {
    await member("editor@bueno-test.example.com", "editor");
    const session = await freshSession();
    const { cookie } = await session.signInWithPassword({ email: "editor@bueno-test.example.com", password: PASSWORD });

    cookiesMock.mockResolvedValue(cookieJar(cookie));
    await expect(session.requireAdminAction("team.manage")).rejects.toMatchObject({ reason: "not_authorized" });
    await expect(session.requireAdminAction("team.manage")).rejects.toBeInstanceOf(session.AdminAuthError);
  });

  it("blocks a viewer from requireAdminAction('catalog.write')", async () => {
    await member("viewer@bueno-test.example.com", "viewer");
    const session = await freshSession();
    const { cookie } = await session.signInWithPassword({ email: "viewer@bueno-test.example.com", password: PASSWORD });

    cookiesMock.mockResolvedValue(cookieJar(cookie));
    await expect(session.requireAdminAction("catalog.write")).rejects.toMatchObject({ reason: "not_authorized" });
  });

  it("treats a missing cookie as unauthenticated for requireAdminAction, never redirecting", async () => {
    cookiesMock.mockResolvedValue(cookieJar(undefined));
    const session = await freshSession();
    await expect(session.requireAdminAction("catalog.read")).rejects.toMatchObject({ reason: "unauthenticated" });
    await expect(session.requireAdminAction("catalog.read")).rejects.toBeInstanceOf(session.AdminAuthError);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects requireAdminPage to /admin/login when there is no cookie", async () => {
    cookiesMock.mockResolvedValue(cookieJar(undefined));
    const session = await freshSession();
    await expect(session.requireAdminPage()).rejects.toBeInstanceOf(RedirectSignal);
    await expect(session.requireAdminPage()).rejects.toMatchObject({ url: "/admin/login" });
  });

  it("redirects requireAdminPage to /admin/login?error=not_authorized for a removed user", async () => {
    await member("gone@bueno-test.example.com", "viewer");
    const session = await freshSession();
    const { cookie } = await session.signInWithPassword({ email: "gone@bueno-test.example.com", password: PASSWORD });
    await upsertMember({ email: "gone@bueno-test.example.com", role: "viewer", active: false });

    cookiesMock.mockResolvedValue(cookieJar(cookie));
    await expect(session.requireAdminPage()).rejects.toMatchObject({ url: "/admin/login?error=not_authorized" });
  });
});
