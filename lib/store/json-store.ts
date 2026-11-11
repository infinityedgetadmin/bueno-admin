import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { STORE_FILES, storeDir, storeFilePath, type StoreFileName } from "./store-path";

export { STORE_FILES, storeDir, storeFilePath };
export type { StoreFileName };

/** A store file exists but is not valid JSON. */
export class StoreFormatError extends Error {
  constructor(readonly file: StoreFileName) {
    super(`${file} is not valid JSON.`);
    this.name = "StoreFormatError";
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** Parsed contents of a store file, or undefined when it has never been written. */
export async function readStoreFile(name: StoreFileName): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(storeFilePath(name), "utf8");
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new StoreFormatError(name);
  }
}

/**
 * Writes a store file atomically: the JSON goes to a temporary file in the same folder, which
 * is then renamed over the target, so a crash mid-write can never leave a half-written file.
 */
export async function writeStoreFile(name: StoreFileName, value: unknown): Promise<void> {
  const dir = storeDir();
  await mkdir(dir, { recursive: true });
  const target = storeFilePath(name);
  const temporary = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

interface LockState {
  chain: Promise<unknown>;
}

const LOCK_KEY = Symbol.for("bueno-admin.store-lock");

function lockState(): LockState {
  const holder = globalThis as typeof globalThis & { [LOCK_KEY]?: LockState };
  holder[LOCK_KEY] ??= { chain: Promise.resolve() };
  return holder[LOCK_KEY];
}

/**
 * Runs `task` after every earlier task has finished, so read-modify-write sequences on the store
 * never interleave. The lock lives on `globalThis` because Next.js can load this module more
 * than once (route handlers, Server Actions and pages each get their own bundle) in one process.
 * It serialises one process only: run a single instance of the app against a given data folder.
 */
export function withStoreLock<T>(task: () => Promise<T>): Promise<T> {
  const state = lockState();
  const run = state.chain.then(task, task);
  state.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
