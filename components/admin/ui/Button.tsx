import clsx from "clsx";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = React.ComponentPropsWithRef<"button"> & {
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
};

export function Button({
  variant = "primary",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx("adm-btn", `adm-btn--${variant}`, className)}
      disabled={disabled === true || loading}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {loading ? <span className="adm-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "secondary",
  icon,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  icon?: React.ReactNode;
  external?: boolean;
}) {
  const className = clsx("adm-btn", `adm-btn--${variant}`);
  if (external) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {icon}
        <span>{children}</span>
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}
