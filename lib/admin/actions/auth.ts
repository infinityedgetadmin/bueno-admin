"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logError } from "@/lib/logger";
import { getAdminActor, revokeSessions } from "../session";
import { SESSION_COOKIE, SESSION_PATH } from "../session-constants";

export async function signOutAction(): Promise<void> {
  // Revocation (including looking up the actor) is best-effort: if the data folder can't be read,
  // the person must still be able to clear their cookie and land on the login page.
  try {
    const actor = await getAdminActor();
    if (typeof actor !== "string") await revokeSessions(actor.uid);
  } catch (error) {
    logError("admin.sign_out.revoke", error);
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: SESSION_PATH,
    maxAge: 0,
  });
  redirect("/admin/login");
}
