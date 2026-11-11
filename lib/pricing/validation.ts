import {
  AMOUNT_LIMITS,
  CURRENCY_CODES,
  CURRENCY_NAMES,
  CURRENCY_SHORT_NAMES,
  KES_ROUNDING_STEPS,
  MAX_RANGE_DAYS,
  MAX_START_YEARS_AHEAD,
  RATE_LIMITS_E4,
  RATE_SCALE,
  TEXT_LIMITS,
  USD_ROUNDING_STEPS,
  WARNING_THRESHOLDS,
} from "./constants";
import { addYears, compareIsoDates, daysInclusive, formatDateRange, isIsoDate, rangesOverlap } from "./dates";
import { conversionContextOf } from "./defaults";
import { promotionStatus } from "./engine";
import {
  convertInto,
  formatMoney,
  formatRate,
  isAmountWithinLimits,
  isPercentOffWithinLimits,
  otherCurrency,
  parseRateInput,
} from "./money";
import type {
  CurrencyCode,
  CurrencyDraft,
  CurrencySettings,
  FieldErrors,
  IsoDate,
  KesRoundingStep,
  PackageCommercial,
  PackageDraft,
  PricingCatalog,
  PromotionDraft,
  PromotionTarget,
  RoundingSteps,
  Season,
  SeasonDraft,
  UsdRoundingStep,
  ValidationOutcome,
  ValidationWarning,
} from "./types";

export function hasErrors(outcome: { errors: FieldErrors }): boolean {
  return Object.keys(outcome.errors).length > 0;
}

type AmountCheck = { ok: true; amount: number } | { ok: false; message: string };

function checkAmount(value: number | null | undefined, currency: CurrencyCode): AmountCheck {
  if (value === null || value === undefined) {
    return { ok: false, message: `Enter a ${CURRENCY_NAMES[currency]} price.` };
  }
  if (!isAmountWithinLimits(value, currency)) {
    const { min, max } = AMOUNT_LIMITS[currency];
    return {
      ok: false,
      message: `Enter a whole number between ${formatMoney(min, currency)} and ${formatMoney(max, currency)}.`,
    };
  }
  return { ok: true, amount: value };
}

function percentChange(from: number, to: number): number {
  return Math.abs(to - from) / from;
}

interface SeasonComparison {
  season: Season;
  currency: CurrencyCode;
  base: number;
  amount: number;
}

