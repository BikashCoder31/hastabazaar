'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, Check, ImageIcon, Landmark, MessageCircle } from 'lucide-react';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import type { BankTransferLane, BankTransferOrder, BankTransferQueue } from '@/lib/payments/bank-transfer-queue';
import type { getManualPaymentWorkspace } from '@/lib/payments/manual-payment-workspace';

const lanes = [
  { id: 'check', title: 'Customer says paid — check bank' },
  { id: 'waiting', title: 'Waiting for money' },
  { id: 'release', title: 'Ready to release' },
  { id: 'problems', title: 'Problems' },
  { id: 'done', title: 'Done today' },
] as const;

const npr = new Intl.NumberFormat('en-NP', { maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('en-NP', {
  timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});
const panel = 'min-w-0 rounded-2xl border border-[#E4DACA] bg-white';
const field = 'min-w-0 space-y-2 text-sm font-semibold';
const input = 'block min-h-11 w-full min-w-0 rounded-[10px] border border-[#D4C1A6] bg-white px-3 py-2 font-normal focus-visible:outline-2 focus-visible:outline-[#14213D]';
const button = 'inline-flex min-h-11 min-w-0 items-center justify-center rounded-[10px] border border-[#D4C1A6] px-4 py-2 text-center text-sm font-semibold text-[#14213D] hover:bg-[#F7F3EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-55';
const primary = 'inline-flex min-h-11 w-full min-w-0 items-center justify-center rounded-[10px] bg-[#A8232E] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#8F1E27] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:bg-[#737B8E]';
const money = (paisa: number) => 'NPR ' + npr.format(paisa / 100);

type PaymentWorkspace = Awaited<ReturnType<typeof getManualPaymentWorkspace>>;

export type GuidedBankCredit = {
  orderId: string;
  orderRevision: number;
  amountPaisa: number;
  bankAt: number;
  accountVersionId: string;
  transactionIdentity: string;
  payerReference: string;
  evidenceReference: string;
  matchingBasis: string;
};

type PaymentAction = (action: string, revision: string | null, input: Record<string, unknown>) => Promise<void>;

function readAmount(value: string) {
  const parts = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!parts) return null;
  const amount = Number(parts[1]) * 100 + Number((parts[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function StatusPill({ order, now }: { order: BankTransferOrder; now: number }) {
  const partial = order.paidAt === null && order.receivedPaisa > 0 && order.receivedPaisa < order.payablePaisa;
  const expired = order.paidAt === null && order.cutoffAt <= now;
  const remainingMinutes = Math.ceil(Math.max(0, order.cutoffAt - now) / 60_000);
  const remainingHours = Math.floor(remainingMinutes / 60);
  const timeLeft = remainingHours ? `${remainingHours} h ${remainingMinutes % 60} min left` : `${remainingMinutes} min left`;
  const label = order.orderStatus === 'cancelled' ? order.closureReason === 'expired' ? 'Expired' : 'Closed'
    : order.releasedAt !== null ? 'Released'
      : expired ? 'Expired' : partial ? `Short ${money(order.payablePaisa - order.receivedPaisa)}`
        : order.paidAt !== null ? 'Paid' : timeLeft;
  const tone = expired || partial ? 'bg-[#A8232E] text-white' : order.paidAt !== null ? 'bg-[#E1EEE5] text-[#205B3D]' : 'bg-[#EDE3CF] text-[#435371]';
  return <span className={`inline-block w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function ClaimAndOrder({ order }: { order: BankTransferOrder }) {
  const { claim } = order;
  return <div className="grid min-w-0 gap-3 xl:grid-cols-2">
    <section className="min-w-0 rounded-[13px] border border-[#E4DACA] bg-[#FCF9F4] p-4">
      <h3 className="text-sm font-bold">Customer says</h3>
      {claim ? <>
        <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-[#655846]">Paid</dt><dd>{money(claim.amountPaisa)}</dd>
          <dt className="text-[#655846]">On</dt><dd>{claim.paymentDate}</dd>
          <dt className="text-[#655846]">Reference</dt><dd className="break-all font-mono text-xs">{claim.bankReference ?? 'Not supplied'}</dd>
        </dl>
        {claim.note ? <p className="mt-2 text-sm">{claim.note}</p> : null}
        {claim.evidenceIds.map((id, index) => (
          <a key={id} href={`/api/admin/payments/files/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-sm underline focus-visible:outline-2">
            <ImageIcon className="size-4 shrink-0" aria-hidden="true" /> {claim.evidenceIds.length === 1 ? 'Open receipt attachment' : `Open attachment ${index + 1}`}
          </a>
        ))}
      </> : <p className="mt-2 text-sm text-[#46536F]">No claim yet. Check the company bank statement for a credit.</p>}
    </section>
    <section className="min-w-0 rounded-[13px] border border-[#E4DACA] bg-[#FCF9F4] p-4">
      <h3 className="text-sm font-bold">Order needs</h3>
      <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-[#655846]">Total</dt><dd>{money(order.payablePaisa)}</dd>
        <dt className="text-[#655846]">Reference</dt><dd className="break-all font-mono text-xs">{order.orderNumber}</dd>
        <dt className="text-[#655846]">Deadline</dt><dd>{dateTime.format(order.cutoffAt)} Nepal time</dd>
        {order.receivedPaisa > 0 ? <><dt className="text-[#655846]">Matched</dt><dd>{money(order.receivedPaisa)}</dd></> : null}
        {order.receivedPaisa > 0 && order.receivedPaisa < order.payablePaisa ? <>
          <dt className="text-[#655846]">Still due</dt><dd>{money(order.payablePaisa - order.receivedPaisa)}</dd>
        </> : null}
      </dl>
    </section>
  </div>;
}

function StepHeading({ step, complete, children }: { step: number; complete?: boolean; children: React.ReactNode }) {
  return <h3 className="flex items-center gap-2.5 text-base font-bold">
    <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs text-white ${complete ? 'bg-[#286748]' : 'bg-[#14213D]'}`}>{step}</span>
    {children}
  </h3>;
}

function BankCreditStep({ order, accounts, now, locked, pendingMatch, onCredit }: {
  order: BankTransferOrder;
  accounts: PaymentWorkspace['accounts'];
  now: number;
  locked: boolean;
  pendingMatch: boolean;
  onCredit: (input: GuidedBankCredit) => void;
}) {
  const current = accounts.find(account => account.id === order.accountVersionId && account.enabled && account.currency === 'NPR');
  const [account, setAccount] = useState(current?.id ?? '');
  const [amount, setAmount] = useState('');
  const [time, setTime] = useState('');
  const [identity, setIdentity] = useState('');
  const [payerReference, setPayerReference] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [matchingBasis, setMatchingBasis] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const paisa = readAmount(amount);
  const due = order.payablePaisa - order.receivedPaisa;
  const difference = paisa === null ? null : paisa - due;
  const bankAt = Date.parse(time + ':00+05:45');
  const paid = order.paidAt !== null;
  const canRecord = !locked && !pendingMatch && Boolean(current && current.id === account)
    && paisa !== null && bankAt >= 0 && Number.isSafeInteger(bankAt)
    && identity.trim().length >= 3 && payerReference.trim().length > 0
    && evidenceReference.trim().length >= 8 && matchingBasis.trim().length >= 10 && confirmed;
  function record() {
    if (!canRecord || paisa === null) return;
    onCredit({
      orderId: order.id, orderRevision: order.revision, amountPaisa: paisa, bankAt, accountVersionId: account,
      transactionIdentity: identity.trim(), payerReference: payerReference.trim(), evidenceReference: evidenceReference.trim(),
      matchingBasis: matchingBasis.trim(),
    });
  }

  return <section className="space-y-4 rounded-[14px] border border-[#E4DACA] p-4 sm:p-5">
    <StepHeading step={1} complete={paid}>Record the money in the company bank</StepHeading>
    {paid ? <p className="flex items-start gap-2 text-sm text-[#46536F]"><Check className="size-5 shrink-0 text-[#286748]" aria-hidden="true" />
      {money(order.receivedPaisa)} matched to {order.orderNumber}.</p>
      : order.closedAt !== null || order.orderStatus === 'cancelled' || now >= order.cutoffAt
        ? <p className="text-sm text-[#46536F]">Keep a late credit in a separate review. The order’s payment window is closed.</p>
        : !current ? <p className="text-sm text-[#46536F]">The original receiving account needs review. Use the company receipt and exception controls in More actions.</p>
          : <>
            <fieldset disabled={locked || pendingMatch} className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className={field}>Company account
                <select className={input} value={account} onChange={event => setAccount(event.target.value)}>
                  <option value="">Choose the credited account</option>
                  <option value={current.id}>{current.bank} · …{current.lastFour}</option>
                </select>
              </label>
              <label className={field}>Amount credited (NPR)
                <input className={input} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} />
              </label>
              <label className={field}>Bank time (Nepal)
                <input className={input} type="datetime-local" value={time} onChange={event => setTime(event.target.value)} />
              </label>
              <label className={field}>Bank transaction ID
                <input className={input} maxLength={200} value={identity} onChange={event => setIdentity(event.target.value)} />
              </label>
              <label className={field}>Payer or reference shown in the bank
                <input className={input} maxLength={500} value={payerReference} onChange={event => setPayerReference(event.target.value)} />
              </label>
              <label className={field}>Bank statement evidence reference
                <input className={input} maxLength={500} value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)} />
              </label>
              <label className={`${field} sm:col-span-2`}>How this credit matches the order
                <textarea className={input} rows={2} maxLength={1000} value={matchingBasis} onChange={event => setMatchingBasis(event.target.value)} />
              </label>
            </fieldset>
            {difference === null ? null : <output aria-live="polite"
              className={`flex items-start gap-2 rounded-[10px] p-3 text-sm ${difference === 0 ? 'bg-[#E1EEE5] text-[#205B3D]' : 'bg-[#F8E1DE] text-[#842029]'}`}>
              {difference === 0 ? <Check className="size-5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />}
              <span>{difference === 0
                ? <><strong>{order.receivedPaisa > 0 ? 'Matches the remaining amount.' : 'Matches the order total.'}</strong> Matching this credit marks the order paid.</>
                : difference < 0
                  ? <><strong>{money(-difference)} short.</strong> The order stays unpaid. Ask the customer to send the rest before the deadline.</>
                  : <><strong>{money(difference)} extra.</strong> The order uses the amount it needs. The excess stays in its own review case.</>}</span>
            </output>}
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}
                disabled={locked || pendingMatch} required className="size-4 shrink-0 accent-[#14213D]" />
              I checked this credit in the company bank statement myself.
            </label>
            <button type="button" className={primary} disabled={!canRecord} onClick={record}>
              {pendingMatch ? 'Matching the recorded credit…' : difference !== null && difference < 0
                ? `Record ${money(paisa!)} (part payment)` : `Record and match to ${order.orderNumber}`}
            </button>
          </>}
  </section>;
}

function ReleaseStep({ order, canRelease, locked, send }: {
  order: BankTransferOrder; canRelease: boolean; locked: boolean; send: PaymentAction;
}) {
  const [reason, setReason] = useState('');
  const paid = order.paidAt !== null && order.receivedPaisa >= order.payablePaisa;
  const isClosed = order.closedAt !== null || order.orderStatus === 'cancelled';
  const ready = paid && !isClosed && Boolean(order.releaseOrderReady && order.releaseItemsReady && order.releaseWithoutHold);
  const sellers = Number(order.sellerCount);
  const buttonLabel = sellers > 1 ? 'Release to sellers' : order.sellerName ? `Release to ${order.sellerName}` : 'Release to the seller';
  return <section className="space-y-3 rounded-[14px] border border-[#E4DACA] p-4 sm:p-5">
    <StepHeading step={2} complete={order.releasedAt !== null}>Release the order to the seller</StepHeading>
    {order.releasedAt !== null ? <p className="text-sm text-[#286748]">The order was released {dateTime.format(order.releasedAt)}.</p> :
      isClosed ? <p className="text-sm text-[#46536F]">This order is closed.</p> :
        !paid ? <p className="text-sm text-[#46536F]">Opens after the money is matched.</p> :
          <>
            <ul className="grid gap-2 text-sm text-[#46536F]">
              {[['Paid in full', paid], ['Order not cancelled', !isClosed], ['Items still available', Boolean(order.releaseItemsReady)]].map(([name, met]) => (
                <li key={String(name)} className="flex items-center gap-2">
                  {met ? <Check className="size-4 shrink-0 text-[#286748]" aria-hidden="true" /> :
                    <AlertTriangle className="size-4 shrink-0 text-[#A8232E]" aria-label="Check required" />} {name}
                </li>
              ))}
            </ul>
            {!ready ? <p className="rounded-lg bg-[#F8E1DE] p-3 text-sm text-[#842029]">A saved readiness check needs review. The order stays paid while you review the original order or payment case.</p> : null}
            {canRelease ? <>
              <label className={field}>Why the order is ready
                <textarea className={input} rows={2} maxLength={1000} value={reason} disabled={!ready || locked}
                  onChange={event => setReason(event.target.value)} />
              </label>
              <button type="button" className={primary} disabled={!ready || locked || reason.trim().length < 10}
                onClick={() => void send('release', String(order.revision), { orderId: order.id, reason: reason.trim() })}>{buttonLabel}</button>
            </> : null}
            <p className="flex items-start gap-2 rounded-[10px] bg-[#E1E7F3] p-3 text-sm text-[#263F65]">
              <Bell className="size-5 shrink-0" aria-hidden="true" />
              <span>After release, the customer gets <strong>Payment received</strong>. The seller sees the order in <strong>To prepare</strong>.</span>
            </p>
          </>}
  </section>;
}

function CustomerAndExpiryActions({ order, now, superAdmin, locked, send }: {
  order: BankTransferOrder; now: number; superAdmin: boolean; locked: boolean; send: PaymentAction;
}) {
  const [action, setAction] = useState<'ask' | 'close' | null>(null);
  const [reason, setReason] = useState('');
  const claim = order.claim;
  const open = order.closedAt === null && order.paidAt === null && order.orderStatus !== 'cancelled';
  const ask = open && now < order.cutoffAt && claim && ['submitted', 'clarified', 'needs_information'].includes(claim.state);
  const close = superAdmin && open && now >= order.cutoffAt && order.receivedPaisa === 0;
  if (!ask && !close) return null;
  return <section className="space-y-3 border-t border-[#E4DACA] pt-4">
    {ask ? <button type="button" className={button} aria-expanded={action === 'ask'} disabled={locked}
      onClick={() => { setAction(action === 'ask' ? null : 'ask'); setReason(''); }}>
      <MessageCircle className="mr-2 size-4 shrink-0" aria-hidden="true" /> Ask the customer
    </button> : null}
    {close ? <button type="button" className={button} aria-expanded={action === 'close'} disabled={locked}
      onClick={() => { setAction(action === 'close' ? null : 'close'); setReason(''); }}>Close — no payment arrived</button> : null}
    {(action === 'ask' && ask) || (action === 'close' && close) ? (
      <div className="grid gap-3">
        <label className={field}>{action === 'ask' ? 'What information do you need?' : 'Why the order is closing'}
          <textarea className={input} rows={2} maxLength={1000} value={reason} disabled={locked}
            onChange={event => setReason(event.target.value)} />
        </label>
        <button type="button" className={button} disabled={locked || reason.trim().length < 10} onClick={() => {
          if (action === 'ask' && claim) {
            void send('review_claim', String(claim.revision), {
              orderId: order.id, action: 'needs_information', reason: reason.trim(), expectedWindowRevision: order.revision,
            });
          } else if (action === 'close' && close) {
            void send('close_expired', String(order.revision), { orderId: order.id, reason: reason.trim() });
          }
        }}>{action === 'ask' ? 'Send my question' : 'Close the expired order'}</button>
      </div>
    ) : null}
  </section>;
}

function BankTransferDetail({ order, now, accounts, locked, pendingMatch, canRelease, superAdmin, send, onCredit }: {
  order: BankTransferOrder; now: number; accounts: PaymentWorkspace['accounts']; locked: boolean;
  pendingMatch: boolean; canRelease: boolean; superAdmin: boolean; send: PaymentAction; onCredit: (input: GuidedBankCredit) => void;
}) {
  return <article className={`${panel} space-y-4 p-4 sm:p-5`} aria-label={`Bank transfer for ${order.orderNumber}`}>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="break-all text-base font-bold">{order.orderNumber}</h2>
        <p className="mt-1 text-sm text-[#46536F]">
          {[order.customerName, order.itemName, Number(order.sellerCount) > 1 ? `${order.sellerCount} sellers` : order.sellerName].filter(Boolean).join(' · ')}
        </p>
      </div>
      <StatusPill order={order} now={now} />
    </div>
    <ClaimAndOrder order={order} />
    <BankCreditStep key={`${order.id}:${order.receivedPaisa}`} order={order} accounts={accounts} now={now}
      locked={locked} pendingMatch={pendingMatch} onCredit={onCredit} />
    <ReleaseStep order={order} canRelease={canRelease} locked={locked || pendingMatch} send={send} />
    <CustomerAndExpiryActions order={order} now={now} superAdmin={superAdmin} locked={locked || pendingMatch} send={send} />
  </article>;
}

function defaultLane(queue: BankTransferQueue): BankTransferLane {
  return lanes.find(lane => queue.counts[lane.id] > 0)?.id ?? 'check';
}

export function BankTransferWorkspace({ queue, exact, initialLane, workspace, locked, pendingMatch, superAdmin, canRelease, returnTo, send, onCredit, openUnmatched }: {
  queue: BankTransferQueue;
  exact: boolean;
  initialLane?: string;
  workspace: PaymentWorkspace;
  locked: boolean;
  pendingMatch: boolean;
  superAdmin: boolean;
  canRelease: boolean;
  returnTo: string;
  send: PaymentAction;
  onCredit: (input: GuidedBankCredit) => void;
  openUnmatched: () => void;
}) {
  const [selection, setSelection] = useState<{ lane: BankTransferLane; orderId?: string } | null>(null);
  const [timer, setTimer] = useState<{ serverTime: number; elapsed: number } | null>(null);
  useEffect(() => {
    const loadedAt = performance.now();
    const tick = window.setInterval(() => setTimer({ serverTime: queue.now, elapsed: performance.now() - loadedAt }), 30_000);
    return () => window.clearInterval(tick);
  }, [queue.now]);
  const effectiveNow = queue.now + (timer?.serverTime === queue.now ? timer.elapsed : 0);
  const selectedOrder = exact ? queue.orders[0] : queue.orders.find(order => order.id === selection?.orderId);
  const lane = selectedOrder?.lane === 'history' ? 'done' : selectedOrder?.lane ?? selection?.lane
    ?? lanes.find(item => item.id === initialLane)?.id ?? defaultLane(queue);
  const orders = exact ? queue.orders : queue.orders.filter(order => order.lane === lane);
  const selected = selectedOrder ?? orders[0];
  const title = lanes.find(item => item.id === lane)!.title;
  const visibleUnmatched = lane === 'problems' ? queue.unmatched : [];

  return <div className="min-w-0 space-y-4 text-[#14213D]">
    <nav aria-label="Bank transfer lanes" className="flex flex-wrap gap-2">
      {lanes.map(item => exact
        ? <Link key={item.id} href={withAdminReturnTo(`/admin/payments?view=incoming&lane=${item.id}`, returnTo)}
          className={`${button} gap-2 rounded-full`}>{item.title}<span>{queue.counts[item.id]}</span></Link>
        : <button type="button" key={item.id} aria-pressed={lane === item.id} disabled={pendingMatch}
          className={`${button} gap-2 rounded-full ${lane === item.id ? 'border-[#14213D] bg-[#14213D] text-white hover:bg-[#253554]' : 'bg-white'}`}
          onClick={() => setSelection({ lane: item.id })}>{item.title}<span>{queue.counts[item.id]}</span></button>)}
    </nav>
    <div className="grid min-w-0 items-start gap-5 min-[1180px]:grid-cols-[1.16fr_minmax(0,1fr)]">
      <section className={panel} aria-labelledby="bank-transfer-lane-heading">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#E4DACA] p-4">
          <h2 id="bank-transfer-lane-heading" className="text-base font-bold">{exact ? 'Selected bank transfer' : title}</h2>
          <p className="text-xs text-[#46536F]">Nepal time · soonest deadline first</p>
        </div>
        {orders.length || visibleUnmatched.length ? (
          <ul className="divide-y divide-[#E4DACA]">
            {orders.map(order => (
              <li key={order.id}>
                <button type="button" className={`grid min-h-11 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-l-[3px] p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#14213D] ${selected?.id === order.id ? 'border-[#A8232E] bg-[#FAF7F2]' : 'border-transparent hover:bg-[#FAF7F2]'}`}
                  disabled={pendingMatch} aria-pressed={selected?.id === order.id}
                  onClick={() => setSelection({ lane, orderId: order.id })}>
                  <span className="min-w-0">
                    <strong className="break-all text-sm">{order.orderNumber}</strong> <span className="text-sm">{order.customerName}</span>
                    <span className="mt-1 block text-sm text-[#46536F]">
                      {order.claim ? `Customer says paid ${money(order.claim.amountPaisa)} · ${dateTime.format(order.claim.submittedAt)}` : 'No payment claim received'}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col items-end gap-1 text-right">
                    <strong className="text-sm">{money(order.payablePaisa)}</strong><StatusPill order={order} now={effectiveNow} />
                  </span>
                </button>
              </li>
            ))}
            {visibleUnmatched.map(credit => <li key={credit.id} className="p-4">
              <Link className="inline-flex min-h-11 flex-wrap items-center gap-2 text-sm underline" href={withAdminReturnTo(`/admin/payments/exceptions/${encodeURIComponent(credit.id)}`, returnTo)}>
                <Landmark className="size-4 shrink-0" aria-hidden="true" /> Unmatched credit <strong className="break-all">{credit.reference}</strong>
              </Link>
            </li>)}
          </ul>
        ) : <p className="p-4 text-sm text-[#46536F]">There are no bank transfers in this lane.</p>}
        {!exact && queue.counts[lane] > orders.length + visibleUnmatched.length ? (
          <p className="border-t border-[#E4DACA] p-4 text-sm text-[#46536F]">Use Find an exact order number under More actions to open another transfer in this lane.</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-2xl border-t border-[#E4DACA] bg-[#F7F3EC] p-4">
          <p className="flex items-center gap-2 text-sm text-[#46536F]"><Landmark className="size-4 shrink-0" aria-hidden="true" /> Money arrived but you can’t find its order?</p>
          <button type="button" className={button} disabled={locked || pendingMatch} onClick={openUnmatched}>Record money with no order</button>
        </div>
      </section>
      {selected ? <BankTransferDetail key={selected.id} order={selected} now={effectiveNow} accounts={workspace.accounts}
        locked={locked} pendingMatch={pendingMatch} canRelease={canRelease} superAdmin={superAdmin}
        send={(action, revision, command) => {
          setSelection({ lane, orderId: selected.id });
          return send(action, revision, command);
        }}
        onCredit={command => {
          setSelection({ lane, orderId: selected.id });
          onCredit(command);
        }} /> : null}
    </div>
  </div>;
}
