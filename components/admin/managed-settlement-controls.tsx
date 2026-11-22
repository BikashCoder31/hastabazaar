'use client';
import {LiveManagedFinanceControls} from './live-managed-finance-controls';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ManagedFinanceMaker, ManagedFinanceWorkspace, ManagedPaymentRow } from '@/lib/managed-commerce/finance-workspace';
import { managedFinanceActions, managedFinanceBaseKeys, type ManagedFinanceAction } from '@/lib/managed-commerce/finance-contract';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { nepalDateTimeInput, parseNepalDateTime } from '@/lib/incentives/presentation';
import { createManagedFinanceAttempt, financeAttemptKey, readManagedFinanceAttempts, retainManagedFinanceAttempt,
  verifiedManagedFinanceReceipt, type RetainedManagedFinanceAttempt } from './managed-finance-attempt';

const money = (value: number) => `NPR ${(value / 100).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu',dateStyle:'medium',timeStyle:'short' }).format(value);
const titles: Record<ManagedFinanceAction,string> = { release_eligibility: 'Release mature earnings', prepare_sale_linked_payout: 'Prepare simulated payment',
  approve_sale_linked_payout: 'Approve payment', record_sale_linked_payment: 'Record simulated payment', cancel_sale_linked_payout: 'Cancel unpaid payment' };

function FinanceForm({ action, maker, payment, asOf, disabled, onAttempt }: {
  action: ManagedFinanceAction; maker: ManagedFinanceMaker; payment?: ManagedPaymentRow; asOf: number; disabled: boolean;
  onAttempt: (action: ManagedFinanceAction, body: Record<string,unknown>, config: NonNullable<ReturnType<typeof usePublishedFormConfig>['config']>) => Promise<void>;
}) {
  const form = usePublishedFormConfig(managedFinanceActions[action].formId);
  const [error,setError] = useState('');
  async function submit(event: {preventDefault():void;currentTarget:HTMLFormElement}) {
    event.preventDefault();
    if (disabled || !form.config || !form.canSubmit) return;
    try {
      const element = event.currentTarget;
      const data = new FormData(element);
      const custom = readConfiguredSubmission(element,form.config,managedFinanceBaseKeys);
      const body: Record<string,unknown> = { reason: data.get('reason'), ...configuredJsonPayload(form.config,custom.answers,managedFinanceBaseKeys) };
      if (action === 'prepare_sale_linked_payout') Object.assign(body, { destinationReference: maker.preview.receivingReference,
        scheduledFor: parseNepalDateTime(typeof data.get('scheduledFor') === 'string' ? data.get('scheduledFor') as string : ''), expectedAmountPaisa: maker.preview.amountPaisa, expectedSnapshot: maker.preview.snapshotDigest });
      if (payment) Object.assign(body,{ payoutId: payment.id, expectedStatus: payment.status });
      if (action === 'record_sale_linked_payment') body.providerReference = data.get('providerReference');
      setError('');
      await onAttempt(action,body,form.config);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Review the form and try again.'); }
  }
  return <form onSubmit={submit} data-form-id={action === 'release_eligibility' ? 'staff.managed-eligibility-release' : action === 'prepare_sale_linked_payout' ? 'staff.managed-payout-preparation' : 'staff.managed-payout-action'} className="min-w-0 space-y-3 rounded-xl border p-4" aria-label={`${titles[action]} for ${maker.name}`}>
    <h4 className="font-semibold">{titles[action]}</h4>
    {action === 'prepare_sale_linked_payout' ? <>
      <p>Reviewed balance: <strong>{money(maker.preview.amountPaisa)}</strong></p>
      <p className="break-all text-sm">Receiving reference: {maker.preview.receivingReference || 'Review required'}</p>
      <label className="block text-sm">Processing date and time · Nepal time<input required name="scheduledFor" type="datetime-local"
        defaultValue={nepalDateTimeInput(Math.ceil(asOf/60000)*60000)} className="mt-1 w-full rounded-md border bg-background p-2" /></label>
    </> : null}
    {action === 'record_sale_linked_payment' ? <label className="block text-sm">Simulated payment reference<input name="providerReference" required minLength={3} maxLength={191} className="mt-1 w-full rounded-md border bg-background p-2" /></label> : null}
    <label className="block text-sm">Review reason<textarea name="reason" required minLength={8} maxLength={1000} rows={2} className="mt-1 w-full rounded-md border bg-background p-2" /></label>
    {form.config ? <ConfiguredFields config={form.config} baseKeys={managedFinanceBaseKeys} /> : null}
    {form.status === 'loading' ? <output className="block">Loading payment form…</output> : null}
    {form.message ? <p role="alert">{form.message} <button type="button" onClick={form.refresh} className="underline">Reload form</button></p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <button type="submit" disabled={disabled || !form.canSubmit} className="rounded-md border px-4 py-2 disabled:opacity-50 max-md:min-h-11">{titles[action]}</button>
  </form>;
}

function MakerPayments({ ownerId, maker, asOf, simulationAllowed, busy, setBusy }: {
  ownerId:string; maker:ManagedFinanceMaker; asOf:number; simulationAllowed:boolean; busy:boolean; setBusy:(value:boolean)=>void;
}) {
  const router = useRouter();
  const [pending,setPending] = useState<RetainedManagedFinanceAttempt[]>([]);
  const [loaded,setLoaded] = useState(false);
  const [storageError,setStorageError] = useState('');
  const [message,setMessage] = useState('');
  useEffect(() => {
    let active = true;
    Promise.resolve().then(()=>readManagedFinanceAttempts(localStorage,{ownerId,sellerId:maker.sellerId})).then(records => { if(active) {setPending(records);setLoaded(true);} })
      .catch(() => { if(active) {setStorageError('A recorded payment attempt cannot be read. Check payment history before changing local retry records.');setLoaded(true);} });
    return () => {active=false;};
  },[ownerId,maker.sellerId]);
  async function send(operation: RetainedManagedFinanceAttempt) {
    if (busy || !simulationAllowed) return;
    setBusy(true); setMessage('Checking the recorded operation…');
    try {
      const response = await fetch(`/api/admin/managed-program/${encodeURIComponent(maker.sellerId)}`, {
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(operation.body),
      });
      const result: unknown = await response.json();
      if (!response.ok || !verifiedManagedFinanceReceipt(operation,result)) {
        const error = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'The result could not be verified.';
        setMessage(`${error} The original operation is retained. Check history or retry it.`); return;
      }
      // A confirmed receipt belongs to this exact immutable operation, even after a reload.
      localStorage.removeItem(financeAttemptKey(operation));
      setPending(current => current.filter(value=>value.requestId!==operation.requestId));
      setMessage('The recorded operation is confirmed. The current balances are refreshing.'); router.refresh();
    } catch { setMessage('The result is uncertain. The original operation is retained. Check history or retry it.'); }
    finally { setBusy(false); }
  }
  async function start(action:ManagedFinanceAction,body:Record<string,unknown>,config:Parameters<typeof createManagedFinanceAttempt>[2]) {
    if (busy || !loaded || storageError || !simulationAllowed) return;
    // Re-read storage so another open tab cannot be silently ignored.
    const existing = await readManagedFinanceAttempts(localStorage,{ownerId,sellerId:maker.sellerId});
    if(existing.length) {setPending(existing);throw new Error('Review the recorded operation before starting another one.');}
    const operation = await createManagedFinanceAttempt({ownerId,sellerId:maker.sellerId,action},body,config);
    retainManagedFinanceAttempt(localStorage,operation); setPending([operation]); await send(operation);
  }
  const blocked = busy || !loaded || Boolean(storageError) || pending.length > 0 || !simulationAllowed;
  const summary = maker.summary;
  return <article className="min-w-0 space-y-4 rounded-2xl border bg-card p-5">
    <div><h3 className="font-heading text-xl">{maker.name}</h3><p className="text-sm text-muted-foreground">{maker.route === 'registered_seller' ? 'Registered Seller · historical company-store money' : 'Company-store maker'} · {maker.stage}</p></div>
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[
      ['Calculated',summary.calculatedPaisa],['Earned',summary.earnedPaisa],['Held',summary.heldPaisa],['Payable',summary.payablePaisa],
      ['Reserved',summary.reservedPaisa],['Paid',summary.paidPaisa],['Refund offset',summary.refundOffsetPaisa],['Ledger balance',summary.balancePaisa],
    ].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold">{money(Number(value))}</dd></div>)}</dl>
    <p className="text-sm">{maker.acceptedTermsReady ? 'Accepted company-store terms are recorded.' : 'Review accepted terms before new company-store sales.'} Receiving reference: {maker.preview.receivingReference || 'Review required'}.</p>
    {maker.preview.needsReview || summary.needsReconciliation ? <p role="alert">The balance needs reconciliation. Review the original orders, cases and adjustments before preparing payment.</p> : null}
    {maker.preview.hasUnpaidReservation ? <p>An unpaid payment already reserves this maker’s balance. Review its original history and cancel it only when the unpaid reservation is eligible.</p> : null}
    {maker.blockers.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{maker.blockers.map((blocker,index)=><li key={`${blocker.entitlementId}:${index}`}><a className="underline" href={blocker.href}>{blocker.message}</a></li>)}</ul> : null}
    {maker.moreBlockers ? <p className="text-sm">Only the first 50 blocked earnings are shown. Review all original orders and cases.</p> : null}
    <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href={`/admin/staff-form-history?kind=managed-eligibility-release&id=${encodeURIComponent(maker.sellerId)}`}>Earnings release history</Link><Link className="underline" href="/admin/staff-form-history?kind=managed-payout-preparation">Payment preparation history</Link><Link className="underline" href="/admin/staff-form-history?kind=managed-payout-action">Payment action history</Link></div>
    {storageError ? <p role="alert">{storageError}</p> : null}
    {pending.map(operation=><section key={operation.requestId} className="min-w-0 space-y-3 rounded-xl border border-amber-500 p-4" aria-label="Recorded payment operation">
      <h4 className="font-semibold">Recorded operation · {titles[operation.action]}</h4>
      <p className="break-all text-xs">Request: {operation.requestId} · form version {operation.config.version}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(operation.body,null,2)}</pre>
      {operation.action === 'record_sale_linked_payment' ? <p>This old payment-completion reference is retained for history review. Completion cannot be retried here; this reference does not prove that payment was made.</p> : <button type="button" disabled={busy || !simulationAllowed} onClick={()=>void send(operation)} className="rounded-md border px-3 py-2 disabled:opacity-50">Retry recorded operation</button>}{' '}
      <button type="button" disabled={busy} className="underline" onClick={()=>{
        const retiredCompletion=operation.action === 'record_sale_linked_payment';
        if(!window.confirm(retiredCompletion ? 'Check the original payment history first. Clearing this local reference does not prove or cancel a payment. Completion cannot be retried here. Continue?' : 'Check payment history first. Clearing this local retry record does not cancel a server operation. Start a new attempt only after confirming the original outcome. Continue?')) return;
        localStorage.removeItem(financeAttemptKey(operation));setPending(current=>current.filter(value=>value.requestId!==operation.requestId));setMessage(retiredCompletion ? 'Local reference cleared. Original payment history is unchanged; completion remains unavailable here.' : 'Local retry record cleared. Review the current payment state before starting again.');router.refresh();
      }}>{operation.action === 'record_sale_linked_payment' ? 'Clear local reference after history review' : 'Check history, then start a new attempt'}</button>
    </section>)}
    {message ? <output className="block">{message}</output> : null}
    <div className="grid gap-4 lg:grid-cols-2">
      <FinanceForm action="release_eligibility" maker={maker} asOf={asOf} disabled={blocked} onAttempt={start}/>
      {maker.preview.amountPaisa > 0 ? <FinanceForm action="prepare_sale_linked_payout" maker={maker} asOf={asOf} disabled={blocked} onAttempt={start}/> : <p className="self-center text-sm text-muted-foreground">A new payment becomes available when mature earnings, receiving details and case checks are ready.</p>}
    </div>
    <h4 className="font-semibold">Payments · {maker.paymentCount} total</h4>
    {!maker.payments.length ? <p className="text-sm text-muted-foreground">No payments have been prepared.</p> : <div className="space-y-4">{maker.payments.map(payment=><section key={payment.id} className="min-w-0 space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap justify-between gap-2"><p className="break-all font-semibold">{payment.number} · {money(payment.amountPaisa)}</p><p>{payment.status}</p></div>
      <p className="break-all text-sm">Processing: {date(payment.scheduledFor)} Nepal time · {payment.destination}{payment.providerReference ? ` · ${payment.providerReference}` : ''}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {payment.status === 'prepared' ? <FinanceForm action="approve_sale_linked_payout" maker={maker} payment={payment} asOf={asOf} disabled={blocked} onAttempt={start}/> : null}
        {payment.status === 'approved' ? <p className="text-sm">This retained simulation cannot be completed here. Review its original history; an eligible unpaid reservation can be cancelled below.</p> : null}
        {['prepared','approved','processing','failed'].includes(payment.status) ? <FinanceForm action="cancel_sale_linked_payout" maker={maker} payment={payment} asOf={asOf} disabled={blocked} onAttempt={start}/> : null}
      </div>
    </section>)}</div>}
    {maker.paymentCount>maker.payments.length ? <p className="text-sm">The latest 50 payments are shown. Open payment histories for older records.</p> : null}
  </article>;
}

export function ManagedSettlementControls({ownerId,workspace,asOf,simulationAllowed}:{ownerId:string;workspace:ManagedFinanceWorkspace;asOf:number;simulationAllowed:boolean}) {
  const [busy,setBusy] = useState(false);
  return <section id="maker-payments" className="min-w-0 scroll-mt-6 space-y-4" aria-labelledby="maker-payments-heading">
    <h2 id="maker-payments-heading" className="font-heading text-2xl">Sale-linked maker payments</h2>
    <p className="text-sm text-muted-foreground">Actual original live earnings use the protected payout workflow. Retained simulation history stays separate; fixed supplier payments remain in Supply &amp; payments.</p>
    {!simulationAllowed ? <p role="alert">Retained simulation actions are unavailable outside the verified simulation environment; actual live money has its own protected controls below.</p> : null}
    {workspace.error ? <p role="alert">{workspace.error}</p> : !workspace.makers.length ? <p>No company-store maker financial records yet.</p> : workspace.makers.map(maker=><section key={maker.sellerId} className="space-y-4"><h3 className="font-semibold">{maker.name}</h3><LiveManagedFinanceControls key={ownerId+':'+maker.sellerId} actorId={ownerId} sellerId={maker.sellerId} initial={maker.live} error={maker.liveError}/><details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium max-md:min-h-11 max-md:content-center">Retained simulation history</summary><MakerPayments ownerId={ownerId} maker={maker} asOf={asOf} simulationAllowed={simulationAllowed} busy={busy} setBusy={setBusy}/></details></section>)}
    {workspace.nextCursor ? <a className="section-link" href={`/admin/programs?financeAfter=${encodeURIComponent(workspace.nextCursor)}#maker-payments`}>Next 20 makers</a> : null}
  </section>;
}
