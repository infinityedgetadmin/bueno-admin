import { describe, expect, it } from "vitest";
import {
  EntityNotFoundError,
  VersionConflictError,
  applyCurrencyUpdate,
  applyPackageUpdate,
  deletePromotion,
  deleteSeason,
  pruneRetiredPackages,
  setPromotionPaused,
  upsertPromotion,
  upsertSeason,
} from "@/lib/pricing/operations";
import { emptyCatalog } from "@/lib/pricing/defaults";
import type { PackageDraft } from "@/lib/pricing/types";
import { makeCatalog, makeCurrency, makePackage, makePromotion, makeSeason } from "./fixtures";

const ctx = { actor: { uid: "u1", email: "editor@bueno.example.com" }, now: "2026-09-24T10:00:00.000Z" };
const titles: Record<string, string> = { "coastal-escape": "Coastal Escape", "safari-honeymoon": "Safari Honeymoon" };
const titleOf = (slug: string) => titles[slug] ?? slug;

function draft(overrides: Partial<PackageDraft> = {}): PackageDraft {
  return {
    visible: true,
    display: "price",
    basis: null,
    currencies: { USD: "fixed", KES: "converted" },
    base: { USD: 3000, KES: 999 },
    seasonPrices: [],
    featuredRank: null,
    ...overrides,
  };
}

describe("applyPackageUpdate", () => {
  it("creates a stored entry from defaults, keeping only fixed-currency amounts", () => {
    const catalog = makeCatalog({ seasons: [makeSeason({ id: "s1" }), makeSeason({ id: "s0", startDate: "2026-10-01", endDate: "2026-10-31" })] });
    const result = applyPackageUpdate({
      catalog,
      slug: "coastal-escape",
      draft: draft({
        seasonPrices: [
          { seasonId: "s1", USD: 3600, KES: 111 },
          { seasonId: "s0", USD: null, KES: null },
        ],
      }),
      expectedVersion: 0,
      listPriceUsd: 2800,
      titleOf,
      ctx,
    });
    expect(result.catalog.revision).toBe(2);
    expect(result.catalog.updatedBy).toBe("editor@bueno.example.com");
    expect(result.catalog.packages["coastal-escape"]).toEqual({
      visible: true,
      display: "price",
      basis: null,
      currencies: { USD: "fixed", KES: "converted" },
      base: { USD: 3000 },
      seasonPrices: [{ seasonId: "s1", USD: 3600 }],
      featuredRank: null,
      version: 1,
      updatedAt: ctx.now,
      updatedBy: "editor@bueno.example.com",
    });
    expect(result.audits).toHaveLength(1);
    expect(result.audits[0]).toMatchObject({
      action: "package.update",
      entity: { type: "package", id: "coastal-escape" },
      summary: "Coastal Escape: dollar base $2,800 → $3,000; season prices updated",
    });
  });

  it("rejects stale versions", () => {
    const catalog = makeCatalog({ packages: { "coastal-escape": makePackage({ version: 3 }) } });
    expect(() =>
      applyPackageUpdate({ catalog, slug: "coastal-escape", draft: draft(), expectedVersion: 2, listPriceUsd: 2800, titleOf, ctx }),
    ).toThrow(VersionConflictError);
  });

  it("moves a featured slot away from its previous holder and leaves other slots alone", () => {
    const catalog = makeCatalog({
      packages: {
        "safari-honeymoon": makePackage({ featuredRank: 2, version: 4 }),
        "luxury-safari-experience": makePackage({ featuredRank: 3, version: 2 }),
      },
    });
    const result = applyPackageUpdate({
      catalog,
      slug: "coastal-escape",
      draft: draft({ featuredRank: 2 }),
      expectedVersion: 0,
      listPriceUsd: 3000,
      titleOf,
      ctx,
    });
    expect(result.catalog.packages["safari-honeymoon"]).toMatchObject({ featuredRank: null, version: 5 });
    expect(result.catalog.packages["luxury-safari-experience"]).toMatchObject({ featuredRank: 3, version: 2 });
    expect(result.audits.map((a) => [a.action, a.summary])).toEqual([
      ["package.update", "Coastal Escape: featured in slot 2"],
      ["package.featured_moved", "Safari Honeymoon: left featured slot 2 (now Coastal Escape)"],
    ]);
  });

  it("describes visibility, display, basis, currency and removal-from-featured changes", () => {
    const catalog = makeCatalog({
      packages: { "coastal-escape": makePackage({ base: { USD: 3000 }, featuredRank: 1 }) },
    });
    const result = applyPackageUpdate({
      catalog,
      slug: "coastal-escape",
      draft: draft({
        visible: false,
        display: "enquire",
        basis: "per_couple",
        currencies: { USD: "fixed", KES: "fixed" },
        base: { USD: 3000, KES: 390_000 },
      }),
      expectedVersion: 1,
      listPriceUsd: 3000,
      titleOf,
      ctx,
    });
    expect(result.audits[0]?.summary).toBe(
      "Coastal Escape: hidden from the website; shows “Chat with an agent” instead of a price; price basis per couple; shilling price converted → fixed; shilling base KSh 390,000; removed from featured",
    );
  });

  it("describes publishing, showing a price, removing the basis and converting a currency", () => {
    const catalog = makeCatalog({
      packages: {
        "coastal-escape": makePackage({
          visible: false,
          display: "enquire",
          basis: "per_couple",
          currencies: { USD: "fixed", KES: "fixed" },
          base: { USD: 3000, KES: 390_000 },
        }),
      },
    });
    const result = applyPackageUpdate({ catalog, slug: "coastal-escape", draft: draft(), expectedVersion: 1, listPriceUsd: 3000, titleOf, ctx });
    expect(result.audits[0]?.summary).toBe(
      "Coastal Escape: published on the website; shows its price; price basis removed; shilling price fixed → converted",
    );
  });

  it("notes when nothing changed, including keeping its own featured slot", () => {
    const catalog = makeCatalog({
      packages: { "coastal-escape": makePackage({ base: { USD: 3000 }, featuredRank: 1 }) },
    });
    const result = applyPackageUpdate({
      catalog,
      slug: "coastal-escape",
      draft: draft({ featuredRank: 1 }),
      expectedVersion: 1,
      listPriceUsd: 3000,
      titleOf,
      ctx,
    });
    expect(result.audits).toHaveLength(1);
    expect(result.audits[0]?.summary).toBe("Coastal Escape: saved without changes");
  });

  it("sorts multiple season prices by season id", () => {
    const catalog = makeCatalog({ seasons: [makeSeason({ id: "s1" }), makeSeason({ id: "s2" })] });
    const result = applyPackageUpdate({
      catalog,
      slug: "coastal-escape",
      draft: draft({
        seasonPrices: [
          { seasonId: "s2", USD: 4200, KES: null },
          { seasonId: "s1", USD: 3600, KES: null },
        ],
      }),
      expectedVersion: 0,
      listPriceUsd: 2800,
      titleOf,
      ctx,
    });
    expect(result.catalog.packages["coastal-escape"]?.seasonPrices).toEqual([
      { seasonId: "s1", USD: 3600 },
      { seasonId: "s2", USD: 4200 },
    ]);
  });
});

