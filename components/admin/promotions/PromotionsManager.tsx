"use client";

import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/admin/ui/Button";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Notice } from "@/components/admin/ui/Notice";
import { StatusPill, type PillTone } from "@/components/admin/ui/StatusPill";
import { resultErrorMessage } from "@/lib/admin/action-result";
import { deletePromotionAction, savePromotionAction, setPromotionPausedAction } from "@/lib/admin/actions/promotions";
import { describeTarget, type PromotionPreviewRow } from "@/lib/admin/promotion-view";
import { useServerAction } from "@/lib/admin/use-server-action";
import { formatDateRange } from "@/lib/pricing/dates";
import type { PromotionStatus } from "@/lib/pricing/engine";
import type { FieldErrors, Promotion } from "@/lib/pricing/types";
import PromotionForm, { EMPTY_PROMOTION_FORM, parsePercent, type PromotionFormState } from "./PromotionForm";

export interface PromotionRow extends Promotion {
  status: PromotionStatus;
}

const GROUPS: ReadonlyArray<{ status: PromotionStatus; title: string; tone: PillTone }> = [
  { status: "live", title: "Live", tone: "live" },
  { status: "scheduled", title: "Scheduled", tone: "purple" },
  { status: "paused", title: "Paused", tone: "warning" },
  { status: "ended", title: "Ended", tone: "muted" },
];

function toForm(promotion: PromotionRow): PromotionFormState {
  return {
    id: promotion.id,
    expectedVersion: promotion.version,
    name: promotion.name,
    label: promotion.label,
    percentOff: String(promotion.percentOff),
    startDate: promotion.startDate,
    endDate: promotion.endDate,
    scope: promotion.appliesTo.kind,
    slugs: promotion.appliesTo.kind === "packages" ? promotion.appliesTo.slugs : [],
    terms: promotion.terms ?? "",
  };
}

export default function PromotionsManager({
  promotions,
  packages,
  previewRows,
  today,
  canEdit,
}: {
  promotions: PromotionRow[];
  packages: Array<{ slug: string; title: string }>;
  previewRows: PromotionPreviewRow[];
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<PromotionFormState | null>(null);
  const [deleting, setDeleting] = useState<PromotionRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const save = useServerAction(savePromotionAction);
  const pause = useServerAction(setPromotionPausedAction);
  const remove = useServerAction(deletePromotionAction);
  const titles = new Map(packages.map((pkg) => [pkg.slug, pkg.title]));

  const errors: FieldErrors =
    save.result !== null && !save.result.ok && save.result.kind === "validation" ? save.result.fieldErrors : {};
  const warnings = save.result !== null && !save.result.ok && save.result.kind === "confirm" ? save.result.warnings : [];

  async function submit(confirmed: boolean) {
    if (form === null) return;
    const outcome = await save.run({
      id: form.id,
      expectedVersion: form.expectedVersion,
      confirmed,
      name: form.name,
      label: form.label,
      percentOff: parsePercent(form.percentOff),
      startDate: form.startDate,
      endDate: form.endDate,
      appliesTo: form.scope === "all" ? { kind: "all" } : { kind: "packages", slugs: form.slugs },
      terms: form.terms,
    });
    if (outcome.ok) {
      setNotice(outcome.message);
      setForm(null);
      router.refresh();
    }
  }

  async function togglePause(promotion: PromotionRow) {
    setNotice(null);
    const outcome = await pause.run({ id: promotion.id, expectedVersion: promotion.version, paused: !promotion.paused });
    if (outcome.ok) {
      setNotice(outcome.message);
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

  const pauseFailure = resultErrorMessage(pause.result);
  const deleteFailure = resultErrorMessage(remove.result);

  return (
    <div className="adm-stack">
      {notice !== null && <Notice tone="success">{notice}</Notice>}
      {pauseFailure !== null && <Notice tone="error">{pauseFailure}</Notice>}
      {canEdit && form === null && (
        <div className="adm-page-actions">
          <Button
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => {
              save.clear();
              setNotice(null);
              setForm(EMPTY_PROMOTION_FORM);
            }}
          >
            New promotion
          </Button>
        </div>
      )}

      {form !== null && (
        <PromotionForm
          key={form.id ?? "new"}
          form={form}
          onChange={(next) => {
            setForm(next);
            if (save.result !== null) save.clear();
          }}
          onSubmit={() => void submit(false)}
          onConfirm={() => void submit(true)}
          onDismissWarnings={save.clear}
          onCancel={() => {
            setForm(null);
            save.clear();
          }}
          packages={packages}
          previewRows={previewRows}
          errors={errors}
          failure={warnings.length > 0 ? null : resultErrorMessage(save.result)}
          warnings={warnings}
          busy={save.isPending}
          today={today}
        />
      )}

      {promotions.length === 0 ? (
        <EmptyState title="No promotions yet">
          Create a percentage discount and it appears on the website with a badge and the original price struck through.
        </EmptyState>
      ) : (
        GROUPS.map((group) => {
          const items = promotions.filter((promotion) => promotion.status === group.status);
          if (items.length === 0) return null;
          return (
            <section key={group.status} aria-labelledby={`promotions-${group.status}`}>
              <h2 className="adm-section-label" id={`promotions-${group.status}`}>
                {group.title}
              </h2>
              <ul className="adm-list">
                {items.map((promotion) => (
                  <li key={promotion.id} className="adm-list-item">
                    <div className="adm-list-main">
                      <span className="adm-list-title">
                        {promotion.name}
                        <StatusPill tone="gold">{promotion.label}</StatusPill>
                        <StatusPill tone={group.tone}>{group.title}</StatusPill>
                      </span>
                      <span className="adm-list-meta">
                        {promotion.percentOff}% off · {formatDateRange(promotion.startDate, promotion.endDate)} ·{" "}
                        {describeTarget(promotion.appliesTo, titles)}
                      </span>
                      {promotion.terms !== null && <span className="adm-list-meta">{promotion.terms}</span>}
                    </div>
                    {canEdit && (
                      <div className="adm-list-actions">
                        <Button
                          variant="secondary"
                          icon={<Pencil size={14} aria-hidden="true" />}
                          aria-label={`Edit ${promotion.name}`}
                          onClick={() => {
                            save.clear();
                            setNotice(null);
                            setForm(toForm(promotion));
                          }}
                        >
                          Edit
                        </Button>
                        {promotion.status !== "ended" && (
                          <Button
                            variant="ghost"
                            icon={promotion.paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
                            aria-label={`${promotion.paused ? "Resume" : "Pause"} ${promotion.name}`}
                            onClick={() => void togglePause(promotion)}
                            loading={pause.isPending}
                          >
                            {promotion.paused ? "Resume" : "Pause"}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          icon={<Trash2 size={14} aria-hidden="true" />}
                          aria-label={`Delete ${promotion.name}`}
                          onClick={() => {
                            remove.clear();
                            setDeleting(promotion);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ""}”?`}
        confirmLabel="Delete promotion"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setDeleting(null);
          remove.clear();
        }}
      >
        <p>The discount disappears from the website within about a minute. This can&apos;t be undone.</p>
        {deleteFailure !== null && <Notice tone="error">{deleteFailure}</Notice>}
      </ConfirmDialog>
    </div>
  );
}
