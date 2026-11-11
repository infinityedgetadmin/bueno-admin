import { PRICE_BASIS_LABELS } from "./constants";
import { formatDisplayDate } from "./dates";
import type { PriceQuote } from "./engine";
import { formatMoney } from "./money";

export interface StoredPriceQuote extends PriceQuote {
  computedAt: string;
}

/** One-line description of the price a visitor saw, for the team's enquiry email. */
export function describeQuote(quote: PriceQuote | null): string {
  if (quote === null) return "Not shown (price on request)";
  const parts: string[] = [];
  let price = formatMoney(quote.amount, quote.currency);
  if (quote.basis !== null) price += ` ${PRICE_BASIS_LABELS[quote.basis]}`;
  if (quote.original !== null) {
    const was = `was ${formatMoney(quote.original, quote.currency)}`;
    price += quote.promotionLabel === null ? ` (${was})` : ` (${was} · ${quote.promotionLabel})`;
  }
  parts.push(price);
  if (quote.seasonName !== null) parts.push(quote.seasonName);
  parts.push(`for travel on ${formatDisplayDate(quote.travelDate)}`);
  return parts.join(" · ");
}
