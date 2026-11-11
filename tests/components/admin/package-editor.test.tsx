import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const savePackageAction = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/actions/packages", () => ({ savePackageAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import PackageEditor from "@/components/admin/packages/PackageEditor";
import { MESSAGES, fail, invalid, needsConfirmation, succeed } from "@/lib/admin/action-result";
import { editableCommercial } from "@/lib/admin/package-form";
import { defaultPackageCommercial } from "@/lib/pricing/defaults";

const currency = {
  kesPerUsdE4: 1_295_000,
  roundingStep: { USD: 1 as const, KES: 500 as const },
  version: 1,
  updatedAt: "2026-09-20T08:00:00.000Z",
  updatedBy: "owner@bueno.example.com",
};
const season = { id: "s1", name: "Festive peak", startDate: "2026-12-15", endDate: "2027-01-05", version: 1 };

function renderEditor(overrides: Partial<React.ComponentProps<typeof PackageEditor>> = {}) {
  return render(
    <PackageEditor
      slug="coastal-escape"
      initial={defaultPackageCommercial(2800)}
      upcomingSeasons={[season]}
      currency={currency}
      seasons={[season]}
      promotions={[]}
      today="2026-09-24"
      featuredHolders={{ "2": "Safari Honeymoon" }}
      canEdit
      {...overrides}
    />,
  );
}

async function setUsdPrice(value: string) {
  const input = screen.getByLabelText("Standard price (USD)");
  await userEvent.clear(input);
  if (value !== "") await userEvent.type(input, value);
}

