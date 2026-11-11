import { describe, expect, it } from "vitest";
import { activityPriceTexts, describesSamePrice } from "@/lib/pricing/activities";

const CONVERSION = { kesPerUsdE4: 1_295_000, roundingStep: { USD: 1 as const, KES: 500 as const } };

describe("activityPriceTexts", () => {
  it("shows the USD range and the converted KES range", () => {
    expect(activityPriceTexts({ min: 300, max: 6900, currency: "USD", unit: "per person" }, CONVERSION)).toEqual({
      USD: "$300 – $6,900 per person",
      KES: "KSh 39,000 – KSh 893,500 per person",
    });
  });

  it("collapses equal bounds", () => {
    expect(activityPriceTexts({ min: 50, max: 50, currency: "USD", unit: "per boat" }, CONVERSION)).toEqual({
      USD: "$50 per boat",
      KES: "KSh 6,500 per boat",
    });
  });

  it("shows USD only without a rate", () => {
    expect(activityPriceTexts({ min: 30, max: 50, currency: "USD", unit: "per person" }, null)).toEqual({
      USD: "$30 – $50 per person",
    });
  });

  it("returns nothing for unsupported currencies or invalid ranges", () => {
    expect(activityPriceTexts({ min: 30, max: 50, currency: "EUR", unit: "per person" }, CONVERSION)).toEqual({});
    expect(activityPriceTexts({ min: 50, max: 30, currency: "USD", unit: "per person" }, CONVERSION)).toEqual({});
    expect(activityPriceTexts({ min: 0, max: 30, currency: "USD", unit: "per person" }, CONVERSION)).toEqual({});
    expect(activityPriceTexts({ min: 30, max: 2_000_000, currency: "USD", unit: "per person" }, CONVERSION)).toEqual({});
  });

  it("hides the shilling range when the converted amount exceeds the KES limit", () => {
    const HIGH_RATE = { kesPerUsdE4: 5_000_000, roundingStep: { USD: 1 as const, KES: 500 as const } };
    expect(
      activityPriceTexts({ min: 100_000, max: 400_000, currency: "USD", unit: "per person" }, HIGH_RATE),
    ).toEqual({
      USD: "$100,000 – $400,000 per person",
    });
  });
});

describe("describesSamePrice", () => {
  it("matches after normalising a spaced hyphen to an en dash", () => {
    expect(describesSamePrice("$410 – $650 per person", "$410 - $650 per person")).toBe(true);
  });

  it("matches through extra whitespace", () => {
    expect(describesSamePrice("$300 – $6,900  per  person", "  $300 –   $6,900 per person  ")).toBe(true);
  });

  it("does not match when the authored text carries extra information", () => {
    expect(
      describesSamePrice("$20 – $80 per person", "$20 entry + $80 Nairobi NP fee (combined visit)"),
    ).toBe(false);
  });
});
