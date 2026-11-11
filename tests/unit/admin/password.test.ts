import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, hashPassword, passwordProblem, verifyPassword } from "@/lib/admin/password";

describe("passwordProblem", () => {
  it("requires 10 to 200 characters with no surrounding spaces", () => {
    expect(passwordProblem("short")).toBe("Use at least 10 characters.");
    expect(passwordProblem("x".repeat(PASSWORD_MAX_LENGTH + 1))).toBe("Use at most 200 characters.");
    expect(passwordProblem(" padded-password")).toBe("Passwords can't start or end with a space.");
    expect(passwordProblem("padded-password ")).toBe("Passwords can't start or end with a space.");
    expect(passwordProblem("correct horse battery")).toBeNull();
    expect(passwordProblem("x".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
  });
});

describe("hashPassword / verifyPassword", () => {
  it("verifies the password it hashed and nothing else, with a fresh salt each time", async () => {
    const first = await hashPassword("correct horse battery");
    const second = await hashPassword("correct horse battery");
    expect(first).not.toBe(second);
    expect(first.startsWith("scrypt$16384$")).toBe(true);
    expect(await verifyPassword("correct horse battery", first)).toBe(true);
    expect(await verifyPassword("correct horse battery", second)).toBe(true);
    expect(await verifyPassword("Correct horse battery", first)).toBe(false);
    expect(await verifyPassword("", first)).toBe(false);
  });

  it("treats malformed stored hashes as a mismatch rather than throwing", async () => {
    const good = await hashPassword("correct horse battery");
    const [, cost, salt, hash] = good.split("$") as [string, string, string, string];
    for (const bad of [
      "",
      "plaintext",
      `bcrypt$${cost}$${salt}$${hash}`,
      `scrypt$${cost}$${salt}`,
      `scrypt$abc$${salt}$${hash}`,
      `scrypt$1000$${salt}$${hash}`,
      `scrypt$1$${salt}$${hash}`,
      `scrypt$2097152$${salt}$${hash}`,
      `scrypt$1.5$${salt}$${hash}`,
      `scrypt$${cost}$$${hash}`,
      `scrypt$${cost}$${salt}$short`,
    ]) {
      expect(await verifyPassword("correct horse battery", bad), bad).toBe(false);
    }
  });
});
