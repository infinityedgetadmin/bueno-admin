"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { Field, FieldGroup } from "@/components/admin/ui/Field";
import { Notice } from "@/components/admin/ui/Notice";
import { SegmentedControl } from "@/components/admin/ui/SegmentedControl";
import { WarningsPanel } from "@/components/admin/ui/WarningsPanel";
import { discountPreview, type PromotionPreviewRow } from "@/lib/admin/promotion-view";
import { CURRENCY_CODES, TEXT_LIMITS } from "@/lib/pricing/constants";
import { formatMoney, isPercentOffWithinLimits } from "@/lib/pricing/money";
import type { FieldErrors, ValidationWarning } from "@/lib/pricing/types";

export interface PromotionFormState {
  id: string | null;
  expectedVersion: number;
  name: string;
  label: string;
  percentOff: string;
  startDate: string;
  endDate: string;
  scope: "all" | "packages";
  slugs: string[];
  terms: string;
}

export const EMPTY_PROMOTION_FORM: PromotionFormState = {
  id: null,
  expectedVersion: 0,
  name: "",
  label: "",
  percentOff: "",
  startDate: "",
  endDate: "",
  scope: "all",
  slugs: [],
  terms: "",
};

const SCOPES = [
  { value: "all", label: "All packages" },
  { value: "packages", label: "Selected packages" },
] as const;

const NUMBER_INPUT = /^-?\d+(?:\.\d+)?$/;

/**
 * Any typed number is sent as-is, so the server can say what is wrong with it (150 gets "Enter a
 * whole percentage from 1 to 90."); blank or non-numeric input is sent as null ("Enter a discount
 * percentage.").
 */
export function parsePercent(value: string): number | null {
  const trimmed = value.trim();
  if (!NUMBER_INPUT.test(trimmed)) return null;
  const percent = Number(trimmed);
  return Number.isFinite(percent) ? percent : null;
}

