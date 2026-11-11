import type { Metadata } from "next";
import ActivityLog from "@/components/admin/ActivityLog";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { formatTimestamp } from "@/lib/admin/format";
import { requireAdminPage } from "@/lib/admin/session";
import { listAudit } from "@/lib/cms/audit";
import { logError } from "@/lib/logger";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  await requireAdminPage();
  // An unreadable activity log is shown as a notice rather than an error page.
  const entries = await listAudit({ limit: 200 }).catch((error: unknown) => {
    logError("admin.activity.list", error);
    return null;
  });
  return (
    <>
      <PageHeader eyebrow="Back office" title="Activity" description="Every change made in the back office, newest first." />
      {entries === null ? (
        <section className="adm-card">
          <p className="adm-hint">The activity log can&apos;t be shown right now.</p>
        </section>
      ) : (
        <ActivityLog
          entries={entries.map((entry) => ({
            id: entry.id,
            type: entry.entity.type,
            when: formatTimestamp(entry.at),
            who: entry.actor.email,
            summary: entry.summary,
          }))}
        />
      )}
    </>
  );
}
