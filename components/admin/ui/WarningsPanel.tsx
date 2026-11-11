"use client";

import { TriangleAlert } from "lucide-react";
import type { ValidationWarning } from "@/lib/pricing/types";
import { Button } from "./Button";

export function WarningsPanel({
  warnings,
  busy,
  onConfirm,
  onCancel,
}: {
  warnings: ValidationWarning[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <section className="adm-warnings" aria-live="assertive" aria-labelledby="adm-warnings-title">
      <p className="adm-warnings-title" id="adm-warnings-title">
        <TriangleAlert size={18} aria-hidden="true" />
        Please double-check before saving
      </p>
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.id}-${warning.message}`}>{warning.message}</li>
        ))}
      </ul>
      <div className="adm-warnings-actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Go back
        </Button>
        <Button onClick={onConfirm} loading={busy}>
          Save anyway
        </Button>
      </div>
    </section>
  );
}
