import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveSeasonAction = vi.hoisted(() => vi.fn());
const deleteSeasonAction = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/actions/seasons", () => ({ saveSeasonAction, deleteSeasonAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import SeasonsManager from "@/components/admin/seasons/SeasonsManager";
import { MESSAGES, invalid, succeed } from "@/lib/admin/action-result";

const rows = [
  { id: "s1", name: "Festive peak", startDate: "2026-12-15", endDate: "2027-01-05", version: 3, status: "upcoming" as const, packagesPriced: 2 },
  { id: "s0", name: "August", startDate: "2026-08-01", endDate: "2026-08-31", version: 1, status: "ended" as const, packagesPriced: 0 },
];

describe("SeasonsManager", () => {
  beforeEach(() => {
    saveSeasonAction.mockReset();
    deleteSeasonAction.mockReset();
    refresh.mockReset();
  });

  it("lists current/upcoming and ended seasons", () => {
    render(<SeasonsManager seasons={rows} today="2026-09-24" canEdit />);
    expect(screen.getByText("Festive peak")).toBeInTheDocument();
    expect(screen.getByText(/Custom prices on 2 packages/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ended" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit August" })).toBeNull();
    expect(screen.getByRole("img", { name: /Season calendar: Festive peak/ })).toBeInTheDocument();
  });

  it("creates a season", async () => {
    saveSeasonAction.mockResolvedValue(succeed({ id: "s2" }, "Season created."));
    render(<SeasonsManager seasons={rows} today="2026-09-24" canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "New season" }));
    await userEvent.type(screen.getByLabelText("Name"), "Long rains 2027");
    await userEvent.type(screen.getByLabelText("First travel date"), "2027-04-01");
    await userEvent.type(screen.getByLabelText("Last travel date"), "2027-06-15");
    await userEvent.click(screen.getByRole("button", { name: "Create season" }));
    expect(saveSeasonAction).toHaveBeenCalledWith({
      id: null,
      expectedVersion: 0,
      name: "Long rains 2027",
      startDate: "2027-04-01",
      endDate: "2027-06-15",
    });
    expect(await screen.findByText("Season created.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("edits with the current version and shows validation errors", async () => {
    saveSeasonAction.mockResolvedValue(invalid({ dates: "Overlaps with “Festive peak” (15 Dec 2026 – 5 Jan 2027)." }, MESSAGES.fixFields));
    render(<SeasonsManager seasons={rows} today="2026-09-24" canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Festive peak" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Festive peak");
    await userEvent.click(screen.getByRole("button", { name: "Save season" }));
    expect(saveSeasonAction).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", expectedVersion: 3 }));
    expect(await screen.findByText("Overlaps with “Festive peak” (15 Dec 2026 – 5 Jan 2027).")).toBeInTheDocument();
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancelButton).toBeEnabled());
    await userEvent.click(cancelButton);
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("links a field error to its input", async () => {
    saveSeasonAction.mockResolvedValue(invalid({ name: "Name must be 2–40 characters." }, MESSAGES.fixFields));
    render(<SeasonsManager seasons={rows} today="2026-09-24" canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "New season" }));
    const name = screen.getByLabelText("Name");
    expect(name).toHaveAccessibleDescription("For example “Festive peak 2026”.");
    await userEvent.click(screen.getByRole("button", { name: "Create season" }));
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    expect(name).toHaveAccessibleDescription("Name must be 2–40 characters.");
    expect(screen.getByLabelText("First travel date")).not.toHaveAttribute("aria-invalid");
  });

  it("confirms before deleting and explains the impact", async () => {
    deleteSeasonAction.mockResolvedValue(succeed(null, "Season deleted."));
    render(<SeasonsManager seasons={rows} today="2026-09-24" canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Festive peak" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete “Festive peak”?" });
    expect(dialog).toHaveTextContent("Its custom prices will be removed from 2 packages.");
    await userEvent.click(screen.getByRole("button", { name: "Delete season" }));
    expect(deleteSeasonAction).toHaveBeenCalledWith({ id: "s1", expectedVersion: 3 });
    expect(await screen.findByText("Season deleted.")).toBeInTheDocument();
  });

  it("is read-only for viewers", () => {
    render(<SeasonsManager seasons={rows} today="2026-09-24" canEdit={false} />);
    expect(screen.queryByRole("button", { name: "New season" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });
});
