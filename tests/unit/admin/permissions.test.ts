import { describe, expect, it } from "vitest";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can } from "@/lib/admin/permissions";

describe("permissions", () => {
  it("gives admins everything", () => {
    expect(can("admin", "catalog.read")).toBe(true);
    expect(can("admin", "catalog.write")).toBe(true);
    expect(can("admin", "team.manage")).toBe(true);
  });

  it("lets editors change the catalog but not the team", () => {
    expect(can("editor", "catalog.read")).toBe(true);
    expect(can("editor", "catalog.write")).toBe(true);
    expect(can("editor", "team.manage")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(can("viewer", "catalog.read")).toBe(true);
    expect(can("viewer", "catalog.write")).toBe(false);
    expect(can("viewer", "team.manage")).toBe(false);
  });

  it("labels and describes every role", () => {
    expect(ROLE_LABELS).toEqual({ admin: "Admin", editor: "Editor", viewer: "Viewer" });
    expect(Object.keys(ROLE_DESCRIPTIONS)).toEqual(["admin", "editor", "viewer"]);
  });
});
