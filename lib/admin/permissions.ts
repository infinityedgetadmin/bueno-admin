import type { AdminRole } from "./types";

export type Permission = "catalog.read" | "catalog.write" | "team.manage";

export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly Permission[]>> = {
  admin: ["catalog.read", "catalog.write", "team.manage"],
  editor: ["catalog.read", "catalog.write"],
  viewer: ["catalog.read"],
};

export const ROLE_LABELS: Readonly<Record<AdminRole, string>> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

export const ROLE_DESCRIPTIONS: Readonly<Record<AdminRole, string>> = {
  admin: "Everything, including who has access",
  editor: "Prices, seasons, promotions, currency and what the website shows",
  viewer: "Can see everything but can't change anything",
};

export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
