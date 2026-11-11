import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCOUNT_ATTEMPT_LIMIT,
  ADDRESS_ATTEMPT_LIMIT,
  MAX_TRACKED_KEYS,
  PAIR_ATTEMPT_LIMIT,
  SATURATION_PAUSE_MS,
  THROTTLE_WINDOW_MS,
  clientAddress,
  configuredTrustedProxies,
  recordSignInSuccess,
  reserveSignInAttempt,
  resetSignInThrottle,
  trackedThrottleKeys,
} from "@/lib/admin/sign-in-throttle";

const T0 = 1_800_000_000_000;
const who = { email: "Owner@Example.com", address: "203.0.113.7" };

beforeEach(resetSignInThrottle);

describe("sign-in throttle", () => {
  it("allows the limit, then refuses the same client on the same account for the window", () => {
    for (let i = 0; i < PAIR_ATTEMPT_LIMIT; i++) expect(reserveSignInAttempt(who, T0 + i)).toBe(0);
    const lockedAt = T0 + PAIR_ATTEMPT_LIMIT - 1;
    expect(reserveSignInAttempt(who, lockedAt)).toBe(THROTTLE_WINDOW_MS);
    expect(reserveSignInAttempt(who, lockedAt + THROTTLE_WINDOW_MS - 1)).toBe(1);
    expect(reserveSignInAttempt(who, lockedAt + THROTTLE_WINDOW_MS)).toBe(0);
  });

  it("counts an attempt the moment it is reserved, so simultaneous attempts cannot exceed the limit", () => {
    const outcomes = Array.from({ length: PAIR_ATTEMPT_LIMIT * 3 }, () => reserveSignInAttempt(who, T0));
    expect(outcomes.filter((wait) => wait === 0)).toHaveLength(PAIR_ATTEMPT_LIMIT);
  });

  it("does not lock the owner out from another address when one client keeps failing", () => {
    for (let i = 0; i < PAIR_ATTEMPT_LIMIT; i++) reserveSignInAttempt({ email: " OWNER@example.com ", address: "198.51.100.1" }, T0);
    expect(reserveSignInAttempt({ email: "owner@example.com", address: "198.51.100.1" }, T0)).toBeGreaterThan(0);
    expect(reserveSignInAttempt({ email: "owner@example.com", address: "192.0.2.1" }, T0)).toBe(0);
  });

  it("still bounds guessing on one account spread across many addresses", () => {
    let allowed = 0;
    for (let i = 0; i < ACCOUNT_ATTEMPT_LIMIT + 10; i++) {
      if (reserveSignInAttempt({ email: "owner@example.com", address: `198.51.100.${i}` }, T0) === 0) allowed++;
    }
    expect(allowed).toBe(ACCOUNT_ATTEMPT_LIMIT);
    expect(reserveSignInAttempt({ email: "owner@example.com", address: "192.0.2.200" }, T0)).toBe(THROTTLE_WINDOW_MS);
  });

  it("locks an address that guesses across many accounts", () => {
    let allowed = 0;
    for (let i = 0; i < ADDRESS_ATTEMPT_LIMIT + 5; i++) {
      if (reserveSignInAttempt({ email: `user${i}@example.com`, address: who.address }, T0) === 0) allowed++;
    }
    expect(allowed).toBe(ADDRESS_ATTEMPT_LIMIT);
    expect(reserveSignInAttempt({ email: "fresh@example.com", address: "192.0.2.9" }, T0)).toBe(0);
  });

  it("forgets attempts that fall outside the window", () => {
    for (let i = 0; i < PAIR_ATTEMPT_LIMIT - 1; i++) reserveSignInAttempt(who, T0);
    expect(reserveSignInAttempt(who, T0 + THROTTLE_WINDOW_MS + 1)).toBe(0);
    expect(reserveSignInAttempt(who, T0 + THROTTLE_WINDOW_MS + 2)).toBe(0);
  });

  it("refunds a successful attempt and clears that client's count for the account", () => {
    for (let i = 0; i < PAIR_ATTEMPT_LIMIT - 1; i++) reserveSignInAttempt(who, T0);
    expect(reserveSignInAttempt(who, T0)).toBe(0);
    recordSignInSuccess(who);
    for (let i = 0; i < PAIR_ATTEMPT_LIMIT - 1; i++) expect(reserveSignInAttempt(who, T0 + 1)).toBe(0);
  });

  it("leaves no counters behind after a lone successful sign-in, and tolerates a success with none", () => {
    recordSignInSuccess(who);
    expect(reserveSignInAttempt(who, T0)).toBe(0);
    expect(trackedThrottleKeys()).toBe(3);
    recordSignInSuccess(who);
    expect(trackedThrottleKeys()).toBe(0);
  });

  it("unlocks a shared counter when the attempt that filled it turns out to be a successful sign-in", () => {
    for (let i = 0; i < ADDRESS_ATTEMPT_LIMIT - 1; i++) reserveSignInAttempt({ email: `user${i}@example.com`, address: who.address }, T0);
    expect(reserveSignInAttempt(who, T0)).toBe(0);
    recordSignInSuccess(who);
    expect(reserveSignInAttempt({ email: "next@example.com", address: who.address }, T0)).toBe(0);
  });

  it("never forgets a live lock when flooded with new keys, and pauses instead", () => {
    for (let i = 0; i < PAIR_ATTEMPT_LIMIT; i++) reserveSignInAttempt(who, T0);
    expect(reserveSignInAttempt(who, T0)).toBeGreaterThan(0);
    let refusedAt = -1;
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) {
      if (reserveSignInAttempt({ email: `flood${i}@example.com`, address: `a${i}` }, T0) > 0) {
        refusedAt = i;
        break;
      }
    }
    expect(refusedAt).toBeGreaterThan(0);
    expect(trackedThrottleKeys()).toBeLessThanOrEqual(MAX_TRACKED_KEYS);
    expect(reserveSignInAttempt({ email: "bystander@example.com", address: "192.0.2.50" }, T0)).toBe(SATURATION_PAUSE_MS);
    expect(reserveSignInAttempt(who, T0 + SATURATION_PAUSE_MS)).toBeGreaterThan(0);
  });

  it("evicts idle entries to make room once their window has passed", () => {
    for (let i = 0; i < MAX_TRACKED_KEYS / 3; i++) reserveSignInAttempt({ email: `old${i}@example.com`, address: `o${i}` }, T0);
    const later = T0 + THROTTLE_WINDOW_MS + SATURATION_PAUSE_MS + 1;
    expect(reserveSignInAttempt({ email: "new@example.com", address: "192.0.2.77" }, later)).toBe(0);
    expect(trackedThrottleKeys()).toBe(3);
  });
});

