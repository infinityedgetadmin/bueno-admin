import { afterEach, beforeEach } from "vitest";
import { TEST_SESSION_SECRET, removeStore, useTemporaryStore } from "../support/store";

// Every test gets an empty data folder of its own, and a fixed signing key so cookies issued in
// one module instance verify in another.
process.env.ADMIN_SESSION_SECRET = TEST_SESSION_SECRET;

let current: string | null = null;

beforeEach(async () => {
  current = await useTemporaryStore();
});

afterEach(async () => {
  if (current !== null) await removeStore(current);
  current = null;
});
