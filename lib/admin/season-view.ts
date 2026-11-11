import { MONTH_ABBREVIATIONS, daysInclusive } from "@/lib/pricing/dates";
import type { IsoDate, PricingCatalog, Season } from "@/lib/pricing/types";

export type SeasonStatus = "current" | "upcoming" | "ended";

export function seasonStatus(season: Pick<Season, "startDate" | "endDate">, today: IsoDate): SeasonStatus {
  if (today > season.endDate) return "ended";
  if (today < season.startDate) return "upcoming";
  return "current";
}

export function seasonUsage(catalog: PricingCatalog): Partial<Record<string, number>> {
  const usage: Partial<Record<string, number>> = {};
  for (const pkg of Object.values(catalog.packages)) {
    for (const price of pkg.seasonPrices) usage[price.seasonId] = (usage[price.seasonId] ?? 0) + 1;
  }
  return usage;
}

export interface Timeline {
  months: Array<{ key: string; label: string }>;
  bars: Array<{ id: string; name: string; leftPercent: number; widthPercent: number }>;
  todayPercent: number;
}

function monthStart(year: number, monthIndex: number): IsoDate {
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
}

/** Positions seasons on a calendar that starts on the first day of today's month. */
export function buildTimeline(params: {
  seasons: ReadonlyArray<Pick<Season, "id" | "name" | "startDate" | "endDate">>;
  today: IsoDate;
  months: number;
}): Timeline {
  const year = Number(params.today.slice(0, 4));
  const monthIndex = Number(params.today.slice(5, 7)) - 1;
  const start = monthStart(year, monthIndex);
  const endExclusive = monthStart(year, monthIndex + params.months);
  const totalDays = daysInclusive(start, endExclusive) - 1;
  const offset = (date: IsoDate) => daysInclusive(start, date) - 1;

  const months = Array.from({ length: params.months }, (_, index) => {
    const key = monthStart(year, monthIndex + index);
    const month = Number(key.slice(5, 7));
    const label = index === 0 || month === 1 ? `${MONTH_ABBREVIATIONS[month - 1]} ${key.slice(0, 4)}` : MONTH_ABBREVIATIONS[month - 1];
    return { key, label };
  });

  const bars = params.seasons.flatMap((season) => {
    if (season.endDate < start || season.startDate >= endExclusive) return [];
    const from = Math.max(0, offset(season.startDate));
    const to = Math.min(totalDays, offset(season.endDate) + 1);
    return [{ id: season.id, name: season.name, leftPercent: (from / totalDays) * 100, widthPercent: ((to - from) / totalDays) * 100 }];
  });

  return { months, bars, todayPercent: (offset(params.today) / totalDays) * 100 };
}
