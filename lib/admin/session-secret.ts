import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { STORE_FILES, storeDir, storeFilePath, withStoreLock } from "@/lib/store/json-store";

export const SESSION_SECRET_MIN_LENGTH = 32;

/**
 * The key that signs session cookies. Set ADMIN_SESSION_SECRET (at least 32 characters) in
 * production; without it, a random secret is generated once and kept in the data folder, so
 * sessions survive restarts but every deployment of the folder has its own key.
 */
export async function getSessionSecret(): Promise<string> {
  const configured = process.env.ADMIN_SESSION_SECRET;
  if (configured !== undefined && configured.length >= SESSION_SECRET_MIN_LENGTH) return configured;
  if (configured !== undefined && configured.length > 0) {
    throw new Error(`ADMIN_SESSION_SECRET must be at least ${SESSION_SECRET_MIN_LENGTH} characters.`);
  }
  return withStoreLock(async () => {
    const file = storeFilePath(STORE_FILES.sessionSecret);
    try {
      const existing = (await readFile(file, "utf8")).trim();
      if (existing.length >= SESSION_SECRET_MIN_LENGTH) return existing;
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
    }
    const generated = randomBytes(32).toString("hex");
    await mkdir(storeDir(), { recursive: true });
    await writeFile(file, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
    return generated;
  });
}
