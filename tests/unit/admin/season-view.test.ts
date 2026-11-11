import { describe, expect, it } from "vitest";
import { buildTimeline, seasonStatus, seasonUsage } from "@/lib/admin/season-view";
import { makeCatalog, makePackage, makeSeason } from "../pricing/fixtures";

describe("season view helpers", () => {
  it("classifies seasons against today", () => {
    const season = makeSeason({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(seasonStatus(season, "2026-09-30")).toBe("upcoming");
    expect(seasonStatus(season, "2026-10-01")).toBe("current");
    expect(seasonStatus(season, "2026-10-31")).toBe("current");
    expect(seasonStatus(season, "2026-11-01")).toBe("ended");
  });

  it("counts packages with custom prices per season", () => {
    const catalog = makeCatalog({
      packages: {
        a: makePackage({ seasonPrices: [{ seasonId: "s1", USD: 1 }, { seasonId: "s2", USD: 1 }] }),
        b: makePackage({ seasonPrices: [{ seasonId: "s1", USD: 1 }] }),
      },
    });
    expect(seasonUsage(catalog)).toEqual({ s1: 2, s2: 1 });
  });

  it("lays seasons out on an 18-month calendar starting this month", () => {
    const timeline = buildTimeline({
      today: "2026-09-24",
      months: 18,
      seasons: [
        { id: "past", name: "Past", startDate: "2026-07-01", endDate: "2026-08-31" },
        { id: "early", name: "Early", startDate: "2026-08-01", endDate: "2026-09-10" },
        { id: "festive", name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05" },
        { id: "far", name: "Far", startDate: "2028-06-01", endDate: "2028-06-30" },
        { id: "long", name: "Long", startDate: "2027-12-01", endDate: "2028-05-01" },
      ],
    });
    expect(timeline.months).toHaveLength(18);
    expect(timeline.months[0]).toEqual({ key: "2026-09-01", label: "Sep 2026" });
    expect(timeline.months[4]).toEqual({ key: "2027-01-01", label: "Jan 2027" });
    expect(timeline.months[5]).toEqual({ key: "2027-02-01", label: "Feb" });
    expect(timeline.bars.map((bar) => bar.id)).toEqual(["early", "festive", "long"]);
    const [early, festive, long] = timeline.bars;
    expect(early?.leftPercent).toBe(0);
    expect(festive?.leftPercent).toBeGreaterThan(0);
    expect((long?.leftPercent ?? 0) + (long?.widthPercent ?? 0)).toBeCloseTo(100, 5);
    expect(timeline.todayPercent).toBeGreaterThan(0);
    expect(timeline.todayPercent).toBeLessThan(10);
  });
});
