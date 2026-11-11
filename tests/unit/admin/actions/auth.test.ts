import { beforeEach, describe, expect, it, vi } from "vitest";
import { signOutAction } from "@/lib/admin/actions/auth";
import { SESSION_COOKIE, SESSION_PATH } from "@/lib/admin/session-constants";

/** Recognisable signal thrown by the mocked `redirect()`, carrying the target URL. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

const cookiesSetMock = vi.hoisted(() => vi.fn());
const cookiesMock = vi.hoisted(() => vi.fn(async () => ({ set: cookiesSetMock })));
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
);
const getAdminActorMock = vi.hoisted(() => vi.fn());
const revokeSessionsMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/admin/session", () => ({ getAdminActor: getAdminActorMock, revokeSessions: revokeSessionsMock }));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));

function expectCookieCleared() {
  expect(cookiesSetMock).toHaveBeenCalledWith(
    SESSION_COOKIE,
    "",
    expect.objectContaining({
      httpOnly: true,
      sameSite: "lax",
      path: SESSION_PATH,
      maxAge: 0,
    }),
  );
}

describe("signOutAction", () => {
  beforeEach(() => {
    getAdminActorMock.mockReset();
    revokeSessionsMock.mockReset();
  });

  it("revokes the session, clears the cookie and redirects to the login page", async () => {
    getAdminActorMock.mockResolvedValue({ uid: "u-1", email: "owner@bueno-test.example.com", role: "admin" });
    revokeSessionsMock.mockResolvedValue(undefined);

    await expect(signOutAction()).rejects.toBeInstanceOf(RedirectSignal);

    expect(revokeSessionsMock).toHaveBeenCalledWith("u-1");
    expect(logErrorMock).not.toHaveBeenCalled();
    expectCookieCleared();
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });

  it("clears the cookie and redirects even when revokeSessions rejects", async () => {
    getAdminActorMock.mockResolvedValue({ uid: "u-2", email: "owner@bueno-test.example.com", role: "admin" });
    revokeSessionsMock.mockRejectedValue(new Error("revoke failed"));

    await expect(signOutAction()).rejects.toBeInstanceOf(RedirectSignal);

    expect(logErrorMock).toHaveBeenCalledWith("admin.sign_out.revoke", expect.any(Error));
    expectCookieCleared();
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });

  it("clears the cookie and redirects even when getAdminActor rejects (data folder unreadable)", async () => {
    getAdminActorMock.mockRejectedValue(new Error("EACCES: permission denied"));

    await expect(signOutAction()).rejects.toBeInstanceOf(RedirectSignal);

    expect(revokeSessionsMock).not.toHaveBeenCalled();
    expect(logErrorMock).toHaveBeenCalledWith("admin.sign_out.revoke", expect.any(Error));
    expectCookieCleared();
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });

  it("does not revoke for an unauthenticated actor, but still clears the cookie and redirects", async () => {
    getAdminActorMock.mockResolvedValue("unauthenticated");

    await expect(signOutAction()).rejects.toBeInstanceOf(RedirectSignal);

    expect(revokeSessionsMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
    expectCookieCleared();
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });
});
