"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Field, FieldGroup } from "@/components/admin/ui/Field";
import { MoneyInput } from "@/components/admin/ui/MoneyInput";
import { Notice } from "@/components/admin/ui/Notice";
import { SegmentedControl } from "@/components/admin/ui/SegmentedControl";
import { Switch } from "@/components/admin/ui/Switch";
import { WarningsPanel } from "@/components/admin/ui/WarningsPanel";
import { MESSAGES, resultErrorMessage } from "@/lib/admin/action-result";
import { savePackageAction } from "@/lib/admin/actions/packages";
import {
  isBasisChoice,
  isRankChoice,
  isSameState,
  previewCommercial,
  toDraft,
  toEditorState,
  type PackageEditorState,
  type RankChoice,
  type SeasonInputs,
} from "@/lib/admin/package-form";
import { useServerAction } from "@/lib/admin/use-server-action";
import { CURRENCY_CODES, PRICE_BASIS_LABELS } from "@/lib/pricing/constants";
import { formatDateRange } from "@/lib/pricing/dates";
import { formatMoney, formatRate } from "@/lib/pricing/money";
import type {
  CurrencyCode,
  CurrencyMode,
  CurrencySettings,
  DisplayMode,
  FieldErrors,
  PackageCommercial,
  Promotion,
  Season,
} from "@/lib/pricing/types";
import PricePreview from "./PricePreview";