export function validatePackageDraft(params: {
  slug: string;
  draft: PackageDraft;
  current: PackageCommercial;
  catalog: PricingCatalog;
  knownSlugs: ReadonlySet<string>;
}): ValidationOutcome {
  const { slug, draft, current, catalog, knownSlugs } = params;
  const errors: FieldErrors = {};

  if (!knownSlugs.has(slug)) errors.slug = "This package no longer exists on the website.";

  const modes = draft.currencies;
  const fixed = CURRENCY_CODES.filter((currency) => modes[currency] === "fixed");
  if (fixed.length === 0) errors.currencies = "Set a fixed price in at least one currency.";
  for (const currency of CURRENCY_CODES) {
    const source = otherCurrency(currency);
    if (modes[currency] === "converted" && modes[source] !== "fixed") {
      errors[`currencies.${currency}`] =
        `${CURRENCY_NAMES[currency]} prices can only be converted from a fixed ${CURRENCY_NAMES[source]} price.`;
    }
  }

  // Validated amounts are collected as we go, so warnings never re-check nullability.
  const validBase = new Map<CurrencyCode, number>();
  for (const currency of fixed) {
    const check = checkAmount(draft.base[currency], currency);
    if (check.ok) validBase.set(currency, check.amount);
    else errors[`base.${currency}`] = check.message;
  }

  const knownSeasons = new Map(catalog.seasons.map((season) => [season.id, season]));
  const seen = new Set<string>();
  const comparisons: SeasonComparison[] = [];
  for (const row of draft.seasonPrices) {
    const key = `seasonPrices.${row.seasonId}`;
    const season = knownSeasons.get(row.seasonId);
    if (season === undefined) {
      errors[key] = "This season no longer exists. Remove it and save again.";
      continue;
    }
    if (seen.has(row.seasonId)) {
      errors[key] = "This season is listed twice.";
      continue;
    }
    seen.add(row.seasonId);
    for (const currency of fixed) {
      const check = checkAmount(row[currency], currency);
      if (!check.ok) {
        errors[`${key}.${currency}`] = check.message;
        continue;
      }
      const base = validBase.get(currency);
      if (base !== undefined) comparisons.push({ season, currency, base, amount: check.amount });
    }
  }

  if (hasErrors({ errors })) return { errors, warnings: [] };

  const warnings: ValidationWarning[] = [];

  for (const [currency, after] of validBase) {
    const before = current.currencies[currency] === "fixed" ? current.base[currency] : undefined;
    if (before === undefined) continue;
    const change = percentChange(before, after);
    if (change > WARNING_THRESHOLDS.basePriceChange) {
      warnings.push({
        id: "W1",
        message: `The ${CURRENCY_SHORT_NAMES[currency]} base price changes by ${Math.round(change * 100)}% (${formatMoney(before, currency)} → ${formatMoney(after, currency)}).`,
      });
    }
  }

  const usd = validBase.get("USD");
  const kes = validBase.get("KES");
  if (usd !== undefined && kes !== undefined && catalog.currency !== null) {
    const implied = kes / usd;
    const house = catalog.currency.kesPerUsdE4 / RATE_SCALE;
    if (percentChange(house, implied) > WARNING_THRESHOLDS.impliedRateDeviation) {
      warnings.push({
        id: "W2",
        message: `These prices imply KSh ${implied.toFixed(2)} per dollar, but the house rate is KSh ${formatRate(catalog.currency.kesPerUsdE4)}. Check for a missing or extra zero.`,
      });
    }
  }

  for (const { season, currency, base, amount } of comparisons) {
    const deviation = percentChange(base, amount);
    if (deviation > WARNING_THRESHOLDS.seasonDeviation) {
      warnings.push({
        id: "W3",
        message: `The ${season.name} ${CURRENCY_SHORT_NAMES[currency]} price is ${Math.round(deviation * 100)}% away from the base price (${formatMoney(amount, currency)} vs ${formatMoney(base, currency)}).`,
      });
    }
  }

  if (catalog.currency === null && CURRENCY_CODES.some((currency) => modes[currency] === "converted")) {
    warnings.push({ id: "W7", message: "Converted prices stay hidden until the exchange rate is set in Settings." });
  }

  // A converted currency is shown only if every price converts within its limits (see
  // buildPriceSheet), so one price over the limit leaves the package in the fixed currency alone.
  const conversion = conversionContextOf(catalog);
  if (conversion !== null) {
    for (const [source, base] of validBase) {
      const target = otherCurrency(source);
      if (modes[target] !== "converted") continue;
      const amounts = [base, ...comparisons.filter((row) => row.currency === source).map((row) => row.amount)];
      if (amounts.some((amount) => convertInto(amount, target, conversion) === null)) {
        warnings.push({
          id: "W9",
          message: `At the current exchange rate, a price here converts above the ${formatMoney(AMOUNT_LIMITS[target].max, target)} limit, so visitors will only see this package in ${CURRENCY_SHORT_NAMES[source]}s.`,
        });
      }
    }
  }

  if (!draft.visible && draft.featuredRank !== null) {
    warnings.push({
      id: "W8",
      message: `This package is hidden, so it won't appear in featured slot ${draft.featuredRank} on the homepage.`,
    });
  }

  return { errors, warnings };
}

function dateRangeErrors(startDate: string, endDate: string, today: IsoDate): FieldErrors {
  const errors: FieldErrors = {};
  if (!isIsoDate(startDate)) errors.startDate = "Enter a valid start date.";
  if (!isIsoDate(endDate)) errors.endDate = "Enter a valid end date.";
  if (hasErrors({ errors })) return errors;
  if (endDate < startDate) errors.endDate = "The end date must be on or after the start date.";
  else if (daysInclusive(startDate, endDate) > MAX_RANGE_DAYS) errors.endDate = "A range can cover at most 366 days.";
  else if (endDate < today) errors.endDate = "The end date must be today or later.";
  return errors;
}

function lengthOutside(value: string, limits: { min: number; max: number }): boolean {
  const length = value.trim().length;
  return length < limits.min || length > limits.max;
}

export function validateSeasonDraft(params: {
  draft: SeasonDraft;
  catalog: PricingCatalog;
  today: IsoDate;
}): ValidationOutcome {
  const { draft, catalog, today } = params;
  const errors: FieldErrors = {};
  if (lengthOutside(draft.name, TEXT_LIMITS.seasonName)) errors.name = "Name must be 2–40 characters.";
  Object.assign(errors, dateRangeErrors(draft.startDate, draft.endDate, today));
  if (errors.startDate === undefined && errors.endDate === undefined) {
    if (draft.startDate > addYears(today, MAX_START_YEARS_AHEAD)) {
      errors.startDate = "Start within the next three years.";
    } else {
      const clash = catalog.seasons.find((season) => season.id !== draft.id && rangesOverlap(season, draft));
      if (clash !== undefined) {
        errors.dates = `Overlaps with “${clash.name}” (${formatDateRange(clash.startDate, clash.endDate)}).`;
      }
    }
  }
  return { errors, warnings: [] };
}

