/**
 * Slows password guessing. Failed sign-ins are counted per account and per client address inside
 * a rolling window; past the limit, further attempts are refused until the lock expires.
 * State is in memory (on `globalThis`, because Next.js can load this module more than once), so
 * it protects a single running instance and resets on restart.
 */
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const ACCOUNT_FAILURE_LIMIT = 5;
export const ADDRESS_FAILURE_LIMIT = 20;
const MAX_TRACKED_KEYS = 10_000;

interface Bucket {
  failures: number[];
  lockedUntil: number;
}

const STATE_KEY = Symbol.for("bueno-admin.sign-in-throttle");

function buckets(): Map<string, Bucket> {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: Map<string, Bucket> };
  holder[STATE_KEY] ??= new Map();
  return holder[STATE_KEY];
}

function keysFor(subject: { email: string; address: string }): Array<{ key: string; limit: number }> {
  return [
    { key: `account:${subject.email.trim().toLowerCase()}`, limit: ACCOUNT_FAILURE_LIMIT },
    { key: `address:${subject.address}`, limit: ADDRESS_FAILURE_LIMIT },
  ];
}

/** Milliseconds until this account or address may try again; 0 when it may try now. */
export function signInRetryAfterMs(subject: { email: string; address: string }, nowMs: number): number {
  let wait = 0;
  for (const { key } of keysFor(subject)) {
    const bucket = buckets().get(key);
    if (bucket !== undefined && bucket.lockedUntil > nowMs) wait = Math.max(wait, bucket.lockedUntil - nowMs);
  }
  return wait;
}

export function recordSignInFailure(subject: { email: string; address: string }, nowMs: number): void {
  const store = buckets();
  if (store.size >= MAX_TRACKED_KEYS) {
    for (const [key, bucket] of store) {
      if (bucket.lockedUntil <= nowMs && bucket.failures.every((at) => at <= nowMs - THROTTLE_WINDOW_MS)) store.delete(key);
    }
    if (store.size >= MAX_TRACKED_KEYS) store.clear();
  }
  for (const { key, limit } of keysFor(subject)) {
    const bucket = store.get(key) ?? { failures: [], lockedUntil: 0 };
    bucket.failures = bucket.failures.filter((at) => at > nowMs - THROTTLE_WINDOW_MS);
    bucket.failures.push(nowMs);
    if (bucket.failures.length >= limit) {
      bucket.lockedUntil = nowMs + THROTTLE_WINDOW_MS;
      bucket.failures = [];
    }
    store.set(key, bucket);
  }
}

/** A successful sign-in clears the account's count. The address count is left to expire. */
export function recordSignInSuccess(subject: { email: string }): void {
  buckets().delete(`account:${subject.email.trim().toLowerCase()}`);
}

export function resetSignInThrottle(): void {
  buckets().clear();
}

/** The caller's address as the proxy reports it; one shared bucket when there is none. */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded !== undefined && forwarded.length > 0 ? forwarded.slice(0, 64) : "unknown";
}
