import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  recordSignIn: vi.fn(),
  getCredential: vi.fn(),
  revokeSessionsAt: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(async () => "scrypt$decoy"),
  getSessionSecret: vi.fn(async () => "unit-test-secret-which-is-long-enough-0123456789"),
  logError: vi.fn(),
}));

vi.mock("@/lib/admin/users-repo", () => ({ getAdminUser: mocks.getAdminUser, recordSignIn: mocks.recordSignIn }));
vi.mock("@/lib/admin/credentials-repo", () => ({
  getCredential: mocks.getCredential,
  revokeSessionsAt: mocks.revokeSessionsAt,
}));
vi.mock("@/lib/admin/password", () => ({ verifyPassword: mocks.verifyPassword, hashPassword: mocks.hashPassword }));
vi.mock("@/lib/admin/session-secret", () => ({ getSessionSecret: mocks.getSessionSecret }));
vi.mock("@/lib/logger", () => ({ logError: mocks.logError }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { AdminAuthError, resolveActorFromSessionCookie, revokeSessions, signInWithPassword } from "@/lib/admin/session";
import { signSessionToken } from "@/lib/admin/session-token";

const NOW = new Date("2026-11-08T09:00:00.000Z");
const EMAIL = "owner@bueno.example.com";
const SECRET = "unit-test-secret-which-is-long-enough-0123456789";

const activeUser = {
  email: EMAIL,
  role: "admin" as const,
  active: true,
  addedAt: "2026-09-01T09:00:00.000Z",
  addedBy: "cli:grant-admin",
  lastSignInAt: null,
};
const credential = { passwordHash: "scrypt$real", passwordUpdatedAt: "2026-09-01T09:00:00.000Z", sessionsRevokedAt: null };

beforeEach(() => {
  mocks.getAdminUser.mockReset().mockResolvedValue(activeUser);
  mocks.getCredential.mockReset().mockResolvedValue(credential);
  mocks.verifyPassword.mockReset().mockResolvedValue(true);
  mocks.recordSignIn.mockReset().mockResolvedValue(undefined);
  mocks.revokeSessionsAt.mockReset().mockResolvedValue(undefined);
  mocks.logError.mockReset();
});

describe("signInWithPassword", () => {
  it("records the sign-in time and returns a verifiable session", async () => {
    const result = await signInWithPassword({ email: "Owner@bueno.example.com", password: "pw" }, NOW);
    expect(result.actor).toEqual({ uid: EMAIL, email: EMAIL, role: "admin" });
    expect(mocks.verifyPassword).toHaveBeenCalledWith("pw", "scrypt$real");
    expect(mocks.recordSignIn).toHaveBeenCalledWith(EMAIL, NOW.toISOString());
    expect(mocks.logError).not.toHaveBeenCalled();
    await expect(resolveActorFromSessionCookie(result.cookie, NOW)).resolves.toEqual({ uid: EMAIL, email: EMAIL, role: "admin" });
  });

  it("still signs the person in when recording the sign-in time fails, and logs the failure", async () => {
    const writeFailure = new Error("EACCES: permission denied");
    mocks.recordSignIn.mockRejectedValue(writeFailure);
    const result = await signInWithPassword({ email: EMAIL, password: "pw" }, NOW);
    expect(result.actor.role).toBe("admin");
    expect(mocks.logError).toHaveBeenCalledWith("admin.session.record_sign_in", writeFailure);
  });

  it("refuses a wrong password", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    await expect(signInWithPassword({ email: EMAIL, password: "nope" }, NOW)).rejects.toEqual(new AdminAuthError("invalid_credentials"));
    expect(mocks.recordSignIn).not.toHaveBeenCalled();
  });

  it("still runs a password check for an unknown address, so timing gives nothing away", async () => {
    mocks.getCredential.mockResolvedValue(null);
    mocks.getAdminUser.mockResolvedValue(null);
    mocks.verifyPassword.mockResolvedValue(true);
    await expect(signInWithPassword({ email: "stranger@example.com", password: "pw" }, NOW)).rejects.toMatchObject({
      reason: "invalid_credentials",
    });
    expect(mocks.verifyPassword).toHaveBeenCalledWith("pw", "scrypt$decoy");
  });

  it("refuses someone who is no longer on the team, even with the right password", async () => {
    mocks.getAdminUser.mockResolvedValue({ ...activeUser, active: false });
    await expect(signInWithPassword({ email: EMAIL, password: "pw" }, NOW)).rejects.toMatchObject({ reason: "not_authorized" });
    mocks.getAdminUser.mockResolvedValue(null);
    await expect(signInWithPassword({ email: EMAIL, password: "pw" }, NOW)).rejects.toMatchObject({ reason: "not_authorized" });
  });

  it("gives every failure reason a message that never includes the inputs", () => {
    expect(new AdminAuthError("unauthenticated").message).toBe("Not signed in.");
    expect(new AdminAuthError("not_authorized").message).toBe("Not authorised for this back-office action.");
    expect(new AdminAuthError("invalid_credentials").message).toBe("Email or password is incorrect.");
  });
});

describe("resolveActorFromSessionCookie", () => {
  const issuedAt = NOW.getTime() - 60_000;
  const token = signSessionToken({ email: EMAIL, issuedAt, expiresAt: NOW.getTime() + 60_000 }, SECRET);

  it("treats missing, garbage or forged cookies as signed out", async () => {
    await expect(resolveActorFromSessionCookie(undefined, NOW)).resolves.toBe("unauthenticated");
    await expect(resolveActorFromSessionCookie("", NOW)).resolves.toBe("unauthenticated");
    await expect(resolveActorFromSessionCookie("garbage", NOW)).resolves.toBe("unauthenticated");
    await expect(resolveActorFromSessionCookie(`${token}x`, NOW)).resolves.toBe("unauthenticated");
    expect(mocks.getAdminUser).not.toHaveBeenCalled();
  });

  it("treats a session issued before a revocation as signed out", async () => {
    mocks.getCredential.mockResolvedValue({ ...credential, sessionsRevokedAt: issuedAt });
    await expect(resolveActorFromSessionCookie(token, NOW)).resolves.toBe("unauthenticated");
    mocks.getCredential.mockResolvedValue({ ...credential, sessionsRevokedAt: issuedAt - 1 });
    await expect(resolveActorFromSessionCookie(token, NOW)).resolves.toMatchObject({ email: EMAIL });
  });

  it("reports a removed or unknown person as not authorised", async () => {
    mocks.getAdminUser.mockResolvedValue({ ...activeUser, active: false });
    await expect(resolveActorFromSessionCookie(token, NOW)).resolves.toBe("not_authorized");
    mocks.getAdminUser.mockResolvedValue(null);
    mocks.getCredential.mockResolvedValue(null);
    await expect(resolveActorFromSessionCookie(token, NOW)).resolves.toBe("not_authorized");
  });
});

describe("revokeSessions", () => {
  it("marks every session issued up to now as revoked", async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ["Date"] });
    try {
      await revokeSessions(EMAIL);
    } finally {
      vi.useRealTimers();
    }
    expect(mocks.revokeSessionsAt).toHaveBeenCalledWith(EMAIL, 1_700_000_000_000);
  });
});
