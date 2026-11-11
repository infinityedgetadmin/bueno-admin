import { convertAmount, formatMoney, isAmountWithinLimits } from "./money";
import type { ConversionContext, CurrencyCode } from "./types";

export interface ActivityPriceRange {
  min: number;
  max: number;
  currency: string;
  unit: string;
}

function rangeText(min: number, max: number, currency: CurrencyCode, unit: string): string {
  const amounts = min === max ? formatMoney(min, currency) : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
  return `${amounts} ${unit}`;
}

function normalizePriceText(text: string): string {
  return text.replace(/ - /g, " – ").replace(/\s+/g, " ").trim();
}

/**
 * True when a generated "$X – $Y unit" string and an authored `priceDisplay` string describe
 * the same price, once a spaced hyphen (" - ") is normalised to an en dash (" – ") and
 * whitespace runs are collapsed. Used to decide whether the authored wording is safe to treat
 * as the source for a currency conversion (see `ActivityPrice`); a false result means the
 * authored text carries information the generated amount+unit text does not (e.g. a combined
 * entry fee), so it must be shown unconverted.
 */
export function describesSamePrice(generated: string, authored: string): boolean {
  return normalizePriceText(generated) === normalizePriceText(authored);
}

/** Display strings for an activity's USD price range, plus KES when a house rate is set. */
export function activityPriceTexts(
  range: ActivityPriceRange,
  conversion: ConversionContext | null,
): Partial<Record<CurrencyCode, string>> {
  if (
    range.currency !== "USD" ||
    !isAmountWithinLimits(range.min, "USD") ||
    !isAmountWithinLimits(range.max, "USD") ||
    range.min > range.max
  ) {
    return {};
  }
  const texts: Partial<Record<CurrencyCode, string>> = { USD: rangeText(range.min, range.max, "USD", range.unit) };
  if (conversion !== null) {
    const step = conversion.roundingStep.KES;
    const min = convertAmount(range.min, "USD", "KES", conversion.kesPerUsdE4, step);
    const max = convertAmount(range.max, "USD", "KES", conversion.kesPerUsdE4, step);
    if (isAmountWithinLimits(min, "KES") && isAmountWithinLimits(max, "KES")) {
      texts.KES = rangeText(min, max, "KES", range.unit);
    }
  }
  return texts;
}
