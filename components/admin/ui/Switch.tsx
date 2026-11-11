"use client";

import clsx from "clsx";
import type { FieldControlProps } from "./Field";

export function Switch({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: FieldControlProps & {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      className={clsx("adm-switch", checked && "is-on")}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="adm-switch-track" aria-hidden="true">
        <span className="adm-switch-thumb" />
      </span>
      <span className="adm-switch-text">
        <span className="adm-switch-label">{label}</span>
        {description !== undefined && <span className="adm-switch-description">{description}</span>}
      </span>
    </button>
  );
}
