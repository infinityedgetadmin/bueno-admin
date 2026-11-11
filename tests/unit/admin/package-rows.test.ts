import { describe, expect, it } from "vitest";
import { tourPackages } from "@/data/cms";
import { buildAdminPackageRows } from "@/lib/admin/package-rows";
import { makeCatalog, makePackage, makePromotion } from "../pricing/fixtures";

describe("buildAdminPackageRows", () => {
  it("lists every package with default prices when nothing is configured", () => {
    const rows = buildAdminPackageRows({ packages: tourPackages, catalog: makeCatalog(), today: "2026-09-24" });
    expect(rows).toHaveLength(tourPackages.length);
    const coastal = rows.find((row) => row.slug === "coastal-escape");
    expect(coastal).toMatchObject({ visible: true, display: "price", customised: false, featuredRank: null, promotionLabel: null });
    expect(coastal?.from.USD).toEqual({ amount: 2800, original: null });
    expect(coastal?.from.KES).toEqual({ amount: 362_500, original: null });
  });

  it("still prices hidden and enquire-only packages, and shows live promotions", () => {
    const catalog = makeCatalog({
      promotions: [makePromotion({ appliesTo: { kind: "packages", slugs: ["coastal-escape"] } })],
      packages: {
        "coastal-escape": makePackage({ base: { USD: 3000 }, visible: false, display: "enquire", featuredRank: 1 }),
      },
    });
    const row = buildAdminPackageRows({ packages: tourPackages, catalog, today: "2026-09-24" }).find((r) => r.slug === "coastal-escape");
    expect(row).toMatchObject({ visible: false, display: "enquire", customised: true, featuredRank: 1, promotionLabel: "Early Bird" });
    expect(row?.from.USD).toEqual({ amount: 2550, original: 3000 });
  });

  it("omits currencies that cannot be priced", () => {
    const catalog = makeCatalog({ currency: null });
    const row = buildAdminPackageRows({ packages: tourPackages, catalog, today: "2026-09-24" })[0];
    expect(row?.from.KES).toBeUndefined();
  });
});
