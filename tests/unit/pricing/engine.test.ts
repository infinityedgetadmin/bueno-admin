import { describe, expect, it } from "vitest";
import {
  activePromotionFor,
  applyPromotion,
  buildPriceSheet,
  fromPrice,
  priceForDate,
  promotionAppliesTo,
  promotionStatus,
  quoteForDate,
  resolveAmount,
  seasonalRateTable,
} from "@/lib/pricing/engine";
import type { ConversionContext, PriceSheet, RoundingSteps } from "@/lib/pricing/types";
import { TODAY, makeCatalog, makeCurrency, makePackage, makePromotion, makeSeason } from "./fixtures";

const CONVERSION = { kesPerUsdE4: 1_295_000, roundingStep: { USD: 1 as const, KES: 500 as const } };

describe("promotionStatus", () => {
  it("classifies promotions against today (inclusive window)", () => {
    const promo = makePromotion({ startDate: "2026-09-24", endDate: "2026-09-30" });
    expect(promotionStatus(promo, "2026-09-23")).toBe("scheduled");
    expect(promotionStatus(promo, "2026-09-24")).toBe("live");
    expect(promotionStatus(promo, "2026-09-30")).toBe("live");
    expect(promotionStatus(promo, "2026-10-01")).toBe("ended");
    expect(promotionStatus({ ...promo, paused: true }, "2026-09-25")).toBe("paused");
  });

  it("matches targeted packages", () => {
    expect(promotionAppliesTo(makePromotion(), "anything")).toBe(true);
    const targeted = makePromotion({ appliesTo: { kind: "packages", slugs: ["coastal-escape"] } });
    expect(promotionAppliesTo(targeted, "coastal-escape")).toBe(true);
    expect(promotionAppliesTo(targeted, "safari-honeymoon")).toBe(false);
  });
});

describe("activePromotionFor", () => {
  it("returns null when nothing is live for the package", () => {
    const promotions = [
      makePromotion({ id: "a", paused: true }),
      makePromotion({ id: "b", endDate: "2026-09-23" }),
      makePromotion({ id: "c", startDate: "2026-09-25" }),
      makePromotion({ id: "d", appliesTo: { kind: "packages", slugs: ["other"] } }),
    ];
    expect(activePromotionFor(promotions, "coastal-escape", TODAY)).toBeNull();
  });

  it("prefers the largest discount, then the soonest end, then the lower id", () => {
    const small = makePromotion({ id: "small", percentOff: 10 });
    const bigLate = makePromotion({ id: "big-late", percentOff: 20, endDate: "2026-12-31" });
    const bigSoon = makePromotion({ id: "big-soon", percentOff: 20, endDate: "2026-10-15" });
    const bigSoonB = makePromotion({ id: "big-soon-b", percentOff: 20, endDate: "2026-10-15" });
    expect(activePromotionFor([small, bigLate, bigSoonB, bigSoon], "x", TODAY)?.id).toBe("big-soon");
  });
});

