"use server";

import { teamAddSchema, teamUpdateSchema, type TeamAddInput, type TeamUpdateInput } from "@/lib/pricing/schemas";
import { MESSAGES, invalid, succeed, type ActionResult } from "../action-result";
import { runAdminAction } from "../action-runtime";
import { revokeSessionsAt, setPassword } from "../credentials-repo";
import { passwordProblem } from "../password";
import { ROLE_LABELS } from "../permissions";
import { normalizeEmail } from "../team-rules";
import { applyTeamChange } from "../users-repo";

export async function addTeamMemberAction(input: TeamAddInput): Promise<ActionResult<null>> {
  return runAdminAction({ context: "admin.team.add", permission: "team.manage" }, async (actor) => {
    const parsed = teamAddSchema.safeParse(input);
    if (!parsed.success) return invalid({}, MESSAGES.invalidRequest);
    const problem = passwordProblem(parsed.data.password);
    if (problem !== null) return invalid({ password: problem }, MESSAGES.fixFields);
    const email = normalizeEmail(parsed.data.email);
    const now = new Date().toISOString();
    const errors = await applyTeamChange({ actor, change: { kind: "add", email, role: parsed.data.role }, now });
    if (Object.keys(errors).length > 0) return invalid(errors, errors.form ?? MESSAGES.fixFields);
    await setPassword(email, parsed.data.password, now);
    return succeed(null, `${email} can now sign in as ${ROLE_LABELS[parsed.data.role]}.`);
  });
}

export async function updateTeamMemberAction(input: TeamUpdateInput): Promise<ActionResult<null>> {
  return runAdminAction({ context: "admin.team.update", permission: "team.manage" }, async (actor) => {
    const parsed = teamUpdateSchema.safeParse(input);
    if (!parsed.success) return invalid({}, MESSAGES.invalidRequest);
    const email = normalizeEmail(parsed.data.email);
    const errors = await applyTeamChange({
      actor,
      change: { kind: "update", email, role: parsed.data.role, active: parsed.data.active },
      now: new Date().toISOString(),
    });
    if (Object.keys(errors).length > 0) return invalid(errors, errors.form ?? MESSAGES.fixFields);
    // Removing access also ends the person's sessions, so an old cookie cannot come back to life
    // if they are given access again later.
    if (!parsed.data.active) await revokeSessionsAt(email, Date.now());
    return succeed(null, parsed.data.active ? `Access updated for ${email}.` : `${email} can no longer sign in.`);
  });
}
