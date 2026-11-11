import { CURRENCY_CODES } from "./constants";
import { compareIsoDates, isIsoDate, isWithin } from "./dates";
import { conversionContextOf, stepFor } from "./defaults";
import { convertInto, discountAmount, otherCurrency } from "./money";
import type {
  ConversionContext,
  CurrencyAmounts,
  CurrencyCode,
  CurrencyMode,
  CurrencySheet,
  DatedPrice,
  DisplayPrice,
  IsoDate,
  PackageCommercial,
  PriceBasis,
  PriceSheet,
  PricingCatalog,
  Promotion,
  Season,
  SeasonPrice,
  SheetPromotion,
  SheetSeasonRow,
} from "./types";

export type PromotionStatus = "live" | "scheduled" | "ended" | "paused";

export function promotionStatus(
  promotion: Pick<Promotion, "paused" | "startDate" | "endDate">,
  today: IsoDate,
): PromotionStatus {
  if (promotion.paused) return "paused";
  if (today < promotion.startDate) return "scheduled";
  if (today > promotion.endDate) return "ended";
  return "live";
}

export function promotionAppliesTo(promotion: Pick<Promotion, "appliesTo">, slug: string): boolean {
  return promotion.appliesTo.kind === "all" || promotion.appliesTo.slugs.includes(slug);
}

export function activePromotionFor(
  promotions: readonly Promotion[],
  slug: string,
  today: IsoDate,
): Promotion | null {
  const live = promotions.filter(
    (promotion) => promotionStatus(promotion, today) === "live" && promotionAppliesTo(promotion, slug),
  );
  live.sort(
    (a, b) =>
      b.percentOff - a.percentOff ||
      compareIsoDates(a.endDate, b.endDate) ||
      compareIsoDates(a.id, b.id),
  );
  return live[0] ?? null;
}

/**
 * The amount shown in `currency`, or null when that currency is not shown. A conversion that
 * lands outside the target currency's limits is null (see `convertInto`), the same rule activity
 * ranges follow.
 */
export function resolveAmount(
  modes: Record<CurrencyCode, CurrencyMode>,
  amounts: CurrencyAmounts,
  currency: CurrencyCode,
  conversion: ConversionContext | null,
): number | null {
  const mode = modes[currency];
  if (mode === "fixed") return amounts[currency] ?? null;
  if (mode === "off" || conversion === null) return null;
  const source = otherCurrency(currency);
  const sourceAmount = amounts[source];
  if (modes[source] !== "fixed" || sourceAmount === undefined) return null;
  return convertInto(sourceAmount, currency, conversion);
}

interface UpcomingSeasonPrice {
  price: SeasonPrice;
  season: Season;
}

/**
 * Every upcoming season's row in one currency, or null when any of them cannot be priced in it.
 * All or nothing: a currency missing one season's row would quote the standard rate for that
 * season's travel dates, so the currency is left out instead, as it is when no rate is set.
 */
function seasonRowsIn(params: {
  currency: CurrencyCode;
  upcoming: readonly UpcomingSeasonPrice[];
  pkg: PackageCommercial;
  conversion: ConversionContext | null;
}): SheetSeasonRow[] | null {
  const { currency, upcoming, pkg, conversion } = params;
  const rows: SheetSeasonRow[] = [];
  for (const { price, season } of upcoming) {
    const amount = resolveAmount(pkg.currencies, { USD: price.USD, KES: price.KES }, currency, conversion);
    if (amount === null) return null;
    rows.push({ seasonId: season.id, name: season.name, startDate: season.startDate, endDate: season.endDate, amount });
  }
  return rows;
}

export function buildPriceSheet(params: {
  slug: string;
  pkg: PackageCommercial;
  catalog: PricingCatalog;
  today: IsoDate;
}): PriceSheet | null {
  const { slug, pkg, catalog, today } = params;
  if (pkg.display === "enquire") return null;
  const conversion = conversionContextOf(catalog);
  const seasonsById = new Map(catalog.seasons.map((season) => [season.id, season]));
  const upcoming = pkg.seasonPrices
    .flatMap((price): UpcomingSeasonPrice[] => {
      const season = seasonsById.get(price.seasonId);
      return season !== undefined && season.endDate >= today ? [{ price, season }] : [];
    })
    .sort((a, b) => compareIsoDates(a.season.startDate, b.season.startDate));

  const currencies: Partial<Record<CurrencyCode, CurrencySheet>> = {};
  for (const currency of CURRENCY_CODES) {
    const standard = resolveAmount(pkg.currencies, pkg.base, currency, conversion);
    const seasons = standard === null ? null : seasonRowsIn({ currency, upcoming, pkg, conversion });
    if (standard === null || seasons === null) continue;
    currencies[currency] = { standard, seasons, step: stepFor(catalog, currency) };
  }
  if (Object.keys(currencies).length === 0) return null;

  const promotion = activePromotionFor(catalog.promotions, slug, today);
  return {
    asOf: today,
    basis: pkg.basis,
    promotion:
      promotion === null
        ? null
        : {
            id: promotion.id,
            label: promotion.label,
            percentOff: promotion.percentOff,
            endDate: promotion.endDate,
            terms: promotion.terms,
          },
    currencies,
  };
}

