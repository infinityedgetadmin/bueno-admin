import "server-only";
import { getCredential, setPassword } from "./credentials-repo";
import { passwordProblem } from "./password";
import { ROLE_LABELS } from "./permissions";
import { normalizeEmail } from "./team-rules";
import type { AdminActor, AdminRole } from "./types";
import { CLI_ACTOR_UID, applyTeamChange, getAdminUser, type TeamChange } from "./users-repo";

/** Who the activity log shows for changes made from the command line. */
const CLI_ACTOR: AdminActor = { uid: CLI_ACTOR_UID, email: "cli:grant-admin", role: "admin" };

export interface GrantRequest {
  email: string;
  role: AdminRole;
  /** Sets or replaces the person's password; required for someone who has none yet. */
  password: string | null;
}

export type GrantOutcome = { ok: true; summary: string } | { ok: false; message: string };

/** Gives someone back-office access or changes their role. Creates the first admin in a new install. */
export async function grantAccess(request: GrantRequest, now: string): Promise<GrantOutcome> {
  const email = normalizeEmail(request.email);
  if (request.password !== null) {
    const problem = passwordProblem(request.password);
    if (problem !== null) return { ok: false, message: `Password: ${problem}` };
  }
  const [existing, credential] = await Promise.all([getAdminUser(email), getCredential(email)]);
  if (request.password === null && credential === null) {
    return { ok: false, message: `${email} has no password yet. Pass --password so they can sign in.` };
  }
  const hasAccess = existing !== null && existing.active;
  const change: TeamChange = hasAccess
    ? { kind: "update", email, role: request.role, active: true }
    : { kind: "add", email, role: request.role };
  const errors = await applyTeamChange({ actor: CLI_ACTOR, change, now });
  const message = Object.values(errors).find((value) => value !== undefined);
  if (message !== undefined) return { ok: false, message };
  if (request.password !== null) await setPassword(email, request.password, now);
  const label = ROLE_LABELS[request.role];
  const base = hasAccess ? `${email} now has ${label} access.` : `${email} can now sign in as ${label}.`;
  return { ok: true, summary: request.password === null ? base : `${base} Password set.` };
}
