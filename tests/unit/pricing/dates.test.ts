import { describe, expect, it } from "vitest";
import {
  addDays,
  addYears,
  compareIsoDates,
  daysInclusive,
  daysSince,
  formatDateRange,
  formatDisplayDate,
  isIsoDate,
  isWithin,
  rangesOverlap,
  toUtcMs,
  todayInNairobi,
} from "@/lib/pricing/dates";

describe("isIsoDate", () => {
  it("accepts real calendar dates, including leap days", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-12-31")).toBe(true);
  });

  it("rejects impossible or malformed dates", () => {
    for (const bad of ["2026-02-29", "2026-13-01", "2026-00-10", "2026-01-00", "2026-1-01", "abc", ""]) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });
});

describe("todayInNairobi", () => {
  it("uses East Africa Time (UTC+3)", () => {
    expect(todayInNairobi(new Date("2026-09-24T20:59:59Z"))).toBe("2026-09-24");
    expect(todayInNairobi(new Date("2026-09-24T21:00:00Z"))).toBe("2026-09-25");
  });

  it("defaults to the current time", () => {
    expect(isIsoDate(todayInNairobi())).toBe(true);
  });
});

describe("arithmetic", () => {
  it("compares dates", () => {
    expect(compareIsoDates("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compareIsoDates("2026-01-02", "2026-01-01")).toBe(1);
    expect(compareIsoDates("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds years and clamps 29 February", () => {
    expect(addYears("2026-09-24", 3)).toBe("2029-09-24");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
  });

  it("counts days inclusively", () => {
    expect(daysInclusive("2026-01-01", "2026-01-01")).toBe(1);
    expect(daysInclusive("2026-01-01", "2026-12-31")).toBe(365);
    expect(daysInclusive("2028-01-01", "2028-12-31")).toBe(366);
  });

  it("checks inclusive membership and overlap", () => {
    expect(isWithin("2026-07-01", "2026-07-01", "2026-10-31")).toBe(true);
    expect(isWithin("2026-10-31", "2026-07-01", "2026-10-31")).toBe(true);
    expect(isWithin("2026-11-01", "2026-07-01", "2026-10-31")).toBe(false);
    expect(isWithin("2026-06-30", "2026-07-01", "2026-10-31")).toBe(false);
    const a = { startDate: "2026-07-01", endDate: "2026-07-10" };
    expect(rangesOverlap(a, { startDate: "2026-07-10", endDate: "2026-07-20" })).toBe(true);
    expect(rangesOverlap(a, { startDate: "2026-07-11", endDate: "2026-07-20" })).toBe(false);
    expect(rangesOverlap(a, { startDate: "2026-06-01", endDate: "2026-06-30" })).toBe(false);
  });

  it("throws on malformed input to arithmetic helpers", () => {
    expect(() => toUtcMs("24/09/2026")).toThrow(RangeError);
  });

  it("counts whole days since a timestamp", () => {
    expect(daysSince("2026-09-01T00:00:00.000Z", new Date("2026-09-24T12:00:00Z"))).toBe(23);
  });
});

describe("display formatting", () => {
  it("formats a single date", () => {
    expect(formatDisplayDate("2026-12-05")).toBe("5 Dec 2026");
  });

  it("formats ranges within one year and across years", () => {
    expect(formatDateRange("2026-07-01", "2026-10-31")).toBe("1 Jul – 31 Oct 2026");
    expect(formatDateRange("2026-12-15", "2027-01-05")).toBe("15 Dec 2026 – 5 Jan 2027");
  });
});
