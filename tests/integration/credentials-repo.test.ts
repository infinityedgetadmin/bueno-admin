import { describe, expect, it } from "vitest";
import { getCredential, revokeSessionsAt, setPassword } from "@/lib/admin/credentials-repo";
import { verifyPassword } from "@/lib/admin/password";

describe("credentials repository", () => {
  it("stores a hash, never the password, and normalises the email", async () => {
    await setPassword("Owner@bueno-test.example.com", "a-long-enough-password", "2026-11-08T10:00:00.000Z");
    const stored = await getCredential("owner@bueno-test.example.com");
    expect(stored).toMatchObject({
      passwordUpdatedAt: "2026-11-08T10:00:00.000Z",
      sessionsRevokedAt: Date.parse("2026-11-08T10:00:00.000Z"),
    });
    expect(stored?.passwordHash).not.toContain("a-long-enough-password");
    expect(await verifyPassword("a-long-enough-password", stored?.passwordHash ?? "")).toBe(true);
    expect(await getCredential("nobody@bueno-test.example.com")).toBeNull();
  });

  it("ends earlier sessions when the password changes, and only ever moves the mark forward", async () => {
    const first = Date.parse("2026-11-08T10:00:00.000Z");
    const second = Date.parse("2026-11-08T11:00:00.000Z");
    await setPassword("owner@bueno-test.example.com", "first-password-here", "2026-11-08T10:00:00.000Z");
    await revokeSessionsAt("owner@bueno-test.example.com", first - 5_000);
    expect((await getCredential("owner@bueno-test.example.com"))?.sessionsRevokedAt).toBe(first);
    await revokeSessionsAt("owner@bueno-test.example.com", second + 5_000);
    await setPassword("owner@bueno-test.example.com", "second-password-here", "2026-11-08T11:00:00.000Z");
    expect((await getCredential("owner@bueno-test.example.com"))?.sessionsRevokedAt).toBe(second + 5_000);
  });

  it("falls back to the current time when given an unparseable timestamp", async () => {
    const before = Date.now();
    await setPassword("owner@bueno-test.example.com", "first-password-here", "not a date");
    expect((await getCredential("owner@bueno-test.example.com"))?.sessionsRevokedAt).toBeGreaterThanOrEqual(before);
  });

  it("does nothing when revoking sessions for someone with no credentials", async () => {
    await revokeSessionsAt("nobody@bueno-test.example.com", 1_000);
    expect(await getCredential("nobody@bueno-test.example.com")).toBeNull();
  });
});
