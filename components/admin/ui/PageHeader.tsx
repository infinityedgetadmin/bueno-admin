import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="adm-page-header">
      <div>
        {back !== undefined && (
          <Link className="adm-back" href={back.href}>
            <ArrowLeft size={14} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <p className="adm-eyebrow">{eyebrow}</p>
        <h1 className="adm-title">{title}</h1>
        {description !== undefined && <p className="adm-description">{description}</p>}
      </div>
      {actions !== undefined && <div className="adm-page-actions">{actions}</div>}
    </header>
  );
}