export default function PromotionForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  onConfirm,
  onDismissWarnings,
  packages,
  previewRows,
  errors,
  failure,
  warnings,
  busy,
  today,
}: {
  form: PromotionFormState;
  onChange: (next: PromotionFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onDismissWarnings: () => void;
  packages: Array<{ slug: string; title: string }>;
  previewRows: PromotionPreviewRow[];
  errors: FieldErrors;
  failure: string | null;
  warnings: ValidationWarning[];
  busy: boolean;
  today: string;
}) {
  const percent = parsePercent(form.percentOff);
  const termsLength = form.terms.trim().length;
  const termsLimit = TEXT_LIMITS.promotionTerms.max;
  const termsAtLimit = termsLength >= termsLimit;
  // Seeded from the value at mount (never a hard-coded false), so opening a form whose stored
  // terms are already at the limit is not itself a crossing and stays silent on first paint.
  const wasAtLimitRef = useRef(termsAtLimit);
  const [limitAnnouncement, setLimitAnnouncement] = useState("");

  useEffect(() => {
    if (termsAtLimit && !wasAtLimitRef.current) {
      setLimitAnnouncement(`Terms have reached the ${termsLimit} character limit.`);
    } else if (!termsAtLimit && wasAtLimitRef.current) {
      // Reset so a later crossing back up announces again instead of staying silent.
      setLimitAnnouncement("");
    }
    wasAtLimitRef.current = termsAtLimit;
  }, [termsAtLimit, termsLimit]);

  const targeted = form.scope === "all" ? previewRows : previewRows.filter((row) => form.slugs.includes(row.slug));
  const preview =
    percent === null || !isPercentOffWithinLimits(percent)
      ? []
      : targeted.slice(0, 4).map((row) => ({ row, prices: discountPreview(row, percent) }));

  function toggleSlug(slug: string) {
    const slugs = form.slugs.includes(slug) ? form.slugs.filter((s) => s !== slug) : [...form.slugs, slug];
    onChange({ ...form, slugs });
  }

  return (
    <Card title={form.id === null ? "New promotion" : "Edit promotion"} description="Dates are inclusive, in Kenya time.">
      <form
        className="adm-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="adm-form-grid">
          <Field id="promo-name" label="Internal name" error={errors.name} hint="Only the team sees this.">
            <input id="promo-name" className="adm-input" value={form.name} maxLength={TEXT_LIMITS.promotionName.max} onChange={(e) => onChange({ ...form, name: e.target.value })} />
          </Field>
          <Field id="promo-label" label="Badge text" error={errors.label} hint="Shown on the website, e.g. “Early Bird”.">
            <input id="promo-label" className="adm-input" value={form.label} maxLength={TEXT_LIMITS.promotionLabel.max} onChange={(e) => onChange({ ...form, label: e.target.value })} />
          </Field>
          <Field id="promo-percent" label="Discount (%)" error={errors.percentOff} hint="Whole number from 1 to 90.">
            <input id="promo-percent" className="adm-input" inputMode="numeric" value={form.percentOff} onChange={(e) => onChange({ ...form, percentOff: e.target.value })} />
          </Field>
          <Field id="promo-start" label="Show from" error={errors.startDate}>
            <input id="promo-start" type="date" className="adm-input" value={form.startDate} onChange={(e) => onChange({ ...form, startDate: e.target.value })} />
          </Field>
          <Field id="promo-end" label="Show until" error={errors.endDate}>
            <input id="promo-end" type="date" className="adm-input" value={form.endDate} min={form.startDate > today ? form.startDate : today} onChange={(e) => onChange({ ...form, endDate: e.target.value })} />
          </Field>
        </div>

        <FieldGroup id="promo-scope" label="Applies to" error={errors.appliesTo}>
          <SegmentedControl label="Applies to" value={form.scope} options={SCOPES} onChange={(scope) => onChange({ ...form, scope })} />
        </FieldGroup>
        {form.scope === "packages" && (
          <div className="adm-checkbox-list" role="group" aria-label="Packages in this promotion">
            {packages.map((pkg) => (
              <label key={pkg.slug} className="adm-checkbox">
                <input type="checkbox" checked={form.slugs.includes(pkg.slug)} onChange={() => toggleSlug(pkg.slug)} />
                <span>{pkg.title}</span>
              </label>
            ))}
          </div>
        )}

        <Field id="promo-terms" label="Terms (optional)" error={errors.terms} hint="Short fine print shown under the seasonal rates.">
          <textarea
            id="promo-terms"
            className="adm-textarea"
            value={form.terms}
            maxLength={termsLimit}
            onChange={(e) => onChange({ ...form, terms: e.target.value })}
            aria-describedby="promo-terms-counter"
          />
        </Field>
        <span className="adm-counter" id="promo-terms-counter">
          {termsLength}/{termsLimit}
        </span>
        <span className="adm-sr-only" role="status">
          {limitAnnouncement}
        </span>

        {preview.length > 0 && (
          <div className="adm-preview" data-testid="promotion-preview">
            {preview.map(({ row, prices }) => (
              <div key={row.slug} className="adm-preview-row">
                <span className="adm-preview-label">{row.title}</span>
                <span className="adm-preview-price">
                  {CURRENCY_CODES.flatMap((currency) => {
                    const price = prices[currency];
                    return price === undefined ? [] : [`${formatMoney(price.before, currency)} → ${formatMoney(price.after, currency)}`];
                  }).join(" · ")}
                </span>
              </div>
            ))}
          </div>
        )}

        {warnings.length > 0 && <WarningsPanel warnings={warnings} busy={busy} onConfirm={onConfirm} onCancel={onDismissWarnings} />}
        {failure !== null && <Notice tone="error">{failure}</Notice>}

        <div className="adm-dialog-actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {form.id === null ? "Create promotion" : "Save promotion"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
