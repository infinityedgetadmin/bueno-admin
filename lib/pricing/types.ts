/** Pricing domain types. Pure declarations — no runtime code. */

export type CurrencyCode = "USD" | "KES";

/** Calendar date "YYYY-MM-DD", interpreted in Africa/Nairobi. */
export type IsoDate = string;

export type PriceBasis = "per_person" | "per_person_sharing" | "per_couple" | "per_group";
export type CurrencyMode = "fixed" | "converted" | "off";
export type DisplayMode = "price" | "enquire";
export type FeaturedRank = 1 | 2 | 3;
export type UsdRoundingStep = 1 | 5 | 10 | 50 | 100;
export type KesRoundingStep = 1 | 10 | 50 | 100 | 500 | 1000;

export interface RoundingSteps {
  USD: UsdRoundingStep;
  KES: KesRoundingStep;
}

export interface CurrencySettings {
  /** KES per 1 USD, multiplied by 10,000 (129.5 → 1_295_000). */
  kesPerUsdE4: number;
  roundingStep: RoundingSteps;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface Season {
  id: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
  version: number;
}

export type PromotionTarget = { kind: "all" } | { kind: "packages"; slugs: string[] };

export interface Promotion {
  id: string;
  name: string;
  label: string;
  percentOff: number;
  startDate: IsoDate;
  endDate: IsoDate;
  appliesTo: PromotionTarget;
  paused: boolean;
  terms: string | null;
  version: number;
}

export type CurrencyAmounts = Partial<Record<CurrencyCode, number>>;

export interface SeasonPrice {
  seasonId: string;
  USD?: number;
  KES?: number;
}

export interface PackageCommercial {
  visible: boolean;
  display: DisplayMode;
  basis: PriceBasis | null;
  currencies: Record<CurrencyCode, CurrencyMode>;
  base: CurrencyAmounts;
  seasonPrices: SeasonPrice[];
  featuredRank: FeaturedRank | null;
  /** 0 for a package that has never been edited (defaults). */
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface PricingCatalog {
  schemaVersion: 1;
  revision: number;
  currency: CurrencySettings | null;
  seasons: Season[];
  promotions: Promotion[];
  packages: Record<string, PackageCommercial>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SheetPromotion {
  id: string;
  label: string;
  percentOff: number;
  endDate: IsoDate;
  terms: string | null;
}

export interface SheetSeasonRow {
  seasonId: string;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
  amount: number;
}

export interface CurrencySheet {
  /** Base price before any promotion. */
  standard: number;
  /** Seasons that have not ended as of `PriceSheet.asOf`, sorted by start date, before any promotion. */
  seasons: SheetSeasonRow[];
  /** Rounding step used for discounts in this currency. */
  step: number;
}

/** Everything the browser needs to render a package price. Serialisable. */
export interface PriceSheet {
  asOf: IsoDate;
  basis: PriceBasis | null;
  promotion: SheetPromotion | null;
  currencies: Partial<Record<CurrencyCode, CurrencySheet>>;
}

export interface DisplayPrice {
  amount: number;
  /** Pre-discount amount when a promotion lowered the price, otherwise null. */
  original: number | null;
}

export interface DatedPrice extends DisplayPrice {
  seasonName: string | null;
}

export interface ConversionContext {
  kesPerUsdE4: number;
  roundingStep: RoundingSteps;
}

/** Keyed by field path (e.g. "base.USD"); a missing key means the field is valid. */
export type FieldErrors = Partial<Record<string, string>>;

export type WarningId = "W1" | "W2" | "W3" | "W4" | "W5" | "W6" | "W7" | "W8" | "W9";

export interface ValidationWarning {
  id: WarningId;
  message: string;
}

export interface ValidationOutcome {
  errors: FieldErrors;
  warnings: ValidationWarning[];
}

/** Package editor payload after parsing (amounts null when left empty). */
export interface PackageDraft {
  visible: boolean;
  display: DisplayMode;
  basis: PriceBasis | null;
  currencies: Record<CurrencyCode, CurrencyMode>;
  base: Record<CurrencyCode, number | null>;
  seasonPrices: Array<{ seasonId: string; USD: number | null; KES: number | null }>;
  featuredRank: FeaturedRank | null;
}

export interface SeasonDraft {
  id: string | null;
  name: string;
  startDate: string;
  endDate: string;
}

export interface PromotionDraft {
  id: string | null;
  name: string;
  label: string;
  percentOff: number | null;
  startDate: string;
  endDate: string;
  appliesTo: PromotionTarget;
  terms: string;
}

export interface CurrencyDraft {
  rate: string;
  roundingStep: { USD: number; KES: number };
}
