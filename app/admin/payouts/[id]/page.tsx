import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, History, Landmark, ListChecks } from 'lucide-react';

import { PayoutWorkflowActions } from '@/components/admin/payout-actions';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getPayoutDetail } from '@/lib/db/repositories/payouts';
import { can } from '@/lib/marketplace/permissions';

export const dynamic = 'force-dynamic';
const money = (paisa: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    paisa / 100,
  );
const date = (value: number) =>
  new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(value));
const mask = (value: string) =>
  value.length <= 4 ? '••••' : `•••• ${value.slice(-4)}`;

export default async function PayoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(
    `/admin/payouts/${id}`,
    'payout.prepare',
  );
  const payout = await getPayoutDetail(
    requireDatabase(env as unknown as { DB?: D1Database }),
    id,
  );
  if (!payout) notFound();
  return (
    <div className="space-y-7">
      <Link
        href="/admin/payouts"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to payouts
      </Link>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">{payout.payoutNumber}</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">
            {payout.tradingName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Prepared by {payout.preparedByName} · {date(payout.createdAt)}
          </p>
        </div>
        <StatusBadge status={payout.status} />
      </div>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="size-5 text-primary" /> Settlement summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Amount">{money(payout.amountPaisa)}</Detail>
                <Detail label="Destination">
                  {mask(payout.destinationReference)}
                </Detail>
                <Detail label="Prepared by">{payout.preparedByName}</Detail>
                <Detail label="Approved by">{payout.approvedByName}</Detail>
                <Detail label="Provider reference">
                  {payout.providerReference}
                </Detail>
                <Detail label="Failure reason">{payout.failureReason}</Detail>
                <Detail label="Preparation note">{payout.note}</Detail>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="size-5 text-primary" /> Included ledger
                entries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Order / product</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payout.entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="capitalize">
                        {entry.type.replaceAll('_', ' ')}
                      </TableCell>
                      <TableCell>
                        <span className="block font-medium">
                          {entry.orderNumber ?? 'Payout settlement'}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {entry.productName ?? entry.description}
                        </span>
                      </TableCell>
                      <TableCell>{date(entry.createdAt)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {money(entry.amountPaisa)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Next action</CardTitle>
            </CardHeader>
            <CardContent>
              <PayoutWorkflowActions
                key={payout.id + ':' + payout.status}
                payoutId={payout.id}
                status={payout.status}
                isPreparer={payout.preparedBy === staff.id}
                canApprove={can(staff, 'payout.approve')}
                canProcess={can(staff, 'payout.mark_paid')}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-5 text-primary" /> Audit history
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payout.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No events recorded.
                </p>
              ) : (
                <ol className="space-y-5">
                  {payout.events.map((event) => (
                    <li
                      key={event.id}
                      className="border-l-2 border-primary/25 pl-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={event.toStatus} />
                        <span className="text-xs text-muted-foreground">
                          {date(event.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6">{event.note}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.actorName} · {event.actorType.replace('_', ' ')}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-6">{children || '—'}</dd>
    </div>
  );
}
