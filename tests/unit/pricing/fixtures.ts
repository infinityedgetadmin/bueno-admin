import type {
  CurrencySettings,
  PackageCommercial,
  PricingCatalog,
  Promotion,
  Season,
} from "@/lib/pricing/types";

export const TODAY = "2026-09-24";

export function makeCurrency(overrides: Partial<CurrencySettings> = {}): CurrencySettings {
  return {
    kesPerUsdE4: 1_295_000,
    roundingStep: { USD: 1, KES: 500 },
    version: 1,
    updatedAt: "2026-09-20T08:00:00.000Z",
    updatedBy: "owner@bueno.example.com",
    ...overrides,
  };
}

export function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    id: "season-high",
    name: "High season",
    startDate: "2026-12-15",
    endDate: "2027-01-05",
    version: 1,
    ...overrides,
  };
}

export function makePromotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: "promo-early",
    name: "Early bird Q4",
    label: "Early Bird",
    percentOff: 15,
    startDate: "2026-09-01",
    endDate: "2026-10-31",
    appliesTo: { kind: "all" },
    paused: false,
    terms: null,
    version: 1,
    ...overrides,
  };
}

export function makePackage(overrides: Partial<PackageCommercial> = {}): PackageCommercial {
  return {
    visible: true,
    display: "price",
    basis: null,
    currencies: { USD: "fixed", KES: "converted" },
    base: { USD: 4500 },
    seasonPrices: [],
    featuredRank: null,
    version: 1,
    updatedAt: "2026-09-20T08:00:00.000Z",
    updatedBy: "owner@bueno.example.com",
    ...overrides,
  };
}

export function makeCatalog(overrides: Partial<PricingCatalog> = {}): PricingCatalog {
  return {
    schemaVersion: 1,
    revision: 1,
    currency: makeCurrency(),
    seasons: [],
    promotions: [],
    packages: {},
    updatedAt: "2026-09-20T08:00:00.000Z",
    updatedBy: "owner@bueno.example.com",
    ...overrides,
  };
}
