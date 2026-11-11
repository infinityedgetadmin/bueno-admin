import "server-only";
import { randomUUID } from "node:crypto";
import { logError } from "@/lib/logger";
import type { Actor, AuditAction, AuditDraft, AuditEntityType } from "@/lib/pricing/operations";
import { auditEntrySchema } from "@/lib/pricing/schemas";
import { STORE_FILES, readStoreFile, withStoreLock, writeStoreFile } from "@/lib/store/json-store";

export interface AuditRecord {
  at: string;
  actor: Actor;
  action: AuditAction;
  entity: { type: AuditEntityType; id: string };
  summary: string;
  before: unknown;
  after: unknown;
  revision: number | null;
}

export interface AuditEntry extends AuditRecord {
  id: string;
}

/**
 * Stored values are plain JSON, so a JSON round-trip is an exact normalisation: it drops
 * `undefined` keys (which JSON cannot represent) and nothing else.
 */
export function plainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildAuditRecord(draft: AuditDraft, actor: Actor, at: string, revision: number | null): AuditRecord {
  return {
    at,
    actor: { uid: actor.uid, email: actor.email },
    action: draft.action,
    entity: draft.entity,
    summary: draft.summary,
    before: draft.before ?? null,
    after: draft.after ?? null,
    revision,
  };
}

export function newAuditEntry(record: AuditRecord): AuditEntry {
  return { id: randomUUID(), ...record };
}

async function readRawEntries(): Promise<unknown[]> {
  const raw = await readStoreFile(STORE_FILES.audit);
  return Array.isArray(raw) ? raw : [];
}

/** Appends entries to the activity log. The caller must already hold the store lock. */
export async function appendAuditEntries(entries: readonly AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const existing = await readRawEntries();
  await writeStoreFile(STORE_FILES.audit, [...existing, ...entries.map((entry) => plainJson(entry))]);
}

export async function writeAudit(params: { draft: AuditDraft; actor: Actor; now: string }): Promise<void> {
  const entry = newAuditEntry(buildAuditRecord(params.draft, params.actor, params.now, null));
  await withStoreLock(() => appendAuditEntries([entry]));
}

/**
 * Newest first. Entries written in the same instant keep their write order (the later write
 * lists first), so a sequence of changes made together reads top-down as most recent first.
 */
export async function listAudit(params: {
  entity?: { type: AuditEntityType; id: string };
  limit: number;
}): Promise<AuditEntry[]> {
  const raw = await readRawEntries();
  const entries = raw.flatMap((item, index) => {
    const parsed = auditEntrySchema.safeParse(item);
    if (!parsed.success) {
      logError("cms.audit.invalid_entry", new Error(`Skipping malformed audit entry at position ${index}`));
      return [];
    }
    return [{ entry: parsed.data, index }];
  });
  const filtered =
    params.entity === undefined
      ? entries
      : entries.filter(({ entry }) => entry.entity.type === params.entity?.type && entry.entity.id === params.entity?.id);
  filtered.sort((a, b) => (a.entry.at === b.entry.at ? b.index - a.index : a.entry.at < b.entry.at ? 1 : -1));
  return filtered.slice(0, params.limit).map(({ entry }) => entry);
}
