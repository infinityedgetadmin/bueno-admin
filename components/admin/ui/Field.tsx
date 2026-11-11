import clsx from "clsx";
import { cloneElement, type AriaAttributes, type ReactElement } from "react";

/**
 * The ARIA props `Field` wires onto its control. A composite control (one that wraps its real
 * <input>/<select> in other markup, like MoneyInput) must accept these and forward them to it.
 */
export type FieldControlProps = Pick<AriaAttributes, "aria-describedby" | "aria-invalid">;

/** A space-separated id list with blanks and repeats removed; undefined when nothing is left. */
function mergeIds(...lists: ReadonlyArray<string | undefined>): string | undefined {
  const ids = new Set(lists.flatMap((list) => (list === undefined ? [] : list.split(/\s+/))).filter((id) => id !== ""));
  return ids.size > 0 ? [...ids].join(" ") : undefined;
}

/**
 * Label + hint/error around a control that names itself (SegmentedControl, checkbox lists,
 * switches). Wired centrally like `Field`: the control is described by whichever of the error or
 * hint is showing (merged with any `aria-describedby` it already has) and marked `aria-invalid`
 * while there is an error, so call sites never pass these themselves. The control decides where
 * each prop lands — typically `aria-describedby` on its own group container (`role="group"` or
 * `"radiogroup"`) and `aria-invalid` on its member controls.
 */
export function FieldGroup({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<FieldControlProps>;
}) {
  const messageId = error !== undefined ? `${id}-error` : hint !== undefined ? `${id}-hint` : undefined;
  const group = cloneElement(children, {
    "aria-describedby": mergeIds(messageId, children.props["aria-describedby"]),
    "aria-invalid": error !== undefined ? true : children.props["aria-invalid"],
  });
  return (
    <div className={clsx("adm-field", error !== undefined && "adm-field--invalid")}>
      <span className="adm-label" aria-hidden="true">
        {label}
      </span>
      {group}
      {error !== undefined ? (
        <p className="adm-field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : (
        hint !== undefined && (
          <p className="adm-hint" id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/**
 * Label + hint/error around one control. The control is wired centrally: it is described by
 * whichever of the error or hint is showing (merged with any `aria-describedby` it already has)
 * and marked `aria-invalid` while there is an error, so call sites never pass these themselves.
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<FieldControlProps>;
  className?: string;
}) {
  const messageId = error !== undefined ? `${id}-error` : hint !== undefined ? `${id}-hint` : undefined;
  const control = cloneElement(children, {
    "aria-describedby": mergeIds(messageId, children.props["aria-describedby"]),
    "aria-invalid": error !== undefined ? true : children.props["aria-invalid"],
  });
  return (
    <div className={clsx("adm-field", error !== undefined && "adm-field--invalid", className)}>
      <label className="adm-label" htmlFor={id}>
        {label}
      </label>
      {control}
      {error !== undefined ? (
        <p className="adm-field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : (
        hint !== undefined && (
          <p className="adm-hint" id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
