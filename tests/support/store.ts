/**
 * Fixtures for the integration suite, the E2E suite and `npm run seed`. Writes the JSON files
 * directly and imports nothing server-only, so Node scripts and Playwright can load it.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashPassword } from "@/lib/admin/password";
import type { AdminRole, AdminUserRecord } from "@/lib/admin/types";
import { DEFAULT_ROUNDING_STEPS } from "@/lib/pricing/constants";
import { emptyCatalog } from "@/lib/pricing/defaults";
import type { PricingCatalog } from "@/lib/pricing/types";
import { STORE_FILES, storeDir, type StoreFileName } from "@/lib/store/store-path";

export const OWNER_EMAIL = "owner@bueno-test.example.com";
export const EDITOR_EMAIL = "editor@bueno-test.example.com";
export const VIEWER_EMAIL = "viewer@bueno-test.example.com";

export interface SeedAccount {
  email: string;
  role: AdminRole;
  password: string;
}

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { email: OWNER_EMAIL, role: "admin", password: "owner-demo-pass-2026" },
  { email: EDITOR_EMAIL, role: "editor", password: "editor-demo-pass-2026" },
  { email: VIEWER_EMAIL, role: "viewer", password: "viewer-demo-pass-2026" },
];

export function seedPassword(email: string): string {
  const account = SEED_ACCOUNTS.find((candidate) => candidate.email === email);
  if (account === undefined) throw new Error(`${email} is not a seeded account.`);
  return account.password;
}

/** KSh 129.5 per US dollar. */
export const SEED_RATE_E4 = 1_295_000;

/** Where the Playwright web server and the E2E tests both keep their data. */
export const E2E_DATA_DIR = path.join(os.tmpdir(), "bueno-admin-e2e-store");
export const TEST_SESSION_SECRET = "bueno-admin-test-session-secret-0123456789abcdef";

/** Writes a store file as-is: JSON for objects, the raw text for a string (to corrupt a file). */
export async function writeRawStoreFile(name: StoreFileName, value: unknown): Promise<void> {
  await mkdir(storeDir(), { recursive: true });
  const text = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(storeDir(), name), text, "utf8");
}

async function readJsonFile<T>(name: StoreFileName, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(storeDir(), name), "utf8")) as T;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

/** Empties the data folder. */
export async function resetStore(): Promise<void> {
  await rm(storeDir(), { recursive: true, force: true });
  await mkdir(storeDir(), { recursive: true });
}

/** Points BUENO_DATA_DIR at a brand-new temporary folder and returns it. */
export async function useTemporaryStore(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bueno-admin-test-"));
  process.env.BUENO_DATA_DIR = dir;
  return dir;
}

export async function removeStore(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Adds or replaces one team member. */
export async function upsertMember(record: Partial<AdminUserRecord> & { email: string }): Promise<AdminUserRecord> {
  const full: AdminUserRecord = {
    role: "admin",
    active: true,
    addedAt: "2026-09-24T09:00:00.000Z",
    addedBy: "test",
    lastSignInAt: null,
    ...record,
  };
  const members = await readJsonFile<AdminUserRecord[]>(STORE_FILES.team, []);
  await writeRawStoreFile(STORE_FILES.team, [...members.filter((member) => member.email !== full.email), full]);
  return full;
}

const hashCache = new Map<string, Promise<string>>();

function cachedHash(password: string): Promise<string> {
  let hash = hashCache.get(password);
  if (hash === undefined) {
    hash = hashPassword(password);
    hashCache.set(password, hash);
  }
  return hash;
}

/** Sets someone's password without touching the team list. */
export async function setSeedPassword(email: string, password: string, now = "2026-09-24T09:00:00.000Z"): Promise<void> {
  const credentials = await readJsonFile<Record<string, unknown>>(STORE_FILES.credentials, {});
  credentials[email] = { passwordHash: await cachedHash(password), passwordUpdatedAt: now, sessionsRevokedAt: null };
  await writeRawStoreFile(STORE_FILES.credentials, credentials);
}

/** The three demo accounts, all active, with their passwords. */
export async function seedTeam(now: string = new Date().toISOString()): Promise<void> {
  for (const account of SEED_ACCOUNTS) {
    await upsertMember({ email: account.email, role: account.role, addedAt: now, addedBy: "seed" });
    await setSeedPassword(account.email, account.password, now);
  }
}

/** Stores the house exchange rate as if the owner had saved it once. */
export async function seedExchangeRate(now: string = new Date().toISOString()): Promise<void> {
  const catalog: PricingCatalog = {
    ...emptyCatalog(),
    revision: 1,
    currency: {
      kesPerUsdE4: SEED_RATE_E4,
      roundingStep: DEFAULT_ROUNDING_STEPS,
      version: 1,
      updatedAt: now,
      updatedBy: OWNER_EMAIL,
    },
    updatedAt: now,
    updatedBy: OWNER_EMAIL,
  };
  await writeRawStoreFile(STORE_FILES.catalog, catalog);
}

/** Stores a catalog that fails schema validation, so every catalog read throws. */
export async function seedMalformedCatalog(): Promise<void> {
  await writeRawStoreFile(STORE_FILES.catalog, { schemaVersion: 99 });
}