describe("seasons", () => {
  it("creates a season with a new id", () => {
    const result = upsertSeason({
      catalog: emptyCatalog(),
      draft: { id: null, name: "  Festive  ", startDate: "2026-12-15", endDate: "2027-01-05" },
      expectedVersion: 0,
      ctx,
      newId: () => "season-new",
    });
    expect(result.catalog.seasons).toEqual([
      { id: "season-new", name: "Festive", startDate: "2026-12-15", endDate: "2027-01-05", version: 1 },
    ]);
    expect(result.catalog.revision).toBe(1);
    expect(result.audits[0]).toMatchObject({ action: "season.create", summary: "Season “Festive” created (15 Dec 2026 – 5 Jan 2027)" });
  });

  it("updates an existing season and keeps seasons sorted", () => {
    const catalog = makeCatalog({
      seasons: [makeSeason({ id: "a", startDate: "2027-03-01", endDate: "2027-03-31" }), makeSeason({ id: "b", startDate: "2027-05-01", endDate: "2027-05-31" })],
    });
    const result = upsertSeason({
      catalog,
      draft: { id: "b", name: "Long rains", startDate: "2027-01-01", endDate: "2027-01-31" },
      expectedVersion: 1,
      ctx,
      newId: () => "unused",
    });
    expect(result.catalog.seasons.map((s) => [s.id, s.version])).toEqual([["b", 2], ["a", 1]]);
    expect(result.audits[0]).toMatchObject({ action: "season.update", summary: "Season “Long rains” updated (1 Jan – 31 Jan 2027)" });
  });

  it("rejects stale or missing seasons", () => {
    const catalog = makeCatalog({ seasons: [makeSeason({ id: "a", version: 2 })] });
    const update = (id: string, expectedVersion: number) => () =>
      upsertSeason({ catalog, draft: { id, name: "X y", startDate: "2027-01-01", endDate: "2027-01-02" }, expectedVersion, ctx, newId: () => "n" });
    expect(update("a", 1)).toThrow(VersionConflictError);
    expect(update("missing", 1)).toThrow(EntityNotFoundError);
    expect(() => deleteSeason({ catalog, id: "missing", expectedVersion: 1, ctx })).toThrow(EntityNotFoundError);
    expect(() => deleteSeason({ catalog, id: "a", expectedVersion: 1, ctx })).toThrow(VersionConflictError);
  });

  it("deletes a season and removes its package prices", () => {
    const catalog = makeCatalog({
      seasons: [makeSeason({ id: "s1", name: "Festive" })],
      packages: {
        "coastal-escape": makePackage({ seasonPrices: [{ seasonId: "s1", USD: 3600 }], version: 2 }),
        "safari-honeymoon": makePackage({ seasonPrices: [] }),
      },
    });
    const result = deleteSeason({ catalog, id: "s1", expectedVersion: 1, ctx });
    expect(result.catalog.seasons).toEqual([]);
    expect(result.catalog.packages["coastal-escape"]).toMatchObject({ seasonPrices: [], version: 3 });
    expect(result.catalog.packages["safari-honeymoon"]?.version).toBe(1);
    expect(result.audits[0]).toMatchObject({ action: "season.delete", summary: "Season “Festive” deleted; its prices were removed from 1 package" });
  });

  it("reports when a deleted season had no package prices", () => {
    const catalog = makeCatalog({ seasons: [makeSeason({ id: "s1", name: "Quiet" })] });
    const result = deleteSeason({ catalog, id: "s1", expectedVersion: 1, ctx });
    expect(result.audits[0]?.summary).toBe("Season “Quiet” deleted; its prices were removed from 0 packages");
  });
});

