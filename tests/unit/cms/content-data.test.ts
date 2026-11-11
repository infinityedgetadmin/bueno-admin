import { describe, expect, it } from "vitest";
import { tourPackages } from "@/data/cms";
import { activities, getActivityBySlug } from "@/data/activities";
import { activityPriceTexts, describesSamePrice } from "@/lib/pricing/activities";
import { isAmountWithinLimits } from "@/lib/pricing/money";

const CONVERSION = { kesPerUsdE4: 1_295_000, roundingStep: { USD: 1 as const, KES: 500 as const } };

describe("tour package content", () => {
  it("has unique slugs", () => {
    const slugs = tourPackages.map((tour) => tour.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every package a valid whole-dollar list price", () => {
    for (const tour of tourPackages) {
      expect(isAmountWithinLimits(tour.listPriceUsd, "USD"), tour.slug).toBe(true);
    }
  });
});

describe("activity content", () => {
  it("prices every activity as a whole-dollar USD range or gives display text to show instead", () => {
    for (const activity of activities) {
      const { min, max, currency } = activity.priceRange;
      expect(currency, activity.slug).toBe("USD");
      expect(min, activity.slug).toBeLessThanOrEqual(max);
      const priceable = isAmountWithinLimits(min, "USD") && isAmountWithinLimits(max, "USD");
      const hasDisplayText = activity.priceDisplay.trim().length > 0;
      expect(priceable || hasDisplayText, activity.slug).toBe(true);
    }
  });

  it("falls back to display text for the Kazuri Beads Factory Tour's free price range", () => {
    const activity = getActivityBySlug("kazuri-beads-factory-tour");
    if (!activity) throw new Error("kazuri-beads-factory-tour activity not found in data/activities.ts");
    expect(activityPriceTexts(activity.priceRange, null)).toEqual({});
  });

  it("converts at least one activity's authored price to KES when a house rate is set", () => {
    const convertible = activities.filter((activity) => {
      const texts = activityPriceTexts(activity.priceRange, CONVERSION);
      return texts.USD !== undefined && describesSamePrice(texts.USD, activity.priceDisplay) && texts.KES !== undefined;
    });
    expect(convertible.length).toBeGreaterThanOrEqual(1);
  });

  it("lists the priceable activities whose generated wording does not match their authored priceDisplay", () => {
    const mismatched = activities
      .filter((activity) => {
        const texts = activityPriceTexts(activity.priceRange, CONVERSION);
        return texts.USD !== undefined && !describesSamePrice(texts.USD, activity.priceDisplay);
      })
      .map((activity) => activity.slug);
    // Activities whose authored priceDisplay wording differs from the generated wording.
    expect([...mismatched].sort()).toEqual([
      "crescent-island-walk",
      "fly-in-safari",
      "golf-experience",
      "kitengela-glass-art-studio",
      "lake-baringo-birdwatching",
      "lake-bogoria-hot-springs",
      "lamu-museums-package",
      "nairobi-national-park",
      "ol-pejeta-conservancy",
      "olkaria-geothermal-spa",
      "paradise-lost",
      "running-camp-iten",
      "sheldrick-elephant-orphanage",
    ]);
  });
});
