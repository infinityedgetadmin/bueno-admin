import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/admin/packages/coastal-escape" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/lib/admin/actions/auth", () => ({ signOutAction: vi.fn() }));

import AdminShell, { isActivePath } from "@/components/admin/AdminShell";

describe("AdminShell", () => {
  beforeEach(() => {
    pathname.current = "/admin/packages/coastal-escape";
  });

  it("marks the current section and shows the signed-in person", () => {
    render(
      <AdminShell actor={{ email: "owner@bueno.example.com", role: "admin" }}>
        <p>Page body</p>
      </AdminShell>,
    );
    expect(screen.getByRole("link", { name: "Packages" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("owner@bueno.example.com")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText("Page body")).toBeInTheDocument();
  });

  it("hides team management from editors and viewers", () => {
    const viewer = render(
      <AdminShell actor={{ email: "viewer@bueno.example.com", role: "viewer" }}>
        <p>Body</p>
      </AdminShell>,
    );
    expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
    viewer.unmount();

    render(
      <AdminShell actor={{ email: "editor@bueno.example.com", role: "editor" }}>
        <p>Body</p>
      </AdminShell>,
    );
    expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
  });

  it("opens and closes the mobile navigation", async () => {
    render(
      <AdminShell actor={{ email: "a@b.example.com", role: "editor" }}>
        <p>Body</p>
      </AdminShell>,
    );
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close navigation", expanded: true })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Close navigation" })[1]);
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the mobile navigation after a route change", async () => {
    const { rerender } = render(
      <AdminShell actor={{ email: "a@b.example.com", role: "editor" }}>
        <p>Body</p>
      </AdminShell>,
    );
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close navigation", expanded: true })).toBeInTheDocument();

    pathname.current = "/admin/seasons";
    rerender(
      <AdminShell actor={{ email: "a@b.example.com", role: "editor" }}>
        <p>Body</p>
      </AdminShell>,
    );

    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
  });

  it("matches nested routes but keeps Overview exact", () => {
    expect(isActivePath("/admin", "/admin")).toBe(true);
    expect(isActivePath("/admin/packages", "/admin")).toBe(false);
    expect(isActivePath("/admin/packages/x", "/admin/packages")).toBe(true);
    expect(isActivePath("/admin/packagesx", "/admin/packages")).toBe(false);
  });
});
