import { describe, expect, it } from "vitest";
import {
  catalogInvariantProblems,
  hasErrors,
  validateCurrencyDraft,
  validatePackageDraft,
  validatePromotionDraft,
  validateSeasonDraft,
} from "@/lib/pricing/validation";
import { defaultPackageCommercial } from "@/lib/pricing/defaults";
import type { PackageDraft, PromotionDraft } from "@/lib/pricing/types";
import { TODAY, makeCatalog, makeCurrency, makePackage, makePromotion, makeSeason } from "./fixtures";

const KNOWN = new Set(["coastal-escape", "safari-honeymoon"]);

function draft(overrides: Partial<PackageDraft> = {}): PackageDraft {
  return {
    visible: true,
    display: "price",
    basis: null,
    currencies: { USD: "fixed", KES: "converted" },
    base: { USD: 2800, KES: null },
    seasonPrices: [],
    featuredRank: null,
    ...overrides,
  };
}

function validatePkg(d: PackageDraft, catalog = makeCatalog(), current = defaultPackageCommercial(2800)) {
  return validatePackageDraft({ slug: "coastal-escape", draft: d, current, catalog, knownSlugs: KNOWN });
}

describe("validatePackageDraft — errors", () => {
  it("accepts a valid draft with no warnings", () => {
    expect(validatePkg(draft())).toEqual({ errors: {}, warnings: [] });
  });

  it("rejects unknown packages (P1)", () => {
    const result = validatePackageDraft({
      slug: "gone",
      draft: draft(),
      current: defaultPackageCommercial(1),
      catalog: makeCatalog(),
      knownSlugs: KNOWN,
    });
    expect(result.errors.slug).toBe("This package no longer exists on the website.");
  });

  it("requires a fixed currency and a fixed source for conversions (P3)", () => {
    const result = validatePkg(draft({ currencies: { USD: "converted", KES: "off" } }));
    expect(result.errors.currencies).toBe("Set a fixed price in at least one currency.");
    expect(result.errors["currencies.USD"]).toBe(
      "US dollar prices can only be converted from a fixed Kenyan shilling price.",
    );
  });

  it("requires in-range base amounts for fixed currencies (P4)", () => {
    expect(validatePkg(draft({ base: { USD: null, KES: null } })).errors["base.USD"]).toBe("Enter a US dollar price.");
    expect(validatePkg(draft({ base: { USD: 0, KES: null } })).errors["base.USD"]).toBe(
      "Enter a whole number between $1 and $1,000,000.",
    );
    const kes = validatePkg(draft({ currencies: { USD: "off", KES: "fixed" }, base: { USD: null, KES: 200_000_000 } }));
    expect(kes.errors["base.KES"]).toBe("Enter a whole number between KSh 1 and KSh 150,000,000.");
  });

  it("validates season rows (P5)", () => {
    const catalog = makeCatalog({ seasons: [makeSeason({ id: "s1" })] });
    const result = validatePkg(
      draft({
        seasonPrices: [
          { seasonId: "s1", USD: null, KES: null },
          { seasonId: "s1", USD: 3000, KES: null },
          { seasonId: "ghost", USD: 3000, KES: null },
        ],
      }),
      catalog,
    );
    expect(result.errors["seasonPrices.s1.USD"]).toBe("Enter a US dollar price.");
    expect(result.errors["seasonPrices.s1"]).toBe("This season is listed twice.");
    expect(result.errors["seasonPrices.ghost"]).toBe("This season no longer exists. Remove it and save again.");
    expect(hasErrors(result)).toBe(true);
  });

  it("reports a missing base price even when season prices are valid", () => {
    const catalog = makeCatalog({ seasons: [makeSeason({ id: "s1" })] });
    const result = validatePkg(
      draft({ base: { USD: null, KES: null }, seasonPrices: [{ seasonId: "s1", USD: 3000, KES: null }] }),
      catalog,
    );
    expect(result).toEqual({ errors: { "base.USD": "Enter a US dollar price." }, warnings: [] });
  });
});