export interface EditorSeason {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface PackageEditorProps {
  slug: string;
  initial: PackageCommercial;
  upcomingSeasons: EditorSeason[];
  currency: CurrencySettings | null;
  seasons: Season[];
  promotions: Promotion[];
  today: string;
  featuredHolders: Partial<Record<"1" | "2" | "3", string>>;
  canEdit: boolean;
}

const CURRENCY_HEADINGS: Readonly<Record<CurrencyCode, string>> = {
  USD: "US dollars — international visitors",
  KES: "Kenyan shillings — visitors in Kenya",
};

const MODE_OPTIONS: Readonly<Record<CurrencyCode, ReadonlyArray<{ value: CurrencyMode; label: string }>>> = {
  USD: [
    { value: "fixed", label: "Set a dollar price" },
    { value: "converted", label: "Convert from shillings" },
    { value: "off", label: "Don't show dollars" },
  ],
  KES: [
    { value: "fixed", label: "Set a shilling price" },
    { value: "converted", label: "Convert from dollars" },
    { value: "off", label: "Don't show shillings" },
  ],
};

const DISPLAY_OPTIONS: ReadonlyArray<{ value: DisplayMode; label: string }> = [
  { value: "price", label: "The price" },
  { value: "enquire", label: "“Chat with an agent”" },
];

const EMPTY_SEASON: SeasonInputs = { custom: false, USD: "", KES: "" };
const BASIS_HINT = "Shown after the price, for example “From $4,500 per person”.";

function conversionHint(currency: CurrencyCode, settings: CurrencySettings | null): string {
  if (settings === null) return "Converted prices stay hidden until the exchange rate is set in Currency settings.";
  const source = currency === "USD" ? "shilling" : "dollar";
  return `Converted from the ${source} price at KSh ${formatRate(settings.kesPerUsdE4)} per dollar, rounded to the nearest ${formatMoney(settings.roundingStep[currency], currency)}.`;
}

function featuredHint(choice: RankChoice, holders: PackageEditorProps["featuredHolders"]): string {
  if (choice === "none") return "Empty homepage slots show the first packages in the catalogue.";
  const holder = holders[choice];
  return holder === undefined
    ? `This package will appear in homepage slot ${choice}.`
    : `Slot ${choice} currently shows “${holder}”. Saving moves it here.`;
}

export default function PackageEditor(props: PackageEditorProps) {
  const router = useRouter();
  const [state, setState] = useState<PackageEditorState>(() => toEditorState(props.initial));
  const [saved, setSaved] = useState<PackageEditorState>(() => toEditorState(props.initial));
  const [version, setVersion] = useState(props.initial.version);
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  const { run, isPending, result, clear } = useServerAction(savePackageAction);

  const dirty = !isSameState(state, saved);
  const disabled = !props.canEdit || isPending;
  const serverErrors: FieldErrors = result !== null && !result.ok && result.kind === "validation" ? result.fieldErrors : {};
  const errors: FieldErrors = { ...serverErrors, ...localErrors };
  const warnings = result !== null && !result.ok && result.kind === "confirm" ? result.warnings : [];
  const failure = resultErrorMessage(result);
  const failureKind = result !== null && !result.ok ? result.kind : null;
  const sessionExpired = failureKind === "auth" && failure === MESSAGES.sessionExpired;
  const preview = useMemo(() => {
    const { draft, errors: parseErrors } = toDraft(state);
    return Object.keys(parseErrors).length > 0 ? null : previewCommercial(draft);
  }, [state]);
  const featuredHintText = featuredHint(state.featuredRank, props.featuredHolders);

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  function update(patch: Partial<PackageEditorState>) {
    setState((current) => ({ ...current, ...patch }));
    setLocalErrors({});
    if (result !== null) clear();
  }

  function updateSeason(seasonId: string, inputs: SeasonInputs) {
    update({ seasons: { ...state.seasons, [seasonId]: inputs } });
  }

  async function save(confirmed: boolean) {
    const { draft, errors: parseErrors } = toDraft(state);
    if (Object.keys(parseErrors).length > 0) {
      setLocalErrors(parseErrors);
      return;
    }
    const submitted = state;
    const outcome = await run({ slug: props.slug, expectedVersion: version, confirmed, ...draft });
    if (outcome.ok) {
      setVersion(outcome.data.version);
      setSaved(submitted);
      router.refresh();
    }
  }

  function discard() {
    setState(saved);
    setLocalErrors({});
    clear();
  }

  const status = isPending
    ? "Saving…"
    : dirty
      ? "You have unsaved changes"
      : result !== null && result.ok
        ? result.message
        : "All changes saved";

  return (
    <div className="adm-editor-layout">
      <div className="adm-stack">
        {!props.canEdit && (
          <Notice tone="info" title="View only">
            You can see how this package is priced, but only admins and editors can change it.
          </Notice>
        )}

        <Card title="On the website" description="Whether this package appears, and whether visitors see its price.">
          <div className="adm-stack">
            <Switch
              id="package-visible"
              checked={state.visible}
              onChange={(visible) => update({ visible })}
              label="Show on the website"
              description="Hidden packages leave the listings, homepage and sitemap, and their page shows “not found”."
              disabled={disabled}
            />
            <FieldGroup id="package-display" label="Visitors see">
              <SegmentedControl
                label="Visitors see"
                value={state.display}
                options={DISPLAY_OPTIONS}
                onChange={(display) => update({ display })}
                disabled={disabled}
              />
            </FieldGroup>
            <Field id="package-featured" label="Homepage" hint={featuredHintText}>
              <select
                id="package-featured"
                className="adm-select"
                value={state.featuredRank}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isRankChoice(value)) update({ featuredRank: value });
                }}
                disabled={disabled}
              >
                <option value="none">Not featured</option>
                <option value="1">Featured slot 1</option>
                <option value="2">Featured slot 2</option>
                <option value="3">Featured slot 3</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card
          title="Price"
          description="Visitors in Kenya see shillings; everyone else sees dollars. Give each currency its own price, or convert one from the other at the house rate."
        >
          <div className="adm-stack">
            {CURRENCY_CODES.map((currency) => (
              <div key={currency} className="adm-stack">
                <FieldGroup
                  id={`currency-${currency}`}
                  label={CURRENCY_HEADINGS[currency]}
                  error={errors[`currencies.${currency}`]}
                >
                  <SegmentedControl
                    label={CURRENCY_HEADINGS[currency]}
                    value={state.currencies[currency]}
                    options={MODE_OPTIONS[currency]}
                    onChange={(mode) => update({ currencies: { ...state.currencies, [currency]: mode } })}
                    disabled={disabled}
                  />
                </FieldGroup>
                {state.currencies[currency] === "fixed" && (
                  <MoneyInput
                    id={`base-${currency}`}
                    label={`Standard price (${currency})`}
                    currency={currency}
                    value={state.base[currency]}
                    onChange={(value) => update({ base: { ...state.base, [currency]: value } })}
                    error={errors[`base.${currency}`]}
                    hint="Used for travel dates outside any season. Whole numbers only."
                    disabled={disabled}
                  />
                )}
                {state.currencies[currency] === "converted" && (
                  <p className="adm-hint">{conversionHint(currency, props.currency)}</p>
                )}
              </div>
            ))}
            {errors.currencies !== undefined && <Notice tone="error">{errors.currencies}</Notice>}
            <Field id="package-basis" label="Price is quoted" hint={BASIS_HINT}>
              <select
                id="package-basis"
                className="adm-select"
                value={state.basis}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isBasisChoice(value)) update({ basis: value });
                }}
                disabled={disabled}
              >
                <option value="none">No label</option>
                {Object.entries(PRICE_BASIS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card
          title="Seasonal prices"
          description="Travel dates inside a season use that season's price. Leave a season off to keep the standard price."
        >
          {props.upcomingSeasons.length === 0 ? (
            <EmptyState title="No upcoming seasons" action={<ButtonLink href="/admin/seasons">Manage seasons</ButtonLink>}>
              Create seasons such as “Festive peak” or “Long rains” to charge different prices on those dates.
            </EmptyState>
          ) : (
            <ul className="adm-list">
              {props.upcomingSeasons.map((season) => {
                const inputs = state.seasons[season.id] ?? EMPTY_SEASON;
                const rowError = errors[`seasonPrices.${season.id}`];
                const rowErrorId = `season-${season.id}-error`;
                return (
                  <li key={season.id} className="adm-list-item">
                    <div className="adm-list-main">
                      <span className="adm-list-title">{season.name}</span>
                      <span className="adm-list-meta">{formatDateRange(season.startDate, season.endDate)}</span>
                      {rowError !== undefined && (
                        <p className="adm-field-error" id={rowErrorId} role="alert">
                          {rowError}
                        </p>
                      )}
                    </div>
                    <Switch
                      id={`season-${season.id}`}
                      checked={inputs.custom}
                      onChange={(custom) => updateSeason(season.id, { ...inputs, custom })}
                      label={`Custom price for ${season.name}`}
                      disabled={disabled}
                      aria-describedby={rowError !== undefined ? rowErrorId : undefined}
                      aria-invalid={rowError !== undefined ? true : undefined}
                    />
                    {inputs.custom && (
                      <div className="adm-season-prices">
                        {CURRENCY_CODES.filter((currency) => state.currencies[currency] === "fixed").map((currency) => (
                          <MoneyInput
                            key={currency}
                            id={`season-${season.id}-${currency}`}
                            label={`${season.name} (${currency})`}
                            currency={currency}
                            value={inputs[currency]}
                            onChange={(value) => updateSeason(season.id, { ...inputs, [currency]: value })}
                            error={errors[`seasonPrices.${season.id}.${currency}`]}
                            disabled={disabled}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {warnings.length > 0 && (
          <WarningsPanel warnings={warnings} busy={isPending} onConfirm={() => void save(true)} onCancel={clear} />
        )}
        {failure !== null && (
          <Notice
            tone="error"
            action={
              failureKind === "conflict" ? (
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Reload the latest version
                </Button>
              ) : sessionExpired ? (
                <ButtonLink href={`/admin/login?next=/admin/packages/${props.slug}`}>Sign in again</ButtonLink>
              ) : undefined
            }
          >
            {failure}
          </Notice>
        )}

        {props.canEdit && (
          <div className="adm-savebar">
            <span className={clsx("adm-savebar-status", dirty && "is-dirty")} aria-live="polite">
              {status}
            </span>
            <div className="adm-savebar-actions">
              <Button variant="ghost" onClick={discard} disabled={!dirty || isPending}>
                Discard changes
              </Button>
              <Button onClick={() => void save(false)} loading={isPending} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="adm-stack adm-sticky">
        <Card title="Preview" description="How the price appears on the website today.">
          <PricePreview
            slug={props.slug}
            commercial={preview}
            visible={state.visible}
            display={state.display}
            currency={props.currency}
            seasons={props.seasons}
            promotions={props.promotions}
            today={props.today}
          />
        </Card>
      </div>
    </div>
  );
}
