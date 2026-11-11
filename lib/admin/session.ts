import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { logError } from "@/lib/logger";
import { getCredential, revokeSessionsAt } from "./credentials-repo";
import { hashPassword, verifyPassword } from "./password";
import { can, type Permission } from "./permissions";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./session-constants";
import type { SessionFailure } from "./session-rules";
import { getSessionSecret } from "./session-secret";
import { signSessionToken, verifySessionToken } from "./session-token";
import { normalizeEmail } from "./team-rules";
import type { AdminActor } from "./types";
import { getAdminUser, recordSignIn } from "./users-repo";

const FAILURE_MESSAGES: Readonly<Record<SessionFailure, string>> = {
  unauthenticated: "Not signed in.",
  not_authorized: "Not authorised for this back-office action.",
  invalid_credentials: "Email or password is incorrect.",
};

export class AdminAuthError extends Error {
  constructor(readonly reason: SessionFailure) {
    super(FAILURE_MESSAGES[reason]);
    this.name = "AdminAuthError";
  }
}

/**
 * A hash to check against when the email has no credentials, so a sign-in attempt takes the
 * same time whether or not the address is on the team.
 */
const decoyHash: Promise<string> = hashPassword(randomBytes(24).toString("base64url"));

/** Checks an email and password and turns them into a 5-day session cookie. */
export async function signInWithPassword(
  input: { email: string; password: string },
  now: Date = new Date(),
): Promise<{ cookie: string; actor: AdminActor }> {
  const email = normalizeEmail(input.email);
  const [user, credential] = await Promise.all([getAdminUser(email), getCredential(email)]);
  const matches = await verifyPassword(input.password, credential?.passwordHash ?? (await decoyHash));
  if (credential === null || !matches) throw new AdminAuthError("invalid_credentials");
  if (user === null || !user.active) throw new AdminAuthError("not_authorized");
  const issuedAt = now.getTime();
  const cookie = signSessionToken(
    { email, issuedAt, expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS * 1000 },
    await getSessionSecret(),
  );
  try {
    await recordSignIn(email, now.toISOString());
  } catch (error) {
    // Bookkeeping only (the team page's "last sign-in"): a write failure must not turn a
    // valid sign-in into a failed one.
    logError("admin.session.record_sign_in", error);
  }
  return { cookie, actor: { uid: email, email, role: user.role } };
}

/** Session cookie → actor. The team list is re-read every time so changes apply immediately. */
export async function resolveActorFromSessionCookie(
  cookie: string | undefined,
  now: Date = new Date(),
): Promise<AdminActor | SessionFailure> {
  if (cookie === undefined || cookie.length === 0) return "unauthenticated";
  const claims = verifySessionToken(cookie, await getSessionSecret(), now.getTime());
  if (claims === null) return "unauthenticated";
  const email = normalizeEmail(claims.email);
  const [user, credential] = await Promise.all([getAdminUser(email), getCredential(email)]);
  if (credential !== null && credential.sessionsRevokedAt !== null && claims.issuedAt <= credential.sessionsRevokedAt) {
    return "unauthenticated";
  }
  if (user === null || !user.active) return "not_authorized";
  return { uid: email, email, role: user.role };
}

export const getAdminActor = cache(async (): Promise<AdminActor | SessionFailure> => {
  const store = await cookies();
  return resolveActorFromSessionCookie(store.get(SESSION_COOKIE)?.value);
});

/** For admin pages: redirects to the login page when there is no valid team session. */
export async function requireAdminPage(): Promise<AdminActor> {
  const result = await getAdminActor();
  if (result === "unauthenticated" || result === "invalid_credentials") redirect("/admin/login");
  if (result === "not_authorized") redirect("/admin/login?error=not_authorized");
  return result;
}

/** For Server Actions: throws AdminAuthError (never redirects) when not allowed. */
export async function requireAdminAction(permission: Permission): Promise<AdminActor> {
  const result = await getAdminActor();
  if (typeof result === "string") throw new AdminAuthError(result);
  if (!can(result.role, permission)) throw new AdminAuthError("not_authorized");
  return result;
}

/** Ends every session this person holds, on every device, from this instant. */
export async function revokeSessions(uid: string): Promise<void> {
  await revokeSessionsAt(uid, Date.now());
}
