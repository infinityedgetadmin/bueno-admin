import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const savePromotionAction = vi.hoisted(() => vi.fn());
const setPromotionPausedAction = vi.hoisted(() => vi.fn());
const deletePromotionAction = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/actions/promotions", () => ({ savePromotionAction, setPromotionPausedAction, deletePromotionAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import PromotionsManager from "@/components/admin/promotions/PromotionsManager";
import { MESSAGES, invalid, needsConfirmation, succeed } from "@/lib/admin/action-result";

const packages = [
  { slug: "coastal-escape", title: "Coastal Escape" },
  { slug: "safari-honeymoon", title: "Safari Honeymoon" },
];
const previewRows = [
  { slug: "coastal-escape", title: "Coastal Escape", prices: { USD: { amount: 2800, step: 1 } } },
  { slug: "safari-honeymoon", title: "Safari Honeymoon", prices: { USD: { amount: 5200, step: 1 } } },
];
const live = {
  id: "p1",
  name: "Early bird Q4",
  label: "Early Bird",
  percentOff: 15,
  startDate: "2026-09-01",
  endDate: "2026-10-31",
  appliesTo: { kind: "all" as const },
  paused: false,
  terms: "Book by 31 Oct.",
  version: 2,
  status: "live" as const,
};

function renderManager(canEdit = true) {
  render(<PromotionsManager promotions={[live]} packages={packages} previewRows={previewRows} today="2026-09-24" canEdit={canEdit} />);
}

