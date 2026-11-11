import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminActor } from "@/lib/admin/types";
import type { FieldErrors } from "@/lib/pricing/types";

const requireAdminAction = vi.hoisted(() => vi.fn());
const applyTeamChange = vi.hoisted(() => vi.fn<() => Promise<FieldErrors>>());
const setPassword = vi.hoisted(() => vi.fn<() => Promise<void>>());
const revokeSessionsAt = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("@/lib/admin/session", () => {
  class AdminAuthError extends Error {
    constructor(readonly reason: "unauthenticated" | "not_authorized") {
      super(reason);
    }
  }
  return { requireAdminAction, AdminAuthError };
});
vi.mock("@/lib/admin/users-repo", () => ({ applyTeamChange }));
vi.mock("@/lib/admin/credentials-repo", () => ({ setPassword, revokeSessionsAt }));

import { MESSAGES } from "@/lib/admin/action-result";
import { addTeamMemberAction, updateTeamMemberAction } from "@/lib/admin/actions/team";
import { AdminAuthError } from "@/lib/admin/session";

const actor: AdminActor = { uid: "owner@bueno.example.com", email: "owner@bueno.example.com", role: "admin" };
const PASSWORD = "temporary-password-1";

describe("addTeamMemberAction", () => {
  beforeEach(() => {
    requireAdminAction.mockReset().mockResolvedValue(actor);
    applyTeamChange.mockReset().mockResolvedValue({});
    setPassword.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires team.manage and refuses an editor/viewer without touching the store", async () => {
    requireAdminAction.mockRejectedValue(new AdminAuthError("not_authorized"));
    expect(await addTeamMemberAction({ email: "new@bueno.example.com", role: "viewer", password: PASSWORD })).toEqual({
      ok: false,
      kind: "auth",
      formError: MESSAGES.forbidden,
    });
    expect(requireAdminAction).toHaveBeenCalledWith("team.manage");
    expect(applyTeamChange).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload before calling applyTeamChange", async () => {
    expect(await addTeamMemberAction({ email: "new@bueno.example.com", role: "owner", password: PASSWORD } as never)).toEqual({
      ok: false,
      kind: "validation",
      fieldErrors: {},
      formError: MESSAGES.invalidRequest,
    });
    expect(await addTeamMemberAction({ email: "new@bueno.example.com", role: "viewer" } as never)).toMatchObject({
      ok: false,
      kind: "validation",
    });
    expect(applyTeamChange).not.toHaveBeenCalled();
  });

  it("rejects a weak temporary password with a field error, before touching the team", async () => {
    expect(await addTeamMemberAction({ email: "new@bueno.example.com", role: "viewer", password: "short" })).toEqual({
      ok: false,
      kind: "validation",
      fieldErrors: { password: "Use at least 10 characters." },
      formError: MESSAGES.fixFields,
    });
    expect(applyTeamChange).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("returns a field error from applyTeamChange with the generic fix-fields message, and sets no password", async () => {
    applyTeamChange.mockResolvedValue({ email: "This person already has access." });
    expect(await addTeamMemberAction({ email: "editor@bueno.example.com", role: "viewer", password: PASSWORD })).toEqual({
      ok: false,
      kind: "validation",
      fieldErrors: { email: "This person already has access." },
      formError: MESSAGES.fixFields,
    });
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("returns a form-level error from applyTeamChange verbatim", async () => {
    applyTeamChange.mockResolvedValue({ form: "At least one active admin must remain." });
    expect(await addTeamMemberAction({ email: "editor@bueno.example.com", role: "viewer", password: PASSWORD })).toEqual({
      ok: false,
      kind: "validation",
      fieldErrors: { form: "At least one active admin must remain." },
      formError: "At least one active admin must remain.",
    });
  });

  it("succeeds with the normalised email, sets the password and names the role in the message", async () => {
    const result = await addTeamMemberAction({ email: "New@bueno.example.com", role: "viewer", password: PASSWORD });
    expect(result).toEqual({ ok: true, data: null, message: "new@bueno.example.com can now sign in as Viewer." });
    expect(applyTeamChange).toHaveBeenCalledWith({
      actor,
      change: { kind: "add", email: "new@bueno.example.com", role: "viewer" },
      now: expect.any(String),
    });
    expect(setPassword).toHaveBeenCalledWith("new@bueno.example.com", PASSWORD, expect.any(String));
  });
});

describe("updateTeamMemberAction", () => {
  beforeEach(() => {
    requireAdminAction.mockReset().mockResolvedValue(actor);
    applyTeamChange.mockReset().mockResolvedValue({});
    revokeSessionsAt.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires team.manage and refuses an editor/viewer without touching applyTeamChange", async () => {
    requireAdminAction.mockRejectedValue(new AdminAuthError("not_authorized"));
    expect(await updateTeamMemberAction({ email: "editor@bueno.example.com", role: "admin", active: true })).toEqual({
      ok: false,
      kind: "auth",
      formError: MESSAGES.forbidden,
    });
    expect(requireAdminAction).toHaveBeenCalledWith("team.manage");
    expect(applyTeamChange).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload before calling applyTeamChange", async () => {
    expect(await updateTeamMemberAction({ email: "editor@bueno.example.com", role: "admin" } as never)).toEqual({
      ok: false,
      kind: "validation",
      fieldErrors: {},
      formError: MESSAGES.invalidRequest,
    });
    expect(applyTeamChange).not.toHaveBeenCalled();
  });

  it("returns a form-level error from applyTeamChange verbatim", async () => {
    applyTeamChange.mockResolvedValue({ form: "At least one active admin must remain." });
    expect(await updateTeamMemberAction({ email: "owner@bueno.example.com", role: "editor", active: true })).toEqual({
      ok: false,
      kind: "validation",
      fieldErrors: { form: "At least one active admin must remain." },
      formError: "At least one active admin must remain.",
    });
  });

  it("returns 'Access updated for …' with the normalised email when the member stays active", async () => {
    const result = await updateTeamMemberAction({ email: "Editor@bueno.example.com", role: "admin", active: true });
    expect(result).toEqual({ ok: true, data: null, message: "Access updated for editor@bueno.example.com." });
    expect(applyTeamChange).toHaveBeenCalledWith({
      actor,
      change: { kind: "update", email: "editor@bueno.example.com", role: "admin", active: true },
      now: expect.any(String),
    });
    expect(revokeSessionsAt).not.toHaveBeenCalled();
  });

  it("returns '… can no longer sign in.' when access is removed", async () => {
    const result = await updateTeamMemberAction({ email: "editor@bueno.example.com", role: "editor", active: false });
    expect(result).toEqual({ ok: true, data: null, message: "editor@bueno.example.com can no longer sign in." });
    expect(applyTeamChange).toHaveBeenCalledWith({
      actor,
      change: { kind: "update", email: "editor@bueno.example.com", role: "editor", active: false },
      now: expect.any(String),
    });
    expect(revokeSessionsAt).toHaveBeenCalledWith("editor@bueno.example.com", expect.any(Number));
  });
});

describe("updateTeamMemberAction and sessions", () => {
  beforeEach(() => {
    requireAdminAction.mockReset().mockResolvedValue(actor);
    revokeSessionsAt.mockReset().mockResolvedValue(undefined);
  });

  it("does not end anyone's sessions when the change was refused", async () => {
    applyTeamChange.mockReset().mockResolvedValue({ form: "At least one active admin must remain." });
    await updateTeamMemberAction({ email: "owner@bueno.example.com", role: "admin", active: false });
    expect(revokeSessionsAt).not.toHaveBeenCalled();
  });
});