export function applyPromotion(amount: number, promotion: SheetPromotion | null, step: number): DisplayPrice {
  if (promotion === null) return { amount, original: null };
  const discounted = discountAmount(amount, promotion.percentOff, step);
  return discounted < amount ? { amount: discounted, original: amount } : { amount, original: null };
}

export function fromPrice(sheet: PriceSheet, currency: CurrencyCode): DisplayPrice | null {
  const sheetForCurrency = sheet.currencies[currency];
  if (!sheetForCurrency) return null;
  const lowest = sheetForCurrency.seasons.reduce(
    (min, row) => Math.min(min, row.amount),
    sheetForCurrency.standard,
  );
  return applyPromotion(lowest, sheet.promotion, sheetForCurrency.step);
}

export function priceForDate(sheet: PriceSheet, currency: CurrencyCode, date: string): DatedPrice | null {
  const sheetForCurrency = sheet.currencies[currency];
  if (!sheetForCurrency || !isIsoDate(date) || date < sheet.asOf) return null;
  const row = sheetForCurrency.seasons.find((season) => isWithin(date, season.startDate, season.endDate));
  const amount = row === undefined ? sheetForCurrency.standard : row.amount;
  return {
    ...applyPromotion(amount, sheet.promotion, sheetForCurrency.step),
    seasonName: row === undefined ? null : row.name,
  };
}

export interface RateTableRow {
  key: string;
  label: string;
  dates: { startDate: IsoDate; endDate: IsoDate } | null;
  prices: Partial<Record<CurrencyCode, DisplayPrice>>;
}

function pricesFor(
  sheet: PriceSheet,
  pick: (sheetForCurrency: CurrencySheet) => number | null,
): Partial<Record<CurrencyCode, DisplayPrice>> {
  const prices: Partial<Record<CurrencyCode, DisplayPrice>> = {};
  for (const currency of CURRENCY_CODES) {
    const sheetForCurrency = sheet.currencies[currency];
    if (!sheetForCurrency) continue;
    const amount = pick(sheetForCurrency);
    if (amount !== null) prices[currency] = applyPromotion(amount, sheet.promotion, sheetForCurrency.step);
  }
  return prices;
}

export function seasonalRateTable(sheet: PriceSheet): RateTableRow[] {
  const seasons = new Map<string, SheetSeasonRow>();
  for (const currency of CURRENCY_CODES) {
    for (const row of sheet.currencies[currency]?.seasons ?? []) {
      if (!seasons.has(row.seasonId)) seasons.set(row.seasonId, row);
    }
  }
  if (seasons.size === 0) return [];
  const rows: RateTableRow[] = [...seasons.values()]
    .sort((a, b) => compareIsoDates(a.startDate, b.startDate))
    .map((season) => ({
      key: season.seasonId,
      label: season.name,
      dates: { startDate: season.startDate, endDate: season.endDate },
      prices: pricesFor(
        sheet,
        (sheetForCurrency) =>
          sheetForCurrency.seasons.find((row) => row.seasonId === season.seasonId)?.amount ?? null,
      ),
    }));
  rows.push({
    key: "standard",
    label: "Standard rate",
    dates: null,
    prices: pricesFor(sheet, (sheetForCurrency) => sheetForCurrency.standard),
  });
  return rows;
}

export interface PriceQuote {
  currency: CurrencyCode;
  amount: number;
  original: number | null;
  basis: PriceBasis | null;
  seasonName: string | null;
  promotionLabel: string | null;
  travelDate: IsoDate;
}

export function quoteForDate(sheet: PriceSheet, preferred: CurrencyCode, travelDate: string): PriceQuote | null {
  for (const currency of [preferred, otherCurrency(preferred)]) {
    const price = priceForDate(sheet, currency, travelDate);
    if (price === null) continue;
    return {
      currency,
      amount: price.amount,
      original: price.original,
      basis: sheet.basis,
      seasonName: price.seasonName,
      promotionLabel: price.original !== null && sheet.promotion !== null ? sheet.promotion.label : null,
      travelDate,
    };
  }
  return null;
}
