"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Field } from "@/components/admin/ui/Field";
import { Notice } from "@/components/admin/ui/Notice";
import { StatusPill, type PillTone } from "@/components/admin/ui/StatusPill";
import { resultErrorMessage } from "@/lib/admin/action-result";
import { deleteSeasonAction, saveSeasonAction } from "@/lib/admin/actions/seasons";
import { buildTimeline, type SeasonStatus } from "@/lib/admin/season-view";
import { useServerAction } from "@/lib/admin/use-server-action";
import { TEXT_LIMITS } from "@/lib/pricing/constants";
import { formatDateRange } from "@/lib/pricing/dates";
import type { FieldErrors, Season } from "@/lib/pricing/types";
import SeasonTimeline from "./SeasonTimeline";

export interface SeasonRow extends Season {
  status: SeasonStatus;
  packagesPriced: number;
}

interface FormState {
  id: string | null;
  expectedVersion: number;
  name: string;
  startDate: string;
  endDate: string;
}

const EMPTY_FORM: FormState = { id: null, expectedVersion: 0, name: "", startDate: "", endDate: "" };

const STATUS: Readonly<Record<SeasonStatus, { tone: PillTone; label: string }>> = {
  current: { tone: "live", label: "Current" },
  upcoming: { tone: "purple", label: "Upcoming" },
  ended: { tone: "muted", label: "Ended" },
};

function usageText(count: number): string {
  if (count === 0) return "No custom package prices";
  return `Custom prices on ${count} package${count === 1 ? "" : "s"}`;
}

export default function SeasonsManager({
  seasons,
  today,
  canEdit,
}: {
  seasons: SeasonRow[];
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<SeasonRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const save = useServerAction(saveSeasonAction);
  const remove = useServerAction(deleteSeasonAction);

  const errors: FieldErrors =
    save.result !== null && !save.result.ok && save.result.kind === "validation" ? save.result.fieldErrors : {};
  const saveFailure = resultErrorMessage(save.result);
  const active = seasons.filter((season) => season.status !== "ended");
  const ended = seasons.filter((season) => season.status === "ended");
  const timeline = buildTimeline({ seasons: active, today, months: 18 });

  function openForm(next: FormState) {
    save.clear();
    setNotice(null);
    setForm(next);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form === null) return;
    const outcome = await save.run({
      id: form.id,
      expectedVersion: form.expectedVersion,
      name: form.name,
      startDate: form.startDate,
      endDate: form.endDate,
    });
    if (outcome.ok) {
      setNotice(outcome.message);
      setForm(null);
      router.refresh();
    }
  }

  async function confirmDelete() {
    if (deleting === null) return;
    const outcome = await remove.run({ id: deleting.id, expectedVersion: deleting.version });
    if (outcome.ok) {
      setNotice(outcome.message);
      setDeleting(null);
      router.refresh();
    }
  }

  function renderItem(row: SeasonRow) {
    return (
      <li key={row.id} className="adm-list-item">
        <div className="adm-list-main">
          <span className="adm-list-title">
            {row.name}
            <StatusPill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusPill>
          </span>
          <span className="adm-list-meta">
            {formatDateRange(row.startDate, row.endDate)} · {usageText(row.packagesPriced)}
          </span>
        </div>
        {canEdit && (
          <div className="adm-list-actions">
            {row.status !== "ended" && (
              <Button
                variant="secondary"
                icon={<Pencil size={14} aria-hidden="true" />}
                aria-label={`Edit ${row.name}`}
                onClick={() =>
                  openForm({ id: row.id, expectedVersion: row.version, name: row.name, startDate: row.startDate, endDate: row.endDate })
                }
              >
                Edit
              </Button>
            )}
            <Button
              variant="ghost"
              icon={<Trash2 size={14} aria-hidden="true" />}
              aria-label={`Delete ${row.name}`}
              onClick={() => {
                remove.clear();
                setDeleting(row);
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </li>
    );
  }

  const deleteFailure = resultErrorMessage(remove.result);

  return (
    <div className="adm-stack">
      {notice !== null && <Notice tone="success">{notice}</Notice>}

      <Card
        title="Calendar"
        description="The next 18 months. Gold bars are seasons and the purple line is today."
        actions={
          canEdit && form === null ? (
            <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => openForm(EMPTY_FORM)}>
              New season
            </Button>
          ) : undefined
        }
      >
        <SeasonTimeline timeline={timeline} />
      </Card>

      {form !== null && (
        <Card title={form.id === null ? "New season" : "Edit season"} description="Dates are inclusive, in Kenya time.">
          <form className="adm-stack" onSubmit={(event) => void submit(event)} noValidate>
            <div className="adm-form-grid">
              <Field id="season-name" label="Name" error={errors.name} hint="For example “Festive peak 2026”." className="adm-field--wide">
                <input
                  id="season-name"
                  className="adm-input"
                  value={form.name}
                  maxLength={TEXT_LIMITS.seasonName.max}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field id="season-start" label="First travel date" error={errors.startDate}>
                <input
                  id="season-start"
                  type="date"
                  className="adm-input"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                />
              </Field>
              <Field id="season-end" label="Last travel date" error={errors.endDate}>
                <input
                  id="season-end"
                  type="date"
                  className="adm-input"
                  value={form.endDate}
                  min={form.startDate > today ? form.startDate : today}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                />
              </Field>
            </div>
            {errors.dates !== undefined && <Notice tone="error">{errors.dates}</Notice>}
            {saveFailure !== null && errors.dates === undefined && <Notice tone="error">{saveFailure}</Notice>}
            <div className="adm-dialog-actions">
              <Button
                variant="ghost"
                onClick={() => {
                  setForm(null);
                  save.clear();
                }}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {form.id === null ? "Create season" : "Save season"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <section aria-labelledby="seasons-active">
        <h2 className="adm-section-label" id="seasons-active">
          Current and upcoming
        </h2>
        {active.length === 0 ? (
          <EmptyState title="No upcoming seasons">Add a season to price specific travel dates differently.</EmptyState>
        ) : (
          <ul className="adm-list">{active.map(renderItem)}</ul>
        )}
      </section>

      {ended.length > 0 && (
        <section aria-labelledby="seasons-ended">
          <h2 className="adm-section-label" id="seasons-ended">
            Ended
          </h2>
          <ul className="adm-list">{ended.map(renderItem)}</ul>
        </section>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ""}”?`}
        confirmLabel="Delete season"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setDeleting(null);
          remove.clear();
        }}
      >
        <p>
          {deleting !== null && deleting.packagesPriced > 0
            ? `Its custom prices will be removed from ${deleting.packagesPriced} package${deleting.packagesPriced === 1 ? "" : "s"}.`
            : "No packages use this season yet."}{" "}
          This can&apos;t be undone.
        </p>
        {deleteFailure !== null && <Notice tone="error">{deleteFailure}</Notice>}
      </ConfirmDialog>
    </div>
  );
}
