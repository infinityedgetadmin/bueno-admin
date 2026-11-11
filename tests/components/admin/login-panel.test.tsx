import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPanel from "@/components/admin/LoginPanel";

const fetchMock = vi.fn<typeof fetch>();

async function fillAndSubmit(email = "owner@bueno.example.com", password = "owner-password-1") {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the email and password and navigates on success", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const navigate = vi.fn();
    render(<LoginPanel next="/admin/packages" initialError={null} navigate={navigate} />);
    await fillAndSubmit("Owner@bueno.example.com", "owner-password-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "Owner@bueno.example.com", password: "owner-password-1" }),
        credentials: "same-origin",
      }),
    );
    expect(navigate).toHaveBeenCalledWith("/admin/packages");
  });

  it("explains a wrong email or password and clears the password field", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "invalid_credentials" }), { status: 401 }));
    render(<LoginPanel next="/admin" initialError={null} navigate={vi.fn()} />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("That email and password don't match.");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("owner@bueno.example.com");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("explains when the account is not on the team", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "not_authorized" }), { status: 403 }));
    render(<LoginPanel next="/admin" initialError={null} navigate={vi.fn()} />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't have access to the Bueno back office");
  });

  it("shows a generic message for other server failures, including non-JSON bodies", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 500 }));
    render(<LoginPanel next="/admin" initialError={null} navigate={vi.fn()} />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't sign you in. Please try again.");
    expect(screen.queryByText(/oops/)).toBeNull();
  });

  it("logs network failures and shows sanitised copy", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockRejectedValue(new Error("boom: internal detail"));
    render(<LoginPanel next="/admin" initialError={null} navigate={vi.fn()} />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't sign you in. Please try again.");
    expect(screen.queryByText(/internal detail/)).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("shows an error passed in the URL until the next attempt", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<LoginPanel next="/admin" initialError="not_authorized" navigate={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ask an admin to add you.");
    await fillAndSubmit();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses password-manager-friendly fields", () => {
    render(<LoginPanel next="/admin" initialError={null} navigate={vi.fn()} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });
});

describe("LoginPanel throttling", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tells the person to wait when sign-in is temporarily locked", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "too_many_attempts" }), { status: 429 }));
    render(<LoginPanel next="/admin" initialError={null} navigate={vi.fn()} />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many failed attempts. Wait 15 minutes, then try again.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
