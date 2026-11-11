"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/admin/ui/SegmentedControl";
import type { AuditEntityType } from "@/lib/pricing/operations";
import HistoryList from "./HistoryList";

type Filter = "all" | AuditEntityType;

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "package", label: "Packages" },
  { value: "season", label: "Seasons" },
  { value: "promotion", label: "Promotions" },
  { value: "currency", label: "Currency" },
  { value: "team", label: "Team" },
  { value: "auth", label: "Sign-ins" },
];

export default function ActivityLog({
  entries,
}: {
  entries: Array<{ id: string; type: AuditEntityType; when: string; who: string; summary: string }>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? entries : entries.filter((entry) => entry.type === filter);
  return (
    <div className="adm-stack">
      <SegmentedControl label="Show activity for" value={filter} options={FILTERS} onChange={setFilter} />
      <section className="adm-card">
        {shown.length === 0 ? <p className="adm-hint">Nothing here yet.</p> : <HistoryList entries={shown} />}
      </section>
    </div>
  );
}