describe("promotions", () => {
  const promoDraft = {
    id: null,
    name: " Early bird ",
    label: " Early Bird ",
    percentOff: 15,
    startDate: "2026-09-24",
    endDate: "2026-10-31",
    appliesTo: { kind: "packages" as const, slugs: ["safari-honeymoon", "coastal-escape", "coastal-escape"] },
    terms: "  ",
  };

  it("creates a normalised promotion", () => {
    const result = upsertPromotion({ catalog: emptyCatalog(), draft: promoDraft, expectedVersion: 0, ctx, newId: () => "promo-1" });
    expect(result.catalog.promotions).toEqual([
      {
        id: "promo-1",
        name: "Early bird",
        label: "Early Bird",
        percentOff: 15,
        startDate: "2026-09-24",
        endDate: "2026-10-31",
        appliesTo: { kind: "packages", slugs: ["coastal-escape", "safari-honeymoon"] },
        paused: false,
        terms: null,
        version: 1,
      },
    ]);
    expect(result.audits[0]).toMatchObject({ action: "promotion.create", summary: "Promotion “Early bird” created: 15% off, 24 Sep – 31 Oct 2026, 2 packages" });
  });

  it("describes a single-package promotion", () => {
    const result = upsertPromotion({
      catalog: emptyCatalog(),
      draft: { ...promoDraft, appliesTo: { kind: "packages", slugs: ["coastal-escape"] } },
      expectedVersion: 0,
      ctx,
      newId: () => "promo-2",
    });
    expect(result.audits[0]?.summary).toBe("Promotion “Early bird” created: 15% off, 24 Sep – 31 Oct 2026, 1 package");
  });

  it("updates, pauses, resumes and deletes", () => {
    const catalog = makeCatalog({ promotions: [makePromotion({ id: "p", terms: "Book early" })] });
    const updated = upsertPromotion({
      catalog,
      draft: { ...promoDraft, id: "p", appliesTo: { kind: "all" }, terms: "New terms" },
      expectedVersion: 1,
      ctx,
      newId: () => "unused",
    });
    expect(updated.catalog.promotions[0]).toMatchObject({ version: 2, terms: "New terms", appliesTo: { kind: "all" } });
    expect(updated.audits[0]?.summary).toBe("Promotion “Early bird” updated: 15% off, 24 Sep – 31 Oct 2026, all packages");

    const paused = setPromotionPaused({ catalog: updated.catalog, id: "p", paused: true, expectedVersion: 2, ctx });
    expect(paused.catalog.promotions[0]).toMatchObject({ paused: true, version: 3 });
    expect(paused.audits[0]).toMatchObject({ action: "promotion.pause", summary: "Promotion “Early bird” paused" });

    const resumed = setPromotionPaused({ catalog: paused.catalog, id: "p", paused: false, expectedVersion: 3, ctx });
    expect(resumed.audits[0]).toMatchObject({ action: "promotion.resume", summary: "Promotion “Early bird” resumed" });

    const deleted = deletePromotion({ catalog: resumed.catalog, id: "p", expectedVersion: 4, ctx });
    expect(deleted.catalog.promotions).toEqual([]);
    expect(deleted.audits[0]).toMatchObject({ action: "promotion.delete", summary: "Promotion “Early bird” deleted" });
  });

  it("rejects stale or missing promotions", () => {
    const catalog = makeCatalog({ promotions: [makePromotion({ id: "p", version: 2 })] });
    expect(() => setPromotionPaused({ catalog, id: "p", paused: true, expectedVersion: 1, ctx })).toThrow(VersionConflictError);
    expect(() => deletePromotion({ catalog, id: "x", expectedVersion: 1, ctx })).toThrow(EntityNotFoundError);
    expect(() =>
      upsertPromotion({ catalog, draft: { ...promoDraft, id: "p" }, expectedVersion: 1, ctx, newId: () => "n" }),
    ).toThrow(VersionConflictError);
    expect(() =>
      upsertPromotion({ catalog, draft: { ...promoDraft, id: "missing" }, expectedVersion: 1, ctx, newId: () => "n" }),
    ).toThrow(EntityNotFoundError);
  });

  it("leaves other promotions untouched when updating or pausing one", () => {
    const catalog = makeCatalog({
      promotions: [makePromotion({ id: "p1" }), makePromotion({ id: "p2", name: "Long stay", label: "Long Stay" })],
    });
    const updated = upsertPromotion({
      catalog,
      draft: { ...promoDraft, id: "p1" },
      expectedVersion: 1,
      ctx,
      newId: () => "unused",
    });
    const untouched = makePromotion({ id: "p2", name: "Long stay", label: "Long Stay" });
    expect(updated.catalog.promotions.find((p) => p.id === "p2")).toEqual(untouched);

    const paused = setPromotionPaused({ catalog: updated.catalog, id: "p1", paused: true, expectedVersion: 2, ctx });
    expect(paused.catalog.promotions.find((p) => p.id === "p2")).toEqual(untouched);
  });
});

