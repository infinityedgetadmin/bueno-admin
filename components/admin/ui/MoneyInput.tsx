"use client";

import type { CurrencyCode } from "@/lib/pricing/types";
import { Field, type FieldControlProps } from "./Field";

/** The prefixed input. `Field` injects the ARIA props into this wrapper; they belong on the real <input>. */
function MoneyControl({
  id,
  currency,
  value,
  onChange,
  disabled,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: FieldControlProps & {
  id: string;
  currency: CurrencyCode;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="adm-money">
      <span className="adm-money-prefix" aria-hidden="true">
        {currency === "USD" ? "$" : "KSh"}
      </span>
      <input
        id={id}
        className="adm-input adm-money-input"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        disabled={disabled}
      />
    </div>
  );
}

export function MoneyInput({
  id,
  label,
  currency,
  value,
  onChange,
  error,
  hint,
  disabled = false,
}: {
  id: string;
  label: string;
  currency: CurrencyCode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <MoneyControl id={id} currency={currency} value={value} onChange={onChange} disabled={disabled} />
    </Field>
  );
}
