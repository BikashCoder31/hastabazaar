import Link from 'next/link';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import type { listComplaintsForOperations } from '@/lib/db/repositories/complaints';
import type { ReturnCaseRow } from '@/lib/db/repositories/returns';

export type CaseQueueFilter = 'open' | 'waiting' | 'closed';

const labels: Record<string, string> = {
  requested: 'New request',
  under_investigation: 'In review',
  needs_customer_changes: 'Waiting on customer',
  waiting_customer: 'Waiting on customer',
  pending_high_value_approval: 'High-value refund',
  approved: 'Approved',
  in_transit: 'In transit',
  received: 'Received',
  rejected: 'Closed',
  resolved: 'Resolved',
};

export function caseQueueFilter(value: string | undefined): CaseQueueFilter {
  return value === 'waiting' || value === 'closed' ? value : 'open';
}

export function ReturnCaseQueue({ returns, complaints, filter, selected }: {
  returns: readonly ReturnCaseRow[];
  complaints: Awaited<ReturnType<typeof listComplaintsForOperations>>;
  filter: CaseQueueFilter;
  selected?: string;
}) {
  const cases = [
    ...returns.map(item => ({
      id: item.id,
      href: '/admin/cases/returns/' + encodeURIComponent(item.id),
      reference: item.referenceNumber,
      title: item.reason.replaceAll('_', ' '),
      detail: item.productName + ' · ' + item.sellerName,
      status: item.status,
      waiting: item.status === 'needs_customer_changes' || item.followup?.waitingFor === 'customer',
      updatedAt: item.updatedAt,
    })),
    ...complaints.map(item => ({
      id: item.id,
      href: '/admin/cases/complaints/' + encodeURIComponent(item.id),
      reference: item.referenceNumber,
      title: item.subject,
      detail: item.orderNumber + ' · Complaint',
      status: item.status,
      waiting: item.status === 'waiting_customer',
      updatedAt: item.updatedAt,
    })),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
  const open = cases.filter(item => !['resolved', 'closed', 'rejected'].includes(item.status));
  const waiting = open.filter(item => item.waiting);
  const closed = cases.filter(item => ['resolved', 'closed', 'rejected'].includes(item.status));
  const filters = [
    { name: 'All open', key: 'open', entries: open },
    { name: 'Waiting on customer', key: 'waiting', entries: waiting },
    { name: 'Closed', key: 'closed', entries: closed },
  ] as const;
  const visible = filters.find(option => option.key === filter)?.entries ?? open;
  const filterSuffix = filter === 'open' ? '' : '?view=' + filter;

  return (
    <section className="min-w-0" aria-label="Returns and complaints list">
      <nav aria-label="Filter cases" className="mb-3 flex flex-wrap gap-2">
        {filters.map(option => (
          <Link key={option.key} href={'/admin/cases' + (option.key === 'open' ? '' : '?view=' + option.key)}
            aria-current={option.key === filter ? 'page' : undefined}
            className={'inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm font-semibold ' +
              (option.key === filter ? 'border-[#14213D] bg-[#14213D] text-white' : 'bg-card hover:border-[#14213D]')}>
            {option.name} <span>{option.entries.length}</span>
          </Link>
        ))}
      </nav>
      {visible.length ? <ul className="grid gap-2">
        {visible.map(item => (
          <li key={item.href} className="min-w-0">
            <Link href={withAdminReturnTo(item.href + filterSuffix, '/admin/cases' + filterSuffix)}
              aria-current={selected === item.id ? 'page' : undefined}
              className={'block rounded-xl border p-3.5 hover:border-[#14213D] ' +
                (selected === item.id ? 'border-[#14213D] bg-card ring-1 ring-[#14213D]' : 'bg-card/65')}>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold">{item.reference}</span>
                <span className={'rounded-full px-2.5 py-1 text-xs font-semibold ' +
                  (item.waiting ? 'bg-[#f7e7be] text-[#744a0b]' : 'bg-[#e1e8f4] text-[#24427a]')}>
                  {labels[item.status] ?? item.status.replaceAll('_', ' ')}
                </span>
              </span>
              <span className="mt-2 block font-semibold first-letter:uppercase">{item.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{item.detail}</span>
            </Link>
          </li>
        ))}
      </ul> : <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No cases in this queue.</p>}
    </section>
  );
}
