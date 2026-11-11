import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import HistoryList from "@/components/admin/HistoryList";
import StatCard from "@/components/admin/StatCard";
import { ButtonLink } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { Notice } from "@/components/admin/ui/Notice";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { tourPackages } from "@/data/cms";
import { attentionItems } from "@/lib/admin/attention";
import { loadAdminCatalog } from "@/lib/admin/catalog-loader";
import { formatTimestamp } from "@/lib/admin/format";
import { buildAdminPackageRows } from "@/lib/admin/package-rows";
import { can } from "@/lib/admin/permissions";
import { requireAdminPage } from "@/lib/admin/session";
import { PUBLIC_SITE_URL } from "@/lib/admin/site-url";
import { listAudit } from "@/lib/cms/audit";
import { logError } from "@/lib/logger";
import { todayInNairobi } from "@/lib/pricing/dates";
import { promotionStatus } from "@/lib/pricing/engine";
import { formatRate } from "@/lib/pricing/money";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const actor = await requireAdminPage();
  const [catalog, recent] = await Promise.all([
    loadAdminCatalog(),
    // An unreadable activity log must not take the whole overview down — tolerate it the same
    // way the package page tolerates its per-entity history.
    listAudit({ limit: 8 }).catch((error: unknown) => {
      logError("admin.overview.activity", error);
      return null;
    }),
  ]);
  const today = todayInNairobi();
  const rows = buildAdminPackageRows({ packages: tourPackages, catalog, today });
  const items = attentionItems({ catalog, rows, today, now: new Date() });
  const live = rows.filter((row) => row.visible).length;
  const livePromotions = catalog.promotions.filter((promotion) => promotionStatus(promotion, today) === "live").length;
  const upcomingSeasons = catalog.seasons.filter((season) => season.endDate >= today).length;

  return (
    <>
      <PageHeader
        eyebrow="Back office"
        title="Overview"
        description="Prices, seasons, promotions and currency for bueno.example.com."
        actions={
          <ButtonLink href={PUBLIC_SITE_URL} external icon={<ExternalLink size={16} aria-hidden="true" />}>
            View website
          </ButtonLink>
        }
      />
      <div className="adm-stack">
        {!can(actor.role, "catalog.write") && (
          <Notice tone="info" title="View only">
            You can see everything here, but only admins and editors can make changes.
          </Notice>
        )}
        <div className="adm-grid-4">
          <StatCard label="Live packages" value={String(live)} foot={`${rows.length - live} hidden`} />
          <StatCard label="Live promotions" value={String(livePromotions)} foot={`${catalog.promotions.length} in total`} />
          <StatCard
            label="Exchange rate"
            value={catalog.currency === null ? "Not set" : `KSh ${formatRate(catalog.currency.kesPerUsdE4)}`}
            foot={catalog.currency === null ? "Shilling conversions are hidden" : `per US dollar · ${formatTimestamp(catalog.currency.updatedAt)}`}
          />
          <StatCard label="Seasons ahead" value={String(upcomingSeasons)} foot="current and upcoming" />
        </div>
        <div className="adm-grid-2">
          <Card title="Needs attention">
            {items.length === 0 ? (
              <p className="adm-hint">Everything looks good.</p>
            ) : (
              <ul className="adm-list">
                {items.map((item) => (
                  <li key={item.id} className="adm-list-item">
                    <span>{item.message}</span>
                    <ButtonLink href={item.href} variant={item.tone === "warning" ? "primary" : "secondary"}>
                      {item.cta}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent changes" actions={<ButtonLink href="/admin/activity" variant="ghost">See all</ButtonLink>}>
            {recent === null ? (
              <p className="adm-hint">The activity log can&apos;t be shown right now.</p>
            ) : recent.length === 0 ? (
              <p className="adm-hint">No changes yet.</p>
            ) : (
              <HistoryList
                entries={recent.map((entry) => ({ id: entry.id, when: formatTimestamp(entry.at), who: entry.actor.email, summary: entry.summary }))}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
