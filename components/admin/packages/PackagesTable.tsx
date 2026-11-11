"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Field } from "@/components/admin/ui/Field";
import { SegmentedControl } from "@/components/admin/ui/SegmentedControl";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import type { AdminPackageRow } from "@/lib/admin/package-rows";
import { formatMoney } from "@/lib/pricing/money";
import type { CurrencyCode, CurrencyMode, DisplayPrice } from "@/lib/pricing/types";

type Filter = "all" | "live" | "hidden" | "promotion";

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "hidden", label: "Hidden" },
  { value: "promotion", label: "On promotion" },
];

function matchesFilter(row: AdminPackageRow, filter: Filter): boolean {
  if (filter === "live") return row.visible;
  if (filter === "hidden") return !row.visible;
  if (filter === "promotion") return row.promotionLabel !== null;
  return true;
}

function matchesQuery(row: AdminPackageRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || `${row.title} ${row.location}`.toLowerCase().includes(needle);
}

function MoneyCell({ price, currency, mode }: { price: DisplayPrice | undefined; currency: CurrencyCode; mode: CurrencyMode }) {
  if (price === undefined) return <span className="adm-cell-sub">{mode === "off" ? "Not shown" : "—"}</span>;
  return (
    <span className="adm-money-stack">
      {price.original !== null && <span className="adm-money-was">{formatMoney(price.original, currency)}</span>}
      <span>{formatMoney(price.amount, currency)}</span>
    </span>
  );
}

export default function PackagesTable({ rows, canEdit }: { rows: AdminPackageRow[]; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((row) => matchesFilter(row, filter) && matchesQuery(row, query));
  const verb = canEdit ? "Edit" : "View";

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <Field id="package-search" label="Search packages">
          <input
            id="package-search"
            className="adm-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or place"
          />
        </Field>
        <SegmentedControl label="Filter packages" value={filter} options={FILTERS} onChange={setFilter} />
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No packages match">Try a different search or filter.</EmptyState>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Package</th>
                <th scope="col">Status</th>
                <th scope="col">From (USD)</th>
                <th scope="col">From (KES)</th>
                <th scope="col">Promotion</th>
                <th scope="col">Homepage</th>
                <th scope="col">
                  <span className="adm-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.slug}>
                  <td>
                    <div className="adm-package-cell">
                      <Image className="adm-thumb" src={row.image} alt="" width={56} height={42} />
                      <div>
                        <div className="adm-cell-title">{row.title}</div>
                        <div className="adm-cell-sub">
                          {row.duration} · {row.location}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="adm-list-actions">
                      {row.visible ? <StatusPill tone="live">Live</StatusPill> : <StatusPill tone="muted">Hidden</StatusPill>}
                      {row.display === "enquire" && <StatusPill tone="purple">Chat with agent</StatusPill>}
                      {!row.customised && <StatusPill tone="muted">Code default</StatusPill>}
                    </div>
                  </td>
                  <td>
                    <MoneyCell price={row.from.USD} currency="USD" mode={row.currencies.USD} />
                  </td>
                  <td>
                    <MoneyCell price={row.from.KES} currency="KES" mode={row.currencies.KES} />
                  </td>
                  <td>
                    {row.promotionLabel === null ? (
                      <span className="adm-cell-sub">—</span>
                    ) : (
                      <StatusPill tone="gold">{row.promotionLabel}</StatusPill>
                    )}
                  </td>
                  <td>
                    {row.featuredRank === null ? (
                      <span className="adm-cell-sub">—</span>
                    ) : (
                      <StatusPill tone="purple">Slot {row.featuredRank}</StatusPill>
                    )}
                  </td>
                  <td>
                    <Link
                      className="adm-btn adm-btn--secondary"
                      href={`/admin/packages/${row.slug}`}
                      aria-label={`${verb} ${row.title}`}
                    >
                      {verb}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
