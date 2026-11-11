import type { Metadata } from "next";
import PackagesTable from "@/components/admin/packages/PackagesTable";
import { ButtonLink } from "@/components/admin/ui/Button";
import { Notice } from "@/components/admin/ui/Notice";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { tourPackages } from "@/data/cms";
import { loadAdminCatalog } from "@/lib/admin/catalog-loader";
import { buildAdminPackageRows } from "@/lib/admin/package-rows";
import { can } from "@/lib/admin/permissions";
import { requireAdminPage } from "@/lib/admin/session";
import { todayInNairobi } from "@/lib/pricing/dates";

export const metadata: Metadata = { title: "Packages" };

export default async function PackagesPage() {
  const actor = await requireAdminPage();
  const catalog = await loadAdminCatalog();
  const rows = buildAdminPackageRows({ packages: tourPackages, catalog, today: todayInNairobi() });
  return (
    <>
      <PageHeader
        eyebrow="Website"
        title="Packages"
        description="Prices, visibility and homepage placement for every tour package."
      />
      <div className="adm-stack">
        {catalog.currency === null && (
          <Notice
            tone="warning"
            title="Shilling prices are hidden"
            action={<ButtonLink href="/admin/settings">Set the exchange rate</ButtonLink>}
          >
            Prices converted from dollars appear in shillings once the house exchange rate is set.
          </Notice>
        )}
        <PackagesTable rows={rows} canEdit={can(actor.role, "catalog.write")} />
      </div>
    </>
  );
}
