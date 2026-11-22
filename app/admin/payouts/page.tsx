import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminPageTitle } from '@/components/admin/page-help';
import { AccrueEarningsButton, ApprovePreparedPayoutButton, PreparePayoutButton } from '@/components/admin/payout-actions';
import { PayoutHoldButton } from '@/components/admin/payout-hold-button';
import { PayoutRequestActions } from '@/components/admin/payout-request-actions';
import { PayoutWorkspace } from '@/components/admin/payout-workspace';
import { readPayoutRequestFinanceScope } from '@/lib/admin/finance-work-items';
import { safeAdminReturnTo, withAdminReturnTo } from '@/lib/admin/return-context';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { listPayoutCandidates, listPayoutRequests, listPayoutsForOperations } from '@/lib/db/repositories/payouts';
import { can } from '@/lib/marketplace/permissions';
import { sellerPayoutRequestReadiness } from '@/lib/payments/payout-request-readiness';
import {
  matchingPayouts, payoutAmount, payoutBoardGroups, payoutDate, payoutMonth, payoutStages,
  type PayoutBoardRow, type PayoutFilters, type PayoutStage,
} from './workspace-data';
import { PayoutDetailPanel, readHeldEarnings, readPayoutBankCheck, readPayoutLines, readUnallocatedPayoutLines } from './workspace-detail';

export const dynamic = 'force-dynamic';

type PayoutQuery = {
  sellerId?: string;
  request?: string;
  returnTo?: string;
  stage?: string;
  selected?: string;
  q?: string;
  seller?: string;
  month?: string;
  minimum?: string;
};

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const minimumPattern = /^\d{1,9}(?:\.\d{1,2})?$/;
const actionLink = 'inline-flex min-h-11 w-fit max-w-full items-center text-sm font-semibold underline underline-offset-4';

