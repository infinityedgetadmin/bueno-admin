import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Recognisable signal thrown by the mocked `redirect()`, carrying the target URL. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

const mocks = vi.hoisted(() => ({
  getAdminActor: vi.fn(),
  logError: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminActor: mocks.getAdminActor }));
vi.mock("@/lib/logger", () => ({ logError: mocks.logError }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import LoginPage from "@/app/(admin)/admin/login/page";

function params(values: Record<string, string>) {
  return { searchParams: Promise.resolve(values) };
}

describe("LoginPage", () => {
  beforeEach(() => {
    mocks.getAdminActor.mockReset();
    mocks.logError.mockReset();
    mocks.redirect.mockReset().mockImplementation((url: string) => {
      throw new RedirectSignal(url);
    });
  });

  it("still shows the sign-in panel when the session check fails, and logs why", async () => {
    const outage = new Error("EACCES: permission denied, open 'team.json'");
    mocks.getAdminActor.mockRejectedValue(outage);
    render(await LoginPage(params({ next: "/admin/packages" })));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(mocks.logError).toHaveBeenCalledWith("admin.login.session_check", outage);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent("EACCES");
  });

  it("sends someone already signed in on to the page they asked for", async () => {
    mocks.getAdminActor.mockResolvedValue({ uid: "owner@bueno.example.com", email: "owner@bueno.example.com", role: "admin" });
    await expect(LoginPage(params({ next: "/admin/packages" }))).rejects.toEqual(new RedirectSignal("/admin/packages"));
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/packages");
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("shows the panel to a signed-out visitor, with the not-on-the-team message when asked", async () => {
    mocks.getAdminActor.mockResolvedValue("not_authorized");
    render(await LoginPage(params({ error: "not_authorized" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Ask an admin to add you.");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});
