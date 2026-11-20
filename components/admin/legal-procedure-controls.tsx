'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { procedureTime } from '@/lib/legal-procedures/document';
import { LEGAL_SECTIONS, type LegalDraftSnapshot } from '@/lib/legal-procedures/model';
import { emptyLegalControl, type LegalControlEvent, type LegalControlWorkspace, type LegalOperation } from '@/lib/legal-procedures/lifecycle-model';

const endpoint = '/api/admin/legal-procedures/control';
const labels = { approve: 'Approval', activate: 'Activation', withdraw: 'Withdrawal' };
async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json() as { error?: unknown };
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'The procedure request failed. Review its state before continuing.');
  return data as T;
}

export function LegalProcedureControls({ current, dirty, busy, onBusyChange, initial }: {
  current: LegalDraftSnapshot; dirty: boolean; busy: boolean; onBusyChange: (value: boolean) => void; initial?: LegalControlWorkspace;
}) {
  const [control, setControl] = useState(initial ?? emptyLegalControl);
  const [reason, setReason] = useState('');
  const [confirmedContext, setConfirmedContext] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<LegalControlEvent | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const reviewContext = `${current.sha256}:${control.sha256}:${effectiveFrom}`;
  const confirmed = confirmedContext === reviewContext;
  const approved = control.approval?.document.sha256 === current.sha256;
  const ready = confirmed && reason.trim().length >= 8 && reason.trim().length <= 500 && !busy;

  async function act(operation: LegalOperation) {
    if (inFlight.current || !ready || (operation !== 'withdraw' && (dirty || current.revision < 1))) return;
    const document = operation === 'withdraw' ? (control.active ?? control.scheduled)?.document : current;
    if (!document) return;
    const payload = { operation, expectedSequence: control.sequence, expectedSha256: control.sha256,
      revision: document.revision, documentSha256: document.sha256, approvalSequence: operation === 'activate' ? control.approval?.sequence ?? null : null,
      effectiveFrom: operation === 'activate' ? effectiveFrom || null : null, confirmed: true, reason: reason.trim() };
    const fingerprint = JSON.stringify(payload);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
    inFlight.current = true; onBusyChange(true); setError(''); setNotice('');
    try {
      const data = await responseData<{ control: LegalControlWorkspace; event: LegalControlEvent }>(await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store',
        body: JSON.stringify({ ...payload, requestId: pending.current.requestId }) }));
      setControl(data.control); setReason(''); setConfirmedContext(null); pending.current = null;
      const activeStatus = data.control.active ? `Current staff version: ${data.control.active.document.revision}.` : 'No procedure is currently active for staff.';
      const scheduleStatus = data.control.scheduled ? ` Scheduled version ${data.control.scheduled.document.revision} starts ${procedureTime(data.control.scheduled.effectiveAt!)} Nepal time.` : ' No replacement is scheduled.';
      setNotice(`${labels[operation]} recorded for version ${data.event.document.revision}. ${activeStatus}${scheduleStatus} History is retained.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The action could not be confirmed. Retry the same action or refresh its state.'); }
    finally { inFlight.current = false; onBusyChange(false); }
  }
  async function read(sequence?: number, older = false) {
    if (inFlight.current || busy) return;
    inFlight.current = true; onBusyChange(true); setError(''); setNotice('');
    try {
      if (sequence !== undefined) {
        const data = await responseData<{ event: LegalControlEvent }>(await fetch(`${endpoint}?sequence=${sequence}`, { cache: 'no-store', credentials: 'same-origin' }));
        setSelected(data.event);
      } else {
        const suffix = older && control.nextBeforeSequence !== null ? `?beforeSequence=${control.nextBeforeSequence}` : '';
        const data = await responseData<LegalControlWorkspace>(await fetch(endpoint + suffix, { cache: 'no-store', credentials: 'same-origin' }));
        setControl(previous => older ? { ...data, history: [...previous.history, ...data.history.filter(entry => !previous.history.some(old => old.id === entry.id))] } : data);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Recorded procedure state is unavailable.'); }
    finally { inFlight.current = false; onBusyChange(false); }
  }
  return <section className="flex min-w-0 flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6" aria-label="Approval and activation">
    <div><h2 className="font-heading text-2xl">Approval and activation</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Approve the exact saved text, then activate it for staff. These actions manage internal procedures. Public agreements, commission settings and existing orders keep their own terms.</p></div>
    <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-3">
      <div><dt className="font-semibold">Active for staff</dt><dd className="mt-1 leading-6">{control.active ? `Version ${control.active.document.revision} · effective ${procedureTime(control.active.effectiveAt!)} Nepal time` : 'No active procedure'}</dd></div>
      <div><dt className="font-semibold">Approved version</dt><dd className="mt-1 leading-6">{control.approval ? `Version ${control.approval.document.revision} · ${control.approval.actorName} · ${procedureTime(control.approval.occurredAt)} Nepal time` : 'No current approval'}</dd></div>
      <div><dt className="font-semibold">Scheduled replacement</dt><dd className="mt-1 leading-6">{control.scheduled ? `Version ${control.scheduled.document.revision} · ${procedureTime(control.scheduled.effectiveAt!)} Nepal time` : 'None'}</dd></div>
    </dl>
    <div className="flex flex-wrap gap-4 text-sm font-semibold text-primary">
      <Link href="/admin/legal-policies/active" prefetch={false} className="section-link underline">Open active staff procedure</Link>
      {control.active ? <Link href="/api/admin/legal-procedures/active?download=1" prefetch={false} download className="section-link underline">Download active procedure</Link> : null}
      <Button type="button" size="workspace" variant="workspace-outline" disabled={busy} onClick={() => void read()}>Refresh approval state</Button>
    </div>
    {dirty || current.revision === 0 ? <p className="text-sm font-semibold">Save the completed text as a version before approving or activating it.</p> : null}
    <FieldGroup>
      <Field><FieldLabel htmlFor="procedure-control-reason">Reason for approval or activation</FieldLabel>
        <Textarea id="procedure-control-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={2} disabled={busy} />
        <FieldDescription>Explain the decision in 8–500 characters. The same field is required for withdrawal.</FieldDescription></Field>
      <Field><FieldLabel htmlFor="procedure-effective-time">Effective date and time (Nepal)</FieldLabel>
        <Input id="procedure-effective-time" type="datetime-local" value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} disabled={busy} className="min-w-0" />
        <FieldDescription>Leave empty to activate now. A future activation replaces any pending schedule. An already active version stays in use until the new time.</FieldDescription></Field>
      <Field orientation="horizontal"><input id="procedure-control-confirm" type="checkbox" checked={confirmed} onChange={event => setConfirmedContext(event.target.checked ? reviewContext : null)} disabled={busy} className="mt-1 size-4 shrink-0" />
        <FieldLabel htmlFor="procedure-control-confirm" className="leading-6">I reviewed this saved version and understand the selected approval, activation or withdrawal action.</FieldLabel></Field>
    </FieldGroup>
    <div className="flex flex-wrap gap-3">
      <Button type="button" size="workspace" variant={approved ? 'workspace-outline' : 'workspace-decision'} disabled={!ready || dirty || current.revision === 0 || approved} onClick={() => void act('approve')}>Approve saved version</Button>
      <Button type="button" size="workspace" variant={approved ? 'workspace-decision' : 'workspace-outline'} disabled={!ready || dirty || !approved} onClick={() => void act('activate')}>Activate approved version</Button>
      <Button type="button" size="workspace" variant="workspace-destructive" disabled={!ready || (!control.active && !control.scheduled)} onClick={() => void act('withdraw')}>Withdraw active and scheduled versions</Button>
    </div>
    {notice ? <output className="block rounded-xl border p-4 text-sm leading-6">{notice}</output> : null}
    {error ? <div role="alert" className="rounded-xl border border-destructive p-4 text-sm leading-6">{error} Your entered reason and confirmation are kept. An uncertain response may already have been recorded; retry the unchanged action or refresh its state.</div> : null}
    <details className="min-w-0 border-t pt-4"><summary className="min-h-11 content-center cursor-pointer py-2 font-semibold">Approval and activation history</summary>
      {control.history.length ? <ol className="mt-3 flex flex-col gap-3">{control.history.map(entry => <li key={entry.id} className="min-w-0 rounded-xl border p-4 text-sm leading-6">
        <p className="font-semibold">{labels[entry.operation]} · version {entry.document.revision} · action {entry.sequence}</p>
        <p>{entry.actorName} · {procedureTime(entry.occurredAt)} Nepal time</p><p className="break-words">{entry.reason}</p>
        <Button type="button" size="workspace" variant="workspace-outline" disabled={busy} onClick={() => void read(entry.sequence)} className="mt-2">View action {entry.sequence}</Button>
      </li>)}</ol> : <p className="mt-3 text-sm">No approval or activation has been recorded.</p>}
      {control.nextBeforeSequence !== null ? <Button type="button" size="workspace" variant="workspace-outline" disabled={busy} onClick={() => void read(undefined, true)} className="mt-3">Load older actions</Button> : null}
      {selected ? <article className="mt-5 min-w-0 rounded-xl border p-4 text-sm leading-7">
        <h3 className="text-lg font-semibold">{labels[selected.operation]} · version {selected.document.revision} · read-only snapshot</h3>
        <p>{selected.actorName} · {procedureTime(selected.occurredAt)} Nepal time</p><p>{selected.reason}</p>
        <p className="break-all">Document fingerprint: {selected.document.sha256}</p>
        {selected.document.sections.map((section, index) => <section key={section.id} className="mt-5"><h4 className="font-semibold">{LEGAL_SECTIONS[index][1]}</h4><p className="mt-2 whitespace-pre-wrap break-words">{section.body}</p></section>)}
      </article> : null}
    </details>
  </section>;
}
