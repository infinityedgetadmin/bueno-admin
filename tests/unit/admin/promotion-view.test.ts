import { describe, expect, it } from "vitest";
import { tourPackages } from "@/data/cms";
import { buildPromotionPreviewRows, describeTarget, discountPreview } from "@/lib/admin/promotion-view";
import { makeCatalog, makePackage, makePromotion } from "../pricing/fixtures";

describe("promotion preview", () => {
  it("prices packages without any promotion applied", () => {
    const catalog = makeCatalog({ promotions: [makePromotion()] });
    const rows = buildPromotionPreviewRows({ packages: tourPackages, catalog, today: "2026-09-24" });
    const coastal = rows.find((row) => row.slug === "coastal-escape");
    expect(coastal?.prices).toEqual({ USD: { amount: 2800, step: 1 }, KES: { amount: 362_500, step: 500 } });
  });

  it("leaves out currencies, and packages, that cannot be priced", () => {
    const catalog = makeCatalog({
      currency: null,
      packages: { "coastal-escape": makePackage({ currencies: { USD: "off", KES: "converted" }, base: {} }) },
    });
    const rows = buildPromotionPreviewRows({ packages: tourPackages, catalog, today: "2026-09-24" });
    expect(rows.find((row) => row.slug === "coastal-escape")?.prices).toEqual({});
    expect(rows.find((row) => row.slug === "safari-honeymoon")?.prices).toEqual({ USD: { amount: 5200, step: 1 } });
  });

  it("previews a discount per currency and ignores invalid percentages", () => {
    const row = { slug: "x", title: "X", prices: { USD: { amount: 2800, step: 1 }, KES: { amount: 362_500, step: 500 } } };
    expect(discountPreview(row, 15)).toEqual({ USD: { before: 2800, after: 2380 }, KES: { before: 362_500, after: 308_000 } });
    expect(discountPreview({ ...row, prices: { USD: row.prices.USD } }, 10)).toEqual({ USD: { before: 2800, after: 2520 } });
    expect(discountPreview(row, 0)).toEqual({});
    expect(discountPreview(row, 12.5)).toEqual({});
    expect(discountPreview(row, 95)).toEqual({});
  });

  it("describes who a promotion applies to", () => {
    const titles = new Map([["coastal-escape", "Coastal Escape"], ["safari-honeymoon", "Safari Honeymoon"]]);
    expect(describeTarget({ kind: "all" }, titles)).toBe("All packages");
    expect(describeTarget({ kind: "packages", slugs: ["coastal-escape"] }, titles)).toBe("Coastal Escape");
    expect(describeTarget({ kind: "packages", slugs: ["coastal-escape", "safari-honeymoon", "gone"] }, titles)).toBe(
      "Coastal Escape, Safari Honeymoon and 1 more",
    );
    const three = new Map([["a", "A"], ["b", "B"], ["c", "C"]]);
    expect(describeTarget({ kind: "packages", slugs: ["a", "b", "c"] }, three)).toBe("A, B and 1 more");
  });
});
