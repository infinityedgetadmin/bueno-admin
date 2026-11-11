import type { Metadata } from "next";
import CurrencySettingsForm from "@/components/admin/settings/CurrencySettingsForm";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { tourPackages } from "@/data/cms";
import { loadAdminCatalog } from "@/lib/admin/catalog-loader";
import { formatTimestamp } from "@/lib/admin/format";
import { can } from "@/lib/admin/permissions";
import { requireAdminPage } from "@/lib/admin/session";
import { daysSince } from "@/lib/pricing/dates";
import { resolvePackageCommercial } from "@/lib/pricing/defaults";
import { formatRate } from "@/lib/pricing/money";

export const metadata: Metadata = { title: "Currency" };

export default async function CurrencySettingsPage() {
  const actor = await requireAdminPage();
  const catalog = await loadAdminCatalog();
  const settings = catalog.currency;
  const samples = tourPackages.slice(0, 3).map((tour) => {
    const commercial = resolvePackageCommercial(catalog, tour.slug, tour.listPriceUsd);
    return { title: tour.title, usd: commercial.base.USD ?? tour.listPriceUsd };
  });
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Currency"
        description="Visitors in Kenya see Kenyan shillings; everyone else sees US dollars. The house rate converts between them."
      />
      <CurrencySettingsForm
        initial={
          settings === null
            ? null
            : { rate: formatRate(settings.kesPerUsdE4), roundingStep: settings.roundingStep, version: settings.version }
        }
        samples={samples}
        lastUpdated={
          settings === null
            ? null
            : { when: formatTimestamp(settings.updatedAt), who: settings.updatedBy, daysAgo: daysSince(settings.updatedAt, new Date()) }
        }
        canEdit={can(actor.role, "catalog.write")}
      />
    </>
  );
}
