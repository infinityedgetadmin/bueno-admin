import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addTeamMemberAction = vi.hoisted(() => vi.fn());
const updateTeamMemberAction = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/actions/team", () => ({ addTeamMemberAction, updateTeamMemberAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import TeamManager from "@/components/admin/team/TeamManager";
import { MESSAGES, invalid, succeed } from "@/lib/admin/action-result";

const members = [
  { email: "owner@bueno.example.com", role: "admin" as const, active: true, lastSignIn: "24 Sept 2026, 09:00 EAT" },
  { email: "editor@bueno.example.com", role: "editor" as const, active: true, lastSignIn: "Never" },
];

describe("TeamManager", () => {
  beforeEach(() => {
    addTeamMemberAction.mockReset();
    updateTeamMemberAction.mockReset();
    refresh.mockReset();
  });

  it("adds a person with a role and a temporary password", async () => {
    addTeamMemberAction.mockResolvedValue(succeed(null, "new@bueno.example.com can now sign in as Viewer."));
    render(<TeamManager currentEmail="owner@bueno.example.com" members={members} />);
    await userEvent.type(screen.getByLabelText("Email"), "new@bueno.example.com");
    await userEvent.type(screen.getByLabelText("Temporary password"), "welcome-to-bueno-1");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "viewer");
    await userEvent.click(screen.getByRole("button", { name: "Give access" }));
    expect(addTeamMemberAction).toHaveBeenCalledWith({ email: "new@bueno.example.com", role: "viewer", password: "welcome-to-bueno-1" });
    expect(await screen.findByText("new@bueno.example.com can now sign in as Viewer.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Temporary password")).toHaveValue("");
    expect(refresh).toHaveBeenCalled();
  });

  it("never shows the password being typed", () => {
    render(<TeamManager currentEmail="owner@bueno.example.com" members={members} />);
    const field = screen.getByLabelText("Temporary password");
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("autocomplete", "new-password");
    expect(field).toHaveAccessibleDescription(/At least 10 characters/);
  });

  it("shows validation errors when adding, on the field they belong to", async () => {
    addTeamMemberAction.mockResolvedValueOnce(invalid({ email: "This person already has access." }, MESSAGES.fixFields));
    render(<TeamManager currentEmail="owner@bueno.example.com" members={members} />);
    await userEvent.type(screen.getByLabelText("Email"), "editor@bueno.example.com");
    await userEvent.type(screen.getByLabelText("Temporary password"), "welcome-to-bueno-1");
    await userEvent.click(screen.getByRole("button", { name: "Give access" }));
    expect(await screen.findByText("This person already has access.")).toBeInTheDocument();
    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(emailInput).toHaveAccessibleDescription("This person already has access.");
    expect(screen.getByLabelText("Role")).toHaveAccessibleDescription(
      "Prices, seasons, promotions, currency and what the website shows",
    );
    expect(screen.queryByText(MESSAGES.fixFields)).toBeNull();

    addTeamMemberAction.mockResolvedValueOnce(invalid({ password: "Use at least 10 characters." }, MESSAGES.fixFields));
    await userEvent.type(screen.getByLabelText("Temporary password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Give access" }));
    expect(await screen.findByText("Use at least 10 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("Temporary password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(MESSAGES.fixFields)).toBeNull();
  });

  it("shows a form-level failure when adding", async () => {
    addTeamMemberAction.mockResolvedValue(invalid({ form: "You no longer have permission to manage the team." }, "You no longer have permission to manage the team."));
    render(<TeamManager currentEmail="owner@bueno.example.com" members={members} />);
    await userEvent.type(screen.getByLabelText("Email"), "new@bueno.example.com");
    await userEvent.type(screen.getByLabelText("Temporary password"), "welcome-to-bueno-1");
    await userEvent.click(screen.getByRole("button", { name: "Give access" }));
    expect(await screen.findByText("You no longer have permission to manage the team.")).toBeInTheDocument();
  });

  it("changes a role immediately", async () => {
    updateTeamMemberAction.mockResolvedValue(succeed(null, "Access updated for editor@bueno.example.com."));
    render(<TeamManager currentEmail="owner@bueno.example.com" members={members} />);
    await userEvent.selectOptions(screen.getByLabelText("Role for editor@bueno.example.com"), "admin");
    expect(updateTeamMemberAction).toHaveBeenCalledWith({ email: "editor@bueno.example.com", role: "admin", active: true });
  });

  it("confirms before removing access", async () => {
    updateTeamMemberAction.mockResolvedValue(succeed(null, "editor@bueno.example.com can no longer sign in."));
    render(<TeamManager currentEmail="owner@bueno.example.com" members={members} />);
    await userEvent.click(screen.getByRole("switch", { name: /Access for editor@bueno.example.com/ }));
    const dialog = screen.getByRole("alertdialog", { name: "Remove access for editor@bueno.example.com?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove access" }));
    expect(updateTeamMemberAction).toHaveBeenCalledWith({ email: "editor@bueno.example.com", role: "editor", active: false });
  });

  it("does not let you change your own access", () => {
    render(<TeamManager currentEmail="owner@bueno.example.com" members={members} />);
    expect(screen.getByLabelText("Role for owner@bueno.example.com")).toBeDisabled();
    expect(screen.getByRole("switch", { name: /Access for owner@bueno.example.com/ })).toBeDisabled();
    expect(screen.getByText("You")).toBeInTheDocument();
  });
});
