import { describe, expect, it } from "vitest";
import { getCredential } from "@/lib/admin/credentials-repo";
import { grantAccess } from "@/lib/admin/grant-access";
import { verifyPassword } from "@/lib/admin/password";
import { getAdminUser, listAdminUsers } from "@/lib/admin/users-repo";
import { listAudit } from "@/lib/cms/audit";

const NOW = "2026-09-24T09:00:00.000Z";
const PASSWORD = "first-admin-password";

describe("grantAccess", () => {
  it("creates the first admin with a password, with an audit entry", async () => {
    expect(await grantAccess({ email: "Owner@bueno.example.com", role: "admin", password: PASSWORD }, NOW)).toEqual({
      ok: true,
      summary: "owner@bueno.example.com can now sign in as Admin. Password set.",
    });
    expect(await getAdminUser("owner@bueno.example.com")).toMatchObject({
      role: "admin",
      active: true,
      addedBy: "cli:grant-admin",
    });
    const credential = await getCredential("owner@bueno.example.com");
    expect(await verifyPassword(PASSWORD, credential?.passwordHash ?? "")).toBe(true);
    const [entry] = await listAudit({ limit: 5 });
    expect(entry).toMatchObject({
      action: "team.add",
      actor: { email: "cli:grant-admin" },
      summary: "owner@bueno.example.com given Admin access",
    });
  });

  it("refuses to create someone who would have no way to sign in", async () => {
    expect(await grantAccess({ email: "owner@bueno.example.com", role: "admin", password: null }, NOW)).toEqual({
      ok: false,
      message: "owner@bueno.example.com has no password yet. Pass --password so they can sign in.",
    });
    expect(await listAdminUsers()).toHaveLength(0);
  });

  it("refuses a weak password before touching the team", async () => {
    expect(await grantAccess({ email: "owner@bueno.example.com", role: "admin", password: "short" }, NOW)).toEqual({
      ok: false,
      message: "Password: Use at least 10 characters.",
    });
    expect(await listAdminUsers()).toHaveLength(0);
  });

  it("changes the role of someone who already has access, keeping their password", async () => {
    await grantAccess({ email: "owner@bueno.example.com", role: "admin", password: PASSWORD }, NOW);
    await grantAccess({ email: "editor@bueno.example.com", role: "editor", password: PASSWORD }, NOW);
    expect(await grantAccess({ email: "editor@bueno.example.com", role: "admin", password: null }, NOW)).toEqual({
      ok: true,
      summary: "editor@bueno.example.com now has Admin access.",
    });
    expect((await listAdminUsers()).map((user) => [user.email, user.role])).toEqual([
      ["editor@bueno.example.com", "admin"],
      ["owner@bueno.example.com", "admin"],
    ]);
    const credential = await getCredential("editor@bueno.example.com");
    expect(await verifyPassword(PASSWORD, credential?.passwordHash ?? "")).toBe(true);
  });

  it("replaces a password for someone who already has access", async () => {
    await grantAccess({ email: "owner@bueno.example.com", role: "admin", password: PASSWORD }, NOW);
    expect(await grantAccess({ email: "owner@bueno.example.com", role: "admin", password: "a-brand-new-password" }, NOW)).toEqual({
      ok: true,
      summary: "owner@bueno.example.com now has Admin access. Password set.",
    });
    const credential = await getCredential("owner@bueno.example.com");
    expect(await verifyPassword("a-brand-new-password", credential?.passwordHash ?? "")).toBe(true);
    expect(await verifyPassword(PASSWORD, credential?.passwordHash ?? "")).toBe(false);
  });

  it("will not demote the last active admin", async () => {
    await grantAccess({ email: "owner@bueno.example.com", role: "admin", password: PASSWORD }, NOW);
    expect(await grantAccess({ email: "owner@bueno.example.com", role: "viewer", password: null }, NOW)).toEqual({
      ok: false,
      message: "At least one active admin must remain.",
    });
  });
});
