import { CURRENCY_CODES, PRICE_BASIS_LABELS } from "@/lib/pricing/constants";
import { isAmountWithinLimits, parseAmountInput } from "@/lib/pricing/money";
import type {
  CurrencyAmounts,
  CurrencyCode,
  CurrencyMode,
  DisplayMode,
  FeaturedRank,
  FieldErrors,
  PackageCommercial,
  PackageDraft,
  PriceBasis,
  SeasonPrice,
} from "@/lib/pricing/types";

export type RankChoice = "none" | "1" | "2" | "3";
export type BasisChoice = PriceBasis | "none";

export interface SeasonInputs {
  custom: boolean;
  USD: string;
  KES: string;
}

/** Everything the package editor holds, as the admin typed it. */
export interface PackageEditorState {
  visible: boolean;
  display: DisplayMode;
  basis: BasisChoice;
  currencies: Record<CurrencyCode, CurrencyMode>;
  base: Record<CurrencyCode, string>;
  seasons: Record<string, SeasonInputs>;
  featuredRank: RankChoice;
}

export const RANK_TEXT: Readonly<Record<FeaturedRank, "1" | "2" | "3">> = { 1: "1", 2: "2", 3: "3" };
const TEXT_RANK: Readonly<Record<"1" | "2" | "3", FeaturedRank>> = { "1": 1, "2": 2, "3": 3 };
const RANK_CHOICES: readonly string[] = ["none", "1", "2", "3"];
const NOT_A_NUMBER = "Use whole numbers only, like 4500.";

export function isRankChoice(value: string): value is RankChoice {
  return RANK_CHOICES.includes(value);
}

export function isBasisChoice(value: string): value is BasisChoice {
  return value === "none" || Object.hasOwn(PRICE_BASIS_LABELS, value);
}

function asText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/**
 * Drops stored season prices for seasons that are no longer upcoming. The editor only ever
 * renders a row (and shows errors) for an upcoming season, so a price left over from one that
 * has since ended would otherwise be submitted — and validated — with nothing on screen for
 * the admin to see or fix.
 */
export function editableCommercial(
  commercial: PackageCommercial,
  upcomingSeasonIds: ReadonlySet<string>,
): PackageCommercial {
  return {
    ...commercial,
    seasonPrices: commercial.seasonPrices.filter((price) => upcomingSeasonIds.has(price.seasonId)),
  };
}

export function toEditorState(commercial: PackageCommercial): PackageEditorState {
  const seasons: Record<string, SeasonInputs> = {};
  for (const price of commercial.seasonPrices) {
    seasons[price.seasonId] = { custom: true, USD: asText(price.USD), KES: asText(price.KES) };
  }
  return {
    visible: commercial.visible,
    display: commercial.display,
    basis: commercial.basis ?? "none",
    currencies: { USD: commercial.currencies.USD, KES: commercial.currencies.KES },
    base: { USD: asText(commercial.base.USD), KES: asText(commercial.base.KES) },
    seasons,
    featuredRank: commercial.featuredRank === null ? "none" : RANK_TEXT[commercial.featuredRank],
  };
}

function parseField(raw: string, key: string, errors: FieldErrors): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = parseAmountInput(trimmed);
  if (parsed === null) errors[key] = NOT_A_NUMBER;
  return parsed;
}

/** Editor text → server payload. Only fixed currencies and custom seasons are sent. */
export function toDraft(state: PackageEditorState): { draft: PackageDraft; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const base: Record<CurrencyCode, number | null> = { USD: null, KES: null };
  const fixed = CURRENCY_CODES.filter((currency) => state.currencies[currency] === "fixed");
  for (const currency of fixed) base[currency] = parseField(state.base[currency], `base.${currency}`, errors);

  const seasonPrices: PackageDraft["seasonPrices"] = [];
  for (const [seasonId, inputs] of Object.entries(state.seasons)) {
    if (!inputs.custom) continue;
    const row: PackageDraft["seasonPrices"][number] = { seasonId, USD: null, KES: null };
    for (const currency of fixed) {
      row[currency] = parseField(inputs[currency], `seasonPrices.${seasonId}.${currency}`, errors);
    }
    seasonPrices.push(row);
  }

  return {
    errors,
    draft: {
      visible: state.visible,
      display: state.display,
      basis: state.basis === "none" ? null : state.basis,
      currencies: { USD: state.currencies.USD, KES: state.currencies.KES },
      base,
      seasonPrices,
      featuredRank: state.featuredRank === "none" ? null : TEXT_RANK[state.featuredRank],
    },
  };
}

/**
 * A package the pricing engine can render, or null while the draft is incomplete.
 * With two currencies, one fixed currency is enough: the other is fixed, converted from it, or off.
 */
export function previewCommercial(draft: PackageDraft): PackageCommercial | null {
  const fixed = CURRENCY_CODES.filter((currency) => draft.currencies[currency] === "fixed");
  if (fixed.length === 0) return null;
  const base: CurrencyAmounts = {};
  for (const currency of fixed) {
    const amount = draft.base[currency];
    if (amount === null || !isAmountWithinLimits(amount, currency)) return null;
    base[currency] = amount;
  }
  const seasonPrices: SeasonPrice[] = [];
  for (const row of draft.seasonPrices) {
    const price: SeasonPrice = { seasonId: row.seasonId };
    for (const currency of fixed) {
      const amount = row[currency];
      if (amount === null || !isAmountWithinLimits(amount, currency)) return null;
      price[currency] = amount;
    }
    seasonPrices.push(price);
  }
  return {
    visible: draft.visible,
    display: "price",
    basis: draft.basis,
    currencies: draft.currencies,
    base,
    seasonPrices,
    featuredRank: draft.featuredRank,
    version: 0,
    updatedAt: null,
    updatedBy: null,
  };
}

function comparable(state: PackageEditorState): string {
  const fixed = CURRENCY_CODES.filter((currency) => state.currencies[currency] === "fixed");
  const seasons = Object.entries(state.seasons)
    .filter(([, inputs]) => inputs.custom)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, inputs]) => [id, fixed.map((currency) => inputs[currency].trim())]);
  return JSON.stringify([
    state.visible,
    state.display,
    state.basis,
    state.currencies,
    fixed.map((currency) => state.base[currency].trim()),
    seasons,
    state.featuredRank,
  ]);
}

/** True when two editor states would save the same thing. */
export function isSameState(a: PackageEditorState, b: PackageEditorState): boolean {
  return comparable(a) === comparable(b);
}
