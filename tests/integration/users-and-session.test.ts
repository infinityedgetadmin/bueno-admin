import { describe, expect, it, vi } from "vitest";
import { getCredential } from "@/lib/admin/credentials-repo";
import { AdminAuthError, resolveActorFromSessionCookie, revokeSessions, signInWithPassword } from "@/lib/admin/session";
import { CLI_ACTOR_UID, applyTeamChange, getAdminUser, listAdminUsers } from "@/lib/admin/users-repo";
import { listAudit } from "@/lib/cms/audit";
import { STORE_FILES } from "@/lib/store/store-path";
import { resetStore, setSeedPassword, upsertMember, writeRawStoreFile } from "../support/store";

const PASSWORD = "correct-horse-battery";
const NOW = new Date("2026-11-08T10:00:00.000Z");

describe("password sign-in", () => {
  it("creates a session for an active team member and records the sign-in", async () => {
    await upsertMember({ email: "owner@bueno-test.example.com", role: "admin" });
    await setSeedPassword("owner@bueno-test.example.com", PASSWORD);
    const { cookie, actor } = await signInWithPassword({ email: "Owner@bueno-test.example.com", password: PASSWORD }, NOW);
    expect(actor).toEqual({ uid: "owner@bueno-test.example.com", email: "owner@bueno-test.example.com", role: "admin" });
    expect(cookie.length).toBeGreaterThan(20);
    expect((await getAdminUser("owner@bueno-test.example.com"))?.lastSignInAt).toBe(NOW.toISOString());
    await expect(resolveActorFromSessionCookie(cookie, NOW)).resolves.toMatchObject({
      email: "owner@bueno-test.example.com",
      role: "admin",
    });
  });

  it("refuses unknown addresses and wrong passwords the same way", async () => {
    await upsertMember({ email: "owner@bueno-test.example.com", role: "admin" });
    await setSeedPassword("owner@bueno-test.example.com", PASSWORD);
    await expect(signInWithPassword({ email: "stranger@example.example.com", password: PASSWORD }, NOW)).rejects.toMatchObject({
      reason: "invalid_credentials",
    });
    await expect(signInWithPassword({ email: "owner@bueno-test.example.com", password: "wrong-password-1" }, NOW)).rejects.toMatchObject({
      reason: "invalid_credentials",
    });
    expect((await getAdminUser("owner@bueno-test.example.com"))?.lastSignInAt).toBeNull();
  });

  it("refuses someone whose access was removed, even with the right password", async () => {
    await upsertMember({ email: "former@bueno-test.example.com", active: false });
    await setSeedPassword("former@bueno-test.example.com", PASSWORD);
    const attempt = signInWithPassword({ email: "former@bueno-test.example.com", password: PASSWORD }, NOW);
    await expect(attempt).rejects.toBeInstanceOf(AdminAuthError);
    await expect(attempt).rejects.toMatchObject({ reason: "not_authorized" });
  });

  it("refuses a password with no matching team record", async () => {
    await setSeedPassword("ghost@bueno-test.example.com", PASSWORD);
    await expect(signInWithPassword({ email: "ghost@bueno-test.example.com", password: PASSWORD }, NOW)).rejects.toMatchObject({
      reason: "not_authorized",
    });
  });

  it("re-checks the team list on every request, including role changes", async () => {
    await upsertMember({ email: "editor@bueno-test.example.com", role: "editor" });
    await setSeedPassword("editor@bueno-test.example.com", PASSWORD);
    const { cookie } = await signInWithPassword({ email: "editor@bueno-test.example.com", password: PASSWORD }, NOW);
    await upsertMember({ email: "editor@bueno-test.example.com", role: "viewer" });
    await expect(resolveActorFromSessionCookie(cookie, NOW)).resolves.toMatchObject({ role: "viewer" });
    await upsertMember({ email: "editor@bueno-test.example.com", role: "viewer", active: false });
    await expect(resolveActorFromSessionCookie(cookie, NOW)).resolves.toBe("not_authorized");
  });

  it("treats missing, garbage, expired and forged cookies as signed out", async () => {
    await upsertMember({ email: "owner@bueno-test.example.com" });
    await setSeedPassword("owner@bueno-test.example.com", PASSWORD);
    const { cookie } = await signInWithPassword({ email: "owner@bueno-test.example.com", password: PASSWORD }, NOW);
    await expect(resolveActorFromSessionCookie(undefined, NOW)).resolves.toBe("unauthenticated");
    await expect(resolveActorFromSessionCookie("", NOW)).resolves.toBe("unauthenticated");
    await expect(resolveActorFromSessionCookie("garbage", NOW)).resolves.toBe("unauthenticated");
    await expect(resolveActorFromSessionCookie(`${cookie}x`, NOW)).resolves.toBe("unauthenticated");
    const sixDaysLater = new Date(NOW.getTime() + 6 * 24 * 60 * 60 * 1000);
    await expect(resolveActorFromSessionCookie(cookie, sixDaysLater)).resolves.toBe("unauthenticated");
  });

  it("revokes active sessions immediately, and lets a later sign-in through", async () => {
    await upsertMember({ email: "owner@bueno-test.example.com", role: "admin" });
    await setSeedPassword("owner@bueno-test.example.com", PASSWORD);
    const { cookie, actor } = await signInWithPassword({ email: "owner@bueno-test.example.com", password: PASSWORD }, NOW);
    await expect(resolveActorFromSessionCookie(cookie, NOW)).resolves.toMatchObject({ email: "owner@bueno-test.example.com" });

    const revokedAt = Date.now();
    vi.useFakeTimers({ now: revokedAt, toFake: ["Date"] });
    try {
      await revokeSessions(actor.uid);
    } finally {
      vi.useRealTimers();
    }
    expect((await getCredential("owner@bueno-test.example.com"))?.sessionsRevokedAt).toBe(revokedAt);
    await expect(resolveActorFromSessionCookie(cookie, new Date(revokedAt))).resolves.toBe("unauthenticated");

    const later = new Date(revokedAt + 1000);
    const fresh = await signInWithPassword({ email: "owner@bueno-test.example.com", password: PASSWORD }, later);
    await expect(resolveActorFromSessionCookie(fresh.cookie, later)).resolves.toMatchObject({ role: "admin" });
  });

  it("ignores malformed team and credential records instead of failing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await writeRawStoreFile(STORE_FILES.team, [{ email: "broken@bueno-test.example.com" }, { nonsense: true }]);
      await writeRawStoreFile(STORE_FILES.credentials, { "broken@bueno-test.example.com": { passwordHash: 42 } });
      await upsertMember({ email: "owner@bueno-test.example.com" });
      expect((await listAdminUsers()).map((member) => member.email)).toEqual(["owner@bueno-test.example.com"]);
      expect(await getCredential("broken@bueno-test.example.com")).toBeNull();
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("team changes", () => {
  const actor = { uid: "owner@bueno-test.example.com", email: "owner@bueno-test.example.com", role: "admin" as const };

  it("adds, updates and audits team members", async () => {
    await upsertMember({ email: "owner@bueno-test.example.com", role: "admin" });
    expect(
      await applyTeamChange({ actor, change: { kind: "add", email: "New@bueno-test.example.com", role: "editor" }, now: "2026-09-24T10:00:00.000Z" }),
    ).toEqual({});
    expect(await getAdminUser("new@bueno-test.example.com")).toMatchObject({ role: "editor", active: true, addedBy: actor.email });

    expect(
      await applyTeamChange({
        actor,
        change: { kind: "update", email: "new@bueno-test.example.com", role: "admin", active: true },
        now: "2026-09-24T10:01:00.000Z",
      }),
    ).toEqual({});
    expect(
      await applyTeamChange({
        actor,
        change: { kind: "update", email: "new@bueno-test.example.com", role: "admin", active: false },
        now: "2026-09-24T10:02:00.000Z",
      }),
    ).toEqual({});
    expect((await listAdminUsers()).map((m) => [m.email, m.role, m.active])).toEqual([
      ["new@bueno-test.example.com", "admin", false],
      ["owner@bueno-test.example.com", "admin", true],
    ]);
    expect((await listAudit({ limit: 10 })).map((entry) => entry.summary)).toEqual([
      "new@bueno-test.example.com: access removed",
      "new@bueno-test.example.com: role Editor → Admin",
      "new@bueno-test.example.com given Editor access",
    ]);
  });

  it("returns validation errors without writing", async () => {
    await upsertMember({ email: "owner@bueno-test.example.com", role: "admin" });
    expect(await applyTeamChange({ actor, change: { kind: "add", email: "owner@bueno-test.example.com", role: "editor" }, now: "2026-09-24T10:00:00.000Z" })).toEqual({
      email: "This person already has access.",
    });
    expect(
      await applyTeamChange({ actor, change: { kind: "update", email: "owner@bueno-test.example.com", role: "editor", active: true }, now: "2026-09-24T10:00:00.000Z" }),
    ).toEqual({ form: "You can't change your own access. Ask another admin." });
    expect(
      await applyTeamChange({ actor, change: { kind: "update", email: "ghost@bueno-test.example.com", role: "editor", active: true }, now: "2026-09-24T10:00:00.000Z" }),
    ).toEqual({ form: "That team member no longer exists." });
    expect(await listAudit({ limit: 10 })).toHaveLength(0);
  });

  it("restores access for a previously removed person", async () => {
    await upsertMember({ email: "owner@bueno-test.example.com", role: "admin" });
    await upsertMember({ email: "back@bueno-test.example.com", role: "viewer", active: false, addedAt: "2026-01-01T00:00:00.000Z" });
    expect(
      await applyTeamChange({ actor, change: { kind: "add", email: "back@bueno-test.example.com", role: "viewer" }, now: "2026-09-24T10:00:00.000Z" }),
    ).toEqual({});
    expect(await getAdminUser("back@bueno-test.example.com")).toMatchObject({ active: true, role: "viewer", addedAt: "2026-09-24T10:00:00.000Z" });
    expect((await listAudit({ limit: 1 }))[0]?.summary).toBe("back@bueno-test.example.com given Viewer access");
  });

  it("blocks any actor who is not currently an active team manager, and writes nothing", async () => {
    await upsertMember({ email: "owner@bueno-test.example.com", role: "admin", active: false });
    const staleActor = { uid: "owner@bueno-test.example.com", email: "owner@bueno-test.example.com", role: "admin" as const };

    expect(
      await applyTeamChange({
        actor: staleActor,
        change: { kind: "update", email: "owner@bueno-test.example.com", role: "admin", active: true },
        now: "2026-09-24T10:00:00.000Z",
      }),
    ).toEqual({ form: "You no longer have permission to manage the team." });
    expect(
      await applyTeamChange({
        actor: staleActor,
        change: { kind: "add", email: "owner@bueno-test.example.com", role: "admin" },
        now: "2026-09-24T10:00:00.000Z",
      }),
    ).toEqual({ form: "You no longer have permission to manage the team." });
    expect(await getAdminUser("owner@bueno-test.example.com")).toMatchObject({ active: false });

    await upsertMember({ email: "assistant@bueno-test.example.com", role: "editor", active: true });
    const staleEditor = { uid: "assistant@bueno-test.example.com", email: "assistant@bueno-test.example.com", role: "editor" as const };
    expect(
      await applyTeamChange({
        actor: staleEditor,
        change: { kind: "add", email: "new-guy@bueno-test.example.com", role: "viewer" },
        now: "2026-09-24T10:00:00.000Z",
      }),
    ).toEqual({ form: "You no longer have permission to manage the team." });

    expect(await listAudit({ limit: 10 })).toHaveLength(0);
  });

  it("lets the CLI bootstrap actor add the first admin to an empty team", async () => {
    await resetStore();
    const cliActor = { uid: CLI_ACTOR_UID, email: "cli:grant-admin", role: "admin" as const };
    expect(await listAdminUsers()).toHaveLength(0);
    expect(
      await applyTeamChange({
        actor: cliActor,
        change: { kind: "add", email: "first@bueno-test.example.com", role: "admin" },
        now: "2026-09-24T10:00:00.000Z",
      }),
    ).toEqual({});
    expect(await getAdminUser("first@bueno-test.example.com")).toMatchObject({
      role: "admin",
      active: true,
      addedBy: "cli:grant-admin",
    });
    expect((await listAudit({ limit: 1 }))[0]?.summary).toBe("first@bueno-test.example.com given Admin access");
  });
});
