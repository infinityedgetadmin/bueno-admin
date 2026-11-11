export type LoginError = "not_authorized" | "invalid_credentials" | "sign_in_failed";

export const LOGIN_ERROR_MESSAGES: Readonly<Record<LoginError, string>> = {
  not_authorized: "This account doesn't have access to the Bueno back office. Ask an admin to add you.",
  invalid_credentials: "That email and password don't match. Check them and try again.",
  sign_in_failed: "We couldn't sign you in. Please try again.",
};

/** Maps the session route's response to the message to show. */
export function loginErrorFromResponse(status: number, code: string | null): LoginError {
  if (status === 403) return "not_authorized";
  if (status === 401 && code === "invalid_credentials") return "invalid_credentials";
  return "sign_in_failed";
}

export function parseLoginErrorParam(value: string | undefined): LoginError | null {
  return value === "not_authorized" ? "not_authorized" : null;
}
