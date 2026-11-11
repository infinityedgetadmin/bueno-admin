import type { Metadata } from "next";
import SeasonsManager from "@/components/admin/seasons/SeasonsManager";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { loadAdminCatalog } from "@/lib/admin/catalog-loader";
import { can } from "@/lib/admin/permissions";
import { seasonStatus, seasonUsage } from "@/lib/admin/season-view";
import { requireAdminPage } from "@/lib/admin/session";
import { todayInNairobi } from "@/lib/pricing/dates";

export const metadata: Metadata = { title: "Seasons" };

export default async function SeasonsPage() {
  const actor = await requireAdminPage();
  const catalog = await loadAdminCatalog();
  const today = todayInNairobi();
  const usage = seasonUsage(catalog);
  const seasons = catalog.seasons.map((season) => ({
    ...season,
    status: seasonStatus(season, today),
    packagesPriced: usage[season.id] ?? 0,
  }));
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Seasons"
        description="Travel-date periods that can carry their own package prices. Seasons can't overlap."
      />
      <SeasonsManager seasons={seasons} today={today} canEdit={can(actor.role, "catalog.write")} />
    </>
  );
}