describe("clientAddress", () => {
  const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7 , 10.0.0.1" });

  it("trusts only the hops added by the configured number of proxies, never the client-supplied left side", () => {
    expect(clientAddress(headers, 1)).toBe("10.0.0.1");
    expect(clientAddress(headers, 2)).toBe("203.0.113.7");
    expect(clientAddress(headers, 3)).toBe("6.6.6.6");
  });

  it("uses one shared bucket when the header is missing, too short, or no proxy is trusted", () => {
    expect(clientAddress(new Headers(), 1)).toBe("unknown");
    expect(clientAddress(new Headers({ "x-forwarded-for": " , " }), 1)).toBe("unknown");
    expect(clientAddress(headers, 4)).toBe("unknown");
    expect(clientAddress(headers, 0)).toBe("direct");
  });

  it("bounds the length of what it keeps", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "x".repeat(200) }), 1)).toHaveLength(64);
  });

  it("reads the proxy count from configuration, defaulting to one", () => {
    expect(configuredTrustedProxies(undefined)).toBe(1);
    expect(configuredTrustedProxies(" ")).toBe(1);
    expect(configuredTrustedProxies("0")).toBe(0);
    expect(configuredTrustedProxies("2")).toBe(2);
    expect(configuredTrustedProxies("-1")).toBe(1);
    expect(configuredTrustedProxies("1.5")).toBe(1);
    expect(configuredTrustedProxies("99")).toBe(1);
    expect(configuredTrustedProxies("abc")).toBe(1);
    expect(clientAddress(headers)).toBe("10.0.0.1");
  });
});
