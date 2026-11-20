import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { MessageSquareWarning, RotateCcw } from 'lucide-react';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listReturnsForOperations } from '@/lib/db/repositories/returns';
import { listComplaintsForOperations } from '@/lib/db/repositories/complaints';

export const dynamic = 'force-dynamic';
export default async function AdminCasesPage() {
  await requireStaffPage('/admin/cases', 'support.manage');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [returns, complaints] = await Promise.all([
    listReturnsForOperations(database),
    listComplaintsForOperations(database),
  ]);
  return (
    <div>
      <p className="eyebrow">Customer care</p>
      <h1 className="mt-2 font-heading text-4xl tracking-tight">
        Returns and complaints
      </h1>
      <Link href="/admin/cases/intake" className="mt-3 inline-block underline">Record an earlier email or support request</Link>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        Investigate item-level cases, preserve seller boundaries, and record
        every customer-facing decision in the current English interface.
      </p>
      <div className="mt-8 grid gap-6 2xl:grid-cols-2">
        <Queue
          title="Return and refund queue"
          icon={<RotateCcw />}
          rows={returns.map((item) => ({
            id: item.id,
            href: `/admin/cases/returns/${item.id}`,
            reference: item.referenceNumber,
            title: `${item.productName} · ${item.sellerName}`,
            detail: `${item.orderNumber} · ${item.reason.replaceAll('_', ' ')}`,
            status: item.status,
          }))}
        />
        <Queue
          title="Complaint queue"
          icon={<MessageSquareWarning />}
          rows={complaints.map((item) => ({
            id: item.id,
            href: `/admin/cases/complaints/${item.id}`,
            reference: item.referenceNumber,
            title: item.subject,
            detail: `${item.orderNumber} · ${item.priority} priority`,
            status: item.status,
          }))}
        />
      </div>
    </div>
  );
}
function Queue({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.detail}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold capitalize">
                  {row.status.replaceAll('_', ' ')}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          No cases in this queue.
        </p>
      )}
    </section>
  );
}
