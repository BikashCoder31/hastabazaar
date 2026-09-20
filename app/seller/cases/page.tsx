import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { MessageSquareWarning, RotateCcw } from 'lucide-react';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { listReturnsForSeller } from '@/lib/db/repositories/returns';
import { listComplaintsForSeller } from '@/lib/db/repositories/complaints';

export const dynamic = 'force-dynamic';

export default async function SellerCasesPage() {
  const seller = await requireSellerPage('/seller/cases');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [returns, complaints] = await Promise.all([
    listReturnsForSeller(database, seller.sellerId),
    listComplaintsForSeller(database, seller.sellerId),
  ]);
  return (
    <div>
      <p className="eyebrow">After-sales cases</p>
      <h1 className="mt-2 font-heading text-4xl tracking-tight">
        Returns and complaints
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
        You see only cases for your own items. Customer phone, email, name, and
        street address are intentionally hidden.
      </p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <CaseList
          title="Return requests"
          icon={<RotateCcw />}
          empty="No return requests for your items."
          rows={returns.map((item) => ({
            id: item.id,
            href: `/seller/cases/returns/${item.id}`,
            reference: item.referenceNumber,
            title: item.productName,
            detail: `${item.reason.replaceAll('_', ' ')} · ${item.quantity} item(s)`,
            status: item.status,
          }))}
        />
        <CaseList
          title="Complaints"
          icon={<MessageSquareWarning />}
          empty="No item complaints for your shop."
          rows={complaints.map((item) => ({
            id: item.id,
            href: `/seller/cases/complaints/${item.id}`,
            reference: item.referenceNumber,
            title: item.subject,
            detail: item.productName || 'Shop-related complaint',
            status: item.status,
          }))}
        />
      </div>
    </div>
  );
}

function CaseList({
  title,
  icon,
  empty,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  rows: readonly {
    id: string;
    href: string;
    reference: string;
    title: string;
    detail: string;
    status: string;
  }[];
}) {
  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-center gap-2 text-primary [&>svg]:size-5">
        {icon}
        <h2 className="font-heading text-2xl text-foreground">{title}</h2>
      </div>
      {rows.length ? (
        <div className="mt-5 divide-y">
          {rows.map((row) => (
            <article key={row.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={row.href}
                    className="font-semibold hover:underline"
                  >
                    {row.reference}
                  </Link>
                  <p className="mt-1 text-sm">{row.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.detail}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-sm font-semibold capitalize">
                  {row.status.replaceAll('_', ' ')}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
