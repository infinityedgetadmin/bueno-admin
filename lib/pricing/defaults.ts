import { DEFAULT_ROUNDING_STEPS } from "./constants";
import type { ConversionContext, CurrencyCode, PackageCommercial, PricingCatalog } from "./types";

export function defaultPackageCommercial(listPriceUsd: number): PackageCommercial {
  return {
    visible: true,
    display: "price",
    basis: null,
    currencies: { USD: "fixed", KES: "converted" },
    base: { USD: listPriceUsd },
    seasonPrices: [],
    featuredRank: null,
    version: 0,
    updatedAt: null,
    updatedBy: null,
  };
}

export function emptyCatalog(): PricingCatalog {
  return {
    schemaVersion: 1,
    revision: 0,
    currency: null,
    seasons: [],
    promotions: [],
    packages: {},
    updatedAt: null,
    updatedBy: null,
  };
}

export function resolvePackageCommercial(
  catalog: PricingCatalog,
  slug: string,
  listPriceUsd: number,
): PackageCommercial {
  return catalog.packages[slug] ?? defaultPackageCommercial(listPriceUsd);
}

export function conversionContextOf(catalog: PricingCatalog): ConversionContext | null {
  if (catalog.currency === null) return null;
  return { kesPerUsdE4: catalog.currency.kesPerUsdE4, roundingStep: catalog.currency.roundingStep };
}

/** Rounding step used for conversions and discounts in a currency. */
export function stepFor(catalog: PricingCatalog, currency: CurrencyCode): number {
  return (catalog.currency?.roundingStep ?? DEFAULT_ROUNDING_STEPS)[currency];
}
