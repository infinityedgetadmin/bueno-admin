import path from "node:path";

/**
 * Where the back office keeps its mutable data (catalog, team, credentials, activity log) as
 * JSON files. Dependency-free and not server-only, so scripts and Playwright can resolve the
 * same folder the app writes to. Override with BUENO_DATA_DIR (absolute or relative to cwd).
 */
export const STORE_FILES = {
  catalog: "catalog.json",
  team: "team.json",
  credentials: "credentials.json",
  audit: "audit.json",
  sessionSecret: ".session-secret",
} as const;

export type StoreFileName = (typeof STORE_FILES)[keyof typeof STORE_FILES];

export function storeDir(): string {
  const configured = process.env.BUENO_DATA_DIR;
  if (configured !== undefined && configured.length > 0) return path.resolve(configured);
  return path.join(process.cwd(), "data", "store");
}

export function storeFilePath(name: StoreFileName): string {
  return path.join(storeDir(), name);
}
