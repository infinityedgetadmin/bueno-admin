import { describe, expect, it } from "vitest";
import { describeQuote } from "@/lib/pricing/quote-text";

describe("describeQuote", () => {
  it("explains a missing quote", () => {
    expect(describeQuote(null)).toBe("Not shown (price on request)");
  });

  it("describes a plain quote", () => {
    expect(
      describeQuote({
        currency: "USD",
        amount: 4500,
        original: null,
        basis: null,
        seasonName: null,
        promotionLabel: null,
        travelDate: "2026-11-20",
      }),
    ).toBe("$4,500 · for travel on 20 Nov 2026");
  });

  it("describes a discounted seasonal quote", () => {
    expect(
      describeQuote({
        currency: "KES",
        amount: 469_000,
        original: 552_000,
        basis: "per_person_sharing",
        seasonName: "Festive",
        promotionLabel: "Early Bird",
        travelDate: "2026-12-20",
      }),
    ).toBe("KSh 469,000 per person sharing (was KSh 552,000 · Early Bird) · Festive · for travel on 20 Dec 2026");
  });

  it("mentions the original price even without a promotion label", () => {
    expect(
      describeQuote({ currency: "USD", amount: 900, original: 1000, basis: null, seasonName: null, promotionLabel: null, travelDate: "2026-11-20" }),
    ).toBe("$900 (was $1,000) · for travel on 20 Nov 2026");
  });
});