describe("validatePackageDraft — warnings", () => {
  it("warns on large base price changes (W1)", () => {
    const result = validatePkg(draft({ base: { USD: 5000, KES: null } }));
    expect(result.warnings).toEqual([
      { id: "W1", message: "The dollar base price changes by 79% ($2,800 → $5,000)." },
    ]);
  });

  it("does not compare against a currency that was not fixed before", () => {
    const current = makePackage({ currencies: { USD: "fixed", KES: "converted" }, base: { USD: 2800 } });
    const result = validatePkg(
      draft({ currencies: { USD: "fixed", KES: "fixed" }, base: { USD: 2800, KES: 362_500 } }),
      makeCatalog(),
      current,
    );
    expect(result.warnings).toEqual([]);
  });

  it("warns when both fixed prices imply a rate far from the house rate (W2)", () => {
    const result = validatePkg(draft({ currencies: { USD: "fixed", KES: "fixed" }, base: { USD: 2800, KES: 36_250 } }));
    expect(result.warnings.map((w) => w.id)).toEqual(["W2"]);
    expect(result.warnings[0]?.message).toBe(
      "These prices imply KSh 12.95 per dollar, but the house rate is KSh 129.5. Check for a missing or extra zero.",
    );
  });

  it("warns on season prices far from the base (W3)", () => {
    const catalog = makeCatalog({
      seasons: [
        makeSeason({ id: "s1", name: "Festive" }),
        makeSeason({ id: "s2", name: "Easter", startDate: "2027-03-20", endDate: "2027-04-05" }),
      ],
    });
    const result = validatePkg(
      draft({
        seasonPrices: [
          { seasonId: "s1", USD: 9000, KES: null },
          { seasonId: "s2", USD: 3000, KES: null },
        ],
      }),
      catalog,
    );
    expect(result.warnings).toEqual([
      { id: "W3", message: "The Festive dollar price is 221% away from the base price ($9,000 vs $2,800)." },
    ]);
  });

  it("warns when converted prices will stay hidden without a rate (W7)", () => {
    const result = validatePkg(draft(), makeCatalog({ currency: null }));
    expect(result.warnings).toEqual([
      { id: "W7", message: "Converted prices stay hidden until the exchange rate is set in Settings." },
    ]);
  });

  describe("when a converted price would be over its currency's limit (W9)", () => {
    // KSh 500 per dollar: $300,000 converts to exactly KSh 150,000,000, the most the site shows.
    const rate500 = makeCatalog({ currency: makeCurrency({ kesPerUsdE4: 5_000_000 }), seasons: [makeSeason({ id: "s1" })] });
    const toShillings = {
      id: "W9",
      message:
        "At the current exchange rate, a price here converts above the KSh 150,000,000 limit, so visitors will only see this package in dollars.",
    };

    it("warns when the base price converts over the limit, and not when it lands exactly on it", () => {
      const current = makePackage({ base: { USD: 300_000 } });
      expect(validatePkg(draft({ base: { USD: 300_001, KES: null } }), rate500, current).warnings).toEqual([toShillings]);
      expect(validatePkg(draft({ base: { USD: 300_000, KES: null } }), rate500, current).warnings).toEqual([]);
    });

    it("warns when only a season price converts over the limit", () => {
      const result = validatePkg(
        draft({ base: { USD: 250_000, KES: null }, seasonPrices: [{ seasonId: "s1", USD: 400_000, KES: null }] }),
        rate500,
        makePackage({ base: { USD: 250_000 } }),
      );
      expect(result.warnings).toEqual([toShillings]);
    });

    it("says visitors will see shillings when dollars are the converted currency", () => {
      const shillingsFixed = { USD: "converted", KES: "fixed" } as const;
      const result = validatePkg(
        draft({ currencies: shillingsFixed, base: { USD: null, KES: 150_000_000 } }),
        makeCatalog({ currency: makeCurrency({ kesPerUsdE4: 500_000 }) }),
        makePackage({ currencies: shillingsFixed, base: { KES: 150_000_000 } }),
      );
      expect(result.warnings).toEqual([
        {
          id: "W9",
          message:
            "At the current exchange rate, a price here converts above the $1,000,000 limit, so visitors will only see this package in shillings.",
        },
      ]);
    });

    it("does not warn when the currency is not converted, or before a rate is set", () => {
      const fixedBoth = draft({ currencies: { USD: "fixed", KES: "fixed" }, base: { USD: 300_001, KES: 150_000_000 } });
      const current = makePackage({ currencies: { USD: "fixed", KES: "fixed" }, base: { USD: 300_001, KES: 150_000_000 } });
      expect(validatePkg(fixedBoth, rate500, current).warnings).toEqual([]);
      const noRate = validatePkg(
        draft({ base: { USD: 300_001, KES: null } }),
        makeCatalog({ currency: null }),
        makePackage({ base: { USD: 300_001 } }),
      );
      expect(noRate.warnings.map((warning) => warning.id)).toEqual(["W7"]);
    });
  });

  it("warns when a hidden package still holds a featured slot (W8)", () => {
    const result = validatePkg(draft({ visible: false, featuredRank: 2 }));
    expect(result.warnings).toEqual([
      { id: "W8", message: "This package is hidden, so it won't appear in featured slot 2 on the homepage." },
    ]);
  });

  it("does not warn about a featured slot while the package stays visible", () => {
    const result = validatePkg(draft({ visible: true, featuredRank: 2 }));
    expect(result.warnings).toEqual([]);
  });

  it("does not warn about visibility when the package holds no featured slot", () => {
    const result = validatePkg(draft({ visible: false, featuredRank: null }));
    expect(result.warnings).toEqual([]);
  });

  it("accepts a shilling-only package and skips cross-currency checks", () => {
    const result = validatePkg(draft({ currencies: { USD: "off", KES: "fixed" }, base: { USD: null, KES: 390_000 } }));
    expect(result).toEqual({ errors: {}, warnings: [] });
  });

  it("skips the implied-rate check until a house rate exists", () => {
    const result = validatePkg(
      draft({ currencies: { USD: "fixed", KES: "fixed" }, base: { USD: 2800, KES: 36_250 } }),
      makeCatalog({ currency: null }),
    );
    expect(result.warnings).toEqual([]);
  });
});

