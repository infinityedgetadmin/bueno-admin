import { describe, expect, it } from "vitest";
import {
  adminUserSchema,
  auditRecordSchema,
  currencyFormSchema,
  packageFormSchema,
  pricingCatalogSchema,
  promotionFormSchema,
  promotionSchema,
  seasonFormSchema,
  sessionRequestSchema,
  teamAddSchema,
} from "@/lib/pricing/schemas";
import { makeCatalog, makePackage, makePromotion, makeSeason } from "./fixtures";

describe("pricingCatalogSchema", () => {
  it("accepts a complete catalog", () => {
    const catalog = makeCatalog({
      seasons: [makeSeason()],
      promotions: [makePromotion()],
      packages: {
        "coastal-escape": makePackage({ seasonPrices: [{ seasonId: "season-high", USD: 3200 }] }),
      },
    });
    expect(pricingCatalogSchema.safeParse(catalog).success).toBe(true);
  });

  it("accepts a catalog whose exchange rate was never set", () => {
    expect(pricingCatalogSchema.safeParse(makeCatalog({ currency: null })).success).toBe(true);
  });

  it("rejects an unknown schema version", () => {
    expect(pricingCatalogSchema.safeParse({ ...makeCatalog(), schemaVersion: 2 }).success).toBe(false);
  });

  it("rejects fractional, zero or oversized amounts", () => {
    for (const USD of [4500.5, 0, 150_000_001]) {
      const catalog = makeCatalog({ packages: { x: makePackage({ base: { USD } }) } });
      expect(pricingCatalogSchema.safeParse(catalog).success).toBe(false);
    }

    const overUsd = makeCatalog({ packages: { x: makePackage({ base: { USD: 1_000_001 } }) } });
    expect(pricingCatalogSchema.safeParse(overUsd).success).toBe(false);

    const maxUsd = makeCatalog({ packages: { x: makePackage({ base: { USD: 1_000_000 } }) } });
    expect(pricingCatalogSchema.safeParse(maxUsd).success).toBe(true);

    const maxKes = makeCatalog({
      packages: {
        x: makePackage({ currencies: { USD: "off", KES: "fixed" }, base: { KES: 150_000_000 } }),
      },
    });
    expect(pricingCatalogSchema.safeParse(maxKes).success).toBe(true);
  });

  it("rejects impossible dates and unknown modes", () => {
    expect(
      pricingCatalogSchema.safeParse(makeCatalog({ seasons: [makeSeason({ startDate: "2026-02-30" })] })).success,
    ).toBe(false);
    const badMode = { ...makePackage(), currencies: { USD: "fixed", KES: "auto" } };
    expect(pricingCatalogSchema.safeParse({ ...makeCatalog(), packages: { x: badMode } }).success).toBe(false);
  });

  it("rejects a rate outside 50–500", () => {
    const low = makeCatalog();
    expect(
      pricingCatalogSchema.safeParse({ ...low, currency: { ...low.currency, kesPerUsdE4: 499_999 } }).success,
    ).toBe(false);
  });

  it("requires stored promotions to target at least one package", () => {
    expect(
      promotionSchema.safeParse(makePromotion({ appliesTo: { kind: "packages", slugs: [] } })).success,
    ).toBe(false);
  });
});

describe("form schemas", () => {
  const packageForm = {
    slug: "coastal-escape",
    expectedVersion: 0,
    confirmed: false,
    visible: true,
    display: "price",
    basis: null,
    currencies: { USD: "fixed", KES: "converted" },
    base: { USD: 2800, KES: null },
    seasonPrices: [{ seasonId: "season-high", USD: null, KES: null }],
    featuredRank: null,
  };

  it("accepts a package form with empty (null) amounts", () => {
    expect(packageFormSchema.safeParse(packageForm).success).toBe(true);
  });

  it("rejects a negative expected version", () => {
    expect(packageFormSchema.safeParse({ ...packageForm, expectedVersion: -1 }).success).toBe(false);
  });

  it("accepts season, promotion and currency forms", () => {
    expect(
      seasonFormSchema.safeParse({
        id: null,
        expectedVersion: 0,
        name: "High season",
        startDate: "2026-12-15",
        endDate: "2027-01-05",
      }).success,
    ).toBe(true);
    expect(
      promotionFormSchema.safeParse({
        id: null,
        expectedVersion: 0,
        name: "Early bird",
        label: "Early Bird",
        percentOff: null,
        startDate: "",
        endDate: "",
        appliesTo: { kind: "packages", slugs: [] },
        terms: "",
        confirmed: false,
      }).success,
    ).toBe(true);
    expect(
      currencyFormSchema.safeParse({
        expectedVersion: 0,
        rate: "129.5",
        roundingStep: { USD: 1, KES: 500 },
        confirmed: false,
      }).success,
    ).toBe(true);
  });
});

describe("promotion form percentage", () => {
  const promotionForm = {
    id: null,
    expectedVersion: 0,
    name: "Early bird",
    label: "Early Bird",
    percentOff: 20,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    appliesTo: { kind: "all" },
    terms: "",
    confirmed: false,
  };

  it("passes any number through, leaving range and wholeness to domain validation", () => {
    for (const percentOff of [150, 0, -5, 12.5, 100_000]) {
      expect(promotionFormSchema.safeParse({ ...promotionForm, percentOff }).data?.percentOff, String(percentOff)).toBe(
        percentOff,
      );
    }
    expect(promotionFormSchema.safeParse({ ...promotionForm, percentOff: null }).success).toBe(true);
  });

  it("still rejects anything that is not a number", () => {
    for (const percentOff of ["20", Number.NaN, Number.POSITIVE_INFINITY, true, undefined]) {
      expect(promotionFormSchema.safeParse({ ...promotionForm, percentOff }).success, String(percentOff)).toBe(false);
    }
  });
});

describe("admin and audit schemas", () => {
  it("validates admin users", () => {
    expect(
      adminUserSchema.safeParse({
        email: "owner@bueno.example.com",
        role: "admin",
        active: true,
        addedAt: "2026-09-24T08:00:00.000Z",
        addedBy: "cli",
        lastSignInAt: null,
      }).success,
    ).toBe(true);
    expect(teamAddSchema.safeParse({ email: "x@y.example.com", role: "viewer", password: "welcome-aboard-1" }).success).toBe(true);
    expect(teamAddSchema.safeParse({ email: "x@y.example.com", role: "viewer" }).success).toBe(false);
    expect(teamAddSchema.safeParse({ email: "x@y.example.com", role: "superuser", password: "welcome-aboard-1" }).success).toBe(false);
  });

  it("validates session requests", () => {
    expect(sessionRequestSchema.safeParse({ email: "a@bco.example.com", password: "pw" }).success).toBe(true);
    expect(sessionRequestSchema.safeParse({ email: "a@bco.example.com", password: "" }).success).toBe(false);
    expect(sessionRequestSchema.safeParse({ email: "ab", password: "pw" }).success).toBe(false);
    expect(sessionRequestSchema.safeParse({ idToken: "x".repeat(40) }).success).toBe(false);
  });

  it("validates audit records", () => {
    expect(
      auditRecordSchema.safeParse({
        at: "2026-09-24T08:00:00.000Z",
        actor: { uid: "u1", email: "owner@bueno.example.com" },
        action: "package.update",
        entity: { type: "package", id: "coastal-escape" },
        summary: "Coastal Escape: dollar base $2,800 → $3,000",
        before: { a: 1 },
        after: null,
        revision: 3,
      }).success,
    ).toBe(true);
  });
});