export default async function PayoutsPage({ searchParams }: { searchParams?: Promise<PayoutQuery> } = {}) {
  const staff = await requireStaffPage('/admin/payouts', ['payout.prepare', 'payout.view']);
  const canPrepare = can(staff, 'payout.prepare');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const query = await searchParams ?? {};
  if (query.sellerId !== undefined && typeof query.sellerId !== 'string') notFound();
  const sellerId = query.sellerId?.slice(0, 100);
  const returnTo = safeAdminReturnTo(query.returnTo);

  if (query.request !== undefined) {
    const request = await readPayoutRequestFinanceScope(database, staff.id, query.request, { allowReadOnly: true });
    if (!request || (sellerId && request.sellerId !== sellerId)) notFound();
    const requestHref = '/admin/payouts?request=' + encodeURIComponent(request.id);
    return (
      <div id={'payout-request-' + request.id} className="min-w-0 space-y-4 break-words">
        <Link className={actionLink} href={returnTo}>Back to previous view</Link>
        <AdminPageTitle><h1 className="font-heading text-3xl">Original seller payout request</h1></AdminPageTitle>
        <p>{request.tradingName} · {request.status}</p>
        <p>Originally submitted {payoutDate(request.createdAt, true)}{request.firstFinanceDueAt !== null ? ' · Original Finance review target ' + payoutDate(request.firstFinanceDueAt, true) : ' · Original target needs reconciliation'}</p>
        {request.sellerNote ? <p>Submitted request note · {request.sellerNote}</p> : null}
        {request.processingNote ? <p>Recorded decision note · {request.processingNote}</p> : null}
        {canPrepare && request.status === 'submitted' ? <PayoutRequestActions id={request.id} actorId={staff.id} role={staff.role} /> : null}
        {request.payoutId ? <Link className={actionLink} href={canPrepare
          ? withAdminReturnTo('/admin/payments/payouts?model=registered&payout=' + encodeURIComponent(request.payoutId), requestHref)
          : '/admin/payouts/' + encodeURIComponent(request.payoutId)}>{canPrepare ? 'Open exact original payout instruction' : 'Open payout record'}</Link> : null}
      </div>
    );
  }

  const stage = payoutStages.find(item => item.id === query.stage)?.id ?? 'ready';
  const filters: PayoutFilters = {
    q: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
    seller: typeof query.seller === 'string' ? query.seller.slice(0, 191) : '',
    month: typeof query.month === 'string' && monthPattern.test(query.month) ? query.month : '',
    minimum: typeof query.minimum === 'string' && minimumPattern.test(query.minimum) ? query.minimum : '',
  };
  const now = new Date().getTime();
  const [candidates, payouts, requests, held, hold] = await Promise.all([
    listPayoutCandidates(database, now, sellerId),
    listPayoutsForOperations(database, sellerId),
    listPayoutRequests(database, sellerId),
    readHeldEarnings(database, now, sellerId),
    getEffectiveBusinessSetting(database, 'seller_delivery_hold_days', now),
  ]);
  const { groups, history, approved } = payoutBoardGroups({ candidates, payouts, requests, held, now });
  const requestSellers = requests.map(request => ({ id: request.sellerId, name: request.tradingName }));
  const sellers = [...new Map([
    ...Object.values(groups).flat().concat(history).map(row => [row.sellerId, { id: row.sellerId, name: row.sellerName }] as const),
    ...requestSellers.map(seller => [seller.id, seller] as const),
  ]).values()].sort((a, b) => a.name.localeCompare(b.name));
  const months = [...new Set([
    payoutMonth(now), ...history.flatMap(row => row.at === null ? [] : [payoutMonth(row.at)]),
    ...requests.map(request => payoutMonth(request.createdAt)), ...(filters.month ? [filters.month] : []),
  ])].sort().reverse();
  const rows = matchingPayouts(groups[stage], filters);
  const approvedRows = stage === 'sent' ? matchingPayouts(approved, filters) : [];
  const visible = [...rows, ...approvedRows];
  const selected = visible.find(row => row.id === query.selected) ?? visible[0];
  const metrics = Object.fromEntries(payoutStages.map(({ id }) => [id, {
    count: groups[id].length, total: groups[id].reduce((total, row) => total + row.amountPaisa, 0),
  }])) as Record<PayoutStage, { count: number; total: number }>;

  const baseQuery = new URLSearchParams();
  if (sellerId) baseQuery.set('sellerId', sellerId);
  if (query.returnTo) baseQuery.set('returnTo', returnTo);
  const backQuery = new URLSearchParams(baseQuery);
  backQuery.set('stage', stage);
  for (const [key, value] of Object.entries(filters)) if (value) backQuery.set(key, value);
  if (selected) backQuery.set('selected', selected.id);
  const boardHref = '/admin/payouts?' + backQuery;
  const canViewOrders = can(staff, 'order.manage');

  async function selectedPanel(row: PayoutBoardRow) {
    const recordId = row.id.slice(row.id.indexOf(':') + 1);
    const base = { row, canViewOrders };
    if (row.status === 'earning') {
      const hasRequest = requests.some(request => request.status === 'submitted' && request.sellerId === row.sellerId);
      const candidate = hasRequest ? null : candidates.find(item => item.sellerId === row.sellerId);
      const heldBalance = held.find(item => item.sellerId === row.sellerId);
      const [bank, lines] = await Promise.all([
        readPayoutBankCheck(database, row.sellerId, now),
        readUnallocatedPayoutLines(database, row.sellerId, now, candidate ? (heldBalance ? 'both' : 'available') : 'held'),
      ]);
      return <PayoutDetailPanel {...base} bank={bank} lines={lines}
        actions={canPrepare && candidate ? <PreparePayoutButton sellerId={candidate.sellerId} sellerName={candidate.tradingName} amount={payoutAmount(candidate.amountPaisa)} role={staff.role} /> : null} />;
    }

    if (row.status === 'submitted') {
      const request = await readPayoutRequestFinanceScope(database, staff.id, recordId, { allowReadOnly: true });
      if (!request || request.status !== 'submitted') return null;
      const candidate = candidates.find(item => item.sellerId === row.sellerId);
      const [bank, readiness, currentLines] = await Promise.all([
        readPayoutBankCheck(database, row.sellerId, now),
        sellerPayoutRequestReadiness(database, row.sellerId, now),
        candidate ? readUnallocatedPayoutLines(database, row.sellerId, now, 'available') : [],
      ]);
      const balanceChanged = Boolean(candidate && currentLines.reduce((total, line) => total + line.amountPaisa, 0) !== row.amountPaisa);
      const blocked = !candidate || !readiness.ready || Boolean(bank?.pendingChange) || balanceChanged;
      const originalHref = withAdminReturnTo('/admin/payouts?request=' + encodeURIComponent(request.id), boardHref);
      const approving = !blocked && can(staff, 'payout.approve');
      const displayRow = { ...row, badge: approving ? 'Ready' : row.badge };
      const verifiedBank = bank && readiness.maskedBeneficiary ? { ...bank, title: readiness.maskedBeneficiary } : bank;
      return <PayoutDetailPanel {...base} row={displayRow} bank={verifiedBank} request={request} lines={balanceChanged ? [] : currentLines} blocked={blocked}
        actions={<>
          {approving ? <PayoutRequestActions id={request.id} actorId={staff.id} role={staff.role} approvalAmount={payoutAmount(row.amountPaisa)} /> : null}
          {staff.role === 'super_admin' ? <PayoutHoldButton bankChange={bank?.pendingChange} /> : null}
          {!approving ? <Link className={actionLink} href={originalHref}>Open request record</Link> : null}
        </>} finalApproval={approving}
        historyHref={approving ? originalHref : undefined} />;
    }

    const payout = payouts.find(item => item.id === recordId);
    if (!payout) return null;
    const origin = requests.find(request => request.payoutId === payout.id);
    const [bank, lines] = await Promise.all([
      readPayoutBankCheck(database, payout.sellerId, now, payout.destinationReference),
      readPayoutLines(database, payout.id),
    ]);
    const canApprove = can(staff, 'payout.approve');
    const canProcess = can(staff, 'payout.mark_paid');
    const approvalStage = ['prepared', 'scheduled'].includes(payout.status);
    const approving = approvalStage && canApprove && !bank?.pendingChange;
    const historyHref = '/admin/payouts/' + encodeURIComponent(payout.id);
    const transferHref = withAdminReturnTo('/admin/payments/payouts?model=registered&payout=' + encodeURIComponent(payout.id), boardHref);
    let actions: ReactNode;
    if (approvalStage && canApprove) {
      actions = <>
        {approving ? <ApprovePreparedPayoutButton payoutId={payout.id} status={payout.status} isPreparer={payout.preparedBy === staff.id}
          canApprove={canApprove} canProcess={canProcess} amount={payoutAmount(payout.amountPaisa)} /> : null}
        <PayoutHoldButton bankChange={bank?.pendingChange} />
      </>;
    } else if (canProcess && ['approved', 'processing'].includes(payout.status)) {
      actions = <Link className="admin-primary" href={transferHref}>{payout.status === 'approved' ? 'Open bank transfer' : 'Review bank outcome'}</Link>;
    }
    return <PayoutDetailPanel {...base} payout={payout} row={row} lines={lines} bank={bank}
      request={origin ? { ...origin, sellerNote: '' } : null} actions={actions} historyHref={historyHref} finalApproval={approving} />;
  }

  const detail = selected ? await selectedPanel(selected) : null;
  const filteredHistory = matchingPayouts(history, filters);
  const filteredRequests = requests.filter(request => matchingPayouts([{
    id: request.id, sellerId: request.sellerId, sellerName: request.tradingName, reference: 'Seller request',
    amountPaisa: request.availableAmountSnapshotPaisa, at: request.createdAt, status: request.status, badge: '',
  }], filters).length);
  return (
    <div className="min-w-0 space-y-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AdminPageTitle><h1 className="font-heading text-3xl tracking-tight">Money</h1></AdminPageTitle>
        {query.returnTo ? <Link className={actionLink} href={returnTo}>Back to previous view</Link> : null}
      </div>
      {sellerId ? <p className="break-words text-sm text-muted-foreground">Showing records for one seller. <Link className={actionLink} href="/admin/payouts">All sellers</Link></p> : null}
      <PayoutWorkspace stage={stage} selected={selected?.id ?? null} filters={filters} sellers={sellers} months={months}
        metrics={metrics} rows={rows} approvedRows={approvedRows} baseQuery={baseQuery.toString()} observedAt={now}
        holdDays={hold.value} canExport={canPrepare} detail={detail} />
      <details className="rounded-xl border border-border bg-[#FFFCF7] px-4">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Payout history and tools</summary>
        <div className="grid min-w-0 gap-4 pb-4">
          {canPrepare ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link className={actionLink} href={withAdminReturnTo('/admin/payments/payouts', boardHref)}>Verified funding and bank transfers</Link>
            <AccrueEarningsButton />
          </div> : null}
          <section className="min-w-0" aria-label="Payout history">
            <h2 className="font-semibold">Payout history</h2>
            {filteredHistory.length ? <ul className="divide-y">{filteredHistory.map(row => <li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 py-1">
              <Link className={actionLink + ' break-words'} href={'/admin/payouts/' + encodeURIComponent(row.id.slice('payout:'.length))}>{row.reference} · {row.sellerName}</Link>
              <span className="text-sm text-muted-foreground">{row.badge} · {payoutAmount(row.amountPaisa)}</span>
            </li>)}</ul> : <p className="text-sm text-muted-foreground">No payout history to display.</p>}
          </section>
          <section className="min-w-0" aria-label="Seller payout requests">
            <h2 className="font-semibold">Seller payout requests</h2>
            {filteredRequests.length ? <ul className="divide-y">{filteredRequests.map(request => <li key={request.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 py-1">
              <Link className={actionLink + ' break-words'} href={withAdminReturnTo('/admin/payouts?request=' + encodeURIComponent(request.id), boardHref)}>{request.tradingName} · {payoutDate(request.createdAt)}</Link>
              <span className="text-sm text-muted-foreground">{request.status === 'submitted' ? 'Requested' : request.status === 'prepared' ? 'Payout created' : 'Rejected'}</span>
            </li>)}</ul> : <p className="text-sm text-muted-foreground">No seller payout requests to display.</p>}
          </section>
          {payouts.length >= 150 || requests.length >= 150 ? <p className="text-sm text-muted-foreground">This view shows up to 150 payouts and 150 payout requests.</p> : null}
        </div>
      </details>
    </div>
  );
}
