import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCatalog } from "../../unit/pricing/fixtures";

// The real savePromotionAction runs (schema → domain validation); only I/O is mocked.
const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  readCatalog: vi.fn(),
  mutateCatalog: vi.fn(),
  revalidateSite: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => {
  class AdminAuthError extends Error {
    constructor(readonly reason: "unauthenticated" | "not_authorized") {
      super(reason);
    }
  }
  return { requireAdminAction: mocks.requireAdminAction, AdminAuthError };
});
vi.mock("@/lib/cms/catalog-repo", () => ({ readCatalog: mocks.readCatalog, mutateCatalog: mocks.mutateCatalog }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateSite: mocks.revalidateSite }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { parsePercent } from "@/components/admin/promotions/PromotionForm";
import PromotionsManager from "@/components/admin/promotions/PromotionsManager";
import { addDays, todayInNairobi } from "@/lib/pricing/dates";

const packages = [{ slug: "coastal-escape", title: "Coastal Escape" }];
const previewRows = [{ slug: "coastal-escape", title: "Coastal Escape", prices: { USD: { amount: 2800, step: 1 } } }];

async function submitNewPromotion(percent: string) {
  const today = todayInNairobi();
  render(<PromotionsManager promotions={[]} packages={packages} previewRows={previewRows} today={today} canEdit />);
  await userEvent.click(screen.getByRole("button", { name: "New promotion" }));
  await userEvent.type(screen.getByLabelText("Internal name"), "Generous sale");
  await userEvent.type(screen.getByLabelText("Badge text"), "Big Sale");
  if (percent !== "") await userEvent.type(screen.getByLabelText("Discount (%)"), percent);
  await userEvent.type(screen.getByLabelText("Show from"), addDays(today, 7));
  await userEvent.type(screen.getByLabelText("Show until"), addDays(today, 21));
  await userEvent.click(screen.getByRole("button", { name: "Create promotion" }));
}

describe("promotion percentage", () => {
  beforeEach(() => {
    mocks.requireAdminAction.mockReset().mockResolvedValue({ uid: "u1", email: "editor@bueno.example.com", role: "editor" });
    mocks.readCatalog.mockReset().mockResolvedValue(makeCatalog());
    mocks.mutateCatalog.mockReset();
    mocks.revalidateSite.mockReset();
    mocks.refresh.mockReset();
  });

  it.each(["150", "12.5", "-5"])("explains the allowed range when %s is typed", async (typed) => {
    await submitNewPromotion(typed);
    const percent = screen.getByLabelText("Discount (%)");
    await waitFor(() => expect(percent).toHaveAccessibleDescription("Enter a whole percentage from 1 to 90."));
    expect(percent).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Enter a discount percentage.")).toBeNull();
    expect(screen.queryByTestId("promotion-preview")).toBeNull();
    expect(mocks.mutateCatalog).not.toHaveBeenCalled();
  });

  it("asks for a percentage when the field is left blank", async () => {
    await submitNewPromotion("");
    const percent = screen.getByLabelText("Discount (%)");
    await waitFor(() => expect(percent).toHaveAccessibleDescription("Enter a discount percentage."));
    expect(mocks.mutateCatalog).not.toHaveBeenCalled();
  });

  it("previews only percentages the server would accept", async () => {
    render(<PromotionsManager promotions={[]} packages={packages} previewRows={previewRows} today={todayInNairobi()} canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "New promotion" }));
    const percent = screen.getByLabelText("Discount (%)");
    await userEvent.type(percent, "20");
    expect(screen.getByTestId("promotion-preview")).toHaveTextContent("Coastal Escape$2,800 → $2,240");
    await userEvent.clear(percent);
    await userEvent.type(percent, "95");
    expect(screen.queryByTestId("promotion-preview")).toBeNull();
  });
});

describe("parsePercent", () => {
  it("sends any typed number as-is, so the server can say what is wrong with it", () => {
    expect(parsePercent("20")).toBe(20);
    expect(parsePercent(" 150 ")).toBe(150);
    expect(parsePercent("12.5")).toBe(12.5);
    expect(parsePercent("-5")).toBe(-5);
    expect(parsePercent("007")).toBe(7);
  });

  it("sends blank, non-numeric or unrepresentable input as null", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("   ")).toBeNull();
    expect(parsePercent("ten")).toBeNull();
    expect(parsePercent("15%")).toBeNull();
    expect(parsePercent("1e3")).toBeNull();
    expect(parsePercent("9".repeat(400))).toBeNull();
  });
});
