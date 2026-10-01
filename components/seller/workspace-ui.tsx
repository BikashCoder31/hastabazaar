import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

export function SellerHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 break-words font-heading text-3xl tracking-tight sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SellerMetric({
  label,
  value,
  detail,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  href?: string;
}) {
  const contents = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-muted-foreground">
          {label}
        </span>
        <Icon className="size-5 shrink-0 text-primary" />
      </div>
      <p className="mt-4 break-words font-heading text-3xl tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50"
    >
      {contents}
    </Link>
  ) : (
    <div className="rounded-2xl border bg-card p-5">{contents}</div>
  );
}

export function SellerEmpty({
  icon: Icon,
  title,
  description,
  href,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
      <Icon className="mx-auto size-9 text-primary" />
      <h2 className="mt-4 font-heading text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-base leading-7 text-muted-foreground">
        {description}
      </p>
      {href && action ? (
        <Link className="section-link mt-5" href={href}>
          {action}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
