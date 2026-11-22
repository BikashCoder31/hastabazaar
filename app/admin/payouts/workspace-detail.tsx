import { Check, CircleAlert, Landmark, LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PayoutBadge } from '@/components/admin/payout-workspace';
import { StepLine, type StepLineStep } from '@/components/ui/step-line';
import { standardLedgerEligibility } from '@/lib/db/repositories/payouts';
import type { PayoutRequestRow, PayoutRow } from '@/lib/db/repositories/payouts';
import { currentBankReadiness } from '@/lib/sellers/bank-readiness';
import { payoutAmount, payoutDate, type PayoutBoardRow } from './workspace-data';

type Line = {
  id: string;
  type: string;
  amountPaisa: number;
  description: string;
  orderId: string | null;
  orderNumber: string | null;
  commissionBps: number | null;
  openReturn: number;
  availableAt: number | null;
};

const unusedLedger = `FROM seller_ledger_entries e
  JOIN seller_profiles s ON s.id=e.seller_id
  LEFT JOIN payout_entries pe ON pe.ledger_entry_id=e.id AND pe.released_at IS NULL`;
const unusedLedgerFilter = `s.status='approved' AND pe.ledger_entry_id IS NULL AND ${standardLedgerEligibility('e')}`;

export async function readHeldEarnings(db: D1Database, now: number, sellerId?: string) {
  const rows = await db.prepare(`SELECT e.seller_id AS sellerId, s.trading_name AS tradingName,
      SUM(e.amount_paisa) AS amountPaisa ${unusedLedger}
    WHERE ${unusedLedgerFilter} AND e.available_at>? ${sellerId ? 'AND e.seller_id=?' : ''}
    GROUP BY e.seller_id, s.trading_name HAVING SUM(e.amount_paisa)>0`)
    .bind(...(sellerId ? [now, sellerId] : [now]))
    .all<{ sellerId: string; tradingName: string; amountPaisa: number }>();
  return rows.results;
}

const detailColumns = `e.id, e.type, e.amount_paisa AS amountPaisa, e.description, e.available_at AS availableAt,
  o.id AS orderId, o.order_number AS orderNumber, i.commission_bps AS commissionBps,
  EXISTS(SELECT 1 FROM return_requests r WHERE r.order_item_id=i.id AND r.status NOT IN ('rejected','resolved')) AS openReturn`;
const detailJoins = 'LEFT JOIN order_items i ON i.id=e.order_item_id LEFT JOIN orders o ON o.id=i.order_id';

export async function readUnallocatedPayoutLines(db: D1Database, sellerId: string, now: number, part: 'available' | 'held' | 'both') {
  const comparison = part === 'held' ? 'e.available_at>?' : part === 'available' ? 'e.available_at<=?' : 'e.available_at IS NOT NULL';
  const query = db.prepare(`SELECT ${detailColumns} ${unusedLedger} ${detailJoins}
    WHERE ${unusedLedgerFilter} AND e.seller_id=? AND ${comparison}
    ORDER BY e.created_at, e.id`).bind(...(part === 'both' ? [sellerId] : [sellerId, now]));
  return (await query.all<Line>()).results;
}

export async function readPayoutLines(db: D1Database, payoutId: string) {
  return (await db.prepare(`SELECT ${detailColumns} FROM payout_entries pe
    JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id ${detailJoins}
    WHERE pe.payout_id=? ORDER BY e.created_at, e.id`).bind(payoutId).all<Line>()).results;
}

type BankCheck = { title: string; label: string | null; checkedAt: number | null; pendingChange: boolean };

export async function readPayoutBankCheck(db: D1Database, sellerId: string, now: number, destination?: string) {
  const seller = await db.prepare(`SELECT s.user_id AS ownerId, s.payout_account_reference AS reference,
      COALESCE(v.identity_revision,0) AS identityRevision,
      EXISTS(SELECT 1 FROM seller_protected_change_cases c WHERE c.seller_id=s.id AND c.kind='bank' AND c.status<>'closed') AS pendingChange
    FROM seller_profiles s LEFT JOIN seller_protected_revisions v ON v.seller_id=s.id WHERE s.id=?`)
    .bind(sellerId).first<{ ownerId: string; reference: string | null; identityRevision: number; pendingChange: number }>();
  if (!seller) return null;
  const reference = destination ?? seller.reference;
  const bank = await currentBankReadiness(db, sellerId, reference, seller.identityRevision, seller.ownerId, now);
  const currentVerified = bank.status === 'verified' && reference === seller.reference;
  return {
    title: destination && reference !== seller.reference ? 'Original payout destination' : 'Bank account on file',
    label: currentVerified ? 'The account is linked to the current seller identity.' : 'Review the retained bank details before sending money.',
    checkedAt: currentVerified ? bank.bank?.reviewedAt ?? null : null,
    pendingChange: Boolean(seller.pendingChange),
  } satisfies BankCheck;
}