describe("PackageEditor", () => {
  beforeEach(() => {
    savePackageAction.mockReset();
    refresh.mockReset();
  });

  it("shows the current price and a live preview in both currencies", () => {
    renderEditor();
    expect(screen.getByLabelText("Standard price (USD)")).toHaveValue("2800");
    const preview = screen.getByTestId("price-preview");
    expect(preview).toHaveTextContent("International visitorsFrom $2,800");
    expect(preview).toHaveTextContent("Visitors in KenyaFrom KSh 362,500");
    expect(screen.getByText(/Converted from the dollar price at KSh 129.5 per dollar/)).toBeInTheDocument();
  });

  it("previews dollars for visitors in Kenya when the shilling conversion is over its limit", async () => {
    // KSh 500 per dollar: $300,000 is exactly KSh 150,000,000, the most the site shows.
    renderEditor({ currency: { ...currency, kesPerUsdE4: 5_000_000 } });
    await setUsdPrice("300000");
    expect(screen.getByTestId("price-preview")).toHaveTextContent("Visitors in KenyaFrom KSh 150,000,000");
    await setUsdPrice("300001");
    expect(screen.getByTestId("price-preview")).toHaveTextContent("International visitorsFrom $300,001");
    expect(screen.getByTestId("price-preview")).toHaveTextContent("Visitors in KenyaSees the dollar price");
  });

  it("saves a new price and refreshes the page data", async () => {
    savePackageAction.mockResolvedValue(succeed({ version: 1 }, MESSAGES.savedLive));
    renderEditor();
    await setUsdPrice("3000");
    expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(savePackageAction).toHaveBeenCalledWith({
      slug: "coastal-escape",
      expectedVersion: 0,
      confirmed: false,
      visible: true,
      display: "price",
      basis: null,
      currencies: { USD: "fixed", KES: "converted" },
      base: { USD: 3000, KES: null },
      seasonPrices: [],
      featuredRank: null,
    });
    expect(await screen.findByText(MESSAGES.savedLive)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("blocks amounts that are not whole numbers before calling the server", async () => {
    renderEditor();
    await setUsdPrice("12.5");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Use whole numbers only, like 4500.")).toBeInTheDocument();
    expect(savePackageAction).not.toHaveBeenCalled();
  });

  it("shows server field errors", async () => {
    savePackageAction.mockResolvedValue(invalid({ "base.USD": "Enter a US dollar price." }, MESSAGES.fixFields));
    renderEditor();
    await setUsdPrice("");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter a US dollar price.")).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.fixFields)).toBeInTheDocument();
  });

  it("links a server price error to the price input", async () => {
    savePackageAction.mockResolvedValue(invalid({ "base.USD": "Enter a US dollar price." }, MESSAGES.fixFields));
    renderEditor();
    await setUsdPrice("");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const input = screen.getByLabelText("Standard price (USD)");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveAccessibleDescription("Enter a US dollar price.");
  });

  it("announces a season-row error and links it to that season's switch", async () => {
    savePackageAction.mockResolvedValue(invalid({ "seasonPrices.s1": "This season is listed twice." }, MESSAGES.fixFields));
    renderEditor();
    const seasonSwitch = screen.getByRole("switch", { name: "Custom price for Festive peak" });
    expect(seasonSwitch).not.toHaveAttribute("aria-describedby");
    expect(seasonSwitch).not.toHaveAttribute("aria-invalid");
    await setUsdPrice("3000");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const rowError = await screen.findByText("This season is listed twice.");
    expect(rowError).toHaveAttribute("id", "season-s1-error");
    expect(rowError).toHaveAttribute("role", "alert");
    expect(seasonSwitch).toHaveAttribute("aria-invalid", "true");
    expect(seasonSwitch).toHaveAccessibleDescription("This season is listed twice.");
  });

  it("asks for confirmation and resubmits with confirmed: true", async () => {
    savePackageAction
      .mockResolvedValueOnce(needsConfirmation([{ id: "W1", message: "The dollar base price changes by 221%." }]))
      .mockResolvedValueOnce(succeed({ version: 1 }, MESSAGES.savedLive));
    renderEditor();
    await setUsdPrice("9000");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("The dollar base price changes by 221%.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save anyway" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(savePackageAction).toHaveBeenLastCalledWith(expect.objectContaining({ confirmed: true })));
  });

  it("sends custom season prices", async () => {
    savePackageAction.mockResolvedValue(succeed({ version: 1 }, MESSAGES.savedLive));
    renderEditor();
    await userEvent.click(screen.getByRole("switch", { name: "Custom price for Festive peak" }));
    await userEvent.type(screen.getByLabelText("Festive peak (USD)"), "3600");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(savePackageAction).toHaveBeenCalledWith(
      expect.objectContaining({ seasonPrices: [{ seasonId: "s1", USD: 3600, KES: null }] }),
    );
  });

  it("never resubmits a stored price for a season that has ended", async () => {
    savePackageAction.mockResolvedValue(succeed({ version: 1 }, MESSAGES.savedLive));
    const initial = editableCommercial(
      {
        ...defaultPackageCommercial(2800),
        seasonPrices: [
          { seasonId: "ended", USD: 3200 },
          { seasonId: "s1", USD: 3600 },
        ],
      },
      new Set(["s1"]),
    );
    renderEditor({ initial });
    await setUsdPrice("3100");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(savePackageAction).toHaveBeenCalledWith(
      expect.objectContaining({ seasonPrices: [{ seasonId: "s1", USD: 3600, KES: null }] }),
    );
  });

  it("wires the homepage hint to the select for assistive tech", () => {
    renderEditor();
    const select = screen.getByLabelText("Homepage");
    expect(select).toHaveAttribute("aria-describedby", "package-featured-hint");
    expect(screen.getByText("Empty homepage slots show the first packages in the catalogue.")).toHaveAttribute(
      "id",
      "package-featured-hint",
    );
  });

  it("explains featured slots and discards changes", async () => {
    renderEditor();
    await userEvent.selectOptions(screen.getByLabelText("Homepage"), "2");
    expect(screen.getByText("Slot 2 currently shows “Safari Honeymoon”. Saving moves it here.")).toBeInTheDocument();
    await setUsdPrice("3100");
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByLabelText("Standard price (USD)")).toHaveValue("2800");
    expect(screen.getByLabelText("Homepage")).toHaveValue("none");
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
  });

  it("offers a reload after a conflict", async () => {
    savePackageAction.mockResolvedValue(fail("conflict", MESSAGES.conflict));
    renderEditor();
    await setUsdPrice("3000");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(MESSAGES.conflict);
    expect(within(alert).getByRole("button", { name: "Reload the latest version" })).toBeInTheDocument();
  });

  it("is read-only for viewers", () => {
    renderEditor({ canEdit: false });
    expect(screen.getByText("View only")).toBeInTheDocument();
    expect(screen.getByLabelText("Standard price (USD)")).toBeDisabled();
    expect(screen.getByRole("switch", { name: /Show on the website/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
});
