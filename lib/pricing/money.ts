import {
  AMOUNT_LIMITS,
  CURRENCY_SYMBOLS,
  PERCENT_OFF_LIMITS,
  RATE_LIMITS_E4,
  RATE_SCALE,
} from "./constants";
import type { ConversionContext, CurrencyCode } from "./types";

export type RoundingMode = "nearest" | "down";

const ZERO = BigInt(0);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);

function assertStep(step: number): void {
  if (!Number.isSafeInteger(step) || step < 1) {
    throw new RangeError(`Rounding step must be a positive whole number (received ${step}).`);
  }
}

function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new RangeError(`Amount must be a positive whole number (received ${amount}).`);
  }
}

function assertRate(kesPerUsdE4: number): void {
  if (
    !Number.isSafeInteger(kesPerUsdE4) ||
    kesPerUsdE4 < RATE_LIMITS_E4.min ||
    kesPerUsdE4 > RATE_LIMITS_E4.max
  ) {
    throw new RangeError(`Exchange rate is out of range (received ${kesPerUsdE4}).`);
  }
}

export function otherCurrency(currency: CurrencyCode): CurrencyCode {
  return currency === "USD" ? "KES" : "USD";
}

/** Rounds numerator/denominator to a multiple of `step`, exactly. */
export function roundRatioToStep(
  numerator: bigint,
  denominator: bigint,
  step: number,
  mode: RoundingMode,
): number {
  if (denominator <= ZERO) throw new RangeError("Denominator must be positive.");
  if (numerator < ZERO) throw new RangeError("Numerator must not be negative.");
  assertStep(step);
  const unit = denominator * BigInt(step);
  let multiples = numerator / unit;
  if (mode === "nearest" && (numerator % unit) * TWO >= unit) multiples += BigInt(1);
  return Number(multiples * BigInt(step));
}

/** Converts a whole amount between USD and KES, rounding to the nearest step (min one step). */
export function convertAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  kesPerUsdE4: number,
  step: number,
): number {
  assertAmount(amount);
  assertRate(kesPerUsdE4);
  assertStep(step);
  if (from === to) return amount;
  const value = BigInt(amount);
  const rate = BigInt(kesPerUsdE4);
  const scale = BigInt(RATE_SCALE);
  const rounded =
    from === "USD"
      ? roundRatioToStep(value * rate, scale, step, "nearest")
      : roundRatioToStep(value * scale, rate, step, "nearest");
  return Math.max(step, rounded);
}

/**
 * `amount` in the other currency, converted into `target` at the house rate and rounded to
 * `target`'s step, or null when the result falls outside `target`'s limits: the site never shows
 * such a price (KSh 150,000,000 at 50 would be $3,000,000).
 */
export function convertInto(amount: number, target: CurrencyCode, conversion: ConversionContext): number | null {
  const converted = convertAmount(amount, otherCurrency(target), target, conversion.kesPerUsdE4, conversion.roundingStep[target]);
  return isAmountWithinLimits(converted, target) ? converted : null;
}

/**
 * Applies a percentage discount. Floors to whole units (never 0), then rounds down to
 * the step when the result is at least one step — so the advertised % is never overstated.
 */
export function discountAmount(amount: number, percentOff: number, step: number): number {
  assertAmount(amount);
  assertStep(step);
  if (!isPercentOffWithinLimits(percentOff)) {
    throw new RangeError(
      `Discount must be a whole percentage between ${PERCENT_OFF_LIMITS.min} and ${PERCENT_OFF_LIMITS.max}.`,
    );
  }
  const floored = Number((BigInt(amount) * BigInt(100 - percentOff)) / HUNDRED);
  const atLeastOne = Math.max(1, floored);
  if (step > 1 && atLeastOne >= step) return Math.floor(atLeastOne / step) * step;
  return atLeastOne;
}

export function groupDigits(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Cannot format ${value}.`);
  }
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  return `${CURRENCY_SYMBOLS[currency]}${groupDigits(amount)}`;
}

/** A promotion's discount must be a whole percentage from 1 to 90. */
export function isPercentOffWithinLimits(percentOff: number): boolean {
  return Number.isInteger(percentOff) && percentOff >= PERCENT_OFF_LIMITS.min && percentOff <= PERCENT_OFF_LIMITS.max;
}

export function isAmountWithinLimits(amount: number, currency: CurrencyCode): boolean {
  const { min, max } = AMOUNT_LIMITS[currency];
  return Number.isSafeInteger(amount) && amount >= min && amount <= max;
}

const RATE_INPUT = /^(\d{1,3})(?:\.(\d{1,4}))?$/;

/** "129.5" → 1_295_000. Returns null for malformed input (range is checked by validation). */
export function parseRateInput(input: string): number | null {
  const match = RATE_INPUT.exec(input.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(4, "0"));
  return whole * RATE_SCALE + fraction;
}

export function formatRate(kesPerUsdE4: number): string {
  const whole = Math.floor(kesPerUsdE4 / RATE_SCALE);
  const fraction = String(kesPerUsdE4 % RATE_SCALE).padStart(4, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : String(whole);
}

/** Parses an admin price field ("4,500", "4 500"). Null for empty or non-whole input. */
export function parseAmountInput(input: string): number | null {
  const normalized = input.replace(/[,\s]/g, "");
  if (!/^\d{1,12}$/.test(normalized)) return null;
  return Number(normalized);
}