function payoutSteps(request: PayoutRequestRow | null, payout: PayoutRow | null, blocked: boolean): StepLineStep[] {
  const approvedAt = payout?.approvedAt ?? null;
  const processedAt = payout?.processedAt ?? null;
  const paidAt = payout?.paidAt ?? null;
  const terminal = payout && ['rejected', 'failed', 'reversed'].includes(payout.status);
  const approvalDetail = approvedAt !== null ? payoutDate(approvedAt) : blocked ? 'Needs review' : 'Ready for review';
  return [
    { id: 'requested', label: 'Requested', state: 'complete', detail: request ? payoutDate(request.createdAt) + ' by the seller' : 'Payout prepared' },
    { id: 'approved', label: 'Approved', state: approvedAt !== null ? 'complete' : terminal ? 'upcoming' : 'current', detail: approvalDetail },
    { id: 'sent', label: 'Sent to bank', state: paidAt !== null ? 'complete' : approvedAt !== null && !terminal ? 'current' : 'upcoming',
      detail: paidAt !== null ? 'Bank transfer recorded' : processedAt !== null ? 'Instruction in progress' : approvedAt !== null ? 'Transfer to be recorded' : 'After approval' },
    { id: 'confirmed', label: 'Confirmed', state: paidAt !== null ? 'complete' : 'upcoming', detail: paidAt !== null ? payoutDate(paidAt) : 'When the bank confirms payment' },
  ];
}

function breakdownLines(lines: readonly Line[]) {
  const groups = new Map<string, { label: string; amountPaisa: number; type: string }>();
  const orderCount = new Set(lines.filter(line => line.type === 'sale' && line.orderId).map(line => line.orderId)).size;
  const rates = new Set(lines.filter(line => line.type === 'commission').map(line => line.commissionBps));
  const rate = rates.size === 1 ? rates.values().next().value : null;
  for (const line of lines) {
    const label = line.type === 'sale' ? (orderCount ? `${orderCount} delivered ${orderCount === 1 ? 'order' : 'orders'}` : 'Sales')
      : line.type === 'commission' ? (rate == null ? 'Commission' : `Commission (${rate / 100}%)`)
      : line.type === 'refund' ? (line.orderNumber ? 'Refund for order ' + line.orderNumber : 'Refunds')
      : line.type === 'commission_reversal' ? 'Commission returned'
      : line.type === 'reserve_hold' ? 'Seller reserve held'
      : line.type === 'reserve_release' ? 'Seller reserve released'
      : line.description || line.type.replaceAll('_', ' ');
    const key = line.type + ':' + label;
    const existing = groups.get(key);
    groups.set(key, { label, type: line.type, amountPaisa: (existing?.amountPaisa ?? 0) + line.amountPaisa });
  }
  return [...groups.values()].sort((a, b) => Number(b.type === 'sale') - Number(a.type === 'sale'));
}

