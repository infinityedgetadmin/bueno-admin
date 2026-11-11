import { describe, expect, it } from "vitest";
import {
  convertAmount,
  convertInto,
  discountAmount,
  formatMoney,
  formatRate,
  groupDigits,
  isAmountWithinLimits,
  isPercentOffWithinLimits,
  otherCurrency,
  parseAmountInput,
  parseRateInput,
  roundRatioToStep,
} from "@/lib/pricing/money";

const RATE = 1_295_000; // 129.5 KES per USD

describe("roundRatioToStep", () => {
  it("rounds to the nearest step with halves going up", () => {
    expect(roundRatioToStep(BigInt(1250), BigInt(1), 500, "nearest")).toBe(1500);
    expect(roundRatioToStep(BigInt(1249), BigInt(1), 500, "nearest")).toBe(1000);
  });

  it("rounds down when asked", () => {
    expect(roundRatioToStep(BigInt(1499), BigInt(1), 500, "down")).toBe(1000);
  });

  it("handles fractional ratios exactly", () => {
    expect(roundRatioToStep(BigInt(7), BigInt(2), 1, "nearest")).toBe(4);
    expect(roundRatioToStep(BigInt(7), BigInt(2), 1, "down")).toBe(3);
  });

  it("rejects a non-positive denominator, a negative numerator and a bad step", () => {
    expect(() => roundRatioToStep(BigInt(1), BigInt(0), 1, "nearest")).toThrow(RangeError);
    expect(() => roundRatioToStep(BigInt(-1), BigInt(1), 1, "nearest")).toThrow(RangeError);
    expect(() => roundRatioToStep(BigInt(1), BigInt(1), 0, "nearest")).toThrow(RangeError);
    expect(() => roundRatioToStep(BigInt(1), BigInt(1), 1.5, "nearest")).toThrow(RangeError);
  });
});

describe("convertAmount", () => {
  it("returns the amount unchanged for the same currency", () => {
    expect(convertAmount(4500, "USD", "USD", RATE, 1)).toBe(4500);
  });

  it("converts dollars to shillings, rounding to the nearest step", () => {
    expect(convertAmount(4500, "USD", "KES", RATE, 1)).toBe(582_750);
    expect(convertAmount(4500, "USD", "KES", RATE, 500)).toBe(583_000);
    expect(convertAmount(4499, "USD", "KES", RATE, 1000)).toBe(583_000);
  });

  it("converts shillings to dollars", () => {
    expect(convertAmount(58_000, "KES", "USD", RATE, 1)).toBe(448);
    expect(convertAmount(58_000, "KES", "USD", RATE, 5)).toBe(450);
  });

  it("never returns less than one step", () => {
    expect(convertAmount(1, "USD", "KES", RATE, 1000)).toBe(1000);
  });

  it("uses exact integer arithmetic", () => {
    // 999,999 × 100.0001 = 99,999,999.9999 → 100,000,000
    expect(convertAmount(999_999, "USD", "KES", 1_000_001, 1)).toBe(100_000_000);
  });

  it("rejects invalid amounts, rates and steps", () => {
    expect(() => convertAmount(0, "USD", "KES", RATE, 1)).toThrow(RangeError);
    expect(() => convertAmount(10.5, "USD", "KES", RATE, 1)).toThrow(RangeError);
    expect(() => convertAmount(10, "USD", "KES", 499_999, 1)).toThrow(RangeError);
    expect(() => convertAmount(10, "USD", "KES", 5_000_001, 1)).toThrow(RangeError);
    expect(() => convertAmount(10, "USD", "KES", RATE, 0)).toThrow(RangeError);
  });
});

describe("convertInto", () => {
  it("converts from the other currency at the house rate and step", () => {
    expect(convertInto(4500, "KES", { kesPerUsdE4: RATE, roundingStep: { USD: 1, KES: 500 } })).toBe(583_000);
    expect(convertInto(583_000, "USD", { kesPerUsdE4: RATE, roundingStep: { USD: 100, KES: 500 } })).toBe(4500);
  });

  it("returns null when the result is over the target currency's limit, never a price the site can't show", () => {
    const rate50 = { kesPerUsdE4: 500_000, roundingStep: { USD: 1, KES: 1 } } as const;
    expect(convertInto(50_000_000, "USD", rate50)).toBe(1_000_000);
    expect(convertInto(150_000_000, "USD", rate50)).toBeNull();
  });
});

