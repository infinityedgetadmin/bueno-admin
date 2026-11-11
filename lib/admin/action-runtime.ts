import "server-only";
import { logError } from "@/lib/logger";
import { EntityNotFoundError, VersionConflictError } from "@/lib/pricing/operations";
import { MESSAGES, fail, type ActionResult } from "./action-result";
import type { Permission } from "./permissions";
import { AdminAuthError, requireAdminAction } from "./session";
import type { AdminActor } from "./types";

/** Authenticates, authorises and runs a Server Action body, mapping every failure to safe copy. */
export async function runAdminAction<T>(
  options: { context: string; permission: Permission },
  handler: (actor: AdminActor) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  let actor: AdminActor;
  try {
    actor = await requireAdminAction(options.permission);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return fail("auth", error.reason === "unauthenticated" ? MESSAGES.sessionExpired : MESSAGES.forbidden);
    }
    logError(`${options.context}.auth`, error);
    return fail("error", MESSAGES.generic);
  }
  try {
    return await handler(actor);
  } catch (error) {
    if (error instanceof VersionConflictError || error instanceof EntityNotFoundError) {
      return fail("conflict", MESSAGES.conflict);
    }
    logError(options.context, error, { actor: actor.email });
    return fail("error", MESSAGES.generic);
  }
}
