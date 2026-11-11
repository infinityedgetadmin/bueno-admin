export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="adm-empty">
      <p className="adm-empty-title">{title}</p>
      <p className="adm-empty-body">{children}</p>
      {action}
    </div>
  );
}
