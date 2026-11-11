import type { Metadata } from "next";
import PromotionsManager from "@/components/admin/promotions/PromotionsManager";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { tourPackages } from "@/data/cms";
import { loadAdminCatalog } from "@/lib/admin/catalog-loader";
import { can } from "@/lib/admin/permissions";
import { buildPromotionPreviewRows } from "@/lib/admin/promotion-view";
import { requireAdminPage } from "@/lib/admin/session";
import { todayInNairobi } from "@/lib/pricing/dates";
import { promotionStatus } from "@/lib/pricing/engine";

export const metadata: Metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  const actor = await requireAdminPage();
  const catalog = await loadAdminCatalog();
  const today = todayInNairobi();
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Promotions"
        description="Percentage discounts shown on the website with a badge and the original price struck through. Where promotions overlap, the larger discount wins."
      />
      <PromotionsManager
        promotions={catalog.promotions.map((promotion) => ({ ...promotion, status: promotionStatus(promotion, today) }))}
        packages={tourPackages.map((tour) => ({ slug: tour.slug, title: tour.title }))}
        previewRows={buildPromotionPreviewRows({ packages: tourPackages, catalog, today })}
        today={today}
        canEdit={can(actor.role, "catalog.write")}
      />
    </>
  );
}
