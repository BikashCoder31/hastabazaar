'use client';

import { Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { CustomerActingChip, type CustomerActor } from '@/components/storefront/customer-acting-chip';
import { useBrowserReady } from '@/hooks/use-browser-ready';
import { usePaymentAttempt } from '@/hooks/use-payment-attempt';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import type { getCustomerManualPayment } from '@/lib/payments/manual-receipts';

type Payment = NonNullable<Awaited<ReturnType<typeof getCustomerManualPayment>>>;
type Draft = { amount: string; date: string; reference: string; note: string; files: { id: string; name: string }[] };
type ClaimProps = { payment: Payment; actorId: string; orderSummary?: ReactNode };

const card = 'min-w-0 rounded-2xl border border-[#E3D6C3] bg-[#FDFAF5] p-6';
const control = 'min-h-11 w-full min-w-0 rounded-xl border border-[#D6C3A6] bg-white px-3.5 py-2.5 text-base text-[#14213D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-[#D6C3A6] px-3 text-sm font-semibold text-[#14213D] hover:bg-[#F5EFE3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-60';
const primaryButton = 'inline-flex min-h-[50px] w-full items-center justify-center rounded-xl bg-[#14213D] px-5 text-sm font-semibold text-white hover:bg-[#243656] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-60 sm:w-auto sm:min-w-[220px]';
const textLink = 'inline-flex min-h-11 items-center font-semibold text-[#A8232E] underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';
const timestamp = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' });
const deadline = new Intl.DateTimeFormat('en-NP', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
const hours = new Intl.NumberFormat('en-NP', { style: 'unit', unit: 'hour', unitDisplay: 'long' });

const statuses: Readonly<Record<string, { label: string; actor: CustomerActor } | undefined>> = {
  awaiting_payment: { label: 'Waiting to pay', actor: 'you' },
  partially_paid: { label: 'Partial payment verified', actor: 'you' },
  under_review: { label: 'Checking payment', actor: 'hastabazaar' },
  paid: { label: 'Paid', actor: 'done' },
  paid_pending_release: { label: 'Paid · preparing the order for release', actor: 'hastabazaar' },
  expired: { label: 'Payment window closed', actor: 'done' },
  cancelled: { label: 'Order cancelled', actor: 'done' },
  reconciliation_required: { label: 'Hastabazaar is checking a payment discrepancy', actor: 'hastabazaar' },
};

const claimLabels: Record<string, string> = {
  submitted: 'Submitted for review',
  clarified: 'Updated information sent',
  needs_information: 'More information requested',
  rejected: 'Transfer could not be verified',
  withdrawn: 'Claim withdrawn',
  matched: 'Matched to a verified payment',
};
const claimSavedNotice = 'Claim saved for review. This does not confirm receipt of payment.';

function amount(text: string) {
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(text.trim()))
    throw new Error('Enter a positive NPR amount with no more than two decimal places.');
  const [rupees, paise = ''] = text.trim().split('.');
  const value = Number(BigInt(rupees) * BigInt(100) + BigInt(paise.padEnd(2, '0')));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Enter a valid positive payment amount.');
  return value;
}

const money = (paisa: number) => formatPaisaExact(paisa).replace(/\.00$/, '');
const transferAmount = (paisa: number) => money(paisa).replace(/^NPR |,/g, '');

function useTransferTime(payment: Payment, waiting: boolean) {
  const remaining = Math.max(0, payment.deadlineAt - payment.now);
  const [tick, setTick] = useState({ deadline: payment.deadlineAt, anchor: payment.now, elapsed: 0 });
  useEffect(() => {
    if (!waiting || !Number.isFinite(remaining) || remaining <= 0) return;
    const start = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - start;
      setTick({ deadline: payment.deadlineAt, anchor: payment.now, elapsed });
      if (elapsed >= remaining) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [payment.deadlineAt, payment.now, remaining, waiting]);
  const elapsed = tick.anchor === payment.now && tick.deadline === payment.deadlineAt ? tick.elapsed : 0;
  return Math.max(0, remaining - elapsed);
}

function TransferCountdown({ remaining }: { remaining: number }) {
  const minutes = Math.floor(remaining / 60_000);
  const boxes = [
    ['hours', Math.floor(minutes / 60)],
    ['minutes', minutes % 60],
  ] as const;
  return (
    <div role="timer" aria-label="Time left to transfer" className="flex shrink-0 flex-wrap gap-2.5">
      {minutes === 0 ? <p className="rounded-xl bg-white/10 px-3 py-2 text-sm">Less than one minute</p> :
        boxes.map(([unit, value]) => (
          <div key={unit} className="grid min-w-16 place-items-center rounded-xl bg-white/10 px-2 py-2.5">
            <strong className="font-heading text-[2rem] leading-none tabular-nums">{String(value).padStart(2, '0')}</strong>
            <span className="mt-1 text-xs text-[#D9E0EC]">{unit}</span>
          </div>
        ))}
    </div>
  );
}

function BankInstructions({ payment, active }: { payment: Payment; active: boolean }) {
  const [feedback, setFeedback] = useState('');
  const { instruction, remainingPaisa } = payment;
  const account = instruction.account;
  const due = active ? remainingPaisa : instruction.amountPaisa;
  const rows = [
    { label: 'Account name', value: account.holder },
    { label: 'Bank & branch', value: [account.bank, account.branch].filter(Boolean).join(' · ') },
    { label: 'Account number', value: account.accountNumber, copy: account.accountNumber },
    { label: 'Amount', value: money(due), copy: transferAmount(due) },
    { label: 'Remarks', value: instruction.reference, copy: instruction.reference },
  ];

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`Copied ${label.toLowerCase()}. Paste it into your bank app.`);
    } catch {
      setFeedback(`Select the ${label.toLowerCase()} shown above and copy it manually.`);
    }
  }

  return (
    <>
      <dl className="divide-y divide-[#E9DECE] text-sm leading-relaxed">
        {rows.map(({ label, value, copy: copyValue }) => (
          <div key={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-3 py-2.5">
            <dt className="text-[#465573]">{label}</dt>
            <dd className="flex min-w-0 items-center justify-end gap-2">
              <span className="min-w-0 text-right font-semibold [overflow-wrap:anywhere]">{value}</span>
              {active && copyValue ? <button type="button" aria-label={`Copy ${label.toLowerCase()}`} className={secondaryButton + ' shrink-0'} onClick={() => void copy(label, copyValue)}>Copy</button> : null}
            </dd>
          </div>
        ))}
      </dl>
      <output className="block text-sm font-medium empty:hidden">{feedback}</output>
    </>
  );
}

