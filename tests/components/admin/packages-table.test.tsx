import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import PackagesTable from "@/components/admin/packages/PackagesTable";
import type { AdminPackageRow } from "@/lib/admin/package-rows";

function row(overrides: Partial<AdminPackageRow>): AdminPackageRow {
  return {
    slug: "coastal-escape",
    title: "Coastal Escape",
    image: "/images/bueno-beach-lounging.webp",
    location: "Diani Beach & Watamu",
    duration: "5 Days",
    visible: true,
    display: "price",
    featuredRank: null,
    customised: true,
    currencies: { USD: "fixed", KES: "converted" },
    from: { USD: { amount: 2550, original: 3000 }, KES: { amount: 330_000, original: 388_500 } },
    promotionLabel: "Early Bird",
    ...overrides,
  };
}

const rows = [
  row({}),
  row({ slug: "safari-honeymoon", title: "Safari Honeymoon", location: "Maasai Mara", visible: false, promotionLabel: null, featuredRank: 1, customised: false, from: { USD: { amount: 5200, original: null } } }),
];

describe("PackagesTable", () => {
  it("lists packages with status, prices, promotion and homepage slot", () => {
    render(<PackagesTable rows={rows} canEdit />);
    expect(screen.getByRole("link", { name: "Edit Coastal Escape" })).toHaveAttribute("href", "/admin/packages/coastal-escape");
    const coastal = screen.getByRole("row", { name: /Coastal Escape/ });
    expect(within(coastal).getByText("$3,000")).toBeInTheDocument();
    expect(within(coastal).getByText("$2,550")).toBeInTheDocument();
    expect(within(coastal).getByText("KSh 330,000")).toBeInTheDocument();
    expect(within(coastal).getByText("Live")).toBeInTheDocument();
    expect(within(coastal).getByText("Early Bird")).toBeInTheDocument();
    const safari = screen.getByRole("row", { name: /Safari Honeymoon/ });
    expect(within(safari).getByText("Hidden")).toBeInTheDocument();
    expect(within(safari).getByText("Slot 1")).toBeInTheDocument();
    expect(within(safari).getByText("Code default")).toBeInTheDocument();
  });

  it("filters by search text and status", async () => {
    render(<PackagesTable rows={rows} canEdit />);
    await userEvent.type(screen.getByLabelText("Search packages"), "mara");
    expect(screen.queryByText("Coastal Escape")).toBeNull();
    expect(screen.getByText("Safari Honeymoon")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Search packages"));
    await userEvent.click(screen.getByRole("radio", { name: "On promotion" }));
    expect(screen.getByText("Coastal Escape")).toBeInTheDocument();
    expect(screen.queryByText("Safari Honeymoon")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Hidden" }));
    expect(screen.getByText("Safari Honeymoon")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Search packages"), "zzz");
    expect(screen.getByText("No packages match")).toBeInTheDocument();
  });

  it("offers view links to viewers", () => {
    render(<PackagesTable rows={rows} canEdit={false} />);
    expect(screen.getByRole("link", { name: "View Coastal Escape" })).toBeInTheDocument();
  });
});
