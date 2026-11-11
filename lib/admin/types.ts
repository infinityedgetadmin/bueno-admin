/** Admin domain types. Pure declarations — no runtime code. */

export type AdminRole = "admin" | "editor" | "viewer";

export interface AdminUserRecord {
  email: string;
  role: AdminRole;
  active: boolean;
  addedAt: string;
  addedBy: string;
  lastSignInAt: string | null;
}

export interface AdminActor {
  uid: string;
  email: string;
  role: AdminRole;
}
