import { RATE_STALE_DAYS } from "@/lib/pricing/constants";
import { addDays, daysSince, formatDisplayDate } from "@/lib/pricing/dates";
import { promotionStatus } from "@/lib/pricing/engine";
import type { IsoDate, PricingCatalog } from "@/lib/pricing/types";
import type { AdminPackageRow } from "./package-rows";

export interface AttentionItem {
  id: string;
  tone: "warning" | "info";
  message: string;
  href: string;
  cta: string;
}

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Things the team should look at, most important first. */
export function attentionItems(params: {
  catalog: PricingCatalog;
  rows: readonly AdminPackageRow[];
  today: IsoDate;
  now: Date;
}): AttentionItem[] {
  const { catalog, rows, today, now } = params;
  const items: AttentionItem[] = [];

  if (catalog.currency === null) {
    items.push({
      id: "rate-unset",
      tone: "warning",
      message: "The exchange rate isn't set, so converted shilling prices are hidden on the website.",
      href: "/admin/settings",
      cta: "Set the rate",
    });
  } else {
    const age = daysSince(catalog.currency.updatedAt, now);
    if (age > RATE_STALE_DAYS) {
      items.push({
        id: "rate-stale",
        tone: "warning",
        message: `The exchange rate was last updated ${age} days ago.`,
        href: "/admin/settings",
        cta: "Review the rate",
      });
    }
  }

  const weekAhead = addDays(today, 7);
  for (const promotion of catalog.promotions) {
    if (promotionStatus(promotion, today) === "live" && promotion.endDate <= weekAhead) {
      items.push({
        id: `promo-${promotion.id}`,
        tone: "info",
        message: `“${promotion.label}” ends on ${formatDisplayDate(promotion.endDate)}.`,
        href: "/admin/promotions",
        cta: "View promotions",
      });
    }
  }

  if (catalog.seasons.length > 0) {
    const lastEnd = catalog.seasons.reduce((latest, season) => (season.endDate > latest ? season.endDate : latest), catalog.seasons[0].endDate);
    if (lastEnd < addDays(today, 60)) {
      items.push({
        id: "seasons-ending",
        tone: "info",
        message:
          lastEnd < today
            ? "All seasons have ended. Add the next ones to keep seasonal pricing."
            : `Your last season ends on ${formatDisplayDate(lastEnd)}. Add the next ones to keep seasonal pricing.`,
        href: "/admin/seasons",
        cta: "Manage seasons",
      });
    }
  }

  const enquire = rows.filter((row) => row.visible && row.display === "enquire").length;
  if (enquire > 0) {
    items.push({
      id: "enquire",
      tone: "info",
      message: `${countText(enquire, "package shows", "packages show")} “Chat with an agent” instead of a price.`,
      href: "/admin/packages",
      cta: "Review packages",
    });
  }

  const hidden = rows.filter((row) => !row.visible).length;
  if (hidden > 0) {
    items.push({
      id: "hidden",
      tone: "info",
      message: `${countText(hidden, "package is", "packages are")} hidden from the website.`,
      href: "/admin/packages",
      cta: "Review packages",
    });
  }

  return items;
}
