import "server-only";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { STORE_FILES, readStoreFile, withStoreLock, writeStoreFile } from "@/lib/store/json-store";
import { hashPassword } from "./password";
import { normalizeEmail } from "./team-rules";

/**
 * Sign-in secrets live apart from the team list: the team record is shown in the back office
 * and copied into the activity log, and a password hash must never travel with it.
 */
export interface CredentialRecord {
  passwordHash: string;
  passwordUpdatedAt: string;
  /** Sessions issued at or before this instant (Unix ms) are no longer valid. */
  sessionsRevokedAt: number | null;
}

const credentialSchema = z.object({
  passwordHash: z.string().min(1),
  passwordUpdatedAt: z.string().min(1).max(40),
  sessionsRevokedAt: z.number().int().nullable(),
});

type CredentialFile = Record<string, CredentialRecord>;

async function readCredentials(): Promise<CredentialFile> {
  const raw = await readStoreFile(STORE_FILES.credentials);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const file: CredentialFile = {};
  for (const [email, value] of Object.entries(raw)) {
    const parsed = credentialSchema.safeParse(value);
    if (!parsed.success) {
      logError("admin.credentials.invalid_record", new Error(`Ignoring malformed credentials for ${email}`));
      continue;
    }
    file[email] = parsed.data;
  }
  return file;
}

export async function getCredential(email: string): Promise<CredentialRecord | null> {
  return (await readCredentials())[normalizeEmail(email)] ?? null;
}

/** Hashes and stores a new password. Validate it with `passwordProblem` first. */
export async function setPassword(email: string, password: string, now: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await withStoreLock(async () => {
    const file = await readCredentials();
    const key = normalizeEmail(email);
    file[key] = { passwordHash, passwordUpdatedAt: now, sessionsRevokedAt: file[key]?.sessionsRevokedAt ?? null };
    await writeStoreFile(STORE_FILES.credentials, file);
  });
}

/** Invalidates every session issued up to `atMs`. No-op for someone with no credentials. */
export async function revokeSessionsAt(email: string, atMs: number): Promise<void> {
  await withStoreLock(async () => {
    const file = await readCredentials();
    const key = normalizeEmail(email);
    const existing = file[key];
    if (existing === undefined) return;
    file[key] = { ...existing, sessionsRevokedAt: Math.max(existing.sessionsRevokedAt ?? 0, atMs) };
    await writeStoreFile(STORE_FILES.credentials, file);
  });
}
