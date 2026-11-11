import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginPanel from "@/components/admin/LoginPanel";
import { parseLoginErrorParam } from "@/lib/admin/login-errors";
import { getAdminActor } from "@/lib/admin/session";
import { safeAdminPath } from "@/lib/admin/session-rules";
import type { AdminActor } from "@/lib/admin/types";
import { logError } from "@/lib/logger";

export const metadata: Metadata = { title: "Sign in" };

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The session check here only lets an already-signed-in person skip this screen, so if it fails
 * (for example the data folder can't be read) the sign-in panel is shown rather than an error page.
 */
async function signedInActor(): Promise<AdminActor | null> {
  try {
    const actor = await getAdminActor();
    return typeof actor === "string" ? null : actor;
  } catch (error) {
    logError("admin.login.session_check", error);
    return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeAdminPath(firstValue(params.next));
  if ((await signedInActor()) !== null) redirect(next);
  return <LoginPanel next={next} initialError={parseLoginErrorParam(firstValue(params.error))} />;
}
