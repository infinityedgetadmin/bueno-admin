/**
 * Slows password guessing. Every sign-in attempt is counted before the password is checked
 * (so parallel requests cannot outrun the limit) and refunded when it succeeds.
 *
 * Three counters share one rolling window:
 *   - account + address: the tight limit. Someone guessing from one place is stopped quickly,
 *     without locking the real owner out from elsewhere.
 *   - address: stops one client guessing across many accounts.
 *   - account: a high backstop, so guessing spread over many addresses is still bounded.
 *
 * State is in memory (on `globalThis`, because Next.js can load this module more than once), so it
 * protects a single running instance and resets on restart. Use a shared store to run several.
 */
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const PAIR_ATTEMPT_LIMIT = 5;
export const ADDRESS_ATTEMPT_LIMIT = 20;
export const ACCOUNT_ATTEMPT_LIMIT = 50;
export const MAX_TRACKED_KEYS = 10_000;
/** How long everyone waits when the table is full of live entries and nothing can be evicted. */
export const SATURATION_PAUSE_MS = 60 * 1000;

interface Bucket {
  attempts: number[];
  lockedUntil: number;
}

interface ThrottleState {
  buckets: Map<string, Bucket>;
  saturatedUntil: number;
}

export interface SignInSubject {
  email: string;
  address: string;
}

const STATE_KEY = Symbol.for("bueno-admin.sign-in-throttle");

function state(): ThrottleState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: ThrottleState };
  holder[STATE_KEY] ??= { buckets: new Map(), saturatedUntil: 0 };
  return holder[STATE_KEY];
}

function keysFor(subject: SignInSubject): Array<{ key: string; limit: number }> {
  const email = subject.email.trim().toLowerCase();
  return [
    { key: `pair:${email}|${subject.address}`, limit: PAIR_ATTEMPT_LIMIT },
    { key: `address:${subject.address}`, limit: ADDRESS_ATTEMPT_LIMIT },
    { key: `account:${email}`, limit: ACCOUNT_ATTEMPT_LIMIT },
  ];
}

function isIdle(bucket: Bucket, nowMs: number): boolean {
  return bucket.lockedUntil <= nowMs && bucket.attempts.every((at) => at <= nowMs - THROTTLE_WINDOW_MS);
}

/** Drops only entries that no longer matter. A live lock or a recent attempt is never evicted. */
function makeRoom(store: Map<string, Bucket>, needed: number, nowMs: number): boolean {
  if (store.size + needed <= MAX_TRACKED_KEYS) return true;
  for (const [key, bucket] of store) {
    if (isIdle(bucket, nowMs)) store.delete(key);
  }
  return store.size + needed <= MAX_TRACKED_KEYS;
}

function lockRemaining(subject: SignInSubject, nowMs: number): number {
  const { buckets, saturatedUntil } = state();
  let wait = Math.max(0, saturatedUntil - nowMs);
  for (const { key } of keysFor(subject)) {
    const bucket = buckets.get(key);
    if (bucket !== undefined && bucket.lockedUntil > nowMs) wait = Math.max(wait, bucket.lockedUntil - nowMs);
  }
  return wait;
}

/**
 * Call before checking a password. Returns 0 and counts the attempt when it may proceed, or the
 * milliseconds to wait when it may not. Checking and counting happen in one synchronous step.
 */
export function reserveSignInAttempt(subject: SignInSubject, nowMs: number): number {
  const wait = lockRemaining(subject, nowMs);
  if (wait > 0) return wait;
  const current = state();
  const keys = keysFor(subject);
  const missing = keys.filter(({ key }) => !current.buckets.has(key)).length;
  if (!makeRoom(current.buckets, missing, nowMs)) {
    // Full of live entries: refuse briefly rather than forget anyone's lock.
    current.saturatedUntil = nowMs + SATURATION_PAUSE_MS;
    return SATURATION_PAUSE_MS;
  }
  for (const { key, limit } of keys) {
    const bucket = current.buckets.get(key) ?? { attempts: [], lockedUntil: 0 };
    bucket.attempts = bucket.attempts.filter((at) => at > nowMs - THROTTLE_WINDOW_MS);
    bucket.attempts.push(nowMs);
    if (bucket.attempts.length >= limit) bucket.lockedUntil = nowMs + THROTTLE_WINDOW_MS;
    current.buckets.set(key, bucket);
  }
  return 0;
}

/** Call after a successful sign-in: forgets this client's count for the account and refunds the attempt elsewhere. */
export function recordSignInSuccess(subject: SignInSubject): void {
  const { buckets } = state();
  for (const { key } of keysFor(subject)) {
    if (key.startsWith("pair:")) {
      buckets.delete(key);
      continue;
    }
    const bucket = buckets.get(key);
    if (bucket === undefined) continue;
    bucket.attempts.pop();
    // Only the attempt that filled a counter can still succeed, so refunding it always reopens it.
    bucket.lockedUntil = 0;
    if (bucket.attempts.length === 0) buckets.delete(key);
  }
}

export function resetSignInThrottle(): void {
  const current = state();
  current.buckets.clear();
  current.saturatedUntil = 0;
}

/** Number of tracked counters. For tests and diagnostics. */
export function trackedThrottleKeys(): number {
  return state().buckets.size;
}

/**
 * The caller's address. X-Forwarded-For is a list each proxy appends to, so only the entries
 * added by proxies you run can be trusted: with `trustedProxies` = 1 (one reverse proxy in front,
 * the default) that is the last entry. The left-most entries are whatever the client sent.
 * Set ADMIN_TRUSTED_PROXIES to the number of proxies in front of the app, or 0 when it is reached
 * directly, in which case every caller shares one bucket.
 */
export function clientAddress(headers: Headers, trustedProxies: number = configuredTrustedProxies()): string {
  if (trustedProxies <= 0) return "direct";
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);
  const hop = hops[hops.length - trustedProxies];
  return hop === undefined ? "unknown" : hop.slice(0, 64);
}

export function configuredTrustedProxies(value: string | undefined = process.env.ADMIN_TRUSTED_PROXIES): number {
  if (value === undefined || value.trim() === "") return 1;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10 ? parsed : 1;
}
