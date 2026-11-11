import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORE_FILES, StoreFormatError, readStoreFile, storeDir, withStoreLock, writeStoreFile } from "@/lib/store/json-store";
import { writeRawStoreFile } from "../../support/store";

let dir: string;
let previous: string | undefined;

beforeEach(async () => {
  previous = process.env.BUENO_DATA_DIR;
  dir = await mkdtemp(path.join(os.tmpdir(), "bueno-json-store-"));
  process.env.BUENO_DATA_DIR = dir;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.BUENO_DATA_DIR;
  else process.env.BUENO_DATA_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

describe("json store", () => {
  it("resolves the data folder from BUENO_DATA_DIR, defaulting to ./data/store", () => {
    expect(storeDir()).toBe(dir);
    delete process.env.BUENO_DATA_DIR;
    expect(storeDir()).toBe(path.join(process.cwd(), "data", "store"));
    process.env.BUENO_DATA_DIR = "";
    expect(storeDir()).toBe(path.join(process.cwd(), "data", "store"));
    process.env.BUENO_DATA_DIR = "relative/folder";
    expect(storeDir()).toBe(path.resolve("relative/folder"));
  });

  it("reads undefined for a file that was never written, then what was written", async () => {
    expect(await readStoreFile(STORE_FILES.catalog)).toBeUndefined();
    await writeStoreFile(STORE_FILES.catalog, { hello: "world", list: [1, 2] });
    expect(await readStoreFile(STORE_FILES.catalog)).toEqual({ hello: "world", list: [1, 2] });
  });

  it("leaves no temporary files behind after a write", async () => {
    await writeStoreFile(STORE_FILES.team, []);
    await writeStoreFile(STORE_FILES.team, [{ a: 1 }]);
    expect(await readdir(dir)).toEqual([STORE_FILES.team]);
  });

  it("reports a file that is not JSON as a format error", async () => {
    await writeRawStoreFile(STORE_FILES.audit, "{ nope");
    await expect(readStoreFile(STORE_FILES.audit)).rejects.toBeInstanceOf(StoreFormatError);
    await expect(readStoreFile(STORE_FILES.audit)).rejects.toMatchObject({ file: STORE_FILES.audit });
  });

  it("runs locked tasks one after another, in order, even when one fails", async () => {
    const order: string[] = [];
    const slow = withStoreLock(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("slow");
      return "slow";
    });
    const failing = withStoreLock(async () => {
      order.push("failing");
      throw new Error("boom");
    });
    const fast = withStoreLock(async () => {
      order.push("fast");
      return "fast";
    });
    await expect(slow).resolves.toBe("slow");
    await expect(failing).rejects.toThrow("boom");
    await expect(fast).resolves.toBe("fast");
    expect(order).toEqual(["slow", "failing", "fast"]);
  });
});