export function PayoutDetailPanel({ row, payout = null, request = null, lines, bank, actions, historyHref, finalApproval = false, blocked = false, heading = 'h2', canViewOrders = false }: {
  row: PayoutBoardRow;
  payout?: PayoutRow | null;
  request?: PayoutRequestRow | null;
  lines: readonly Line[];
  bank: BankCheck | null;
  actions?: ReactNode;
  historyHref?: string;
  finalApproval?: boolean;
  blocked?: boolean;
  heading?: 'h1' | 'h2';
  canViewOrders?: boolean;
}) {
  const Heading = heading;
  const earning = row.status === 'earning';
  const orders = [...new Map(lines.flatMap(line => line.orderId && line.orderNumber ? [[line.orderId, line.orderNumber] as const] : [])).entries()];
  const groups = breakdownLines(lines);
  const openReturns = lines.some(line => line.openReturn);
  const headingId = 'selected-payout-title';
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-5 rounded-2xl border border-border bg-white p-5 text-foreground sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {row.reference}{request ? ' · asked ' + payoutDate(request.createdAt) : row.at === null ? '' : ' · ' + payoutDate(row.at)}
          </p>
          <Heading id={headingId} className="break-words font-heading text-2xl leading-tight font-semibold tracking-tight lg:text-[2.15rem]">
            {payoutAmount(row.amountPaisa)} to {row.sellerName}
          </Heading>
        </div>
        <PayoutBadge label={bank?.pendingChange && row.status === 'submitted' ? 'Bank change pending' : blocked ? 'Needs review' : row.badge} />
      </div>
      {earning ? null : <StepLine className="md:grid-cols-1 xl:[grid-template-columns:repeat(4,minmax(0,1fr))]" label="Payout steps" steps={payoutSteps(request, payout, blocked)} />}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-bold">{earning ? 'Earned so far' : 'How the amount adds up'}</h3>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm tabular-nums md:gap-x-4">
            {groups.map(group => (
              <div className="contents" key={group.type + group.label}>
                <dt className={group.amountPaisa < 0 ? 'break-words text-muted-foreground' : 'break-words'}>{group.label}</dt>
                <dd className="max-w-[9rem] break-words text-right">{group.amountPaisa < 0 ? '− ' : group.type !== 'sale' && group.amountPaisa > 0 ? '+ ' : ''}{payoutAmount(Math.abs(group.amountPaisa))}</dd>
              </div>
            ))}
            {request && request.status === 'submitted' && request.availableAmountSnapshotPaisa !== row.amountPaisa ? (
              <div className="contents text-muted-foreground"><dt>Balance when requested</dt><dd className="text-right">{payoutAmount(request.availableAmountSnapshotPaisa)}</dd></div>
            ) : null}
            <dt className="mt-1 border-t border-border pt-2 font-bold">{earning ? 'Total earnings' : blocked && !groups.length ? 'Balance when requested' : 'Payout'}</dt>
            <dd className="mt-1 max-w-[9rem] break-words border-t border-border pt-2 text-right font-bold">{payoutAmount(row.amountPaisa)}</dd>
          </dl>
          {orders.length ? (
            <details className="mt-1">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[#A8232E] underline underline-offset-4">See the {orders.length} {orders.length === 1 ? 'order' : 'orders'}</summary>
              <ul className="grid gap-1">
                {orders.map(([id, number]) => <li key={id}>{canViewOrders ? <Link href={'/admin/orders/' + encodeURIComponent(id)} className="inline-flex min-h-11 items-center underline">{number}</Link> : number}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
        <div className="min-w-0 rounded-xl border border-border bg-[#FFFCF7] p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary"><Landmark className="size-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h3 className="break-words text-sm font-bold">{bank?.title ?? 'Bank account check'}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{bank?.label ?? 'No verified beneficiary was recorded for this payout.'}</p>
            </div>
          </div>
          <ul className="mt-3 grid gap-2 text-sm">
            {bank?.checkedAt ? <li className="flex gap-2 text-[#236548]"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Bank verified {payoutDate(bank.checkedAt)} by document check</li> : null}
            {bank?.pendingChange ? <li className="flex gap-2 text-[#754B08]"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Bank change pending</li> : null}
            {orders.length ? <li className={`flex gap-2 ${openReturns ? 'text-[#754B08]' : 'text-[#236548]'}`}>
              {openReturns ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
              {openReturns ? 'These earnings include an item with an open return' : 'No open returns on these payout items'}
            </li> : null}
          </ul>
        </div>
      </div>
      {request?.sellerNote ? <p className="break-words text-sm text-muted-foreground">{request.sellerNote}</p> : null}
      {actions || finalApproval || historyHref ? (
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border pt-4">
          {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5">{actions}</div> : null}
          {finalApproval ? <p className="flex items-start gap-2 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Your approval is final. It is saved in the payout history.</p> : null}
          {historyHref ? <Link href={historyHref} className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Open payout history</Link> : null}
        </footer>
      ) : null}
    </section>
  );
}
