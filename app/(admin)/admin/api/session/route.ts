import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/admin/origin";
import { AdminAuthError, signInWithPassword } from "@/lib/admin/session";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, SESSION_PATH } from "@/lib/admin/session-constants";
import { clientAddress, recordSignInSuccess, reserveSignInAttempt } from "@/lib/admin/sign-in-throttle";
import { writeAudit } from "@/lib/cms/audit";
import { logError } from "@/lib/logger";
import { sessionRequestSchema } from "@/lib/pricing/schemas";

function failure(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return failure(403, "forbidden");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(400, "bad_request");
  }
  const parsed = sessionRequestSchema.safeParse(body);
  if (!parsed.success) return failure(400, "bad_request");

  const now = new Date();
  const subject = { email: parsed.data.email, address: clientAddress(request.headers) };
  // Counted before the password is checked, so parallel requests cannot outrun the limit;
  // a successful sign-in refunds it below.
  const retryAfterMs = reserveSignInAttempt(subject, now.getTime());
  if (retryAfterMs > 0) {
    const response = failure(429, "too_many_attempts");
    response.headers.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return response;
  }

  try {
    const { cookie, actor } = await signInWithPassword(parsed.data, now);
    recordSignInSuccess(subject);
    await writeAudit({
      draft: {
        action: "auth.sign_in",
        entity: { type: "auth", id: actor.email },
        summary: `${actor.email} signed in`,
        before: null,
        after: null,
      },
      actor,
      now: now.toISOString(),
    }).catch((error: unknown) => logError("admin.session.audit", error));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: SESSION_PATH,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    if (error instanceof AdminAuthError) {
      if (error.reason === "not_authorized") return failure(403, "not_authorized");
      if (error.reason === "invalid_credentials") return failure(401, "invalid_credentials");
      return failure(401, "sign_in_failed");
    }
    logError("admin.session.create", error);
    return failure(401, "sign_in_failed");
  }
}
