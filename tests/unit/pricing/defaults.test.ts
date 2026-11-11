import { describe, expect, it } from "vitest";
import {
  conversionContextOf,
  defaultPackageCommercial,
  emptyCatalog,
  resolvePackageCommercial,
  stepFor,
} from "@/lib/pricing/defaults";
import { makeCatalog, makeCurrency, makePackage } from "./fixtures";

describe("defaults", () => {
  it("builds the default commercial settings from the list price", () => {
    expect(defaultPackageCommercial(4500)).toEqual({
      visible: true,
      display: "price",
      basis: null,
      currencies: { USD: "fixed", KES: "converted" },
      base: { USD: 4500 },
      seasonPrices: [],
      featuredRank: null,
      version: 0,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("creates an empty catalog", () => {
    expect(emptyCatalog()).toEqual({
      schemaVersion: 1,
      revision: 0,
      currency: null,
      seasons: [],
      promotions: [],
      packages: {},
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("prefers stored package settings over defaults", () => {
    const stored = makePackage({ base: { USD: 5000 } });
    const catalog = makeCatalog({ packages: { "coastal-escape": stored } });
    expect(resolvePackageCommercial(catalog, "coastal-escape", 2800)).toBe(stored);
    expect(resolvePackageCommercial(catalog, "safari-honeymoon", 5200).base).toEqual({ USD: 5200 });
  });

  it("exposes the conversion context only when a rate is set", () => {
    expect(conversionContextOf(makeCatalog({ currency: null }))).toBeNull();
    expect(conversionContextOf(makeCatalog())).toEqual({
      kesPerUsdE4: 1_295_000,
      roundingStep: { USD: 1, KES: 500 },
    });
  });

  it("uses configured rounding steps or the defaults", () => {
    const catalog = makeCatalog({ currency: makeCurrency({ roundingStep: { USD: 5, KES: 1000 } }) });
    expect(stepFor(catalog, "USD")).toBe(5);
    expect(stepFor(catalog, "KES")).toBe(1000);
    expect(stepFor(makeCatalog({ currency: null }), "KES")).toBe(500);
    expect(stepFor(makeCatalog({ currency: null }), "USD")).toBe(1);
  });
});
