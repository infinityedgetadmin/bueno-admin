import type {
  CurrencyCode,
  KesRoundingStep,
  PriceBasis,
  RoundingSteps,
  UsdRoundingStep,
} from "./types";

export const CURRENCY_CODES: readonly CurrencyCode[] = ["USD", "KES"];

export const NAIROBI_TIME_ZONE = "Africa/Nairobi";

/** Exchange rates are stored multiplied by this scale (4 decimal places). */
export const RATE_SCALE = 10_000;
export const RATE_LIMITS_E4 = { min: 50 * RATE_SCALE, max: 500 * RATE_SCALE } as const;

export const AMOUNT_LIMITS: Readonly<Record<CurrencyCode, { min: number; max: number }>> = {
  USD: { min: 1, max: 1_000_000 },
  KES: { min: 1, max: 150_000_000 },
};

export const USD_ROUNDING_STEPS: readonly UsdRoundingStep[] = [1, 5, 10, 50, 100];
export const KES_ROUNDING_STEPS: readonly KesRoundingStep[] = [1, 10, 50, 100, 500, 1000];
export const DEFAULT_ROUNDING_STEPS: RoundingSteps = { USD: 1, KES: 500 };

export const PERCENT_OFF_LIMITS = { min: 1, max: 90 } as const;
export const MAX_RANGE_DAYS = 366;
export const MAX_START_YEARS_AHEAD = 3;
export const RATE_STALE_DAYS = 30;

export const CURRENCY_SYMBOLS: Readonly<Record<CurrencyCode, string>> = {
  USD: "$",
  KES: "KSh ",
};

/** Used in field errors: "Enter a US dollar price." */
export const CURRENCY_NAMES: Readonly<Record<CurrencyCode, string>> = {
  USD: "US dollar",
  KES: "Kenyan shilling",
};

/** Used mid-sentence: "The dollar base price changes by 60%". */
export const CURRENCY_SHORT_NAMES: Readonly<Record<CurrencyCode, string>> = {
  USD: "dollar",
  KES: "shilling",
};

export const PRICE_BASIS_LABELS: Readonly<Record<PriceBasis, string>> = {
  per_person: "per person",
  per_person_sharing: "per person sharing",
  per_couple: "per couple",
  per_group: "per group",
};

export const WARNING_THRESHOLDS = {
  basePriceChange: 0.5,
  impliedRateDeviation: 0.25,
  seasonDeviation: 0.6,
  largeDiscountPercent: 50,
  rateChange: 0.1,
} as const;

export const TEXT_LIMITS = {
  seasonName: { min: 2, max: 40 },
  promotionName: { min: 2, max: 60 },
  promotionLabel: { min: 2, max: 24 },
  promotionTerms: { max: 160 },
} as const;
