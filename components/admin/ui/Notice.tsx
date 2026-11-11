import clsx from "clsx";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";

type Tone = "info" | "success" | "warning" | "error";

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleX } as const;

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Icon = ICONS[tone];
  return (
    <div className={clsx("adm-notice", `adm-notice--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" className="adm-notice-icon" />
      <div>
        {title !== undefined && <p className="adm-notice-title">{title}</p>}
        <div className="adm-notice-body">{children}</div>
        {action !== undefined && <div className="adm-notice-action">{action}</div>}
      </div>
    </div>
  );
}
