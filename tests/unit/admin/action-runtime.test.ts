import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/session", () => {
  class AdminAuthError extends Error {
    constructor(readonly reason: "unauthenticated" | "not_authorized") {
      super(reason);
    }
  }
  return { requireAdminAction, AdminAuthError };
});

import { MESSAGES, succeed } from "@/lib/admin/action-result";
import { runAdminAction } from "@/lib/admin/action-runtime";
import { AdminAuthError } from "@/lib/admin/session";
import { EntityNotFoundError, VersionConflictError } from "@/lib/pricing/operations";

const actor = { uid: "u1", email: "editor@bueno.example.com", role: "editor" as const };

describe("runAdminAction", () => {
  beforeEach(() => {
    requireAdminAction.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("runs the handler for authorised users with the required permission", async () => {
    requireAdminAction.mockResolvedValue(actor);
    const result = await runAdminAction({ context: "t", permission: "catalog.write" }, async (who) => succeed(who.email, "ok"));
    expect(requireAdminAction).toHaveBeenCalledWith("catalog.write");
    expect(result).toEqual({ ok: true, data: "editor@bueno.example.com", message: "ok" });
  });

  it("maps expired sessions and missing permissions to sanitised copy", async () => {
    requireAdminAction.mockRejectedValueOnce(new AdminAuthError("unauthenticated"));
    expect(await runAdminAction({ context: "t", permission: "catalog.read" }, async () => succeed(null, "ok"))).toEqual({
      ok: false,
      kind: "auth",
      formError: MESSAGES.sessionExpired,
    });
    requireAdminAction.mockRejectedValueOnce(new AdminAuthError("not_authorized"));
    expect(await runAdminAction({ context: "t", permission: "team.manage" }, async () => succeed(null, "ok"))).toEqual({
      ok: false,
      kind: "auth",
      formError: MESSAGES.forbidden,
    });
  });

  it("maps conflicts, and hides unexpected errors behind generic copy", async () => {
    requireAdminAction.mockResolvedValue(actor);
    const conflict = await runAdminAction({ context: "t", permission: "catalog.write" }, async () => {
      throw new VersionConflictError("Package x");
    });
    expect(conflict).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
    const missing = await runAdminAction({ context: "t", permission: "catalog.write" }, async () => {
      throw new EntityNotFoundError("Season y");
    });
    expect(missing).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
    const unexpected = await runAdminAction({ context: "t", permission: "catalog.write" }, async () => {
      throw new Error("firestore: permission denied on projects/x/databases");
    });
    expect(unexpected).toEqual({ ok: false, kind: "error", formError: MESSAGES.generic });
  });

  it("treats unexpected auth failures as generic errors", async () => {
    requireAdminAction.mockRejectedValue(new Error("network"));
    expect(await runAdminAction({ context: "t", permission: "catalog.read" }, async () => succeed(null, "ok"))).toEqual({
      ok: false,
      kind: "error",
      formError: MESSAGES.generic,
    });
  });
});