function targetsIntersect(a: PromotionTarget, b: PromotionTarget): boolean {
  if (a.kind === "all" || b.kind === "all") return true;
  return a.slugs.some((slug) => b.slugs.includes(slug));
}

export function validatePromotionDraft(params: {
  draft: PromotionDraft;
  catalog: PricingCatalog;
  today: IsoDate;
  knownSlugs: ReadonlySet<string>;
}): ValidationOutcome {
  const { draft, catalog, today, knownSlugs } = params;
  const errors: FieldErrors = {};
  const warnings: ValidationWarning[] = [];

  if (lengthOutside(draft.name, TEXT_LIMITS.promotionName)) errors.name = "Internal name must be 2–60 characters.";
  if (lengthOutside(draft.label, TEXT_LIMITS.promotionLabel)) errors.label = "Badge text must be 2–24 characters.";
  if (draft.terms.trim().length > TEXT_LIMITS.promotionTerms.max) errors.terms = "Terms must be 160 characters or fewer.";

  const percent = draft.percentOff;
  if (percent === null) errors.percentOff = "Enter a discount percentage.";
  else if (!isPercentOffWithinLimits(percent)) {
    errors.percentOff = "Enter a whole percentage from 1 to 90.";
  } else if (percent > WARNING_THRESHOLDS.largeDiscountPercent) {
    warnings.push({
      id: "W4",
      message: `This is a large discount (${percent}% off). Double-check it before it goes live.`,
    });
  }

  Object.assign(errors, dateRangeErrors(draft.startDate, draft.endDate, today));

  if (draft.appliesTo.kind === "packages") {
    const slugs = draft.appliesTo.slugs;
    if (slugs.length === 0) errors.appliesTo = "Choose at least one package.";
    else if (new Set(slugs).size !== slugs.length) errors.appliesTo = "Each package can only be chosen once.";
    else if (slugs.some((slug) => !knownSlugs.has(slug))) errors.appliesTo = "Some chosen packages no longer exist.";
  }

  if (hasErrors({ errors })) return { errors, warnings: [] };

  const overlapping = catalog.promotions.filter(
    (other) =>
      other.id !== draft.id &&
      !other.paused &&
      promotionStatus(other, today) !== "ended" &&
      rangesOverlap(other, draft) &&
      targetsIntersect(other.appliesTo, draft.appliesTo),
  );
  if (overlapping.length > 0) {
    warnings.push({
      id: "W5",
      message: `Where promotions overlap, only the larger discount shows: ${overlapping.map((p) => `“${p.name}”`).join(", ")}.`,
    });
  }

  return { errors, warnings };
}

export interface ParsedCurrency {
  kesPerUsdE4: number;
  roundingStep: RoundingSteps;
}

function isUsdStep(value: number): value is UsdRoundingStep {
  return (USD_ROUNDING_STEPS as readonly number[]).includes(value);
}

function isKesStep(value: number): value is KesRoundingStep {
  return (KES_ROUNDING_STEPS as readonly number[]).includes(value);
}

export function validateCurrencyDraft(params: {
  draft: CurrencyDraft;
  current: CurrencySettings | null;
}): ValidationOutcome & { parsed: ParsedCurrency | null } {
  const { draft, current } = params;
  const errors: FieldErrors = {};

  const rate = parseRateInput(draft.rate);
  let kesPerUsdE4: number | null = null;
  if (rate === null) errors.rate = "Enter the rate as a number, for example 129.5 (up to 4 decimal places).";
  else if (rate < RATE_LIMITS_E4.min || rate > RATE_LIMITS_E4.max) {
    errors.rate = "Enter a rate between 50 and 500 shillings per dollar.";
  } else {
    kesPerUsdE4 = rate;
  }

  const usdStep = draft.roundingStep.USD;
  const kesStep = draft.roundingStep.KES;
  let roundingUsd: UsdRoundingStep | null = null;
  let roundingKes: KesRoundingStep | null = null;
  if (isUsdStep(usdStep)) roundingUsd = usdStep;
  else errors["roundingStep.USD"] = "Choose a rounding option from the list.";
  if (isKesStep(kesStep)) roundingKes = kesStep;
  else errors["roundingStep.KES"] = "Choose a rounding option from the list.";

  if (kesPerUsdE4 === null || roundingUsd === null || roundingKes === null) {
    return { errors, warnings: [], parsed: null };
  }

  const warnings: ValidationWarning[] = [];
  if (current !== null) {
    const change = percentChange(current.kesPerUsdE4, kesPerUsdE4);
    if (change > WARNING_THRESHOLDS.rateChange) {
      warnings.push({
        id: "W6",
        message: `The rate changes by ${Math.round(change * 100)}% (KSh ${formatRate(current.kesPerUsdE4)} → KSh ${formatRate(kesPerUsdE4)} per dollar).`,
      });
    }
  }
  return { errors, warnings, parsed: { kesPerUsdE4, roundingStep: { USD: roundingUsd, KES: roundingKes } } };
}

