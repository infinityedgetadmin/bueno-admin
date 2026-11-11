import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import ConsoleError from "@/app/(admin)/admin/(console)/error";
import AdminError from "@/app/(admin)/admin/error";

const boundaries = [
  { name: "the console boundary (inside the shell)", Boundary: ConsoleError },
  { name: "the admin boundary (around the console layout)", Boundary: AdminError },
];

function failure(): Error & { digest?: string } {
  return Object.assign(new Error("7 PERMISSION_DENIED: projects/example-project/databases/(default)/documents/cms"), {
    digest: "3141592653",
  });
}

describe.each(boundaries)("$name", ({ Boundary }) => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("shows friendly, branded copy and never the error's message or digest", () => {
    render(<Boundary error={failure()} unstable_retry={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Something went wrong", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This page couldn't load. It's usually temporary, so please try again.");
    expect(screen.getByText("Back Office")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("PERMISSION_DENIED");
    expect(document.body).not.toHaveTextContent("example-project");
    expect(document.body).not.toHaveTextContent("3141592653");
  });

  it("tries again through Next's retry (refetch and reset) when asked", async () => {
    const retry = vi.fn();
    render(<Boundary error={failure()} unstable_retry={retry} />);
    expect(retry).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("links back to sign-in", () => {
    render(<Boundary error={failure()} unstable_retry={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/admin/login");
  });

  it("logs the raw error to the console for debugging", () => {
    const error = failure();
    render(<Boundary error={error} unstable_retry={vi.fn()} />);
    expect(consoleError).toHaveBeenCalledWith("Back-office page failed to render", error);
  });
});

describe("boundary placement", () => {
  it("renders the full-page variant as the page's main landmark and the console variant inside the shell's", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const full = render(<AdminError error={failure()} unstable_retry={vi.fn()} />);
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { name: "Something went wrong" }));
    full.unmount();

    render(<ConsoleError error={failure()} unstable_retry={vi.fn()} />);
    expect(screen.queryByRole("main")).toBeNull();
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
