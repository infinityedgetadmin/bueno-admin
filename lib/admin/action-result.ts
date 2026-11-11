import type { FieldErrors, ValidationWarning } from "@/lib/pricing/types";

export type ActionFailureKind = "conflict" | "auth" | "error";

export type ActionResult<T> =
  | { ok: true; data: T; message: string }
  | { ok: false; kind: "validation"; fieldErrors: FieldErrors; formError: string | null }
  | { ok: false; kind: "confirm"; warnings: ValidationWarning[] }
  | { ok: false; kind: ActionFailureKind; formError: string };

/** Every user-facing message a Server Action can return. Raw errors never reach the UI. */
export const MESSAGES = {
  generic: "Something went wrong and nothing was saved. Please try again.",
  conflict:
    "Someone else changed this while you were editing. Reload the page to see the latest version, then make your change again.",
  sessionExpired: "Your session has expired. Sign in again to continue.",
  forbidden: "You don't have permission to do that.",
  invalidRequest: "Something about this form didn't look right. Reload the page and try again.",
  fixFields: "Please fix the highlighted fields.",
  savedLive: "Saved. The website updates within about a minute.",
} as const;

export function succeed<T>(data: T, message: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function invalid<T>(fieldErrors: FieldErrors, formError: string | null = null): ActionResult<T> {
  return { ok: false, kind: "validation", fieldErrors, formError };
}

export function needsConfirmation<T>(warnings: ValidationWarning[]): ActionResult<T> {
  return { ok: false, kind: "confirm", warnings };
}

export function fail<T>(kind: ActionFailureKind, formError: string): ActionResult<T> {
  return { ok: false, kind, formError };
}

/** The message to show for a failed result (null for success, pending confirmation, or no result). */
export function resultErrorMessage<T>(result: ActionResult<T> | null): string | null {
  if (result === null || result.ok || result.kind === "confirm") return null;
  if (result.kind === "validation") return result.formError ?? MESSAGES.fixFields;
  return result.formError;
}