describe("applyCurrencyUpdate", () => {
  it("sets the rate for the first time", () => {
    const result = applyCurrencyUpdate({
      catalog: emptyCatalog(),
      kesPerUsdE4: 1_295_000,
      roundingStep: { USD: 1, KES: 500 },
      expectedVersion: 0,
      ctx,
    });
    expect(result.catalog.currency).toEqual({
      kesPerUsdE4: 1_295_000,
      roundingStep: { USD: 1, KES: 500 },
      version: 1,
      updatedAt: ctx.now,
      updatedBy: "editor@bueno.example.com",
    });
    expect(result.audits[0]).toMatchObject({
      action: "currency.update",
      entity: { type: "currency", id: "settings" },
      summary: "Exchange rate set to KSh 129.5 per dollar (rounding: $1, KSh 500)",
    });
  });

  it("updates an existing rate and rejects stale versions", () => {
    const catalog = makeCatalog({ currency: makeCurrency({ version: 3 }) });
    const result = applyCurrencyUpdate({ catalog, kesPerUsdE4: 1_300_000, roundingStep: { USD: 5, KES: 1000 }, expectedVersion: 3, ctx });
    expect(result.audits[0]?.summary).toBe("Exchange rate KSh 129.5 → KSh 130 per dollar (rounding: $5, KSh 1,000)");
    expect(() =>
      applyCurrencyUpdate({ catalog, kesPerUsdE4: 1_300_000, roundingStep: { USD: 5, KES: 1000 }, expectedVersion: 2, ctx }),
    ).toThrow(VersionConflictError);
  });
});

