import { describe, expect, it } from "vitest";
import { LOGIN_ERROR_MESSAGES, loginErrorFromResponse, parseLoginErrorParam } from "@/lib/admin/login-errors";

describe("login errors", () => {
  it("maps the session route's responses to friendly categories", () => {
    expect(loginErrorFromResponse(403, "not_authorized")).toBe("not_authorized");
    expect(loginErrorFromResponse(403, null)).toBe("not_authorized");
    expect(loginErrorFromResponse(401, "invalid_credentials")).toBe("invalid_credentials");
    expect(loginErrorFromResponse(401, "sign_in_failed")).toBe("sign_in_failed");
    expect(loginErrorFromResponse(401, null)).toBe("sign_in_failed");
    expect(loginErrorFromResponse(429, "too_many_attempts")).toBe("too_many_attempts");
    expect(loginErrorFromResponse(500, null)).toBe("sign_in_failed");
    expect(loginErrorFromResponse(400, "bad_request")).toBe("sign_in_failed");
  });

  it("only accepts known URL error parameters", () => {
    expect(parseLoginErrorParam("not_authorized")).toBe("not_authorized");
    expect(parseLoginErrorParam("invalid_credentials")).toBeNull();
    expect(parseLoginErrorParam("<script>")).toBeNull();
    expect(parseLoginErrorParam(undefined)).toBeNull();
  });

  it("has sanitised copy for every error", () => {
    expect(LOGIN_ERROR_MESSAGES.not_authorized).toBe(
      "This account doesn't have access to the Bueno back office. Ask an admin to add you.",
    );
    expect(Object.keys(LOGIN_ERROR_MESSAGES).sort()).toEqual(["invalid_credentials", "not_authorized", "sign_in_failed", "too_many_attempts"]);
  });
});
