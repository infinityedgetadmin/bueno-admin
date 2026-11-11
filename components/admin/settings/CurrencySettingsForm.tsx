"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { Field } from "@/components/admin/ui/Field";
import { Notice } from "@/components/admin/ui/Notice";
import { WarningsPanel } from "@/components/admin/ui/WarningsPanel";
import { resultErrorMessage } from "@/lib/admin/action-result";
import { saveCurrencyAction } from "@/lib/admin/actions/currency";
import { useServerAction } from "@/lib/admin/use-server-action";
import {
  DEFAULT_ROUNDING_STEPS,
  KES_ROUNDING_STEPS,
  RATE_LIMITS_E4,
  RATE_STALE_DAYS,
  USD_ROUNDING_STEPS,
} from "@/lib/pricing/constants";
import { convertAmount, formatMoney, parseRateInput } from "@/lib/pricing/money";
import type { FieldErrors, RoundingSteps } from "@/lib/pricing/types";

const REVERSE_SAMPLE_KES = 58_000;
const RATE_HINT = "How many Kenyan shillings one US dollar buys at your house rate, e.g. 129.5.";

export default function CurrencySettingsForm({
  initial,
  samples,
  lastUpdated,
  canEdit,
}: {
  initial: { rate: string; roundingStep: RoundingSteps; version: number } | null;
  samples: Array<{ title: string; usd: number }>;
  lastUpdated: { when: string; who: string; daysAgo: number } | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rate, setRate] = useState(initial?.rate ?? "");
  const [usdStep, setUsdStep] = useState<number>(initial?.roundingStep.USD ?? DEFAULT_ROUNDING_STEPS.USD);
  const [kesStep, setKesStep] = useState<number>(initial?.roundingStep.KES ?? DEFAULT_ROUNDING_STEPS.KES);
  const [version, setVersion] = useState(initial?.version ?? 0);
  const { run, isPending, result, clear } = useServerAction(saveCurrencyAction);

  const parsed = parseRateInput(rate);
  const rateValid = parsed !== null && parsed >= RATE_LIMITS_E4.min && parsed <= RATE_LIMITS_E4.max;
  const errors: FieldErrors = result !== null && !result.ok && result.kind === "validation" ? result.fieldErrors : {};
  const warnings = result !== null && !result.ok && result.kind === "confirm" ? result.warnings : [];
  const failure = warnings.length > 0 ? null : resultErrorMessage(result);
  const disabled = !canEdit || isPending;

  async function save(confirmed: boolean) {
    const outcome = await run({ expectedVersion: version, rate, roundingStep: { USD: usdStep, KES: kesStep }, confirmed });
    if (outcome.ok) {
      setVersion(outcome.data.version);
      router.refresh();
    }
  }

  function edit(apply: () => void) {
    apply();
    if (result !== null) clear();
  }

  return (
    <div className="adm-editor-layout">
      <div className="adm-stack">
        {lastUpdated === null ? (
          <Notice tone="warning" title="No exchange rate yet">
            Shilling prices converted from dollars stay hidden until you save one.
          </Notice>
        ) : lastUpdated.daysAgo > RATE_STALE_DAYS ? (
          <Notice tone="warning" title="Time to review the rate">
            The rate was last updated {lastUpdated.daysAgo} days ago ({lastUpdated.when}, by {lastUpdated.who}).
          </Notice>
        ) : (
          <Notice tone="info">
            Last updated {lastUpdated.when} by {lastUpdated.who}.
          </Notice>
        )}
        {!canEdit && (
          <Notice tone="info" title="View only">
            Only admins and editors can change the exchange rate.
          </Notice>
        )}

        <Card title="House exchange rate" description="Used wherever a price is converted between dollars and shillings.">
          <form
            className="adm-stack"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save(false);
            }}
          >
            <Field id="rate" label="Shillings per US dollar" error={errors.rate} hint={RATE_HINT}>
              <input
                id="rate"
                className="adm-input"
                inputMode="decimal"
                value={rate}
                onChange={(event) => edit(() => setRate(event.target.value))}
                disabled={disabled}
              />
            </Field>
            <div className="adm-form-grid">
              <Field id="usd-step" label="Round dollar prices to" error={errors["roundingStep.USD"]}>
                <select
                  id="usd-step"
                  className="adm-select"
                  value={usdStep}
                  onChange={(event) => edit(() => setUsdStep(Number(event.target.value)))}
                  disabled={disabled}
                >
                  {USD_ROUNDING_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {step === 1 ? "$1 (exact)" : `Nearest ${formatMoney(step, "USD")}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="kes-step" label="Round shilling prices to" error={errors["roundingStep.KES"]}>
                <select
                  id="kes-step"
                  className="adm-select"
                  value={kesStep}
                  onChange={(event) => edit(() => setKesStep(Number(event.target.value)))}
                  disabled={disabled}
                >
                  {KES_ROUNDING_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {step === 1 ? "KSh 1 (exact)" : `Nearest ${formatMoney(step, "KES")}`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {warnings.length > 0 && (
              <WarningsPanel warnings={warnings} busy={isPending} onConfirm={() => void save(true)} onCancel={clear} />
            )}
            {failure !== null && <Notice tone="error">{failure}</Notice>}
            {result !== null && result.ok && <Notice tone="success">{result.message}</Notice>}
            {canEdit && (
              <div className="adm-dialog-actions">
                <Button type="submit" loading={isPending}>
                  Save exchange rate
                </Button>
              </div>
            )}
          </form>
        </Card>
      </div>

      <div className="adm-stack adm-sticky">
        <Card title="Preview" description="How the rate and rounding convert real prices.">
          {rateValid && parsed !== null ? (
            <div className="adm-preview" data-testid="conversion-preview">
              {samples.map((sample) => (
                <div key={sample.title} className="adm-preview-row">
                  <span className="adm-preview-label">{sample.title}</span>
                  <span className="adm-preview-price">
                    {formatMoney(sample.usd, "USD")} → {formatMoney(convertAmount(sample.usd, "USD", "KES", parsed, kesStep), "KES")}
                  </span>
                </div>
              ))}
              <div className="adm-preview-row">
                <span className="adm-preview-label">A shilling price</span>
                <span className="adm-preview-price">
                  {formatMoney(REVERSE_SAMPLE_KES, "KES")} → {formatMoney(convertAmount(REVERSE_SAMPLE_KES, "KES", "USD", parsed, usdStep), "USD")}
                </span>
              </div>
            </div>
          ) : (
            <p className="adm-hint">Enter a rate between 50 and 500 to preview conversions.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
