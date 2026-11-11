"use client";

import clsx from "clsx";
import { useRef } from "react";
import type { FieldControlProps } from "./Field";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: FieldControlProps & {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Enter") {
      // A native <button> activates (clicks) on Enter, but the ARIA radiogroup pattern assigns
      // Enter no role here — selection already happens on click and on arrow navigation — so
      // swallow it to avoid a duplicate onChange call for whichever option holds focus.
      event.preventDefault();
      return;
    }
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    // Move relative to the currently selected value (not the focused DOM node): a controlled
    // radiogroup's arrow-key navigation always steps from what is checked, per the ARIA APG
    // pattern, and this is what lets a repeated key press wrap from either end deterministically.
    const currentIndex = options.findIndex((option) => option.value === value);
    const from = currentIndex === -1 ? index : currentIndex;
    const next = (from + (forward ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} aria-describedby={ariaDescribedBy} className="adm-segmented">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-invalid={ariaInvalid}
            tabIndex={selected ? 0 : -1}
            className={clsx("adm-segmented-option", selected && "is-active")}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            disabled={disabled}
          >
            <span>{option.label}</span>
            {option.description !== undefined && (
              <span className="adm-segmented-description">{option.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
