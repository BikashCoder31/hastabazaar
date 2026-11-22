'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, CircleCheck, CircleHelp } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { AdminPageTitle } from './page-help';
import { FinanceAccessNotice } from './finance-access-notice';
import { useIncomingRecovery, type IncomingCommand } from './use-incoming-recovery';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { incomingParcelHref } from '@/lib/payments/incoming-links';
import type { readCourierCashWorkspace } from '@/lib/payments/manual-payment-workspace';

type Cash = Awaited<ReturnType<typeof readCourierCashWorkspace>>;
type Parcel = Cash['parcels'][number];
type Props = {
  cash: Cash;
  actorId: string;
  superAdmin: boolean;
  incomingHref?: string;
  returnTo?: string;
  payoutHref?: string;
  refundsHref?: string;
};

const card = 'rounded-[14px] border bg-card';
const input = 'mt-2 block min-h-11 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm';
const action = 'admin-button min-h-11';
const currency = new Intl.NumberFormat('en-NP', {
  style: 'currency', currency: 'NPR', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const deliveryDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', year: 'numeric',
});
const bankTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const money = (amount: number) => currency.format(amount / 100);

function paisa(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1] + (match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

const daysSince = (now: number, then: number) => Math.max(0, Math.floor((now - then) / 86_400_000));
const ageLabel = (days: number) => days === 0 ? 'Under 1 day' : days === 1 ? '1 day' : `${days} days`;

function CashTotals({ cash }: { cash: Cash }) {
  const { totals, differences, now } = cash;
  const differenceCount = Number(differences[0]?.total ?? 0);
  const oldest = totals.oldestDeliveredAt === null ? null : daysSince(now, totals.oldestDeliveredAt);
  const amounts = [
    { label: 'Collected by couriers', value: money(totals.collectedPaisa),
      detail: `${totals.delivered} delivered cash ${Number(totals.delivered) === 1 ? 'parcel' : 'parcels'}` },
    { label: 'Received in our bank', value: money(totals.matchedBankPaisa),
      detail: `${totals.matchedBankReceipts} matched bank ${Number(totals.matchedBankReceipts) === 1 ? 'credit' : 'credits'}` },
    { label: 'Still with couriers', value: money(totals.remainingPaisa),
      detail: oldest === null ? (Number(totals.outstanding) ? 'Delivery dates unrecorded' : 'No cash to match')
        : `Oldest delivery · ${ageLabel(oldest)}`,
      border: 'border-[#c9962f]', color: 'text-[#7a4e08]' },
    { label: 'Differences to check', value: differenceCount,
      detail: differenceCount ? 'Open Finance reviews' : 'No open courier cash reviews',
      color: 'text-destructive' },
  ];
  return <dl className="grid gap-3.5 lg:grid-cols-4">
    {amounts.map(({ label, value, detail, border, color }) => (
      <div key={label} className={`${card} min-w-0 space-y-1 px-4 py-3.5 xl:px-[18px] xl:py-4 ${border ?? ''}`}>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className={`break-words font-heading text-[23px] leading-tight font-medium tabular-nums xl:text-[28px] ${color ?? ''}`}>{value}</dd>
        <dd className="text-[13px] text-muted-foreground">{detail}</dd>
      </div>
    ))}
  </dl>;
}

function canSelect(parcel: Parcel) {
  return !parcel.correctionHeld && !parcel.personalInterest;
}

function ParcelGroups({
  cash, selected, toggle, superAdmin, locked, currentHref,
}: {
  cash: Cash;
  selected: Set<string>;
  toggle: (parcels: Parcel[], checked: boolean) => void;
  superAdmin: boolean;
  locked: boolean;
  currentHref?: string;
}) {
  const groups = new Map<string | null, Parcel[]>();
  for (const parcel of cash.parcels) {
    const group = groups.get(parcel.courierName);
    if (group) group.push(parcel);
    else groups.set(parcel.courierName, [parcel]);
  }
  if (!groups.size) return (
    <section className={`${card} p-4 sm:p-5`} aria-label="Delivered cash parcels">
      <h2 className="font-semibold">Delivered, cash not yet received</h2>
      <p className="mt-2 text-sm text-muted-foreground">There are no delivered courier cash parcels waiting to be matched.</p>
    </section>
  );
  return <div className="min-w-0 space-y-3.5">
    {[...groups].map(([courier, parcels]) => {
      const eligible = parcels.filter(canSelect);
      const allSelected = eligible.length > 0 && eligible.every(parcel => selected.has(parcel.id));
      return <section className={card} key={courier ?? ''} aria-label={`Delivered cash parcels · ${courier ?? 'Courier unrecorded'}`}>
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-[18px]">
          <h2 className="min-w-0 break-words font-semibold">Delivered, cash not yet received · {courier ?? 'Courier unrecorded'}</h2>
          {superAdmin && eligible.length && courier ? <button type="button" className={`${action} shrink-0 rounded-full`} disabled={locked}
            aria-label={`${allSelected ? 'Clear selection' : 'Select all'} · ${courier ?? 'Courier unrecorded'}`}
            onClick={() => toggle(eligible, !allSelected)}>
            {allSelected ? 'Clear selection' : 'Select all'}
          </button> : null}
        </header>
        <ul>
          {parcels.map(parcel => {
            const days = parcel.deliveredAt === null ? null : daysSince(cash.now, parcel.deliveredAt);
            const checked = selected.has(parcel.id);
            const detailHref = currentHref && incomingParcelHref(parcel.orderId, parcel.id, undefined, currentHref);
            const reference = <>
              {parcel.orderNumber}
              <span className="font-sans text-[13px] font-normal text-muted-foreground break-words">
                {[parcel.sellerName, parcel.deliveredAt === null ? 'Delivery date unrecorded' : `Delivered ${deliveryDate.format(parcel.deliveredAt)}`].filter(Boolean).join(' · ')}
              </span>
            </>;
            const referenceClass = 'inline-flex min-h-11 min-w-0 max-w-full flex-col justify-center rounded-sm font-mono text-sm font-bold break-words';
            return <li id={'courier-parcel-' + parcel.id} key={parcel.id}
              className={`grid items-center gap-x-2 gap-y-1 border-t px-4 py-2.5 sm:px-[18px] ${superAdmin && canSelect(parcel)
                ? 'grid-cols-[36px_minmax(0,1fr)_auto] sm:grid-cols-[36px_minmax(0,1fr)_auto_auto]'
                : 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto]'} ${checked ? 'bg-[#edf0f7]' : ''}`}>
              {superAdmin && canSelect(parcel) ? <label className="relative -ml-2 inline-flex size-11 cursor-pointer items-center justify-center rounded-md focus-within:ring-2 focus-within:ring-ring">
                <input type="checkbox" aria-label={`Match ${parcel.orderNumber}`} className="size-[21px] accent-primary"
                  checked={checked} disabled={locked} onChange={event => toggle([parcel], event.target.checked)} />
              </label> : null}
              <div className="min-w-0">
                {detailHref ? <Link href={detailHref} className={referenceClass + ' hover:underline'}>{reference}</Link>
                  : <span className={referenceClass}>{reference}</span>}
                {parcel.correctionHeld ? <p className="text-xs font-semibold text-destructive">Bank correction under review</p> : null}
                {parcel.personalInterest ? <p className="text-xs text-muted-foreground">Another eligible Super Admin can match this parcel.</p> : null}
              </div>
              {days === null ? <span /> : <span className={`justify-self-end rounded-full px-2 py-0.5 text-center text-xs font-semibold ${days >= 6
                ? 'bg-destructive text-white' : days >= 3 ? 'bg-[#f5e7c3] text-[#7a4e08]' : 'bg-[#eee5d5] text-muted-foreground'}`}>{ageLabel(days)}</span>}
              <b className={`text-sm tabular-nums sm:col-start-auto sm:text-right ${superAdmin && canSelect(parcel) ? 'col-start-2' : 'col-start-1'}`}>
                {money(parcel.remainingPaisa)}
              </b>
            </li>;
          })}
        </ul>
      </section>;
    })}
    {Number(cash.totals.outstanding) > cash.parcels.length ? (
      <p className="text-sm text-muted-foreground">Showing the first {cash.parcels.length} parcels.{currentHref ? ' Search by exact order number in Incoming payments to review older records.' : null}</p>
    ) : null}
  </div>;
}

const differenceLabels = {
  cod_remittance: 'Courier cash still to match',
  receipt_reversal: 'Bank correction',
  unallocated_credit: 'Unallocated courier bank credit',
} as const;

function Differences({ cash, reviewHref }: { cash: Cash; reviewHref?: string }) {
  return <section className={`${card} p-4 sm:p-5`} aria-labelledby="courier-cash-differences">
    <h2 id="courier-cash-differences" className="font-semibold">Differences to check</h2>
    {cash.differences.length ? <ul className="mt-2 divide-y">
      {cash.differences.map(entry => {
        const details = <>
          <span className="font-semibold">{differenceLabels[entry.kind]}</span>
          <span className="text-sm text-muted-foreground">{[
            entry.orderNumber, entry.receiptReference,
            entry.remainingPaisa ? money(entry.remainingPaisa) + ' outstanding' : null,
            deliveryDate.format(entry.createdAt),
          ].filter(Boolean).join(' · ')}</span>
        </>;
        const classes = 'flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2 break-all';
        return <li key={entry.id}>{reviewHref
          ? <Link href={reviewHref + '#' + encodeURIComponent(entry.id)} className={classes + ' hover:underline'}>{details}</Link>
          : <div className={classes}>{details}</div>}
        </li>;
      })}
    </ul> : <p className="mt-2 text-sm text-muted-foreground">No courier cash differences are open for review.</p>}
  </section>;
}

function AmountInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <div className="text-sm">
    <label htmlFor={id} className="block font-semibold">{label}</label>
    <span className="mt-2 flex h-[46px] min-w-0 items-center gap-2 rounded-[10px] border border-input bg-card px-3 font-normal focus-within:ring-2 focus-within:ring-ring">
      <span className="text-muted-foreground" aria-hidden="true">NPR</span>
      <input id={id} value={value} onChange={event => onChange(event.target.value)} inputMode="decimal" maxLength={20}
        className="h-full min-w-0 flex-1 outline-none" />
    </span>
  </div>;
}

