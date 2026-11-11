import clsx from "clsx";

export type PillTone = "live" | "muted" | "gold" | "warning" | "danger" | "purple";

export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={clsx("adm-pill", `adm-pill--${tone}`)}>{children}</span>;
}
