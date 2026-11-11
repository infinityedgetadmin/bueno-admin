import type { FieldErrors } from "@/lib/pricing/types";
import type { AdminRole, AdminUserRecord } from "./types";

// Excludes "/" and "\" so a stored email can never be misread as a file path or URL segment.
const EMAIL_PATTERN = /^[^\s@/\\]+@[^\s@/\\]+\.[^\s@/\\]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function validateTeamAddition(params: { email: string; members: readonly AdminUserRecord[] }): FieldErrors {
  const email = normalizeEmail(params.email);
  if (!isValidEmail(email)) return { email: "Enter a valid email address." };
  if (params.members.some((member) => member.email === email && member.active)) {
    return { email: "This person already has access." };
  }
  return {};
}

export function validateTeamUpdate(params: {
  actorEmail: string;
  email: string;
  role: AdminRole;
  active: boolean;
  members: readonly AdminUserRecord[];
}): FieldErrors {
  const email = normalizeEmail(params.email);
  const target = params.members.find((member) => member.email === email);
  if (target === undefined) return { form: "That team member no longer exists." };
  if (email === normalizeEmail(params.actorEmail) && (params.role !== target.role || params.active !== target.active)) {
    return { form: "You can't change your own access. Ask another admin." };
  }
  const otherActiveAdmins = params.members.filter(
    (member) => member.email !== email && member.active && member.role === "admin",
  ).length;
  const remainsAdmin = params.active && params.role === "admin";
  if (otherActiveAdmins === 0 && !remainsAdmin) return { form: "At least one active admin must remain." };
  return {};
}
