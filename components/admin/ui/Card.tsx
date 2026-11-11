import clsx from "clsx";
import { useId } from "react";

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <section className={clsx("adm-card", className)} aria-labelledby={title !== undefined ? titleId : undefined}>
      {(title !== undefined || actions !== undefined) && (
        <div className="adm-card-header">
          <div>
            {title !== undefined && (
              <h2 className="adm-card-title" id={titleId}>
                {title}
              </h2>
            )}
            {description !== undefined && <p className="adm-card-description">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
