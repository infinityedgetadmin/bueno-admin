"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef } from "react";
import { Button } from "./Button";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // `busy` and `onCancel` change on every save attempt (a new inline `onCancel`, `busy` flipping
  // true/false). The open-focus / restore-on-close effect below must NOT re-run for those changes
  // — only for `open` itself — otherwise its cleanup fires mid-dialog and throws focus behind the
  // backdrop. Refs give the keydown handler the latest values without being in its effect's deps.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButton.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || panel.current === null) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        // Everything inside is disabled (e.g. mid-save): keep the trap closed rather than let the
        // browser's default Tab action carry focus out of the dialog.
        event.preventDefault();
        panel.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [open]);

  // A focused control that becomes `disabled` (Cancel/Confirm while busy) is blurred by the
  // browser straight to <body>, escaping the trap. Whenever `busy` toggles, pull focus back onto
  // the panel itself if it ever ends up outside it.
  useEffect(() => {
    if (!open || panel.current === null) return;
    const active = document.activeElement;
    const insidePanel = active !== null && panel.current.contains(active);
    if (!insidePanel) {
      panel.current.focus();
    }
  }, [open, busy]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="adm-dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => {
            if (!busy) onCancel();
          }}
        >
          <motion.div
            ref={panel}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            tabIndex={-1}
            className="adm-dialog"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="adm-dialog-title">
              {title}
            </h2>
            <div id={bodyId} className="adm-dialog-body">
              {children}
            </div>
            <div className="adm-dialog-actions">
              <Button ref={cancelButton} variant="ghost" onClick={onCancel} disabled={busy}>
                {cancelLabel}
              </Button>
              <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
