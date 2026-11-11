import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveCurrencyAction = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/actions/currency", () => ({ saveCurrencyAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import CurrencySettingsForm from "@/components/admin/settings/CurrencySettingsForm";
import { MESSAGES, invalid, needsConfirmation, succeed } from "@/lib/admin/action-result";

const samples = [{ title: "Coastal Escape", usd: 2800 }];

describe("CurrencySettingsForm", () => {
  beforeEach(() => {
    saveCurrencyAction.mockReset();
    refresh.mockReset();
  });

  it("warns when no rate has been set and previews conversions as you type", async () => {
    render(<CurrencySettingsForm initial={null} samples={samples} lastUpdated={null} canEdit />);
    expect(screen.getByText(/No exchange rate yet/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Shillings per US dollar"), "129.5");
    expect(screen.getByTestId("conversion-preview")).toHaveTextContent("Coastal Escape$2,800 → KSh 362,500");
    expect(screen.getByTestId("conversion-preview")).toHaveTextContent("KSh 58,000 → $448");
  });

  it("hides the preview for an invalid rate", async () => {
    render(<CurrencySettingsForm initial={null} samples={samples} lastUpdated={null} canEdit />);
    await userEvent.type(screen.getByLabelText("Shillings per US dollar"), "12");
    expect(screen.queryByTestId("conversion-preview")).toBeNull();
    expect(screen.getByText("Enter a rate between 50 and 500 to preview conversions.")).toBeInTheDocument();
  });

  it("links rate and rounding errors to their controls", async () => {
    saveCurrencyAction.mockResolvedValue(
      invalid(
        { rate: "Enter a rate between 50 and 500 shillings per dollar.", "roundingStep.KES": "Choose a shilling rounding step." },
        MESSAGES.fixFields,
      ),
    );
    render(<CurrencySettingsForm initial={null} samples={samples} lastUpdated={null} canEdit />);
    const rate = screen.getByLabelText("Shillings per US dollar");
    expect(rate).not.toHaveAttribute("aria-invalid");
    expect(rate).toHaveAccessibleDescription(/How many Kenyan shillings one US dollar buys/);
    await userEvent.type(rate, "12");
    await userEvent.click(screen.getByRole("button", { name: "Save exchange rate" }));
    await waitFor(() => expect(rate).toHaveAttribute("aria-invalid", "true"));
    expect(rate).toHaveAccessibleDescription("Enter a rate between 50 and 500 shillings per dollar.");
    const kesStep = screen.getByLabelText("Round shilling prices to");
    expect(kesStep).toHaveAttribute("aria-invalid", "true");
    expect(kesStep).toHaveAccessibleDescription("Choose a shilling rounding step.");
    expect(screen.getByLabelText("Round dollar prices to")).not.toHaveAttribute("aria-invalid");
  });

  it("saves with confirmation for big changes", async () => {
    saveCurrencyAction
      .mockResolvedValueOnce(needsConfirmation([{ id: "W6", message: "The rate changes by 24% (KSh 129.5 → KSh 160 per dollar)." }]))
      .mockResolvedValueOnce(succeed({ version: 4 }, MESSAGES.savedLive));
    render(
      <CurrencySettingsForm
        initial={{ rate: "129.5", roundingStep: { USD: 1, KES: 500 }, version: 3 }}
        samples={samples}
        lastUpdated={{ when: "20 Sept 2026, 11:00 EAT", who: "owner@bueno.example.com", daysAgo: 4 }}
        canEdit
      />,
    );
    expect(screen.getByText(/Last updated 20 Sept 2026, 11:00 EAT by owner@bueno.example.com/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Shillings per US dollar"));
    await userEvent.type(screen.getByLabelText("Shillings per US dollar"), "160");
    await userEvent.selectOptions(screen.getByLabelText("Round shilling prices to"), "1000");
    await userEvent.click(screen.getByRole("button", { name: "Save exchange rate" }));
    expect(saveCurrencyAction).toHaveBeenCalledWith({ expectedVersion: 3, rate: "160", roundingStep: { USD: 1, KES: 1000 }, confirmed: false });

    // A result can leave the confirm button disabled for a tick while isPending settles — wait
    // for it to be interactive before clicking, rather than assuming it is the instant it appears.
    const saveAnywayButton = await screen.findByRole("button", { name: "Save anyway" });
    await waitFor(() => expect(saveAnywayButton).toBeEnabled());
    await userEvent.click(saveAnywayButton);
    await waitFor(() => expect(saveCurrencyAction).toHaveBeenLastCalledWith(expect.objectContaining({ confirmed: true })));
    expect(await screen.findByText(MESSAGES.savedLive)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("flags a stale rate and is read-only for viewers", () => {
    render(
      <CurrencySettingsForm
        initial={{ rate: "129.5", roundingStep: { USD: 1, KES: 500 }, version: 3 }}
        samples={samples}
        lastUpdated={{ when: "1 Jul 2026, 09:00 EAT", who: "owner@bueno.example.com", daysAgo: 85 }}
        canEdit={false}
      />,
    );
    expect(screen.getByText(/last updated 85 days ago/)).toBeInTheDocument();
    expect(screen.getByLabelText("Shillings per US dollar")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save exchange rate" })).toBeNull();
  });
});