describe("pruneRetiredPackages", () => {
  const KNOWN = new Set(["coastal-escape", "safari-honeymoon"]);
  const toMixed = (slugs: string[]) => makePromotion({ id: "mixed", name: "Mixed", appliesTo: { kind: "packages", slugs } });

  it("leaves a catalog that only mentions known packages as it is, with nothing to audit", () => {
    const catalog = makeCatalog({
      promotions: [
        makePromotion({ id: "all" }),
        makePromotion({ id: "known", appliesTo: { kind: "packages", slugs: ["coastal-escape", "safari-honeymoon"] } }),
      ],
      packages: { "coastal-escape": makePackage(), "safari-honeymoon": makePackage({ featuredRank: 1 }) },
    });
    expect(pruneRetiredPackages(catalog, KNOWN)).toEqual({ catalog, audits: [] });
  });

  it("removes the records of packages that are no longer on the website, keeping each one in its audit", () => {
    const retired = makePackage({ base: { USD: 3100 }, featuredRank: 2, version: 4 });
    const catalog = makeCatalog({ packages: { gone: retired, "coastal-escape": makePackage() } });
    const result = pruneRetiredPackages(catalog, KNOWN);
    expect(result.catalog.packages).toEqual({ "coastal-escape": makePackage() });
    expect(result.audits).toEqual([
      {
        action: "package.delete",
        entity: { type: "package", id: "gone" },
        summary: "Automatically removed the pricing for package “gone” because it is no longer on the website",
        before: retired,
        after: null,
      },
    ]);
  });

  it("stops a promotion applying to retired packages but keeps it for the known ones", () => {
    const one = toMixed(["coastal-escape", "gone", "safari-honeymoon"]);
    const single = pruneRetiredPackages(makeCatalog({ promotions: [one] }), KNOWN);
    const narrowed = { ...one, appliesTo: { kind: "packages", slugs: ["coastal-escape", "safari-honeymoon"] } };
    expect(single.catalog.promotions).toEqual([narrowed]);
    expect(single.audits).toEqual([
      {
        action: "promotion.update",
        entity: { type: "promotion", id: "mixed" },
        summary: "Automatically removed “gone” from promotion “Mixed” because that package is no longer on the website",
        before: one,
        after: narrowed,
      },
    ]);

    const several = pruneRetiredPackages(makeCatalog({ promotions: [toMixed(["also-gone", "coastal-escape", "gone"])] }), KNOWN);
    expect(several.catalog.promotions[0]?.appliesTo).toEqual({ kind: "packages", slugs: ["coastal-escape"] });
    expect(several.audits[0]?.summary).toBe(
      "Automatically removed “also-gone”, “gone” from promotion “Mixed” because those packages are no longer on the website",
    );
  });

  it("removes a promotion when every package it applied to is gone", () => {
    const orphan = makePromotion({ id: "orphan", name: "Orphan", appliesTo: { kind: "packages", slugs: ["gone", "also-gone"] } });
    const everywhere = makePromotion({ id: "all" });
    const result = pruneRetiredPackages(makeCatalog({ promotions: [orphan, everywhere] }), KNOWN);
    expect(result.catalog.promotions).toEqual([everywhere]);
    expect(result.audits).toEqual([
      {
        action: "promotion.delete",
        entity: { type: "promotion", id: "orphan" },
        summary: "Automatically deleted promotion “Orphan” because every package it applied to (“gone”, “also-gone”) is no longer on the website",
        before: orphan,
        after: null,
      },
    ]);
  });

  it("changes nothing else: versions, the revision and the rest of the catalog stay as they were", () => {
    const catalog = makeCatalog({
      revision: 7,
      seasons: [makeSeason({ id: "s1" })],
      promotions: [makePromotion({ id: "p1", version: 5, appliesTo: { kind: "packages", slugs: ["gone", "coastal-escape"] } })],
      packages: { gone: makePackage(), "coastal-escape": makePackage({ version: 3 }) },
    });
    const { catalog: pruned, audits } = pruneRetiredPackages(catalog, KNOWN);
    expect(audits.map((audit) => audit.action)).toEqual(["package.delete", "promotion.update"]);
    expect(pruned).toEqual({
      ...catalog,
      promotions: [{ ...catalog.promotions[0], appliesTo: { kind: "packages", slugs: ["coastal-escape"] } }],
      packages: { "coastal-escape": makePackage({ version: 3 }) },
    });
    expect(catalog.packages.gone).toBeDefined();
  });
});
