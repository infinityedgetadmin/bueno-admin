import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCOUNT_FAILURE_LIMIT,
  ADDRESS_FAILURE_LIMIT,
  THROTTLE_WINDOW_MS,
  clientAddress,
  recordSignInFailure,
  recordSignInSuccess,
  resetSignInThrottle,
  signInRetryAfterMs,
} from "@/lib/admin/sign-in-throttle";

const T0 = 1_800_000_000_000;
const who = { email: "Owner@Example.com", address: "203.0.113.7" };

beforeEach(resetSignInThrottle);

describe("sign-in throttle", () => {
  it("locks an account after the failure limit, for the length of the window", () => {
    for (let i = 0; i < ACCOUNT_FAILURE_LIMIT - 1; i++) recordSignInFailure(who, T0 + i);
    expect(signInRetryAfterMs(who, T0 + 10)).toBe(0);
    recordSignInFailure(who, T0 + 10);
    expect(signInRetryAfterMs(who, T0 + 10)).toBe(THROTTLE_WINDOW_MS);
    expect(signInRetryAfterMs(who, T0 + 10 + THROTTLE_WINDOW_MS - 1)).toBe(1);
    expect(signInRetryAfterMs(who, T0 + 10 + THROTTLE_WINDOW_MS)).toBe(0);
  });

  it("treats the email case-insensitively and locks it from any address", () => {
    for (let i = 0; i < ACCOUNT_FAILURE_LIMIT; i++) recordSignInFailure({ email: " OWNER@example.com ", address: `198.51.100.${i}` }, T0);
    expect(signInRetryAfterMs({ email: "owner@example.com", address: "192.0.2.1" }, T0)).toBeGreaterThan(0);
    expect(signInRetryAfterMs({ email: "someone-else@example.com", address: "192.0.2.1" }, T0)).toBe(0);
  });

  it("forgets failures that fall outside the window", () => {
    for (let i = 0; i < ACCOUNT_FAILURE_LIMIT - 1; i++) recordSignInFailure(who, T0);
    recordSignInFailure(who, T0 + THROTTLE_WINDOW_MS + 1);
    expect(signInRetryAfterMs(who, T0 + THROTTLE_WINDOW_MS + 1)).toBe(0);
  });

  it("locks an address that guesses across many accounts", () => {
    for (let i = 0; i < ADDRESS_FAILURE_LIMIT; i++) recordSignInFailure({ email: `user${i}@example.com`, address: who.address }, T0);
    expect(signInRetryAfterMs({ email: "fresh@example.com", address: who.address }, T0)).toBe(THROTTLE_WINDOW_MS);
    expect(signInRetryAfterMs({ email: "fresh@example.com", address: "192.0.2.9" }, T0)).toBe(0);
  });

  it("clears the account count on success but leaves a lock on the address alone", () => {
    for (let i = 0; i < ACCOUNT_FAILURE_LIMIT - 1; i++) recordSignInFailure(who, T0);
    recordSignInSuccess({ email: "owner@example.com" });
    recordSignInFailure(who, T0);
    expect(signInRetryAfterMs(who, T0)).toBe(0);
  });

  it("stays bounded when flooded with distinct keys", () => {
    for (let i = 0; i < 6_000; i++) recordSignInFailure({ email: `flood${i}@example.com`, address: `a${i}` }, T0);
    recordSignInFailure(who, T0 + THROTTLE_WINDOW_MS * 2);
    expect(signInRetryAfterMs(who, T0 + THROTTLE_WINDOW_MS * 2)).toBe(0);
    for (let i = 0; i < 6_000; i++) recordSignInFailure({ email: `again${i}@example.com`, address: `b${i}` }, T0 + THROTTLE_WINDOW_MS * 2);
    expect(signInRetryAfterMs({ email: "again5999@example.com", address: "b5999" }, T0 + THROTTLE_WINDOW_MS * 2)).toBe(0);
  });

  it("reads the first forwarded address, bounded in length, with one bucket when absent", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientAddress(new Headers())).toBe("unknown");
    expect(clientAddress(new Headers({ "x-forwarded-for": " , 10.0.0.1" }))).toBe("unknown");
    expect(clientAddress(new Headers({ "x-forwarded-for": "x".repeat(200) }))).toHaveLength(64);
  });
});
