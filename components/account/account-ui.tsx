import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

export function AccountHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 font-heading text-4xl tracking-[-0.035em] sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function AccountEmpty({
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
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-7" strokeWidth={1.5} />
      </span>
      <h2 className="mt-5 font-heading text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-base leading-7 text-muted-foreground">
        {description}
      </p>
      {href && action ? (
        <Link href={href} className="storefront-button mt-6">
          {action}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
