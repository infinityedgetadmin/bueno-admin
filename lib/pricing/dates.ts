import { NAIROBI_TIME_ZONE } from "./constants";
import type { IsoDate } from "./types";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
export const MONTH_ABBREVIATIONS: readonly string[] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const nairobiDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: NAIROBI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(date: IsoDate): [number, number, number] {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid ISO date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** Today's calendar date in Nairobi, e.g. "2026-09-24". */
export function todayInNairobi(now: Date = new Date()): IsoDate {
  const byType = Object.fromEntries(
    nairobiDateFormat.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function compareIsoDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function toUtcMs(date: IsoDate): number {
  const [year, month, day] = parts(date);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

export function addYears(date: IsoDate, years: number): IsoDate {
  const [year, month, day] = parts(date);
  const targetYear = year + years;
  return fromUtcMs(Date.UTC(targetYear, month - 1, Math.min(day, daysInMonth(targetYear, month))));
}

export function daysInclusive(start: IsoDate, end: IsoDate): number {
  return Math.round((toUtcMs(end) - toUtcMs(start)) / DAY_MS) + 1;
}

export function isWithin(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return start <= date && date <= end;
}

interface DateRange {
  startDate: IsoDate;
  endDate: IsoDate;
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function formatDisplayDate(date: IsoDate): string {
  const [year, month, day] = parts(date);
  return `${day} ${MONTH_ABBREVIATIONS[month - 1]} ${year}`;
}

export function formatDateRange(start: IsoDate, end: IsoDate): string {
  const [startYear, startMonth, startDay] = parts(start);
  const [endYear] = parts(end);
  if (startYear === endYear) {
    return `${startDay} ${MONTH_ABBREVIATIONS[startMonth - 1]} – ${formatDisplayDate(end)}`;
  }
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
}

export function daysSince(isoTimestamp: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(isoTimestamp)) / DAY_MS);
}
