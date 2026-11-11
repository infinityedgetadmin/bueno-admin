import { describe, expect, it } from "vitest";
import {
  editableCommercial,
  isBasisChoice,
  isRankChoice,
  isSameState,
  previewCommercial,
  toDraft,
  toEditorState,
} from "@/lib/admin/package-form";
import { defaultPackageCommercial } from "@/lib/pricing/defaults";
import { makePackage } from "../pricing/fixtures";

describe("package form state", () => {
  it("round-trips stored settings into a draft", () => {
    const stored = makePackage({
      basis: "per_couple",
      featuredRank: 2,
      currencies: { USD: "fixed", KES: "fixed" },
      base: { USD: 3000, KES: 390_000 },
      seasonPrices: [{ seasonId: "s1", USD: 3600, KES: 470_000 }],
    });
    const state = toEditorState(stored);
    expect(state).toMatchObject({
      basis: "per_couple",
      featuredRank: "2",
      base: { USD: "3000", KES: "390000" },
      seasons: { s1: { custom: true, USD: "3600", KES: "470000" } },
    });
    expect(toDraft(state)).toEqual({
      errors: {},
      draft: {
        visible: true,
        display: "price",
        basis: "per_couple",
        currencies: { USD: "fixed", KES: "fixed" },
        base: { USD: 3000, KES: 390_000 },
        seasonPrices: [{ seasonId: "s1", USD: 3600, KES: 470_000 }],
        featuredRank: 2,
      },
    });
  });

  it("ignores non-fixed currencies and seasons without a custom price", () => {
    const state = toEditorState(defaultPackageCommercial(2800));
    state.base.KES = "garbage";
    state.seasons.s1 = { custom: false, USD: "9", KES: "" };
    expect(toDraft(state)).toEqual({
      errors: {},
      draft: {
        visible: true,
        display: "price",
        basis: null,
        currencies: { USD: "fixed", KES: "converted" },
        base: { USD: 2800, KES: null },
        seasonPrices: [],
        featuredRank: null,
      },
    });
  });

  it("reports unparseable amounts and keeps empty ones as null", () => {
    const state = toEditorState(defaultPackageCommercial(2800));
    state.base.USD = "12.5";
    state.seasons.s1 = { custom: true, USD: "", KES: "" };
    const { draft, errors } = toDraft(state);
    expect(errors).toEqual({ "base.USD": "Use whole numbers only, like 4500." });
    expect(draft.seasonPrices).toEqual([{ seasonId: "s1", USD: null, KES: null }]);
  });

  it("recognises select values", () => {
    expect(isRankChoice("2")).toBe(true);
    expect(isRankChoice("4")).toBe(false);
    expect(isBasisChoice("none")).toBe(true);
    expect(isBasisChoice("per_group")).toBe(true);
    expect(isBasisChoice("toString")).toBe(false);
  });
});

describe("editableCommercial", () => {
  it("keeps a season price only when its season is upcoming", () => {
    const stored = makePackage({
      seasonPrices: [
        { seasonId: "ended", USD: 3200 },
        { seasonId: "s1", USD: 3600 },
      ],
    });
    expect(editableCommercial(stored, new Set(["s1"])).seasonPrices).toEqual([{ seasonId: "s1", USD: 3600 }]);
  });

  it("yields an editor state and draft that carry only the upcoming season", () => {
    const stored = makePackage({
      seasonPrices: [
        { seasonId: "ended", USD: 3200 },
        { seasonId: "s1", USD: 3600 },
      ],
    });
    const state = toEditorState(editableCommercial(stored, new Set(["s1"])));
    expect(state.seasons).toEqual({ s1: { custom: true, USD: "3600", KES: "" } });
    expect(toDraft(state).draft.seasonPrices).toEqual([{ seasonId: "s1", USD: 3600, KES: null }]);
  });
});

describe("previewCommercial", () => {
  const base = toDraft(toEditorState(defaultPackageCommercial(2800))).draft;

  it("builds a previewable package from a complete draft", () => {
    expect(previewCommercial({ ...base, seasonPrices: [{ seasonId: "s1", USD: 3600, KES: null }] })).toMatchObject({
      display: "price",
      base: { USD: 2800 },
      seasonPrices: [{ seasonId: "s1", USD: 3600 }],
      version: 0,
    });
  });

  it("returns null for incomplete or impossible drafts", () => {
    expect(previewCommercial({ ...base, base: { USD: null, KES: null } })).toBeNull();
    expect(previewCommercial({ ...base, base: { USD: 0, KES: null } })).toBeNull();
    expect(previewCommercial({ ...base, currencies: { USD: "off", KES: "off" } })).toBeNull();
    expect(previewCommercial({ ...base, currencies: { USD: "converted", KES: "off" } })).toBeNull();
    expect(previewCommercial({ ...base, seasonPrices: [{ seasonId: "s1", USD: null, KES: null }] })).toBeNull();
  });
});

describe("isSameState", () => {
  it("ignores seasons that are switched off and season key order", () => {
    const a = toEditorState(makePackage({ seasonPrices: [{ seasonId: "s1", USD: 3600 }, { seasonId: "s2", USD: 3900 }] }));
    const b = toEditorState(makePackage({ seasonPrices: [{ seasonId: "s2", USD: 3900 }, { seasonId: "s1", USD: 3600 }] }));
    b.seasons.s3 = { custom: false, USD: "1", KES: "" };
    expect(isSameState(a, b)).toBe(true);
    b.base.USD = "4600";
    expect(isSameState(a, b)).toBe(false);
  });
});