describe("resolveAmount", () => {
  const modes = { USD: "fixed", KES: "converted" } as const;

  it("returns fixed amounts and null when missing", () => {
    expect(resolveAmount(modes, { USD: 4500 }, "USD", CONVERSION)).toBe(4500);
    expect(resolveAmount(modes, {}, "USD", CONVERSION)).toBeNull();
  });

  it("converts from the fixed currency when a rate is set", () => {
    expect(resolveAmount(modes, { USD: 4500 }, "KES", CONVERSION)).toBe(583_000);
    expect(resolveAmount(modes, { USD: 4500 }, "KES", null)).toBeNull();
    expect(resolveAmount(modes, {}, "KES", CONVERSION)).toBeNull();
  });

  it("returns null for currencies that are off or converted from a non-fixed currency", () => {
    expect(resolveAmount({ USD: "fixed", KES: "off" }, { USD: 4500 }, "KES", CONVERSION)).toBeNull();
    expect(resolveAmount({ USD: "converted", KES: "converted" }, { USD: 4500 }, "KES", CONVERSION)).toBeNull();
  });

  describe("conversions outside the target currency's limits", () => {
    const toUsd = { USD: "converted", KES: "fixed" } as const;
    const atRate = (kesPerUsdE4: number, roundingStep: RoundingSteps = { USD: 1, KES: 1 }): ConversionContext => ({
      kesPerUsdE4,
      roundingStep,
    });
    const RATE_50 = atRate(500_000);
    const RATE_500 = atRate(5_000_000);

    it("hides a dollar price above $1,000,000 (KSh 150,000,000 at 50 is $3,000,000)", () => {
      expect(resolveAmount(toUsd, { KES: 150_000_000 }, "USD", RATE_50)).toBeNull();
    });

    it("hides a shilling price above KSh 150,000,000 ($1,000,000 at 500 is KSh 500,000,000)", () => {
      expect(resolveAmount(modes, { USD: 1_000_000 }, "KES", RATE_500)).toBeNull();
    });

    it("keeps a conversion that lands exactly on the limit and hides one unit over it", () => {
      expect(resolveAmount(toUsd, { KES: 50_000_000 }, "USD", RATE_50)).toBe(1_000_000);
      expect(resolveAmount(toUsd, { KES: 50_000_050 }, "USD", RATE_50)).toBeNull();
      expect(resolveAmount(modes, { USD: 300_000 }, "KES", RATE_500)).toBe(150_000_000);
      expect(resolveAmount(modes, { USD: 300_001 }, "KES", RATE_500)).toBeNull();
    });

    it("checks the limit after rounding to the step", () => {
      // $1,000,000.48 rounds down onto the limit; $1,000,000.98 rounds up past it.
      expect(resolveAmount(toUsd, { KES: 50_000_024 }, "USD", RATE_50)).toBe(1_000_000);
      expect(resolveAmount(toUsd, { KES: 50_000_049 }, "USD", RATE_50)).toBeNull();
      // KSh 149,999,500 rounds up to the limit at a KSh 1,000 step; KSh 150,000,500 rounds past it.
      const rate500Steps1000 = atRate(5_000_000, { USD: 1, KES: 1000 });
      expect(resolveAmount(modes, { USD: 299_999 }, "KES", rate500Steps1000)).toBe(150_000_000);
      expect(resolveAmount(modes, { USD: 300_001 }, "KES", rate500Steps1000)).toBeNull();
    });
  });
});

