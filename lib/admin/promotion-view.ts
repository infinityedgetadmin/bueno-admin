import type { TourPackage } from "@/data/cms";
import { CURRENCY_CODES } from "@/lib/pricing/constants";
import { resolvePackageCommercial } from "@/lib/pricing/defaults";
import { buildPriceSheet, fromPrice } from "@/lib/pricing/engine";
import { discountAmount, isPercentOffWithinLimits } from "@/lib/pricing/money";
import type { CurrencyCode, IsoDate, PricingCatalog, PromotionTarget } from "@/lib/pricing/types";

export interface PromotionPreviewRow {
  slug: string;
  title: string;
  prices: Partial<Record<CurrencyCode, { amount: number; step: number }>>;
}

/** Each package's lowest "From" price with no promotion applied, for before/after previews. */
export function buildPromotionPreviewRows(params: {
  packages: readonly TourPackage[];
  catalog: PricingCatalog;
  today: IsoDate;
}): PromotionPreviewRow[] {
  const catalog: PricingCatalog = { ...params.catalog, promotions: [] };
  return params.packages.map((tour) => {
    const commercial = resolvePackageCommercial(catalog, tour.slug, tour.listPriceUsd);
    const sheet = buildPriceSheet({ slug: tour.slug, pkg: { ...commercial, display: "price" }, catalog, today: params.today });
    const prices: PromotionPreviewRow["prices"] = {};
    if (sheet !== null) {
      for (const currency of CURRENCY_CODES) {
        const currencySheet = sheet.currencies[currency];
        const from = fromPrice(sheet, currency);
        if (currencySheet !== undefined && from !== null) prices[currency] = { amount: from.amount, step: currencySheet.step };
      }
    }
    return { slug: tour.slug, title: tour.title, prices };
  });
}

export function discountPreview(
  row: PromotionPreviewRow,
  percentOff: number,
): Partial<Record<CurrencyCode, { before: number; after: number }>> {
  if (!isPercentOffWithinLimits(percentOff)) return {};
  const preview: Partial<Record<CurrencyCode, { before: number; after: number }>> = {};
  for (const currency of CURRENCY_CODES) {
    const price = row.prices[currency];
    if (price !== undefined) {
      preview[currency] = { before: price.amount, after: discountAmount(price.amount, percentOff, price.step) };
    }
  }
  return preview;
}

export function describeTarget(target: PromotionTarget, titles: ReadonlyMap<string, string>): string {
  if (target.kind === "all") return "All packages";
  const named = target.slugs.flatMap((slug) => {
    const title = titles.get(slug);
    return title === undefined ? [] : [title];
  });
  const extra = target.slugs.length - named.length;
  const shown = named.slice(0, 2);
  const more = named.length - shown.length + extra;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}
