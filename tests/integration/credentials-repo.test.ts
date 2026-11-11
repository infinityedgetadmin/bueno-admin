import { describe, expect, it } from "vitest";
import { getCredential, revokeSessionsAt, setPassword } from "@/lib/admin/credentials-repo";
import { verifyPassword } from "@/lib/admin/password";

describe("credentials repository", () => {
  it("stores a hash, never the password, and normalises the email", async () => {
    await setPassword("Owner@bueno-test.example.com", "a-long-enough-password", "2026-11-08T10:00:00.000Z");
    const stored = await getCredential("owner@bueno-test.example.com");
    expect(stored).toMatchObject({ passwordUpdatedAt: "2026-11-08T10:00:00.000Z", sessionsRevokedAt: null });
    expect(stored?.passwordHash).not.toContain("a-long-enough-password");
    expect(await verifyPassword("a-long-enough-password", stored?.passwordHash ?? "")).toBe(true);
    expect(await getCredential("nobody@bueno-test.example.com")).toBeNull();
  });

  it("keeps the revocation mark when the password changes, and only ever moves it forward", async () => {
    await setPassword("owner@bueno-test.example.com", "first-password-here", "2026-11-08T10:00:00.000Z");
    await revokeSessionsAt("owner@bueno-test.example.com", 5_000);
    await revokeSessionsAt("owner@bueno-test.example.com", 4_000);
    expect((await getCredential("owner@bueno-test.example.com"))?.sessionsRevokedAt).toBe(5_000);
    await setPassword("owner@bueno-test.example.com", "second-password-here", "2026-11-08T11:00:00.000Z");
    expect((await getCredential("owner@bueno-test.example.com"))?.sessionsRevokedAt).toBe(5_000);
  });

  it("does nothing when revoking sessions for someone with no credentials", async () => {
    await revokeSessionsAt("nobody@bueno-test.example.com", 1_000);
    expect(await getCredential("nobody@bueno-test.example.com")).toBeNull();
  });
});
