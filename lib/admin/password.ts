import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

const SCRYPT_COST = 16384;
/** Stored hashes above this cost are refused rather than run, so a crafted file cannot exhaust memory. */
const MAX_ACCEPTED_COST = 1 << 20;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const KEY_LENGTH = 64;
const FORMAT = "scrypt";

const scryptAsync = promisify<string, Buffer, number, ScryptOptions, Buffer>(scrypt);

/** The message to show when a password is not acceptable, or null when it is. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (password.trim().length !== password.length) return "Passwords can't start or end with a space.";
  return null;
}

function derive(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LENGTH, { N: cost, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM, maxmem: 256 * 1024 * 1024 });
}

/** `scrypt$<cost>$<salt>$<hash>`, salt and hash base64url. Only ever stored, never shown. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT_COST);
  return [FORMAT, String(SCRYPT_COST), salt.toString("base64url"), key.toString("base64url")].join("$");
}

function isAcceptableCost(cost: number): boolean {
  return Number.isInteger(cost) && cost >= 2 && cost <= MAX_ACCEPTED_COST && (cost & (cost - 1)) === 0;
}

/** True only for the password the hash was made from. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== FORMAT) return false;
  const [, costText = "", saltText = "", hashText = ""] = parts;
  const cost = Number(costText);
  if (!isAcceptableCost(cost)) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, salt, cost);
  return timingSafeEqual(actual, expected);
}