export function ManualPaymentClaim(props: ClaimProps) {
  const ready = useBrowserReady();
  return ready
    ? <ManualPaymentClaimScope key={JSON.stringify([props.actorId, props.payment.orderId])} {...props} />
    : <output className="block py-6">Loading your payment…</output>;
}

function ManualPaymentClaimScope({ payment, actorId, orderSummary }: ClaimProps) {
  const router = useRouter();
  const key = `hastabazaar:payment-claim:${actorId}:${payment.orderId}`;
  const claim = usePaymentAttempt({ actorId, sourceId: payment.orderId, action: 'claim', storageKey: key, endpoint: `/api/account/payments/${payment.orderId}/claim` });
  const evidence = usePaymentAttempt({ actorId, sourceId: payment.orderId, action: 'upload', storageKey: key + ':upload', legacyKey: key, endpoint: `/api/account/payments/${payment.orderId}/files` });
  const [draft, setDraft] = useState<Draft>(() => ({
    amount: payment.claim ? transferAmount(payment.claim.amountPaisa) : '',
    date: payment.claim?.paymentDate ?? '',
    reference: payment.claim?.bankReference ?? '',
    note: payment.claim?.note ?? '',
    files: payment.claim?.evidenceIds.map(id => ({ id, name: 'Retained payment evidence' })) ?? [],
  }));
  const [file, setFile] = useState<File | null>(null);
  const busy = claim.busy || evidence.busy;
  const verified = payment.state === 'paid' || payment.state === 'paid_pending_release';
  const editable = !verified && payment.state !== 'reconciliation_required';
  const locked = busy || claim.pending;
  const waiting = payment.state === 'awaiting_payment' || payment.state === 'partially_paid';
  const remainingTime = useTransferTime(payment, waiting);
  const transferOpen = waiting && remainingTime > 0 && payment.remainingPaisa > 0 && !payment.instruction.requiresAccountReview;
  const durationHours = (payment.deadlineAt - payment.issuedAt) / 3_600_000;
  const transferWindowLabel = transferOpen && payment.state === 'awaiting_payment' &&
    Number.isInteger(durationHours) && durationHours > 0 ? `Transfer within ${hours.format(durationHours)}` : null;
  const closedOrder = payment.state === 'expired' || payment.state === 'cancelled';
  const needsInformation = payment.state === 'under_review' && payment.claim?.state === 'needs_information';
  const status = needsInformation ? { label: 'More information needed', actor: 'you' as const } :
    waiting && payment.instruction.requiresAccountReview ? { label: 'Bank details need review', actor: 'hastabazaar' as const } :
    waiting && remainingTime === 0 ? { label: 'Transfer deadline passed', actor: 'hastabazaar' as const } :
      statuses[payment.state] ?? { label: 'Payment status unavailable', actor: 'hastabazaar' as const };
  const amountToShow = verified ? payment.receivedPaisa : waiting ? payment.remainingPaisa : payment.duePaisa;
  const orderHref = '/orders/' + encodeURIComponent(payment.orderNumber);
  const change = (field: 'amount' | 'date' | 'reference' | 'note', value: string) => setDraft(d => ({ ...d, [field]: value }));

  async function upload(recover = false) {
    const saved = await (recover ? evidence.recover() : evidence.send(requestId => {
      if (!file) throw new Error('Choose the original optional file.');
      const form = new FormData();
      form.set('requestId', requestId);
      form.set('file', file);
      return form;
    }));
    if (saved) {
      const id = String(saved.result.id), name = String(saved.result.name);
      setDraft(d => ({ ...d, files: d.files.some(f => f.id === id) ? d.files : [...d.files, { id, name }] }));
      setFile(null);
    }
  }

  async function submit() {
    const saved = await claim.send(requestId => JSON.stringify({
      requestId,
      expectedRevision: payment.claim ? String(payment.claim.revision) : null,
      input: {
        amountPaisa: amount(draft.amount),
        paymentDate: draft.date,
        bankReference: draft.reference.trim() || null,
        note: draft.note,
        evidenceIds: draft.files.map(f => f.id),
      },
    }));
    if (saved) {
      claim.setMessage(claimSavedNotice);
      router.refresh();
    }
  }

  async function recoverClaim() {
    if (await claim.recover()) router.refresh();
  }

  const recovery = claim.pending ? <button type="button" disabled={busy} onClick={() => void recoverClaim()} className={secondaryButton}>Check original claim outcome</button> : null;
  const uploadButton = evidence.pending ? <button type="button" disabled={busy} className={secondaryButton} onClick={() => void upload(true)}>Check original upload outcome</button> : null;
  if (claim.denied || evidence.denied) {
    return (
      <section className={card + ' space-y-3'}>
        <output aria-live="polite" className="block">{claim.denied ? claim.message : evidence.message}</output>
        {recovery}
        {uploadButton}
      </section>
    );
  }

  return (
    <section aria-labelledby="payment-title" className="grid min-w-0 gap-7 text-[#14213D] lg:grid-cols-[minmax(0,2.06fr)_minmax(0,1fr)] lg:gap-10">
      <div className="min-w-0 space-y-[18px]">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2.5 text-sm text-[#655848] [overflow-wrap:anywhere]">
          <Link href="/account/orders" prefetch={false} className="inline-flex min-h-11 items-center text-[#465573] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]">My orders</Link>
          <span aria-hidden="true">/</span><span aria-current="page">Pay {payment.orderNumber}</span>
        </nav>

        <div className="flex min-w-0 flex-col gap-5 rounded-[18px] bg-[#14213D] p-7 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h1 id="payment-title" className="sr-only">Payment for {payment.orderNumber}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <CustomerActingChip actor={status.actor} yourTurn />
              <p className="text-sm text-[#D9E0EC]">{transferWindowLabel ?? status.label}</p>
            </div>
            <p className="mt-1.5 font-heading text-[2.5rem] leading-none tabular-nums">{money(amountToShow)}</p>
            <p className="mt-2 text-sm text-[#D9E0EC]">
              Order {payment.orderNumber} · {waiting ? 'by ' : 'original deadline '}
              <time dateTime={new Date(payment.deadlineAt).toISOString()} title="Nepal time">{deadline.format(payment.deadlineAt)}</time>
            </p>
          </div>
          {transferOpen ? <TransferCountdown remaining={remainingTime} /> : null}
        </div>

        {payment.state === 'under_review' && !needsInformation ? (
          <section className={card + ' space-y-1'}>
            <h2 className="font-semibold">We’re checking your transfer</h2>
            <p className="text-sm leading-relaxed text-[#465573]">We’ll verify that the money reached Hastabazaar before the seller starts preparing your order. You don’t need to pay again.</p>
          </section>
        ) : null}
        {verified ? (
          <section className={card + ' space-y-1'}>
            <h2 className="font-semibold">Payment received</h2>
            <p className="text-sm leading-relaxed text-[#465573]">{payment.state === 'paid'
              ? 'Your payment is verified. There’s nothing to pay on delivery.'
              : 'Your payment is verified. Hastabazaar is checking the order before the seller can prepare it.'}</p>
            <Link href={orderHref} prefetch={false} className={textLink}>Track this order</Link>
          </section>
        ) : null}
        {closedOrder ? <p className={card + ' text-sm leading-relaxed'}>This order can’t reopen. If you already sent money, tell us about the transfer below so Hastabazaar can review it.</p> : null}
        {payment.state === 'reconciliation_required' ? <p className={card + ' text-sm leading-relaxed'}>Your recorded payment stays in your order history. No additional payment is due while Hastabazaar checks the discrepancy.</p> : null}

        {transferOpen ? (
          <section className={card + ' space-y-2'} aria-labelledby="transfer-title">
            <h2 id="transfer-title" className="text-lg font-bold">1 · Transfer to Hastabazaar</h2>
            <p className="text-sm leading-relaxed text-[#465573]">Pay from your bank app or at the counter. Use the details saved for this order.</p>
            <BankInstructions payment={payment} active />
          </section>
        ) : (
          <details className={card}>
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]">Original company bank instructions</summary>
            {payment.instruction.requiresAccountReview ? <p className="pb-2 text-sm leading-relaxed">Hastabazaar needs to check these bank details. Contact us before sending another transfer.</p> : null}
            <BankInstructions payment={payment} active={false} />
          </details>
        )}

        {payment.receivedPaisa > 0 || payment.duePaisa !== payment.instruction.amountPaisa || payment.cutoffAt > payment.deadlineAt ? (
          <section className={card + ' space-y-2'} aria-labelledby="payment-amount-details">
            <h2 id="payment-amount-details" className="font-semibold">Payment details</h2>
            <p className="text-sm leading-relaxed text-[#465573]">Originally due {money(payment.instruction.amountPaisa)} · Verified {money(payment.receivedPaisa)}</p>
            <p className="text-sm leading-relaxed text-[#465573]">Current order amount {money(payment.duePaisa)} · Still unpaid {money(payment.remainingPaisa)}</p>
            {payment.duePaisa !== payment.instruction.amountPaisa ? <p className="text-sm">An approved cancellation changed the amount due. Hastabazaar reviews any excess payment separately.</p> : null}
            {payment.cutoffAt > payment.deadlineAt ? <p className="text-sm">Recorded review cutoff {timestamp.format(payment.cutoffAt)} Nepal time.</p> : null}
          </section>
        ) : null}

        {payment.claim ? (
          <section className={card + ' space-y-2'} aria-labelledby="saved-claim-title">
            <h2 id="saved-claim-title" className="font-semibold">Saved claim</h2>
            <p className="text-sm">{money(payment.claim.amountPaisa)} · {payment.claim.paymentDate} · {claimLabels[payment.claim.state] ?? 'Awaiting an update'}</p>
            <p className="text-sm text-[#465573]">First submitted {timestamp.format(payment.claim.firstSubmittedAt)} Nepal time</p>
            {payment.claim.reviewReason ? <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{payment.claim.reviewReason}</p> : null}
            {payment.claim.nextUpdateAt ? <p className="text-sm">Next review update by {timestamp.format(payment.claim.nextUpdateAt)} Nepal time.</p> : null}
          </section>
        ) : null}

        {editable ? (
          <form className={card + ' space-y-3.5'} onSubmit={event => {
            event.preventDefault();
            if (!busy && (!claim.pending || claim.canRetry)) void submit();
          }} aria-labelledby="claim-title">
            <h2 id="claim-title" className="text-lg font-bold">{payment.claim ? 'Update your saved claim' : transferOpen ? '2 · Tell us you’ve paid' : 'Tell us about a transfer'}</h2>
            <fieldset disabled={locked} className="grid min-w-0 gap-x-3 gap-y-3.5 sm:grid-cols-2">
              <label className="min-w-0 space-y-1.5 text-sm font-semibold"><span>Amount paid (NPR)</span>
                <input required inputMode="decimal" placeholder={transferAmount(payment.remainingPaisa)} value={draft.amount} onChange={e => change('amount', e.target.value)} className={control} />
              </label>
              <label className="min-w-0 space-y-1.5 text-sm font-semibold"><span>Date paid</span>
                <input required type="date" value={draft.date} onChange={e => change('date', e.target.value)} className={control + ' block min-h-11'} />
              </label>
              <label className="min-w-0 space-y-1.5 text-sm font-semibold"><span>Bank reference <span className="font-normal text-[#655848]">(optional)</span></span>
                <input value={draft.reference} maxLength={160} placeholder="From your bank receipt" onChange={e => change('reference', e.target.value)} className={control} />
              </label>
              <div className="min-w-0 space-y-1.5 text-sm">
                <p className="font-semibold">Screenshot <span className="font-normal text-[#655848]">(optional)</span></p>
                <label className="relative flex min-h-12 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-[#D6C3A6] px-3.5 font-semibold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#14213D] has-disabled:cursor-not-allowed has-disabled:opacity-60">
                  <Upload className="size-4 shrink-0" aria-hidden="true" />
                  <span>Add receipt image</span>
                  <input type="file" aria-label="Add receipt image" aria-describedby="payment-file-types" accept="application/pdf,image/jpeg,image/png" disabled={locked || evidence.pending || draft.files.length >= 5}
                    onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
                </label>
                <p id="payment-file-types" className="text-xs text-[#655848]">PDF, JPG or PNG, up to 5 MB.</p>
              </div>
              <label className="min-w-0 space-y-1.5 text-sm font-semibold sm:col-span-2"><span>Note <span className="font-normal text-[#655848]">(optional)</span></span>
                <textarea rows={1} value={draft.note} maxLength={2000} onChange={e => change('note', e.target.value)} className={control + ' block min-h-11'} />
              </label>
            </fieldset>
            {file ? <p className="text-sm [overflow-wrap:anywhere]">{file.name}</p> : null}
            {file && (!evidence.pending || evidence.canRetry) ? <button type="button" disabled={locked} className={secondaryButton} onClick={() => void upload()}>{evidence.pending ? 'Retry the same upload' : 'Save optional evidence'}</button> : null}
            {draft.files.length ? <ul className="space-y-1">{draft.files.map(f => (
              <li key={f.id} className="[overflow-wrap:anywhere]"><a className={textLink} href={`/api/account/payment-files/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a></li>
            ))}</ul> : null}
            {!claim.pending || claim.canRetry ? <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving…' : claim.pending ? 'Retry the same claim' : payment.claim ? 'Save claim clarification' : "I've paid"}</button> :
              <p className="text-sm">Check the original claim’s saved outcome before sending another claim.</p>}
            <p className="text-sm leading-relaxed text-[#655848]">We check that the money arrived before confirming payment. You can send the amount and date without a screenshot.</p>
          </form>
        ) : null}

        {uploadButton ? <div className={card + ' space-y-3 text-sm'}><p>{editable
          ? 'The optional upload is still unconfirmed. You can send the amount and date while we check it.'
          : 'Check whether your original optional upload was saved.'}</p>{uploadButton}</div> : null}
        {recovery}
        {claim.message && (!verified || claim.message !== claimSavedNotice) ?
          <output aria-live="polite" className="block rounded-xl border border-[#E3D6C3] bg-[#FDFAF5] p-3">{claim.message}</output> : null}
        {evidence.message ? <output aria-live="polite" className="block rounded-xl border border-[#E3D6C3] bg-[#FDFAF5] p-3">{evidence.message}</output> : null}
        <button type="button" onClick={() => router.refresh()} className={textLink}>Refresh saved payment status</button>
      </div>

      <aside aria-label="Order and bank transfer help" className="min-w-0 space-y-3.5">
        {orderSummary}
        <section className={card + ' space-y-2'}>
          <h2 className="font-semibold">If the time runs out</h2>
          <p className="text-sm leading-relaxed text-[#465573]">If the payment window closes before your payment is verified, the order is cancelled and nothing is owed. If you already sent money, tell us so we can check the transfer and arrange any refund owed.</p>
          <Link href="/help#bank-transfer" className={textLink}>Paying by bank transfer</Link>
          <Link href={orderHref} prefetch={false} className={textLink + ' ml-3'}>Order details</Link>
        </section>
      </aside>
    </section>
  );
}