export function catalogInvariantProblems(catalog: PricingCatalog, knownSlugs: ReadonlySet<string>): string[] {
  const problems: string[] = [];

  const seasonIds = new Set<string>();
  for (const season of catalog.seasons) {
    if (seasonIds.has(season.id)) problems.push(`Duplicate season id ${season.id}.`);
    seasonIds.add(season.id);
    if (!isIsoDate(season.startDate) || !isIsoDate(season.endDate) || season.endDate < season.startDate) {
      problems.push(`Season ${season.id} has an invalid date range.`);
    }
  }
  const sortedSeasons = [...catalog.seasons].sort((a, b) => compareIsoDates(a.startDate, b.startDate));
  let latest = sortedSeasons[0];
  for (let index = 1; index < sortedSeasons.length; index += 1) {
    const next = sortedSeasons[index];
    if (rangesOverlap(latest, next)) problems.push(`Seasons ${latest.id} and ${next.id} overlap.`);
    if (compareIsoDates(next.endDate, latest.endDate) > 0) latest = next;
  }

  const promotionIds = new Set<string>();
  for (const promotion of catalog.promotions) {
    if (promotion.appliesTo.kind === "packages") {
      if (promotion.appliesTo.slugs.length === 0) problems.push(`Promotion ${promotion.id} targets no packages.`);
      for (const slug of promotion.appliesTo.slugs) {
        if (!knownSlugs.has(slug)) problems.push(`Promotion ${promotion.id} targets unknown package ${slug}.`);
      }
    }
    if (promotionIds.has(promotion.id)) problems.push(`Duplicate promotion id ${promotion.id}.`);
    promotionIds.add(promotion.id);
    if (!isIsoDate(promotion.startDate) || !isIsoDate(promotion.endDate) || promotion.endDate < promotion.startDate) {
      problems.push(`Promotion ${promotion.id} has an invalid date range.`);
    }
  }

  const ranks = new Map<number, string>();
  for (const [slug, pkg] of Object.entries(catalog.packages)) {
    if (!knownSlugs.has(slug)) problems.push(`Unknown package ${slug}.`);
    const fixed = CURRENCY_CODES.filter((currency) => pkg.currencies[currency] === "fixed");
    if (fixed.length === 0) problems.push(`Package ${slug} has no fixed currency.`);
    for (const currency of CURRENCY_CODES) {
      if (pkg.currencies[currency] === "converted" && pkg.currencies[otherCurrency(currency)] !== "fixed") {
        problems.push(`Package ${slug} converts ${currency} from a currency that is not fixed.`);
      }
    }
    for (const currency of fixed) {
      const amount = pkg.base[currency];
      if (amount === undefined || !isAmountWithinLimits(amount, currency)) {
        problems.push(`Package ${slug} is missing a valid ${currency} base price.`);
      }
    }
    const pricedSeasons = new Set<string>();
    for (const price of pkg.seasonPrices) {
      if (!seasonIds.has(price.seasonId)) problems.push(`Package ${slug} prices unknown season ${price.seasonId}.`);
      if (pricedSeasons.has(price.seasonId)) problems.push(`Package ${slug} prices season ${price.seasonId} twice.`);
      pricedSeasons.add(price.seasonId);
      for (const currency of fixed) {
        const amount = price[currency];
        if (amount === undefined || !isAmountWithinLimits(amount, currency)) {
          problems.push(`Package ${slug} is missing a valid ${currency} price for season ${price.seasonId}.`);
        }
      }
    }
    if (pkg.featuredRank !== null) {
      const holder = ranks.get(pkg.featuredRank);
      if (holder !== undefined) {
        problems.push(`Packages ${holder} and ${slug} share featured slot ${pkg.featuredRank}.`);
      } else {
        ranks.set(pkg.featuredRank, slug);
      }
    }
  }

  return problems;
}