describe("buildPriceSheet", () => {
  it("returns null for packages shown as 'Chat with an agent'", () => {
    const pkg = makePackage({ display: "enquire" });
    expect(buildPriceSheet({ slug: "x", pkg, catalog: makeCatalog(), today: TODAY })).toBeNull();
  });

  it("returns null when no currency can be priced", () => {
    const pkg = makePackage({ currencies: { USD: "fixed", KES: "off" }, base: {} });
    expect(buildPriceSheet({ slug: "x", pkg, catalog: makeCatalog(), today: TODAY })).toBeNull();
  });

  it("prices both currencies and keeps upcoming seasons in start order", () => {
    const later = makeSeason({ id: "s2", name: "Easter", startDate: "2027-03-20", endDate: "2027-04-05" });
    const sooner = makeSeason({ id: "s1", name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05" });
    const ended = makeSeason({ id: "s0", name: "Old", startDate: "2026-07-01", endDate: "2026-09-23" });
    const endsToday = makeSeason({ id: "s3", name: "Last day", startDate: "2026-09-20", endDate: TODAY });
    const pkg = makePackage({
      basis: "per_person",
      seasonPrices: [
        { seasonId: "s2", USD: 5200 },
        { seasonId: "s1", USD: 5600 },
        { seasonId: "s0", USD: 9999 },
        { seasonId: "s3", USD: 4800 },
        { seasonId: "deleted", USD: 1 },
      ],
    });
    const catalog = makeCatalog({ seasons: [later, sooner, ended, endsToday] });
    const sheet = buildPriceSheet({ slug: "x", pkg, catalog, today: TODAY });
    expect(sheet).toEqual({
      asOf: TODAY,
      basis: "per_person",
      promotion: null,
      currencies: {
        USD: {
          standard: 4500,
          step: 1,
          seasons: [
            { seasonId: "s3", name: "Last day", startDate: "2026-09-20", endDate: TODAY, amount: 4800 },
            { seasonId: "s1", name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05", amount: 5600 },
            { seasonId: "s2", name: "Easter", startDate: "2027-03-20", endDate: "2027-04-05", amount: 5200 },
          ],
        },
        KES: {
          standard: 583_000,
          step: 500,
          seasons: [
            { seasonId: "s3", name: "Last day", startDate: "2026-09-20", endDate: TODAY, amount: 621_500 },
            { seasonId: "s1", name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05", amount: 725_000 },
            { seasonId: "s2", name: "Easter", startDate: "2027-03-20", endDate: "2027-04-05", amount: 673_500 },
          ],
        },
      },
    });
  });

  it("omits converted currencies until a rate is set, and attaches the live promotion", () => {
    const catalog = makeCatalog({ currency: null, promotions: [makePromotion({ terms: "Book by 31 Oct" })] });
    const sheet = buildPriceSheet({ slug: "x", pkg: makePackage(), catalog, today: TODAY });
    expect(sheet?.currencies.KES).toBeUndefined();
    expect(sheet?.currencies.USD).toEqual({ standard: 4500, seasons: [], step: 1 });
    expect(sheet?.promotion).toEqual({
      id: "promo-early",
      label: "Early Bird",
      percentOff: 15,
      endDate: "2026-10-31",
      terms: "Book by 31 Oct",
    });
  });

  it("leaves a currency out when one of its upcoming season prices cannot be resolved", () => {
    const catalog = makeCatalog({ seasons: [makeSeason({ id: "s1" })] });
    const pkg = makePackage({
      currencies: { USD: "fixed", KES: "fixed" },
      base: { USD: 4500, KES: 580_000 },
      seasonPrices: [{ seasonId: "s1", USD: 5000 }],
    });
    const sheet = buildPriceSheet({ slug: "x", pkg, catalog, today: TODAY });
    expect(sheet?.currencies.USD?.seasons).toHaveLength(1);
    expect(sheet?.currencies.KES).toBeUndefined();
  });

  describe("when a converted price would be over the limit", () => {
    // KSh 500 per dollar: $300,000 converts to exactly KSh 150,000,000, anything more is over.
    const catalog = makeCatalog({
      currency: makeCurrency({ kesPerUsdE4: 5_000_000 }),
      seasons: [makeSeason({ id: "s1", name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05" })],
    });

    it("shows only the fixed currency when the standard price converts over the limit", () => {
      const sheet = buildPriceSheet({ slug: "x", pkg: makePackage({ base: { USD: 1_000_000 } }), catalog, today: TODAY });
      expect(sheet?.currencies).toEqual({ USD: { standard: 1_000_000, seasons: [], step: 1 } });
    });

    it("shows only the fixed currency when one upcoming season converts over the limit", () => {
      const pkg = makePackage({ base: { USD: 250_000 }, seasonPrices: [{ seasonId: "s1", USD: 400_000 }] });
      const sheet = buildPriceSheet({ slug: "x", pkg, catalog, today: TODAY });
      expect(Object.keys(sheet?.currencies ?? {})).toEqual(["USD"]);
      expect(sheet?.currencies.USD?.seasons.map((row) => row.amount)).toEqual([400_000]);
      if (sheet === null) throw new Error("expected a sheet");
      // The booking estimate and stored quote fall back to dollars instead of quoting shillings
      // for the season's dates at the standard rate.
      expect(priceForDate(sheet, "KES", "2026-12-20")).toBeNull();
      expect(quoteForDate(sheet, "KES", "2026-12-20")).toMatchObject({ currency: "USD", amount: 400_000, seasonName: "Festive" });
      expect(seasonalRateTable(sheet).map((row) => Object.keys(row.prices))).toEqual([["USD"], ["USD"]]);
    });

    it("keeps both currencies when every converted price is within the limit", () => {
      const pkg = makePackage({ base: { USD: 250_000 }, seasonPrices: [{ seasonId: "s1", USD: 300_000 }] });
      const sheet = buildPriceSheet({ slug: "x", pkg, catalog, today: TODAY });
      expect(sheet?.currencies.KES).toEqual({
        standard: 125_000_000,
        step: 500,
        seasons: [{ seasonId: "s1", name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05", amount: 150_000_000 }],
      });
    });
  });
});

function sheetWith(overrides: Partial<PriceSheet> = {}): PriceSheet {
  return {
    asOf: TODAY,
    basis: "per_person",
    promotion: null,
    currencies: {
      USD: {
        standard: 4500,
        step: 1,
        seasons: [{ seasonId: "s1", name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05", amount: 5600 }],
      },
      KES: {
        standard: 583_000,
        step: 500,
        seasons: [{ seasonId: "s1", name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05", amount: 552_000 }],
      },
    },
    ...overrides,
  };
}

const PROMO = { id: "p", label: "Early Bird", percentOff: 15, endDate: "2026-10-31", terms: null };

describe("applyPromotion", () => {
  it("returns the amount untouched without a promotion", () => {
    expect(applyPromotion(4500, null, 1)).toEqual({ amount: 4500, original: null });
  });

  it("discounts and keeps the original", () => {
    expect(applyPromotion(4500, PROMO, 1)).toEqual({ amount: 3825, original: 4500 });
  });

  it("drops the discount when it would have no effect", () => {
    expect(applyPromotion(1, PROMO, 1)).toEqual({ amount: 1, original: null });
  });
});

describe("fromPrice", () => {
  it("takes the lowest of the standard and upcoming season prices", () => {
    expect(fromPrice(sheetWith(), "USD")).toEqual({ amount: 4500, original: null });
    expect(fromPrice(sheetWith(), "KES")).toEqual({ amount: 552_000, original: null });
  });

  it("applies the promotion after picking the lowest price", () => {
    expect(fromPrice(sheetWith({ promotion: PROMO }), "KES")).toEqual({ amount: 469_000, original: 552_000 });
  });

  it("returns null for a currency the package does not offer", () => {
    expect(fromPrice(sheetWith({ currencies: {} }), "USD")).toBeNull();
  });
});

describe("priceForDate", () => {
  it("uses the season price inside a season and the standard price outside", () => {
    expect(priceForDate(sheetWith(), "USD", "2026-12-20")).toEqual({ amount: 5600, original: null, seasonName: "Festive" });
    expect(priceForDate(sheetWith(), "USD", "2026-11-20")).toEqual({ amount: 4500, original: null, seasonName: null });
  });

  it("applies the promotion", () => {
    expect(priceForDate(sheetWith({ promotion: PROMO }), "USD", "2026-11-20")).toEqual({
      amount: 3825,
      original: 4500,
      seasonName: null,
    });
  });

  it("returns null for past, invalid or unavailable dates", () => {
    expect(priceForDate(sheetWith(), "USD", "2026-09-23")).toBeNull();
    expect(priceForDate(sheetWith(), "USD", "2026-02-30")).toBeNull();
    expect(priceForDate(sheetWith({ currencies: {} }), "USD", "2026-11-20")).toBeNull();
  });
});

describe("seasonalRateTable", () => {
  it("is empty without season rows", () => {
    const sheet = sheetWith({ currencies: { USD: { standard: 4500, step: 1, seasons: [] } } });
    expect(seasonalRateTable(sheet)).toEqual([]);
  });

  it("lists seasons by start date then the standard rate, per currency", () => {
    const sheet = sheetWith({ promotion: PROMO });
    const easter = { seasonId: "s2", name: "Easter", startDate: "2027-03-20", endDate: "2027-04-05", amount: 5200 };
    const usd = sheet.currencies.USD;
    if (!usd) throw new Error("fixture missing USD");
    sheet.currencies.USD = { ...usd, seasons: [easter, ...usd.seasons] };
    expect(seasonalRateTable(sheet)).toEqual([
      {
        key: "s1",
        label: "Festive",
        dates: { startDate: "2026-12-15", endDate: "2027-01-05" },
        prices: { USD: { amount: 4760, original: 5600 }, KES: { amount: 469_000, original: 552_000 } },
      },
      {
        key: "s2",
        label: "Easter",
        dates: { startDate: "2027-03-20", endDate: "2027-04-05" },
        prices: { USD: { amount: 4420, original: 5200 } },
      },
      {
        key: "standard",
        label: "Standard rate",
        dates: null,
        prices: { USD: { amount: 3825, original: 4500 }, KES: { amount: 495_500, original: 583_000 } },
      },
    ]);
  });
});

describe("seasonalRateTable with a single currency", () => {
  it("only prices the currencies the package offers", () => {
    const full = sheetWith();
    const usdOnly: PriceSheet = { ...full, currencies: { USD: full.currencies.USD } };
    expect(seasonalRateTable(usdOnly).map((row) => Object.keys(row.prices))).toEqual([["USD"], ["USD"]]);
  });
});

describe("quoteForDate", () => {
  it("quotes in the preferred currency", () => {
    expect(quoteForDate(sheetWith({ promotion: PROMO }), "KES", "2026-12-20")).toEqual({
      currency: "KES",
      amount: 469_000,
      original: 552_000,
      basis: "per_person",
      seasonName: "Festive",
      promotionLabel: "Early Bird",
      travelDate: "2026-12-20",
    });
  });

  it("falls back to the other currency when the preferred one is not offered", () => {
    const sheet = sheetWith();
    const usdOnly = { ...sheet, currencies: { USD: sheet.currencies.USD } };
    expect(quoteForDate(usdOnly, "KES", "2026-11-20")?.currency).toBe("USD");
  });

  it("omits the promotion label when the discount had no effect, and returns null for past dates", () => {
    const sheet: PriceSheet = {
      asOf: TODAY,
      basis: null,
      promotion: PROMO,
      currencies: { USD: { standard: 1, step: 1, seasons: [] } },
    };
    expect(quoteForDate(sheet, "USD", "2026-11-20")?.promotionLabel).toBeNull();
    expect(quoteForDate(sheet, "USD", "2026-01-01")).toBeNull();
  });
});