describe("discountAmount", () => {
  it("applies the percentage and floors to whole units", () => {
    expect(discountAmount(4500, 15, 1)).toBe(3825);
    expect(discountAmount(999, 15, 1)).toBe(849);
  });

  it("rounds down to the step so the discount is never overstated", () => {
    expect(discountAmount(583_000, 15, 500)).toBe(495_500);
  });

  it("keeps whole-unit precision when the result is below one step", () => {
    expect(discountAmount(300, 10, 500)).toBe(270);
  });

  it("never returns zero", () => {
    expect(discountAmount(1, 90, 1)).toBe(1);
  });

  it("rejects out-of-range or fractional percentages", () => {
    expect(() => discountAmount(100, 0, 1)).toThrow(RangeError);
    expect(() => discountAmount(100, 91, 1)).toThrow(RangeError);
    expect(() => discountAmount(100, 12.5, 1)).toThrow(RangeError);
  });

  it("rejects invalid amounts and steps", () => {
    expect(() => discountAmount(0, 10, 1)).toThrow(RangeError);
    expect(() => discountAmount(10, 10, 0)).toThrow(RangeError);
  });
});

describe("formatting", () => {
  it("groups digits with commas", () => {
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(999)).toBe("999");
    expect(groupDigits(1_000)).toBe("1,000");
    expect(groupDigits(150_000_000)).toBe("150,000,000");
  });

  it("rejects negative or fractional values", () => {
    expect(() => groupDigits(-1)).toThrow(RangeError);
    expect(() => groupDigits(1.5)).toThrow(RangeError);
  });

  it("formats dollars and shillings", () => {
    expect(formatMoney(4500, "USD")).toBe("$4,500");
    expect(formatMoney(583_000, "KES")).toBe("KSh 583,000");
  });
});

describe("limits and currencies", () => {
  it("checks amount limits per currency", () => {
    expect(isAmountWithinLimits(1, "USD")).toBe(true);
    expect(isAmountWithinLimits(1_000_000, "USD")).toBe(true);
    expect(isAmountWithinLimits(1_000_001, "USD")).toBe(false);
    expect(isAmountWithinLimits(150_000_000, "KES")).toBe(true);
    expect(isAmountWithinLimits(0, "KES")).toBe(false);
    expect(isAmountWithinLimits(10.5, "KES")).toBe(false);
  });

  it("checks promotion percentages: whole numbers from 1 to 90", () => {
    expect(isPercentOffWithinLimits(1)).toBe(true);
    expect(isPercentOffWithinLimits(45)).toBe(true);
    expect(isPercentOffWithinLimits(90)).toBe(true);
    expect(isPercentOffWithinLimits(0)).toBe(false);
    expect(isPercentOffWithinLimits(91)).toBe(false);
    expect(isPercentOffWithinLimits(150)).toBe(false);
    expect(isPercentOffWithinLimits(-5)).toBe(false);
    expect(isPercentOffWithinLimits(12.5)).toBe(false);
    expect(isPercentOffWithinLimits(Number.NaN)).toBe(false);
    expect(isPercentOffWithinLimits(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("returns the other currency", () => {
    expect(otherCurrency("USD")).toBe("KES");
    expect(otherCurrency("KES")).toBe("USD");
  });
});

describe("parseRateInput / formatRate", () => {
  it("parses up to four decimals", () => {
    expect(parseRateInput("129.5")).toBe(1_295_000);
    expect(parseRateInput("129")).toBe(1_290_000);
    expect(parseRateInput(" 130.25 ")).toBe(1_302_500);
    expect(parseRateInput("50.0001")).toBe(500_001);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "129.12345", "1,29", "-129", "1000", "12.", ".5"]) {
      expect(parseRateInput(bad)).toBeNull();
    }
  });

  it("formats without trailing zeros", () => {
    expect(formatRate(1_295_000)).toBe("129.5");
    expect(formatRate(1_290_000)).toBe("129");
    expect(formatRate(1_302_500)).toBe("130.25");
    expect(formatRate(500_001)).toBe("50.0001");
  });
});

describe("parseAmountInput", () => {
  it("accepts digits with optional commas or spaces", () => {
    expect(parseAmountInput("4500")).toBe(4500);
    expect(parseAmountInput("4,500")).toBe(4500);
    expect(parseAmountInput(" 4 500 ")).toBe(4500);
    expect(parseAmountInput("0")).toBe(0);
  });

  it("rejects empty, decimal, negative or oversized input", () => {
    for (const bad of ["", "   ", "4500.50", "-10", "abc", "1234567890123"]) {
      expect(parseAmountInput(bad)).toBeNull();
    }
  });
});
