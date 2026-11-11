import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HistoryList from "@/components/admin/HistoryList";
import PackageEditor from "@/components/admin/packages/PackageEditor";
import { ButtonLink } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { getTourBySlug } from "@/data/cms";
import { loadAdminCatalog } from "@/lib/admin/catalog-loader";
import { formatTimestamp } from "@/lib/admin/format";
import { editableCommercial, RANK_TEXT } from "@/lib/admin/package-form";
import { can } from "@/lib/admin/permissions";
import { requireAdminPage } from "@/lib/admin/session";
import { listAudit } from "@/lib/cms/audit";
import { tourTitleOf } from "@/lib/cms/known-slugs";
import { logError } from "@/lib/logger";
import { todayInNairobi } from "@/lib/pricing/dates";
import { resolvePackageCommercial } from "@/lib/pricing/defaults";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: getTourBySlug(slug)?.title ?? "Package" };
}

export default async function PackagePage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireAdminPage();
  const { slug } = await params;
  const tour = getTourBySlug(slug);
  if (!tour) notFound();

  const [catalog, history] = await Promise.all([
    loadAdminCatalog(),
    // History needs a composite index; the editor must still open while it builds.
    listAudit({ entity: { type: "package", id: slug }, limit: 20 }).catch((error: unknown) => {
      logError("admin.packages.history", error, { slug });
      return null;
    }),
  ]);
  const today = todayInNairobi();
  const holders: Partial<Record<"1" | "2" | "3", string>> = {};
  for (const [otherSlug, other] of Object.entries(catalog.packages)) {
    if (otherSlug !== slug && other.featuredRank !== null) holders[RANK_TEXT[other.featuredRank]] = tourTitleOf(otherSlug);
  }
  const upcomingSeasons = catalog.seasons
    .filter((season) => season.endDate >= today)
    .map(({ id, name, startDate, endDate }) => ({ id, name, startDate, endDate }));
  const upcomingSeasonIds = new Set(upcomingSeasons.map((season) => season.id));

  return (
    <>
      <PageHeader
        eyebrow="Packages"
        title={tour.title}
        description={`${tour.duration} · ${tour.location}`}
        back={{ href: "/admin/packages", label: "All packages" }}
        actions={
          <ButtonLink href={`/tour/${slug}`} external icon={<ExternalLink size={16} aria-hidden="true" />}>
            View on website
          </ButtonLink>
        }
      />
      <div className="adm-stack">
        <PackageEditor
          slug={slug}
          initial={editableCommercial(resolvePackageCommercial(catalog, slug, tour.listPriceUsd), upcomingSeasonIds)}
          upcomingSeasons={upcomingSeasons}
          currency={catalog.currency}
          seasons={catalog.seasons}
          promotions={catalog.promotions}
          today={today}
          featuredHolders={holders}
          canEdit={can(actor.role, "catalog.write")}
        />
        <Card title="Change history">
          {history === null ? (
            <p className="adm-hint">The change history can&apos;t be shown right now.</p>
          ) : history.length === 0 ? (
            <p className="adm-hint">No changes yet. This package still uses the price from the website code.</p>
          ) : (
            <HistoryList
              entries={history.map((entry) => ({
                id: entry.id,
                when: formatTimestamp(entry.at),
                who: entry.actor.email,
                summary: entry.summary,
              }))}
            />
          )}
        </Card>
      </div>
    </>
  );
}