function typedText(value: string, min: number, max: number) {
  return value.trim().length >= min && value.length <= max && !/[\p{Cc}<>]/u.test(value);
}

export function CourierCashWorkspace(props: Props) {
  if (props.incomingHref) return <CourierCashView key={props.actorId} {...props} incomingHref={props.incomingHref} />;
  const { cash, refundsHref, returnTo } = props;
  return <div className="space-y-[18px]">
    <AdminPageTitle><h1 className="text-[28px]">Courier cash</h1></AdminPageTitle>
    <CashTotals cash={cash} />
    <ParcelGroups cash={cash} selected={new Set()} toggle={() => {}} superAdmin={false} locked />
    <Differences cash={cash} />
    {refundsHref || returnTo ? <nav aria-label="Payment workspace links" className="flex flex-wrap gap-2">
      {refundsHref ? <Link className={action} href={refundsHref}>Refunds and funding</Link> : null}
      {returnTo ? <Link className={action} href={returnTo}>Back to previous view</Link> : null}
    </nav> : null}
  </div>;
}

function CourierCashView({ cash, actorId, superAdmin, incomingHref, returnTo, payoutHref, refundsHref }: Props & { incomingHref: string }) {
  const router = useRouter();
  const { receipts } = cash;
  const [selection, setSelection] = useState(() => new Set<string>());
  const [bankAmount, setBankAmount] = useState('');
  const [reference, setReference] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [allocationId, setAllocationId] = useState('');
  const [allocatedAmount, setAllocatedAmount] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [terms, setTerms] = useState('');
  const [confirmFee, setConfirmFee] = useState(false);
  const [activeCourier, setActiveCourier] = useState<string | null>();
  const [pending, setPending] = useState<IncomingCommand | null>(null);
  const [recorded, setRecorded] = useState<IncomingCommand | null>(null);

  const journal = useIncomingRecovery({
    actorId,
    storageKey: 'hastabazaar:cod-reconciliation:' + actorId,
    pending,
    onPending: setPending,
    onRecorded: reference => {
      if (reference.action !== 'reconcile_cod') return;
      setRecorded(pending);
      setSelection(previous => {
        const next = new Set(previous);
        next.delete(reference.sourceId);
        return next;
      });
      setAllocatedAmount(null);
      setAllocationId('');
      setReason('');
      setTerms('');
      setConfirmFee(false);
    },
  });

  useEffect(() => {
    function openPreviousFinanceLink() {
      const hash = window.location.hash;
      if (!hash || hash === '#courier-cash-differences' || hash.startsWith('#courier-parcel-') || hash === '#main-content') return;
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'incoming');
      router.replace(url.pathname + url.search + hash);
    }
    openPreviousFinanceLink();
    window.addEventListener('hashchange', openPreviousFinanceLink);
    return () => window.removeEventListener('hashchange', openPreviousFinanceLink);
  }, [router]);

  if (journal.accessDenied) return <FinanceAccessNotice message={journal.message} busy={journal.busy} onCheck={() => void journal.recover()} />;
  if (!journal.verified) return <section className="space-y-3">
    <output className="block" aria-live="polite">{journal.message || 'Checking current Finance access.'}</output>
    <button type="button" className={action} onClick={() => void journal.recover()}>Check current Finance access</button>
  </section>;

  const picked = cash.parcels.filter(parcel => canSelect(parcel) && selection.has(parcel.id));
  const parcel = picked.find(row => row.id === allocationId) ?? picked[0];
  const firstCourier = cash.parcels[0]?.courierName;
  const onlyCourier = cash.parcels.every(row => row.courierName === firstCourier) ? firstCourier : null;
  const statementCourier = parcel ? parcel.courierName : onlyCourier;
  const receipt = receipts.find(row => row.id === receiptId);
  const waitingForRefresh = recorded && (
    cash.parcels.some(row => row.id === recorded.input.jobId && String(row.version) === recorded.expectedRevision)
    || receipts.some(row => row.id === recorded.input.receiptId && row.revision === recorded.input.expectedReceiptRevision)
  );
  const locked = journal.busy || Boolean(pending) || journal.saved || !journal.ready || Boolean(waitingForRefresh);
  const gross = picked.reduce((sum, row) => sum + row.collectedPaisa, 0);
  const applied = picked.reduce((sum, row) => sum + row.actualCashPaisa, 0);
  const outstanding = picked.reduce((sum, row) => sum + row.remainingPaisa, 0);
  const approvedFees = picked.reduce((sum, row) => sum + row.approvedDeductionsPaisa, 0);
  const newCosts = cash.costs.filter(cost => cost.remainingPaisa > 0);
  const pickedIds = new Set(picked.map(row => row.id));
  const feesOutstanding = newCosts.filter(cost => pickedIds.has(cost.jobId)).reduce((sum, cost) => sum + cost.remainingPaisa, 0);
  const parcelCosts = newCosts.filter(cost => cost.jobId === parcel?.id);
  const parcelFees = parcelCosts.reduce((sum, cost) => sum + cost.remainingPaisa, 0);
  const expected = Math.max(0, outstanding - feesOutstanding);
  const received = paisa(bankAmount);
  const receiptMatches = receipt !== undefined && received === receipt.amountMinor;
  const available = receiptMatches ? receipt.unallocatedMinor : received;
  const difference = picked.length && available !== null ? available - expected : null;
  const overComplex = Boolean(parcel && (parcelFees > parcel.remainingPaisa || parcelCosts.length > 20));
  const maxAllocatable = parcel ? Math.max(0, parcel.remainingPaisa - parcelFees) : 0;
  const proposed = picked.length === 1 && available !== null ? Math.min(maxAllocatable, available) : null;
  const allocation = allocatedAmount === null ? proposed : paisa(allocatedAmount);
  const needsReceipt = allocation === null || allocation > 0;
  const validAllocation = allocation !== null && (allocation > 0 || parcelFees > 0)
    && allocation <= maxAllocatable && (!needsReceipt || receiptMatches && allocation <= receipt.unallocatedMinor);
  const canSave = Boolean(parcel && !locked && !overComplex && validAllocation && typedText(reference, 8, 120)
    && typedText(reason, 10, 1000) && (!parcelFees || confirmFee && typedText(terms, 8, 500)));
  const hasMultiple = picked.length > 1;
  const noteStyle = difference === null ? 'bg-[#e2e7f3] text-[#243a63]' : difference === 0 ? 'bg-[#e4f2e8] text-[#245936]' : 'bg-[#f9e7e7] text-[#891f2a]';
  const NoteIcon = difference === null ? CircleHelp : difference === 0 ? CircleCheck : CircleAlert;
  const initialNote = 'Tick parcels and enter the amount.';
  const currentHref = returnTo ? withAdminReturnTo('/admin/payments', returnTo) : '/admin/payments';

  function clearAllocation() {
    setAllocationId('');
    setAllocatedAmount(null);
    setReason('');
    setTerms('');
    setConfirmFee(false);
  }
  function toggle(parcels: Parcel[], checked: boolean) {
    if (!parcels.length) return;
    const courier = parcels[0].courierName;
    const next = new Set(picked.length && activeCourier === courier && (courier || !checked) ? pickedIds : []);
    for (const item of parcels) {
      if (checked) next.add(item.id);
      else next.delete(item.id);
    }
    if (!parcel || !next.has(parcel.id)) clearAllocation();
    if (activeCourier !== undefined && activeCourier !== courier) {
      setBankAmount('');
      setReference('');
      setReceiptId('');
    }
    setActiveCourier(courier);
    setSelection(next);
  }
  function save() {
    if (!canSave || !parcel || allocation === null) return;
    void journal.send('reconcile_cod', String(parcel.version), {
      jobId: parcel.id,
      receiptId: allocation > 0 ? receipt?.id : null,
      expectedReceiptRevision: allocation > 0 ? receipt?.revision : null,
      amountPaisa: allocation,
      cashRecordId: null,
      deductions: parcelCosts.map(cost => ({ courierCostId: cost.id, amountPaisa: cost.remainingPaisa, termsEvidence: terms })),
      evidenceReference: reference,
      reason,
    });
  }

  return <div className="space-y-[18px]">
    <AdminPageTitle><h1 className="text-[28px]">Courier cash</h1></AdminPageTitle>
    <CashTotals cash={cash} />
    {journal.message ? <output className={`${card} block p-4 text-sm`} aria-live="polite">{journal.message}</output> : null}
    {journal.saved || pending ? <div className={`${card} flex flex-wrap gap-2 p-4`}>
      <button type="button" disabled={journal.busy} className={action} onClick={() => void journal.recover()}>Check original COD outcome</button>
      {pending && journal.canRetry ? <button type="button" disabled={journal.busy} className={action}
        onClick={() => void journal.send(pending.action, pending.expectedRevision, pending.input)}>Retry the same COD operation</button> : null}
      {journal.unrecorded ? <button type="button" disabled={journal.busy} className={action} onClick={journal.restart}>Start a new reviewed COD attempt</button> : null}
    </div> : null}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <ParcelGroups cash={cash} selected={pickedIds} toggle={toggle} superAdmin={superAdmin} locked={locked} currentHref={currentHref} />
      {superAdmin ? <aside className="min-w-0 space-y-3.5" aria-label="Courier payment">
        <section className={`${card} space-y-4 p-5`} aria-labelledby="record-courier-payment">
          <h2 id="record-courier-payment" className="text-[17px] font-semibold">Record a courier payment</h2>
          <fieldset className="min-w-0 space-y-4" disabled={locked}>
            <AmountInput label="Amount received in our bank" value={bankAmount} onChange={setBankAmount} />
            <label className="block text-sm font-semibold">Courier’s statement or bank reference
              <input value={reference} onChange={event => setReference(event.target.value)} maxLength={120}
                placeholder={statementCourier ? `${statementCourier} statement number` : 'Statement number or bank reference'}
                className={`${input} font-normal`} />
            </label>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-[7px] border-t pt-3 text-sm tabular-nums">
              <dt className="text-muted-foreground">Parcels ticked</dt><dd>{picked.length}</dd>
              <dt className="text-muted-foreground">Cash they collected</dt><dd>{money(gross)}</dd>
              <dt className="text-muted-foreground">Recorded courier fees</dt><dd>− {money(approvedFees + feesOutstanding)}</dd>
              {applied ? <><dt className="text-muted-foreground">Already matched</dt><dd>− {money(applied)}</dd></> : null}
              <dt className="font-semibold">Should still arrive</dt><dd className="font-semibold">{money(expected)}</dd>
            </dl>
            <output className={`flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm ${noteStyle}`}>
              <NoteIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{difference === null ? <><strong>{initialNote}</strong> The difference is worked out for you.</>
                : difference === 0 ? <strong>Matches the recorded balance.</strong>
                : difference < 0 ? <><strong>{money(-difference)} short.</strong> You can record the verified amount. The unpaid balance goes to Differences to check.</>
                : <><strong>{money(difference)} more than expected.</strong> You can match the parcel balance. The excess stays on the bank credit for Finance review.</>}</span>
            </output>
            {parcel ? <div className="space-y-3 border-t pt-3">
              <label className="block text-sm font-semibold">Verified bank credit
                <select value={receiptId} onChange={event => setReceiptId(event.target.value)} className={`${input} font-normal`}>
                  <option value="">Choose the independently verified credit</option>
                  {receipts.map(row => <option key={row.id} value={row.id}>{row.transactionIdentity} · {money(row.unallocatedMinor)} available</option>)}
                </select>
              </label>
              {receipt ? <p className="text-sm text-muted-foreground">Bank time {bankTime.format(receipt.bankAt)} · {money(receipt.amountMinor)} originally received{receiptMatches ? '' : ' · Enter this exact received amount above.'}</p>
                : <Link className="inline-flex min-h-11 items-center text-sm font-semibold underline" href={incomingHref}>Verify a bank credit in Incoming payments</Link>}
              {hasMultiple ? <label className="block text-sm font-semibold">Parcel to match now
                <select value={parcel.id} onChange={event => { clearAllocation(); setAllocationId(event.target.value); }} className={`${input} font-normal`}>
                  {picked.map(row => <option key={row.id} value={row.id}>{row.orderNumber}</option>)}
                </select>
              </label> : null}
              <AmountInput label={`Amount to match to ${parcel.orderNumber}`}
                value={allocatedAmount ?? (proposed === null ? '' : String(proposed / 100))} onChange={setAllocatedAmount} />
              <p className="text-sm text-muted-foreground">Up to {money(maxAllocatable)} after the recorded fees. Review and save each parcel against the same bank credit.</p>
              {overComplex ? <Link className="inline-flex min-h-11 items-center text-sm font-semibold underline"
                href={incomingParcelHref(parcel.orderId, parcel.id, undefined, currentHref)}>Review the individual courier costs</Link> : null}
              {parcelFees && !overComplex ? <>
                <div className="text-sm"><p className="font-semibold">Documented costs for this parcel</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">{parcelCosts.map(cost => <li key={cost.id} className="break-words">{cost.evidenceReference} · {money(cost.remainingPaisa)}</li>)}</ul>
                </div>
                <label className="block text-sm font-semibold">Original terms evidence for the courier fees
                  <input value={terms} onChange={event => setTerms(event.target.value)} maxLength={500} className={`${input} font-normal`} />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={confirmFee} onChange={event => setConfirmFee(event.target.checked)} />
                  I verified these exact company-paid courier fees.
                </label>
              </> : null}
              <label className="block text-sm font-semibold">How this credit matches the parcel
                <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className={`${input} font-normal`} />
              </label>
            </div> : null}
            <button type="button" disabled={!canSave} onClick={save} className="admin-primary min-h-11 w-full disabled:opacity-50">
              {parcel ? `${allocation === 0 && parcelFees ? 'Save verified fees for' : 'Save match for'} ${parcel.orderNumber}` : 'Save and match'}
            </button>
            {!parcel ? <p className="text-[13px] text-muted-foreground">Tick the parcels this payment covers, one courier at a time.</p> : null}
            {parcel && !canSave && !locked && !overComplex ? <p className="text-[13px] text-muted-foreground">
              Choose a verified credit for cash, enter the parcel amount and add the evidence reference and matching reason.
            </p> : null}
          </fieldset>
        </section>
        <section className={`${card} space-y-1.5 px-5 py-4 text-sm`}>
          <h2 className="font-semibold">Why this matters</h2>
          <p className="text-muted-foreground">Matching the company receipt and any approved fees clears the courier cash requirement for seller earnings.</p>
        </section>
      </aside> : null}
    </div>
    <Differences cash={cash} reviewHref={incomingHref} />
    <nav aria-label="Payment workspace links" className="flex flex-wrap gap-2">
      <Link className={action} href={incomingHref}>Incoming payments and bank receipts</Link>
      {payoutHref ? <Link className={action} href={payoutHref}>Payout transfers</Link> : null}
      {refundsHref ? <Link className={action} href={refundsHref}>Refunds and funding</Link> : null}
      {returnTo ? <Link className={action} href={returnTo}>Back to previous view</Link> : null}
    </nav>
  </div>;
}
