import "server-only";
import { appendAuditEntries, buildAuditRecord, newAuditEntry } from "@/lib/cms/audit";
import { logError } from "@/lib/logger";
import type { AuditDraft } from "@/lib/pricing/operations";
import { adminUserSchema } from "@/lib/pricing/schemas";
import type { FieldErrors } from "@/lib/pricing/types";
import { STORE_FILES, readStoreFile, withStoreLock, writeStoreFile } from "@/lib/store/json-store";
import { ROLE_LABELS, can } from "./permissions";
import { normalizeEmail, validateTeamAddition, validateTeamUpdate } from "./team-rules";
import type { AdminActor, AdminRole, AdminUserRecord } from "./types";

/**
 * The trusted actor for the command line (`npm run admin:grant`), used to create the first
 * admin or to change anyone's role. It is never itself a team member.
 */
export const CLI_ACTOR_UID = "cli";

function parseUser(data: unknown, position: number): AdminUserRecord | null {
  const parsed = adminUserSchema.safeParse(data);
  if (!parsed.success) {
    logError("admin.users.invalid_record", new Error(`Ignoring malformed admin user at position ${position}`));
    return null;
  }
  return parsed.data;
}

async function readTeam(): Promise<AdminUserRecord[]> {
  const raw = await readStoreFile(STORE_FILES.team);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index) => {
    const user = parseUser(item, index);
    return user === null ? [] : [user];
  });
}

function byEmail(a: AdminUserRecord, b: AdminUserRecord): number {
  return a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
}

async function writeTeam(members: readonly AdminUserRecord[]): Promise<void> {
  await writeStoreFile(STORE_FILES.team, [...members].sort(byEmail));
}

export async function getAdminUser(email: string): Promise<AdminUserRecord | null> {
  const wanted = normalizeEmail(email);
  return (await readTeam()).find((member) => member.email === wanted) ?? null;
}

export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  return (await readTeam()).sort(byEmail);
}

export async function recordSignIn(email: string, at: string): Promise<void> {
  await withStoreLock(async () => {
    const members = await readTeam();
    const wanted = normalizeEmail(email);
    const index = members.findIndex((member) => member.email === wanted);
    if (index === -1) throw new Error(`No team member ${wanted} to record a sign-in for.`);
    const member = members[index];
    if (member === undefined) return;
    members[index] = { ...member, lastSignInAt: at };
    await writeTeam(members);
  });
}

export type TeamChange =
  | { kind: "add"; email: string; role: AdminRole }
  | { kind: "update"; email: string; role: AdminRole; active: boolean };

function describeUpdate(before: AdminUserRecord, after: AdminUserRecord): string {
  const changes: string[] = [];
  if (before.role !== after.role) changes.push(`role ${ROLE_LABELS[before.role]} → ${ROLE_LABELS[after.role]}`);
  if (before.active !== after.active) changes.push(after.active ? "access restored" : "access removed");
  return `${after.email}: ${changes.length > 0 ? changes.join("; ") : "no changes"}`;
}

/** Validates and applies a team change under the store lock, with an audit entry. Returns field errors, if any. */
export async function applyTeamChange(params: {
  actor: AdminActor;
  change: TeamChange;
  now: string;
}): Promise<FieldErrors> {
  const { actor, change, now } = params;
  const email = normalizeEmail(change.email);
  const auditActor = { uid: actor.uid, email: actor.email };

  return withStoreLock(async () => {
    const members = await readTeam();

    // Re-check the actor's own standing against the same team list the change is validated
    // against. `requireAdminAction` already checked this from the session cookie, but a
    // concurrent removal/demotion could have landed since — without this, a stale actor could
    // reactivate or re-add themselves via update-self or add-self.
    if (actor.uid !== CLI_ACTOR_UID) {
      const actingMember = members.find((member) => member.email === normalizeEmail(actor.email));
      if (actingMember === undefined || !actingMember.active || !can(actingMember.role, "team.manage")) {
        return { form: "You no longer have permission to manage the team." };
      }
    }

    const existing = members.find((member) => member.email === email);

    let record: AdminUserRecord;
    let audit: AuditDraft;
    if (change.kind === "add") {
      const errors = validateTeamAddition({ email, members });
      if (Object.keys(errors).length > 0) return errors;
      record = {
        email,
        role: change.role,
        active: true,
        addedAt: now,
        addedBy: actor.email,
        lastSignInAt: existing?.lastSignInAt ?? null,
      };
      audit = {
        action: "team.add",
        entity: { type: "team", id: email },
        summary: `${email} given ${ROLE_LABELS[change.role]} access`,
        before: existing ?? null,
        after: record,
      };
    } else {
      if (existing === undefined) return { form: "That team member no longer exists." };
      const errors = validateTeamUpdate({ actorEmail: actor.email, email, role: change.role, active: change.active, members });
      if (Object.keys(errors).length > 0) return errors;
      record = { ...existing, role: change.role, active: change.active };
      audit = {
        action: "team.update",
        entity: { type: "team", id: email },
        summary: describeUpdate(existing, record),
        before: existing,
        after: record,
      };
    }

    await writeTeam([...members.filter((member) => member.email !== email), record]);
    await appendAuditEntries([newAuditEntry(buildAuditRecord(audit, auditActor, now, null))]);
    return {};
  });
}
