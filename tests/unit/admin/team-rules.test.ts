import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  normalizeEmail,
  validateTeamAddition,
  validateTeamUpdate,
} from "@/lib/admin/team-rules";
import type { AdminUserRecord } from "@/lib/admin/types";

function member(email: string, role: AdminUserRecord["role"], active = true): AdminUserRecord {
  return { email, role, active, addedAt: "2026-09-01T00:00:00.000Z", addedBy: "cli", lastSignInAt: null };
}

const admin = member("owner@bueno.example.com", "admin");
const editor = member("editor@bueno.example.com", "editor");
const former = member("former@bueno.example.com", "viewer", false);

describe("emails", () => {
  it("normalises and validates addresses", () => {
    expect(normalizeEmail("  Owner@bueno.example.com ")).toBe("owner@bueno.example.com");
    expect(isValidEmail("a@bco.example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@bco.example.com`)).toBe(false);
    // Neither the local part nor the domain may contain "/" or "\" — an email is used verbatim
    // as a Firestore document id (path segment), so either character would be misread as a path.
    expect(isValidEmail("a/b@cco.example.com")).toBe(false);
    expect(isValidEmail("a\\b@cco.example.com")).toBe(false);
  });
});

describe("validateTeamAddition", () => {
  it("accepts new and previously removed people", () => {
    expect(validateTeamAddition({ email: "new@bueno.example.com", members: [admin] })).toEqual({});
    expect(validateTeamAddition({ email: "FORMER@bueno.example.com", members: [admin, former] })).toEqual({});
  });

  it("rejects invalid or duplicate addresses", () => {
    expect(validateTeamAddition({ email: "nope", members: [] })).toEqual({ email: "Enter a valid email address." });
    expect(validateTeamAddition({ email: "Editor@bueno.example.com", members: [admin, editor] })).toEqual({
      email: "This person already has access.",
    });
  });
});

describe("validateTeamUpdate", () => {
  const members = [admin, editor];

  it("allows admins to change other people", () => {
    expect(validateTeamUpdate({ actorEmail: admin.email, email: editor.email, role: "admin", active: true, members })).toEqual({});
    expect(validateTeamUpdate({ actorEmail: admin.email, email: editor.email, role: "viewer", active: false, members })).toEqual({});
  });

  it("rejects unknown members", () => {
    expect(validateTeamUpdate({ actorEmail: admin.email, email: "ghost@x.example.com", role: "editor", active: true, members })).toEqual({
      form: "That team member no longer exists.",
    });
  });

  it("stops people changing their own access", () => {
    expect(validateTeamUpdate({ actorEmail: admin.email, email: admin.email, role: "editor", active: true, members })).toEqual({
      form: "You can't change your own access. Ask another admin.",
    });
    expect(validateTeamUpdate({ actorEmail: admin.email, email: admin.email, role: "admin", active: false, members })).toEqual({
      form: "You can't change your own access. Ask another admin.",
    });
    expect(validateTeamUpdate({ actorEmail: admin.email, email: admin.email, role: "admin", active: true, members })).toEqual({});
  });

  it("stops a removed person reactivating themselves even with no role change", () => {
    // Same role as before, only `active` flips false → true: the old check (`!params.active`)
    // missed this direction entirely, since it only ever blocked a self *deactivation*.
    const inactiveSelf = member("owner@bueno.example.com", "admin", false);
    const membersWithInactiveSelf = [inactiveSelf, editor];
    expect(
      validateTeamUpdate({
        actorEmail: inactiveSelf.email,
        email: inactiveSelf.email,
        role: "admin",
        active: true,
        members: membersWithInactiveSelf,
      }),
    ).toEqual({ form: "You can't change your own access. Ask another admin." });
  });

  it("allows demoting an admin while another active admin remains", () => {
    const twoAdmins = [admin, member("second@bueno.example.com", "admin")];
    expect(
      validateTeamUpdate({ actorEmail: admin.email, email: "second@bueno.example.com", role: "editor", active: true, members: twoAdmins }),
    ).toEqual({});
  });

  it("refuses to leave the team without an active admin", () => {
    // Only reachable with inconsistent data (e.g. the acting admin was removed concurrently).
    const boss = member("boss@bueno.example.com", "admin");
    const me = member("me@bueno.example.com", "admin", false);
    expect(validateTeamUpdate({ actorEmail: me.email, email: boss.email, role: "admin", active: false, members: [boss, me] })).toEqual({
      form: "At least one active admin must remain.",
    });
    expect(validateTeamUpdate({ actorEmail: me.email, email: boss.email, role: "viewer", active: true, members: [boss, me] })).toEqual({
      form: "At least one active admin must remain.",
    });
  });
});
