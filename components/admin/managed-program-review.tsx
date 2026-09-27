'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import type { ManagedProgramWorkspace } from '@/lib/managed-commerce/program-workspace';

const money = (paisa: number | null) => paisa === null ? '—' : `NPR ${(paisa / 100).toFixed(2)}`;
const baseKeys = {
  'staff.managed-supply-decision': ['action', 'recordId', 'decision', 'quantityAccepted', 'possessionStatus', 'qualityStatus', 'ownershipRecordStatus', 'riskRecordStatus', 'evidenceReference', 'reason', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-adjustment': ['action', 'recordId', 'kind', 'amountNpr', 'amountPaisa', 'reason', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-payment-preparation': ['action', 'recordId', 'destinationReference', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-payment-action': ['action', 'paymentId', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-transition-decision': ['action', 'applicationId', 'decision', 'effectiveLocal', 'effectiveAt', 'reason', 'requestId', 'formVersion', 'customAnswers'],
} as const;
type ProgramFormId = keyof typeof baseKeys;
const managedAttemptKey = (sellerId: string, formId: ProgramFormId, parentId: string, action: string) =>
  sessionAttemptKey(formId, `${sellerId}:${parentId}:${action}`);

export function ManagedProgramReview({ sellerId, workspace }: { sellerId: string; workspace: ManagedProgramWorkspace }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryKeys, setRetryKeys] = useState<Record<string, boolean>>({});
  const supplyCatalog = usePublishedFormConfig('staff.managed-supply-decision');
  const adjustmentCatalog = usePublishedFormConfig('staff.managed-adjustment');
  const preparationCatalog = usePublishedFormConfig('staff.managed-payment-preparation');
  const paymentCatalog = usePublishedFormConfig('staff.managed-payment-action');
  const transitionCatalog = usePublishedFormConfig('staff.managed-transition-decision');
  const catalogs = {
    'staff.managed-supply-decision': supplyCatalog,
    'staff.managed-adjustment': adjustmentCatalog,
    'staff.managed-payment-preparation': preparationCatalog,
    'staff.managed-payment-action': paymentCatalog,
    'staff.managed-transition-decision': transitionCatalog,
  };

  useEffect(() => {
    const keys: string[] = [];
    for (const supply of workspace.supplies) {
      if (supply.status === 'proposed')
        keys.push(managedAttemptKey(sellerId, 'staff.managed-supply-decision', supply.id, 'decide_supply'));
      if (supply.status !== 'accepted') continue;
      keys.push(managedAttemptKey(sellerId, 'staff.managed-adjustment', supply.id, 'add_adjustment'));
      if (!supply.paymentId)
        keys.push(managedAttemptKey(sellerId, 'staff.managed-payment-preparation', supply.id, 'prepare_payment'));
      else if (supply.paymentStatus === 'prepared' || supply.paymentStatus === 'approved')
        keys.push(managedAttemptKey(sellerId, 'staff.managed-payment-action', supply.paymentId,
          supply.paymentStatus === 'prepared' ? 'approve_payment' : 'mark_payment_paid'));
    }
    for (const item of workspace.transitions)
      if (item.status === 'submitted')
        keys.push(managedAttemptKey(sellerId, 'staff.managed-transition-decision', item.id, 'review_transition'));
    const timer = window.setTimeout(() =>
      setRetryKeys(Object.fromEntries(keys.map((key) => [key, hasSessionAttempt(key)]))), 0);
    return () => window.clearTimeout(timer);
  }, [sellerId, workspace]);

  async function send(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const id = form.dataset.formId as ProgramFormId;
    const catalog = catalogs[id];
    if (!catalog?.config || !catalog.canSubmit) { setMessage(catalog?.message || 'Form configuration is unavailable.'); return; }
    let configured: ReturnType<typeof configuredJsonPayload>;
    try {
      const submitted = readConfiguredSubmission(form, catalog.config, baseKeys[id]);
      configured = configuredJsonPayload(catalog.config, submitted.answers, baseKeys[id]);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review the configured fields.'); return; }
    const data = new FormData(form);
    const body = Object.fromEntries(Array.from(data.entries()).filter(([key]) => !key.startsWith('custom.') && key !== 'formVersion')) as Record<string, unknown>;
    if (body.quantityAccepted !== undefined) body.quantityAccepted = Number(body.quantityAccepted);
    if (body.amountNpr !== undefined) {
      body.amountNpr = Number(body.amountNpr);
      body.amountPaisa = Math.round((body.amountNpr as number) * 100);
    }
    if (typeof body.effectiveLocal === 'string' && body.effectiveLocal) body.effectiveAt = new Date(body.effectiveLocal).getTime();
    setBusy(true); setMessage('');
    try {
      const requestKey = managedAttemptKey(sellerId, id, String(body.recordId ?? body.paymentId ?? body.applicationId), String(body.action));
      const requestId = getOrCreateSessionAttempt(requestKey);
      setRetryKeys((current) => ({ ...current, [requestKey]: true }));
      const response = await fetch(`/api/admin/managed-program/${encodeURIComponent(sellerId)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, ...configured, requestId }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; code?: string; paymentId?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok) throw new Error(result?.error ?? 'Action failed; its outcome may be unknown. Retry the same request.');
      if (result?.ok !== true) throw new Error('The response could not confirm this action. Retry the same request.');
      clearSessionAttempt(requestKey);
      setRetryKeys((current) => ({ ...current, [requestKey]: false }));
      setMessage(result.paymentId ? `Prepared simulated payment ${result.paymentId}.` : 'Simulated staging decision recorded.');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Action failed.'); }
    finally { setBusy(false); }
  }

  if (workspace.participationRoute !== 'managed_maker' && workspace.transitions.length === 0) return null;
  const fields = (id: ProgramFormId) => catalogs[id].config
    ? <ConfiguredFields config={catalogs[id].config} baseKeys={baseKeys[id]} /> : null;
  const formMessage = (id: ProgramFormId, parentId: string, action: string) => {
    const key = managedAttemptKey(sellerId, id, parentId, action);
    return <>
      {!catalogs[id].canSubmit ? <p role="alert" className="text-sm text-destructive">{catalogs[id].message || 'Loading form configuration…'}</p> : null}
      {retryKeys[key] ? <div className="space-y-2 text-xs text-muted-foreground"><p>A previous decision may have succeeded. Check the record before retrying. Changed details will use the same request reference and may conflict.</p><Button type="button" variant="outline" disabled={busy} onClick={() => {
        if (!window.confirm('A prior managed-program action may already have succeeded. Check the record first. Starting a new attempt may duplicate it. Continue?')) return;
        clearSessionAttempt(key);
        setRetryKeys((current) => ({ ...current, [key]: false }));
        setMessage('');
        if (catalogs[id].status === 'stale') catalogs[id].refresh();
      }}>Start a new attempt</Button></div> : null}
    </>;
  };
  const disabled = (id: ProgramFormId) => busy || !catalogs[id].canSubmit;

  return <section className="space-y-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm dark:bg-amber-950/20">
    <div><p className="eyebrow">Simulation-only controls</p><h2 className="font-heading text-2xl">Managed program records</h2><p className="mt-2 leading-6">Possession, inspection, title/risk records, supplier obligation, and payment approval remain separate. These controls are rejected outside local staging/test.</p></div>
    <nav className="flex flex-wrap gap-3 text-sm" aria-label="Managed program form history">
      <Link className="underline" href="/admin/staff-form-history?kind=managed-supply-decision">Supply decisions</Link>
      <Link className="underline" href="/admin/staff-form-history?kind=managed-adjustment">Adjustments</Link>
      <Link className="underline" href="/admin/staff-form-history?kind=managed-payment-preparation">Payment preparations</Link>
      <Link className="underline" href="/admin/staff-form-history?kind=managed-payment-action">Payment actions</Link>
      <Link className="underline" href="/admin/staff-form-history?kind=managed-transition-decision">Route transitions</Link>
    </nav>
    {workspace.supplies.map(supply => <div key={supply.id} className="space-y-3 rounded-xl border bg-background p-4">
      <p className="font-semibold">{supply.productName} · {supply.status.replaceAll('_', ' ')}</p><p>{supply.quantityProposed} proposed × {money(supply.agreedUnitPaisa)} · accepted obligation {money(supply.originalOwedPaisa)} · adjustments {money(supply.adjustedPaisa)} · paid {money(supply.paidPaisa)}</p>
      {supply.status === 'proposed' ? <form data-form-id="staff.managed-supply-decision" className="grid gap-2 sm:grid-cols-2" onSubmit={send}>
        <input type="hidden" name="action" value="decide_supply" /><input type="hidden" name="recordId" value={supply.id} />
        <label>Decision<select name="decision" className="mt-1 h-9 w-full rounded border px-2"><option value="accept">Accept</option><option value="reject">Reject</option><option value="cancel">Cancel</option></select></label>
        <label>Accepted quantity<input name="quantityAccepted" type="number" defaultValue={supply.quantityProposed} className="mt-1 h-9 w-full rounded border px-2" /></label>
        <label>Possession<select name="possessionStatus" className="mt-1 h-9 w-full rounded border px-2"><option value="received">Received</option><option value="returned">Returned</option><option value="not_received">Not received</option></select></label>
        <label>Quality<select name="qualityStatus" className="mt-1 h-9 w-full rounded border px-2"><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="not_inspected">Not inspected</option></select></label>
        <label>Ownership record<select name="ownershipRecordStatus" className="mt-1 h-9 w-full rounded border px-2"><option value="simulated_terms_recorded">Simulated terms recorded</option><option value="not_recorded">Not recorded</option></select></label>
        <label>Risk record<select name="riskRecordStatus" className="mt-1 h-9 w-full rounded border px-2"><option value="simulated_terms_recorded">Simulated terms recorded</option><option value="not_recorded">Not recorded</option></select></label>
        <label>Evidence reference<input name="evidenceReference" required className="mt-1 h-9 w-full rounded border px-2" /></label>
        <label>Decision reason<input name="reason" required minLength={10} className="mt-1 h-9 w-full rounded border px-2" /></label>
        <div className="sm:col-span-2">{fields('staff.managed-supply-decision')}{formMessage('staff.managed-supply-decision', supply.id, 'decide_supply')}<Button type="submit" disabled={disabled('staff.managed-supply-decision')}>Record supply decision</Button></div>
      </form> : null}
      {supply.status === 'accepted' ? <div className="grid gap-3 lg:grid-cols-2">
        <form data-form-id="staff.managed-adjustment" className="space-y-2 rounded border p-3" onSubmit={send}>
          <input type="hidden" name="action" value="add_adjustment" /><input type="hidden" name="recordId" value={supply.id} /><p className="font-semibold">Append linked adjustment</p>
          <select name="kind" className="h-9 w-full rounded border px-2"><option value="defect">Defect</option><option value="rejection">Rejection</option><option value="cancellation">Cancellation</option></select>
          <input name="amountNpr" type="number" step="0.01" required placeholder="Amount NPR" className="h-9 w-full rounded border px-2" />
          <input name="reason" required minLength={10} placeholder="Reason" className="h-9 w-full rounded border px-2" />
          {fields('staff.managed-adjustment')}{formMessage('staff.managed-adjustment', supply.id, 'add_adjustment')}<Button type="submit" disabled={disabled('staff.managed-adjustment')} variant="outline">Record adjustment</Button>
        </form>
        {!supply.paymentId ? <form data-form-id="staff.managed-payment-preparation" className="space-y-2 rounded border p-3" onSubmit={send}>
          <input type="hidden" name="action" value="prepare_payment" /><input type="hidden" name="recordId" value={supply.id} /><p className="font-semibold">Prepare supplier payment</p>
          <input name="destinationReference" required defaultValue="SIM-MAKER-ACCOUNT" className="h-9 w-full rounded border px-2" />
          {fields('staff.managed-payment-preparation')}{formMessage('staff.managed-payment-preparation', supply.id, 'prepare_payment')}<Button type="submit" disabled={disabled('staff.managed-payment-preparation')}>Prepare simulated payment</Button>
        </form> : <form data-form-id="staff.managed-payment-action" className="space-y-2 rounded border p-3" onSubmit={send}>
          <input type="hidden" name="paymentId" value={supply.paymentId} /><p className="font-semibold">Payment {supply.paymentStatus} · {supply.paymentId}</p>
          <select name="action" className="h-9 w-full rounded border px-2">{supply.paymentStatus === 'prepared' ? <option value="approve_payment">Approve (different Super Admin)</option> : null}{supply.paymentStatus === 'approved' ? <option value="mark_payment_paid">Mark simulated paid</option> : null}</select>
          {fields('staff.managed-payment-action')}{formMessage('staff.managed-payment-action', supply.paymentId, supply.paymentStatus === 'prepared' ? 'approve_payment' : 'mark_payment_paid')}<Button type="submit" disabled={disabled('staff.managed-payment-action') || supply.paymentStatus === 'paid'}>Record payment action</Button>
        </form>}
      </div> : null}
    </div>)}
    {workspace.transitions.map(item => <div key={item.id} className="space-y-3 rounded-xl border bg-background p-4"><p className="font-semibold">Registered Seller transition · {item.legalName}</p><p>{item.taxMode} · {item.status.replaceAll('_', ' ')}{item.effectiveAt ? ` · effective ${new Date(item.effectiveAt).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' })}` : ''}</p>
      {item.status === 'submitted' ? <form data-form-id="staff.managed-transition-decision" className="grid gap-2 sm:grid-cols-2" onSubmit={send}>
        <input type="hidden" name="action" value="review_transition" /><input type="hidden" name="applicationId" value={item.id} />
        <label>Decision<select name="decision" className="mt-1 h-9 w-full rounded border px-2"><option value="approve">Approve and schedule</option><option value="request_changes">Request changes</option><option value="reject">Reject</option></select></label>
        <label>Effective time<input name="effectiveLocal" type="datetime-local" className="mt-1 h-9 w-full rounded border px-2" /></label>
        <label className="sm:col-span-2">Review reason<input name="reason" required minLength={10} className="mt-1 h-9 w-full rounded border px-2" /></label>
        <div className="sm:col-span-2">{fields('staff.managed-transition-decision')}{formMessage('staff.managed-transition-decision', item.id, 'review_transition')}<Button type="submit" disabled={disabled('staff.managed-transition-decision')}>Record transition decision</Button></div>
      </form> : null}
    </div>)}
    <output aria-live="polite" className="block font-medium">{message}</output>
  </section>;
}
