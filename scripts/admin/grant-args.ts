import { parseArgs } from "node:util";
import { isValidEmail, normalizeEmail } from "@/lib/admin/team-rules";
import type { AdminRole } from "@/lib/admin/types";

export const GRANT_USAGE =
  "Usage: npm run admin:grant -- --email <email> [--role admin|editor|viewer] [--password <password>]";

export interface GrantOptions {
  email: string;
  role: AdminRole;
  password: string | null;
}

export type GrantArgsResult = { ok: true; options: GrantOptions } | { ok: false; message: string };

const ROLES: readonly AdminRole[] = ["admin", "editor", "viewer"];

function isRole(value: string): value is AdminRole {
  return (ROLES as readonly string[]).includes(value);
}

export function parseGrantArgs(argv: readonly string[]): GrantArgsResult {
  let values: Partial<Record<"email" | "role" | "password", string>>;
  try {
    values = parseArgs({
      args: [...argv],
      options: { email: { type: "string" }, role: { type: "string" }, password: { type: "string" } },
      allowPositionals: false,
    }).values;
  } catch {
    return { ok: false, message: "Unrecognised arguments." };
  }
  const email = normalizeEmail(values.email ?? "");
  if (!isValidEmail(email)) return { ok: false, message: "Pass the person's email with --email." };
  const role = values.role ?? "admin";
  if (!isRole(role)) return { ok: false, message: "--role must be admin, editor or viewer." };
  if (values.password !== undefined && values.password.length === 0) {
    return { ok: false, message: "--password can't be empty." };
  }
  return { ok: true, options: { email, role, password: values.password ?? null } };
}