describe("validateSeasonDraft", () => {
  const base = { id: null, name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05" };

  it("accepts a valid season", () => {
    expect(validateSeasonDraft({ draft: base, catalog: makeCatalog(), today: TODAY })).toEqual({ errors: {}, warnings: [] });
  });

  it("checks the name (S1)", () => {
    const result = validateSeasonDraft({ draft: { ...base, name: " X " }, catalog: makeCatalog(), today: TODAY });
    expect(result.errors.name).toBe("Name must be 2–40 characters.");
  });

  it("checks dates (S2)", () => {
    const run = (startDate: string, endDate: string) =>
      validateSeasonDraft({ draft: { ...base, startDate, endDate }, catalog: makeCatalog(), today: TODAY }).errors;
    expect(run("", "2027-01-05").startDate).toBe("Enter a valid start date.");
    expect(run("2026-12-15", "2027-02-30").endDate).toBe("Enter a valid end date.");
    expect(run("2026-12-15", "2026-12-01").endDate).toBe("The end date must be on or after the start date.");
    expect(run("2026-12-15", "2027-12-16").endDate).toBe("A range can cover at most 366 days.");
    expect(run("2026-09-01", "2026-09-23").endDate).toBe("The end date must be today or later.");
    expect(run("2029-09-25", "2029-10-01").startDate).toBe("Start within the next three years.");
  });

  it("rejects overlaps with other seasons but not with itself (S3)", () => {
    const existing = makeSeason({ id: "s1", name: "High season", startDate: "2027-01-01", endDate: "2027-02-01" });
    const catalog = makeCatalog({ seasons: [existing] });
    const clash = validateSeasonDraft({ draft: base, catalog, today: TODAY });
    expect(clash.errors.dates).toBe("Overlaps with “High season” (1 Jan – 1 Feb 2027).");
    const self = validateSeasonDraft({ draft: { ...base, id: "s1" }, catalog, today: TODAY });
    expect(self.errors).toEqual({});
  });
});

describe("validatePromotionDraft", () => {
  const promo: PromotionDraft = {
    id: null,
    name: "Early bird",
    label: "Early Bird",
    percentOff: 15,
    startDate: "2026-09-24",
    endDate: "2026-10-31",
    appliesTo: { kind: "all" },
    terms: "",
  };
  const run = (overrides: Partial<PromotionDraft>, catalog = makeCatalog()) =>
    validatePromotionDraft({ draft: { ...promo, ...overrides }, catalog, today: TODAY, knownSlugs: KNOWN });

  it("accepts a valid promotion", () => {
    expect(run({})).toEqual({ errors: {}, warnings: [] });
  });

  it("checks text lengths (R1)", () => {
    const result = run({ name: "x", label: "L", terms: "t".repeat(161) });
    expect(result.errors.name).toBe("Internal name must be 2–60 characters.");
    expect(result.errors.label).toBe("Badge text must be 2–24 characters.");
    expect(result.errors.terms).toBe("Terms must be 160 characters or fewer.");
    expect(run({ label: "x".repeat(25) }).errors.label).toBe("Badge text must be 2–24 characters.");
  });

  it("checks the percentage (R2) and drops warnings when there are errors", () => {
    expect(run({ percentOff: null }).errors.percentOff).toBe("Enter a discount percentage.");
    expect(run({ percentOff: 0 }).errors.percentOff).toBe("Enter a whole percentage from 1 to 90.");
    expect(run({ percentOff: 95 }).errors.percentOff).toBe("Enter a whole percentage from 1 to 90.");
    expect(run({ percentOff: 12.5 }).errors.percentOff).toBe("Enter a whole percentage from 1 to 90.");
    expect(run({ percentOff: 150 }).errors.percentOff).toBe("Enter a whole percentage from 1 to 90.");
    expect(run({ percentOff: -5 }).errors.percentOff).toBe("Enter a whole percentage from 1 to 90.");
    expect(run({ percentOff: 60, name: "x" }).warnings).toEqual([]);
  });

  it("checks dates (R3)", () => {
    expect(run({ endDate: "2026-09-01", startDate: "2026-08-01" }).errors.endDate).toBe(
      "The end date must be today or later.",
    );
  });

  it("checks targeted packages (R4)", () => {
    expect(run({ appliesTo: { kind: "packages", slugs: [] } }).errors.appliesTo).toBe("Choose at least one package.");
    expect(run({ appliesTo: { kind: "packages", slugs: ["coastal-escape", "coastal-escape"] } }).errors.appliesTo).toBe(
      "Each package can only be chosen once.",
    );
    expect(run({ appliesTo: { kind: "packages", slugs: ["gone"] } }).errors.appliesTo).toBe(
      "Some chosen packages no longer exist.",
    );
  });

  it("warns on large discounts (W4) and overlapping promotions (W5)", () => {
    const other = makePromotion({ id: "other", name: "Flash sale", appliesTo: { kind: "packages", slugs: ["coastal-escape"] } });
    const storewide = makePromotion({ id: "all-live", name: "Storewide" });
    const paused = makePromotion({ id: "p", name: "Paused", paused: true });
    const ended = makePromotion({ id: "e", name: "Ended", startDate: "2026-08-01", endDate: "2026-08-31" });
    const later = makePromotion({ id: "later", name: "Later", startDate: "2026-12-01", endDate: "2026-12-31" });
    const elsewhere = makePromotion({ id: "x", name: "Elsewhere", appliesTo: { kind: "packages", slugs: ["safari-honeymoon"] } });
    const catalog = makeCatalog({ promotions: [other, storewide, paused, ended, later, elsewhere] });
    const result = run({ percentOff: 60, appliesTo: { kind: "packages", slugs: ["coastal-escape"] } }, catalog);
    expect(result.warnings).toEqual([
      { id: "W4", message: "This is a large discount (60% off). Double-check it before it goes live." },
      { id: "W5", message: "Where promotions overlap, only the larger discount shows: “Flash sale”, “Storewide”." },
    ]);
  });

  it("warns when an all-packages promotion overlaps a targeted one", () => {
    const targeted = makePromotion({ id: "t", name: "Targeted", appliesTo: { kind: "packages", slugs: ["coastal-escape"] } });
    expect(run({}, makeCatalog({ promotions: [targeted] })).warnings).toEqual([
      { id: "W5", message: "Where promotions overlap, only the larger discount shows: “Targeted”." },
    ]);
  });

  it("does not warn about itself when editing", () => {
    const self = makePromotion({ id: "self" });
    expect(run({ id: "self" }, makeCatalog({ promotions: [self] })).warnings).toEqual([]);
  });
});

describe("validateCurrencyDraft", () => {
  it("parses a valid rate and steps", () => {
    const result = validateCurrencyDraft({ draft: { rate: "129.5", roundingStep: { USD: 1, KES: 500 } }, current: null });
    expect(result).toEqual({
      errors: {},
      warnings: [],
      parsed: { kesPerUsdE4: 1_295_000, roundingStep: { USD: 1, KES: 500 } },
    });
  });

  it("rejects malformed or out-of-range rates and unknown steps (C1, C2)", () => {
    const malformed = validateCurrencyDraft({ draft: { rate: "abc", roundingStep: { USD: 3, KES: 7 } }, current: null });
    expect(malformed.parsed).toBeNull();
    expect(malformed.errors).toEqual({
      rate: "Enter the rate as a number, for example 129.5 (up to 4 decimal places).",
      "roundingStep.USD": "Choose a rounding option from the list.",
      "roundingStep.KES": "Choose a rounding option from the list.",
    });
    const low = validateCurrencyDraft({ draft: { rate: "49.99", roundingStep: { USD: 1, KES: 500 } }, current: null });
    expect(low.errors.rate).toBe("Enter a rate between 50 and 500 shillings per dollar.");
  });

  it("reports rounding errors even when the rate is valid", () => {
    expect(
      validateCurrencyDraft({ draft: { rate: "129.5", roundingStep: { USD: 3, KES: 500 } }, current: null }).errors,
    ).toEqual({ "roundingStep.USD": "Choose a rounding option from the list." });
    expect(
      validateCurrencyDraft({ draft: { rate: "129.5", roundingStep: { USD: 1, KES: 7 } }, current: null }).errors,
    ).toEqual({ "roundingStep.KES": "Choose a rounding option from the list." });
  });

  it("warns on large rate changes (W6) only", () => {
    const result = validateCurrencyDraft({
      draft: { rate: "150", roundingStep: { USD: 1, KES: 500 } },
      current: makeCurrency(),
    });
    expect(result.warnings).toEqual([
      { id: "W6", message: "The rate changes by 16% (KSh 129.5 → KSh 150 per dollar)." },
    ]);
    const small = validateCurrencyDraft({ draft: { rate: "130", roundingStep: { USD: 1, KES: 500 } }, current: makeCurrency() });
    expect(small.warnings).toEqual([]);
  });
});

describe("catalogInvariantProblems", () => {
  it("accepts a consistent catalog", () => {
    const catalog = makeCatalog({
      seasons: [makeSeason({ id: "s1" })],
      promotions: [makePromotion({ appliesTo: { kind: "packages", slugs: ["coastal-escape"] } })],
      packages: {
        "coastal-escape": makePackage({ seasonPrices: [{ seasonId: "s1", USD: 3000 }], featuredRank: 1 }),
      },
    });
    expect(catalogInvariantProblems(catalog, KNOWN)).toEqual([]);
  });

  it("reports every class of inconsistency", () => {
    const catalog = makeCatalog({
      seasons: [
        makeSeason({ id: "s1", startDate: "2026-12-01", endDate: "2026-12-31" }),
        makeSeason({ id: "s1", startDate: "2026-12-20", endDate: "2027-01-10" }),
        makeSeason({ id: "s2", startDate: "2027-03-01", endDate: "2027-02-01" }),
      ],
      promotions: [
        makePromotion({ id: "p1", appliesTo: { kind: "packages", slugs: ["gone"] } }),
        makePromotion({ id: "p1", startDate: "2026-11-01", endDate: "2026-10-01" }),
        makePromotion({ id: "p2", appliesTo: { kind: "packages", slugs: [] } }),
      ],
      packages: {
        gone: makePackage(),
        "coastal-escape": makePackage({
          currencies: { USD: "converted", KES: "converted" },
          featuredRank: 1,
        }),
        "safari-honeymoon": makePackage({
          base: {},
          seasonPrices: [{ seasonId: "ghost", USD: 1 }, { seasonId: "s1" }, { seasonId: "s1", USD: 5 }],
          featuredRank: 1,
        }),
      },
    });
    expect(catalogInvariantProblems(catalog, KNOWN)).toEqual([
      "Duplicate season id s1.",
      "Season s2 has an invalid date range.",
      "Seasons s1 and s1 overlap.",
      "Promotion p1 targets unknown package gone.",
      "Duplicate promotion id p1.",
      "Promotion p1 has an invalid date range.",
      "Promotion p2 targets no packages.",
      "Unknown package gone.",
      "Package coastal-escape has no fixed currency.",
      "Package coastal-escape converts USD from a currency that is not fixed.",
      "Package coastal-escape converts KES from a currency that is not fixed.",
      "Package safari-honeymoon is missing a valid USD base price.",
      "Package safari-honeymoon prices unknown season ghost.",
      "Package safari-honeymoon is missing a valid USD price for season s1.",
      "Package safari-honeymoon prices season s1 twice.",
      "Packages coastal-escape and safari-honeymoon share featured slot 1.",
    ]);
  });

  it("flags malformed dates and out-of-range amounts", () => {
    const catalog = makeCatalog({
      seasons: [
        makeSeason({ id: "a", startDate: "bad" }),
        makeSeason({ id: "b", startDate: "2027-05-01", endDate: "bad" }),
      ],
      promotions: [makePromotion({ id: "p1", startDate: "bad" }), makePromotion({ id: "p2", endDate: "bad" })],
      packages: {
        "coastal-escape": makePackage({ base: { USD: 0 }, seasonPrices: [{ seasonId: "a", USD: 0 }] }),
      },
    });
    expect(catalogInvariantProblems(catalog, KNOWN)).toEqual([
      "Season a has an invalid date range.",
      "Season b has an invalid date range.",
      "Promotion p1 has an invalid date range.",
      "Promotion p2 has an invalid date range.",
      "Package coastal-escape is missing a valid USD base price.",
      "Package coastal-escape is missing a valid USD price for season a.",
    ]);
  });

  it("catches an overlap with an earlier, wider season, not just its immediate neighbour", () => {
    const wide = makeSeason({ id: "a", startDate: "2027-01-01", endDate: "2027-04-10" });
    const nested = makeSeason({ id: "b", startDate: "2027-01-02", endDate: "2027-01-03" });
    const alsoNested = makeSeason({ id: "c", startDate: "2027-02-19", endDate: "2027-02-20" });
    const catalog = makeCatalog({ seasons: [wide, nested, alsoNested] });
    expect(catalogInvariantProblems(catalog, KNOWN)).toEqual([
      "Seasons a and b overlap.",
      "Seasons a and c overlap.",
    ]);
  });
});
