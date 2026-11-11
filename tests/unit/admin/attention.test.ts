import { describe, expect, it } from "vitest";
import { attentionItems } from "@/lib/admin/attention";
import type { AdminPackageRow } from "@/lib/admin/package-rows";
import { makeCatalog, makeCurrency, makePromotion, makeSeason } from "../pricing/fixtures";

const NOW = new Date("2026-09-24T09:00:00Z");
const TODAY = "2026-09-24";

function row(overrides: Partial<AdminPackageRow>): AdminPackageRow {
  return {
    slug: "x",
    title: "X",
    image: "",
    location: "",
    duration: "",
    visible: true,
    display: "price",
    featuredRank: null,
    customised: false,
    currencies: { USD: "fixed", KES: "converted" },
    from: {},
    promotionLabel: null,
    ...overrides,
  };
}

describe("attentionItems", () => {
  it("is empty when everything is in order", () => {
    const catalog = makeCatalog({ currency: makeCurrency({ updatedAt: "2026-09-20T08:00:00.000Z" }), seasons: [makeSeason({ endDate: "2027-06-30", startDate: "2027-06-01" })] });
    expect(attentionItems({ catalog, rows: [row({})], today: TODAY, now: NOW })).toEqual([]);
  });

  it("flags a missing or stale exchange rate", () => {
    expect(attentionItems({ catalog: makeCatalog({ currency: null }), rows: [], today: TODAY, now: NOW }).map((i) => i.id)).toEqual(["rate-unset"]);
    const stale = makeCatalog({ currency: makeCurrency({ updatedAt: "2026-07-01T08:00:00.000Z" }) });
    expect(attentionItems({ catalog: stale, rows: [], today: TODAY, now: NOW })[0]).toMatchObject({
      id: "rate-stale",
      message: "The exchange rate was last updated 85 days ago.",
    });
  });

  it("flags promotions ending within a week", () => {
    const catalog = makeCatalog({
      promotions: [
        makePromotion({ id: "soon", label: "Early Bird", endDate: "2026-09-30" }),
        makePromotion({ id: "later", endDate: "2026-12-31" }),
        makePromotion({ id: "paused", endDate: "2026-09-28", paused: true }),
      ],
    });
    expect(attentionItems({ catalog, rows: [], today: TODAY, now: NOW })).toEqual([
      { id: "promo-soon", tone: "info", message: "“Early Bird” ends on 30 Sep 2026.", href: "/admin/promotions", cta: "View promotions" },
    ]);
  });

  it("flags seasons running out, judged by the season that ends last", () => {
    const soon = makeCatalog({
      seasons: [
        makeSeason({ id: "a", startDate: "2026-08-01", endDate: "2026-08-31" }),
        makeSeason({ id: "b", startDate: "2026-10-01", endDate: "2026-10-31" }),
      ],
    });
    expect(attentionItems({ catalog: soon, rows: [], today: TODAY, now: NOW })[0]?.message).toBe(
      "Your last season ends on 31 Oct 2026. Add the next ones to keep seasonal pricing.",
    );
    const over = makeCatalog({ seasons: [makeSeason({ startDate: "2026-08-01", endDate: "2026-08-31" })] });
    expect(attentionItems({ catalog: over, rows: [], today: TODAY, now: NOW })[0]?.message).toBe(
      "All seasons have ended. Add the next ones to keep seasonal pricing.",
    );
  });

  it("summarises hidden and enquire-only packages", () => {
    const items = attentionItems({
      catalog: makeCatalog(),
      rows: [row({ display: "enquire" }), row({ visible: false }), row({ visible: false })],
      today: TODAY,
      now: NOW,
    });
    expect(items.map((item) => item.message)).toEqual([
      "1 package shows “Chat with an agent” instead of a price.",
      "2 packages are hidden from the website.",
    ]);
    const single = attentionItems({ catalog: makeCatalog(), rows: [row({ display: "enquire" }), row({ display: "enquire" }), row({ visible: false })], today: TODAY, now: NOW });
    expect(single.map((item) => item.message)).toEqual([
      "2 packages show “Chat with an agent” instead of a price.",
      "1 package is hidden from the website.",
    ]);
  });
});
