import type { TourPackage } from "@/data/cms";
import { CURRENCY_CODES } from "@/lib/pricing/constants";
import { resolvePackageCommercial } from "@/lib/pricing/defaults";
import { buildPriceSheet, fromPrice } from "@/lib/pricing/engine";
import type {
  CurrencyCode,
  CurrencyMode,
  DisplayMode,
  DisplayPrice,
  FeaturedRank,
  IsoDate,
  PricingCatalog,
} from "@/lib/pricing/types";

export interface AdminPackageRow {
  slug: string;
  title: string;
  image: string;
  location: string;
  duration: string;
  visible: boolean;
  display: DisplayMode;
  featuredRank: FeaturedRank | null;
  /** False while the package still uses the price from the website code. */
  customised: boolean;
  currencies: Record<CurrencyCode, CurrencyMode>;
  from: Partial<Record<CurrencyCode, DisplayPrice>>;
  promotionLabel: string | null;
}

export function buildAdminPackageRows(params: {
  packages: readonly TourPackage[];
  catalog: PricingCatalog;
  today: IsoDate;
}): AdminPackageRow[] {
  return params.packages.map((tour) => {
    const commercial = resolvePackageCommercial(params.catalog, tour.slug, tour.listPriceUsd);
    // Price it as if shown so hidden and enquire-only packages still show their numbers here.
    const sheet = buildPriceSheet({
      slug: tour.slug,
      pkg: { ...commercial, display: "price" },
      catalog: params.catalog,
      today: params.today,
    });
    const from: Partial<Record<CurrencyCode, DisplayPrice>> = {};
    if (sheet !== null) {
      for (const currency of CURRENCY_CODES) {
        const price = fromPrice(sheet, currency);
        if (price !== null) from[currency] = price;
      }
    }
    return {
      slug: tour.slug,
      title: tour.title,
      image: tour.image,
      location: tour.location,
      duration: tour.duration,
      visible: commercial.visible,
      display: commercial.display,
      featuredRank: commercial.featuredRank,
      customised: commercial.version > 0,
      currencies: commercial.currencies,
      from,
      promotionLabel: sheet?.promotion?.label ?? null,
    };
  });
}
