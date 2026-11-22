import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApprovePreparedPayoutButton, PayoutWorkflowActions } from '@/components/admin/payout-actions';
import { PayoutHoldButton } from '@/components/admin/payout-hold-button';
import { StatusBadge } from '@/components/admin/status-badge';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getPayoutDetail } from '@/lib/db/repositories/payouts';
import { can } from '@/lib/marketplace/permissions';
import { nativePayoutRow, payoutAmount, payoutDate } from '../workspace-data';
import { PayoutDetailPanel, readPayoutBankCheck, readPayoutLines } from '../workspace-detail';

export const dynamic = 'force-dynamic';

export default async function PayoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage(`/admin/payouts/${id}`, ['payout.prepare', 'payout.view']);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const payout = await getPayoutDetail(db, id);
  if (!payout) notFound();
  const [bank, lines] = await Promise.all([
    readPayoutBankCheck(db, payout.sellerId, new Date().getTime(), payout.destinationReference),
    readPayoutLines(db, payout.id),
  ]);
  const canApprove = can(staff, 'payout.approve');
  const canProcess = can(staff, 'payout.mark_paid');
  const approvalStage = ['prepared', 'scheduled'].includes(payout.status);
  const approving = approvalStage && canApprove && !bank?.pendingChange;
  const transferHref = withAdminReturnTo('/admin/payments/payouts?model=registered&payout=' + encodeURIComponent(payout.id), '/admin/payouts/' + encodeURIComponent(id));
  const workflow = {
    payoutId: payout.id, status: payout.status, isPreparer: payout.preparedBy === staff.id, canApprove, canProcess,
  };

  return (
    <div className="min-w-0 space-y-5">
      <Link href="/admin/payouts" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to payouts
      </Link>
      <PayoutDetailPanel
        row={nativePayoutRow(payout)} bank={bank} lines={lines} payout={payout} heading="h1" finalApproval={approving}
        canViewOrders={can(staff, 'order.manage')}
        actions={approvalStage && canApprove ? <>
          {approving ? <ApprovePreparedPayoutButton {...workflow} amount={payoutAmount(payout.amountPaisa)} /> : null}
          <PayoutHoldButton bankChange={bank?.pendingChange} />
        </> : canProcess && ['approved', 'processing'].includes(payout.status) ? (
          <Link className="admin-primary" href={transferHref}>{payout.status === 'approved' ? 'Open bank transfer' : 'Review bank outcome'}</Link>
        ) : null}
      />
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
        <section className="min-w-0 space-y-3 rounded-2xl border border-border bg-white p-5" aria-labelledby="payout-audit">
          <h2 className="font-heading text-xl font-semibold" id="payout-audit">Payout history</h2>
          {payout.events.length ? <ol className="grid gap-4">
            {payout.events.map(event => (
              <li key={event.id} className="min-w-0 space-y-1 border-l-2 border-primary/25 pl-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={event.toStatus} />
                  <span className="text-xs text-muted-foreground">{payoutDate(event.createdAt, true)}</span>
                </div>
                <p className="break-words text-sm">{event.note}</p>
                <p className="break-words text-xs text-muted-foreground">{event.actorName} · {event.actorType.replaceAll('_', ' ')}</p>
              </li>
            ))}
          </ol> : <p className="text-sm text-muted-foreground">No events recorded.</p>}
        </section>
        <section className="min-w-0 space-y-3 rounded-2xl border border-border bg-white p-5" aria-labelledby="payout-record">
          <h2 className="font-heading text-xl font-semibold" id="payout-record">Payout record</h2>
          <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <div className="break-words"><dt className="font-semibold">Prepared by</dt><dd>{payout.preparedByName} · {payoutDate(payout.createdAt, true)}</dd></div>
            {payout.approvedByName ? <div className="break-words"><dt className="font-semibold">Approved by</dt><dd>{payout.approvedByName}</dd></div> : null}
            {payout.providerReference ? <div className="break-words"><dt className="font-semibold">Provider reference</dt><dd>{payout.providerReference}</dd></div> : null}
            {payout.failureReason ? <div className="break-words"><dt className="font-semibold">Failure reason</dt><dd>{payout.failureReason}</dd></div> : null}
            {payout.note ? <div className="break-words sm:col-span-2"><dt className="font-semibold">Preparation note</dt><dd>{payout.note}</dd></div> : null}
          </dl>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Included ledger entries</summary>
            {payout.entries.length ? <ul className="grid divide-y">
              {payout.entries.map(entry => (
                <li key={entry.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 py-3 text-sm">
                  <div className="break-words">
                    <p className="font-semibold">{entry.orderNumber ?? 'Payout settlement'}</p>
                    <p>{entry.productName ?? entry.description}</p>
                    <p className="text-xs text-muted-foreground">{entry.type.replaceAll('_', ' ')} · {payoutDate(entry.createdAt, true)}</p>
                  </div>
                  <span className="max-w-[8rem] break-words text-right font-semibold">{payoutAmount(entry.amountPaisa)}</span>
                </li>
              ))}
            </ul> : <p className="text-sm text-muted-foreground">No ledger entries recorded.</p>}
          </details>
          {approvalStage && canApprove ? (
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Reject payout</summary>
              <PayoutWorkflowActions {...workflow} decisionOnly="reject" />
            </details>
          ) : can(staff, 'payout.prepare') ? (
            <Link href={`/admin/staff-form-history?kind=${canApprove || canProcess ? 'payout-action' : 'payout-preparation'}&id=${encodeURIComponent(id)}`}
              className="inline-flex min-h-11 items-center text-sm underline">View payout form history</Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}