describe("PromotionsManager", () => {
  beforeEach(() => {
    savePromotionAction.mockReset();
    setPromotionPausedAction.mockReset();
    deletePromotionAction.mockReset();
    refresh.mockReset();
  });

  it("lists promotions by status with their details", () => {
    renderManager();
    expect(screen.getByRole("heading", { name: "Live" })).toBeInTheDocument();
    expect(screen.getByText("Early bird Q4")).toBeInTheDocument();
    expect(screen.getByText(/15% off · 1 Sep – 31 Oct 2026 · All packages/)).toBeInTheDocument();
    expect(screen.getByText("Book by 31 Oct.")).toBeInTheDocument();
  });

  it("creates a promotion for selected packages with a live preview", async () => {
    savePromotionAction.mockResolvedValue(succeed({ id: "p2" }, "Promotion created."));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "New promotion" }));
    await userEvent.type(screen.getByLabelText("Internal name"), "Honeymoon flash sale");
    await userEvent.type(screen.getByLabelText("Badge text"), "Flash Sale");
    await userEvent.type(screen.getByLabelText("Discount (%)"), "20");
    await userEvent.type(screen.getByLabelText("Show from"), "2026-09-24");
    await userEvent.type(screen.getByLabelText("Show until"), "2026-10-15");
    await userEvent.click(screen.getByRole("radio", { name: "Selected packages" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Safari Honeymoon" }));
    expect(screen.getByTestId("promotion-preview")).toHaveTextContent("Safari Honeymoon$5,200 → $4,160");
    await userEvent.click(screen.getByRole("button", { name: "Create promotion" }));
    expect(savePromotionAction).toHaveBeenCalledWith({
      id: null,
      expectedVersion: 0,
      confirmed: false,
      name: "Honeymoon flash sale",
      label: "Flash Sale",
      percentOff: 20,
      startDate: "2026-09-24",
      endDate: "2026-10-15",
      appliesTo: { kind: "packages", slugs: ["safari-honeymoon"] },
      terms: "",
    });
    expect(await screen.findByText("Promotion created.")).toBeInTheDocument();
  });

  it("shows field errors and handles the confirmation step", async () => {
    savePromotionAction
      .mockResolvedValueOnce(invalid({ percentOff: "Enter a whole percentage from 1 to 90." }, MESSAGES.fixFields))
      .mockResolvedValueOnce(needsConfirmation([{ id: "W4", message: "This is a large discount (60% off)." }]))
      .mockResolvedValueOnce(succeed({ id: "p1" }, MESSAGES.savedLive));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "Edit Early bird Q4" }));
    await userEvent.click(screen.getByRole("button", { name: "Save promotion" }));
    expect(await screen.findByText("Enter a whole percentage from 1 to 90.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save promotion" }));
    expect(await screen.findByText("This is a large discount (60% off).")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    expect(savePromotionAction).toHaveBeenLastCalledWith(expect.objectContaining({ id: "p1", expectedVersion: 2, confirmed: true }));
  });

  it("links a server field error to its input for assistive tech", async () => {
    savePromotionAction.mockResolvedValue(invalid({ percentOff: "Enter a whole percentage from 1 to 90." }, MESSAGES.fixFields));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "New promotion" }));
    const percent = screen.getByLabelText("Discount (%)");
    expect(percent).not.toHaveAttribute("aria-invalid");
    expect(percent).toHaveAccessibleDescription("Whole number from 1 to 90.");
    await userEvent.click(screen.getByRole("button", { name: "Create promotion" }));
    await waitFor(() => expect(percent).toHaveAttribute("aria-invalid", "true"));
    expect(percent).toHaveAccessibleDescription("Enter a whole percentage from 1 to 90.");
    const fieldAlert = screen.getAllByRole("alert").find((element) => element.id === "promo-percent-error");
    expect(fieldAlert).toHaveTextContent("Enter a whole percentage from 1 to 90.");
    const name = screen.getByLabelText("Internal name");
    expect(name).not.toHaveAttribute("aria-invalid");
    expect(name).toHaveAccessibleDescription("Only the team sees this.");
  });

  it("links the applies-to error to its radio group and flags its members invalid", async () => {
    savePromotionAction.mockResolvedValue(invalid({ appliesTo: "Choose at least one package." }, MESSAGES.fixFields));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "New promotion" }));
    const group = screen.getByRole("radiogroup", { name: "Applies to" });
    expect(group).not.toHaveAttribute("aria-describedby");
    await userEvent.click(screen.getByRole("button", { name: "Create promotion" }));
    await waitFor(() => expect(group).toHaveAttribute("aria-describedby", "promo-scope-error"));
    expect(group).toHaveAccessibleDescription("Choose at least one package.");
    for (const radio of within(group).getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-invalid", "true");
    }
    const fieldAlert = screen.getAllByRole("alert").find((element) => element.id === "promo-scope-error");
    expect(fieldAlert).toHaveTextContent("Choose at least one package.");
  });

  it("links the terms counter to the textarea as part of its accessible description", async () => {
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "New promotion" }));
    const terms = screen.getByLabelText("Terms (optional)");
    expect(terms).toHaveAccessibleDescription(/0\/160/);
    await userEvent.type(terms, "Book by 31 Oct.");
    expect(terms).toHaveAccessibleDescription(/15\/160/);
  });

  it("does not update the live status region while typing under the limit", async () => {
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "New promotion" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");
    const terms = screen.getByLabelText("Terms (optional)");
    await userEvent.type(terms, "Book by 31 Oct.");
    expect(status).toHaveTextContent("");
  });

  it("announces once the terms text reaches the character limit", async () => {
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "New promotion" }));
    const terms = screen.getByLabelText("Terms (optional)");
    fireEvent.change(terms, { target: { value: "x".repeat(160) } });
    expect(terms).toHaveAccessibleDescription(/160\/160/);
    const status = screen.getByRole("status");
    expect(status).not.toHaveTextContent("");
    expect(status).toHaveTextContent(/160/);
  });

  it("opening the edit form with terms already at the limit stays silent", async () => {
    const atLimit = { ...live, terms: "x".repeat(160) };
    render(<PromotionsManager promotions={[atLimit]} packages={packages} previewRows={previewRows} today="2026-09-24" canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Early bird Q4" }));
    expect(screen.getByLabelText("Terms (optional)")).toHaveAccessibleDescription(/160\/160/);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("announces when terms are edited back up to the limit after dropping below it", async () => {
    const atLimit = { ...live, terms: "x".repeat(160) };
    render(<PromotionsManager promotions={[atLimit]} packages={packages} previewRows={previewRows} today="2026-09-24" canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Early bird Q4" }));
    const terms = screen.getByLabelText("Terms (optional)");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");
    fireEvent.change(terms, { target: { value: "x".repeat(159) } });
    expect(status).toHaveTextContent("");
    fireEvent.change(terms, { target: { value: "x".repeat(160) } });
    expect(status).not.toHaveTextContent("");
    expect(status).toHaveTextContent(/160/);
  });

  it("does not re-announce while typing stays at or above the limit", async () => {
    const belowLimit = { ...live, terms: "x".repeat(159) };
    render(<PromotionsManager promotions={[belowLimit]} packages={packages} previewRows={previewRows} today="2026-09-24" canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Early bird Q4" }));
    const terms = screen.getByLabelText("Terms (optional)");
    const status = screen.getByRole("status");
    fireEvent.change(terms, { target: { value: "x".repeat(160) } });
    const firstAnnouncement = status.textContent;
    expect(firstAnnouncement).not.toBe("");
    fireEvent.change(terms, { target: { value: "y".repeat(160) } });
    expect(status.textContent).toBe(firstAnnouncement);
  });

  it("switching to another promotion's edit form remounts it, so the switch itself does not announce", async () => {
    const belowLimit = { ...live, terms: "x".repeat(50) };
    const atLimit = { ...live, id: "p2", name: "Festive Deal", terms: "x".repeat(160) };
    render(
      <PromotionsManager promotions={[belowLimit, atLimit]} packages={packages} previewRows={previewRows} today="2026-09-24" canEdit />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit Early bird Q4" }));
    expect(screen.getByRole("status")).toHaveTextContent("");
    await userEvent.click(screen.getByRole("button", { name: "Edit Festive Deal" }));
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.getByLabelText("Terms (optional)")).toHaveAccessibleDescription(/160\/160/);
  });

  it("pauses and deletes", async () => {
    setPromotionPausedAction.mockResolvedValue(succeed(null, "Promotion paused."));
    deletePromotionAction.mockResolvedValue(succeed(null, "Promotion deleted."));
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "Pause Early bird Q4" }));
    expect(setPromotionPausedAction).toHaveBeenCalledWith({ id: "p1", expectedVersion: 2, paused: true });
    await userEvent.click(screen.getByRole("button", { name: "Delete Early bird Q4" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete “Early bird Q4”?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete promotion" }));
    expect(deletePromotionAction).toHaveBeenCalledWith({ id: "p1", expectedVersion: 2 });
  });

  it("is read-only for viewers", () => {
    renderManager(false);
    expect(screen.queryByRole("button", { name: "New promotion" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pause/ })).toBeNull();
  });
});
