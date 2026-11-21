'use client';

import Link from 'next/link';
import { CircleAlert, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type SyntheticEvent } from 'react';
import { useOwnedFormScope } from '@/components/forms/use-owned-form-scope';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import type { ComplaintRow } from '@/lib/db/repositories/complaints';
import type { ReturnCaseRow } from '@/lib/db/repositories/returns';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import type { CustomerAftercareContext } from '@/lib/returns/customer-aftercare-context';
import { maximumEvidenceFiles, validateEvidenceFile } from '@/lib/returns/validation';
import { CustomerHelpFlow, complaintBaseKeys, returnBaseKeys, type AftercareReceiptItem } from './customer-help-flow';
import { CustomerRequestView } from './customer-request-view';
import { aftercareBox, aftercarePrimary, aftercareSecondary, customerCaseHref,
  requestProgressForRecord, type CustomerRequestRecord } from './customer-request-presentation';

type AftercareProps = {
  orderNumber: string;
  orderStatus: string;
  items: readonly AftercareReceiptItem[];
  returns: readonly ReturnCaseRow[];
  complaints: readonly ComplaintRow[];
  viewerScope?: string;
  actorId?: string | null;
  initialItemId?: string;
  context?: CustomerAftercareContext | null;
};

function uncertainCaseMessage(kind: 'return' | 'complaint') {
  return `We couldn’t confirm that your ${kind === 'return' ? 'return request' : 'complaint'} was saved. Refresh this receipt and check the saved cases, or retry the same form with the same answers. Your saved request reference is reused for retries.`;
}

function confirmedCase(result: Record<string, unknown> | null): result is { id: string; message: string; duplicate: boolean; referenceNumber: string } {
  return result !== null && typeof result.id === 'string' && result.id.trim().length > 0 && result.id.length <= 100 &&
    typeof result.referenceNumber === 'string' && result.referenceNumber.trim().length > 0 && result.referenceNumber.length <= 100 &&
    typeof result.duplicate === 'boolean' && typeof result.message === 'string' && result.message.trim().length > 0 && result.message.length <= 1000;
}

export function CustomerAftercare(props: AftercareProps) {
  const scope = useOwnedFormScope(JSON.stringify([props.viewerScope ?? props.actorId ?? 'legacy-receipt', props.orderNumber]));
  return <ScopedCustomerAftercare key={scope.key} {...props} isCurrent={scope.isCurrent}/>;
}

function ScopedCustomerAftercare({ orderNumber, orderStatus, items, returns, complaints, viewerScope,
  actorId, initialItemId, context, isCurrent }: AftercareProps & { isCurrent: () => boolean }) {
  const router = useRouter();
  const returnForm = usePublishedFormConfig('commerce.return-request');
  const complaintForm = usePublishedFormConfig('commerce.complaint');
  const returnAttempt = sessionAttemptKey('commerce.return-request', JSON.stringify([viewerScope ?? actorId ?? 'legacy-receipt', orderNumber]));
  const complaintAttempt = sessionAttemptKey('commerce.complaint', JSON.stringify([viewerScope ?? actorId ?? 'legacy-receipt', orderNumber]));
  const startItem = items.some(item => item.id === initialItemId) ? initialItemId : undefined;
  const [mode, setMode] = useState<'item' | 'complaint' | 'urgent' | null>(startItem ? 'item' : null);
  const [helpItem, setHelpItem] = useState(startItem);
  const [accessDenied, setAccessDenied] = useState(false);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const itemLauncher = useRef<HTMLButtonElement>(null);
  const complaintLauncher = useRef<HTMLButtonElement>(null);
  const caseConfirmation = useRef<HTMLOutputElement>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{ kind: 'return' | 'complaint'; id: string; message: string } | null>(null);
  const cases: CustomerRequestRecord[] = [
    ...returns.map(row => ({ kind: 'return' as const, row })),
    ...complaints.map(row => ({ kind: 'complaint' as const, row })),
  ];
  cases.sort((left, right) => Number(requestProgressForRecord(right).actor === 'you') - Number(requestProgressForRecord(left).actor === 'you')
    || right.row.updatedAt - left.row.updatedAt);

  async function send(kind: 'return' | 'complaint', event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (sending.current || !isCurrent()) return;
    const formElement = event.currentTarget;
    const published = kind === 'return' ? returnForm : complaintForm;
    const baseKeys = kind === 'return' ? returnBaseKeys : complaintBaseKeys;
    const attempt = kind === 'return' ? returnAttempt : complaintAttempt;
    if (!published.canSubmit || !published.config) {
      setError(published.message || 'The current request form is unavailable. Reload and try again.');
      return;
    }
    const form = new FormData(formElement);
    if (kind === 'return') {
      const files = form.getAll('evidence').filter((value): value is File => value instanceof File && value.size > 0);
      if (files.length > maximumEvidenceFiles) { setError(`Choose up to ${maximumEvidenceFiles} evidence files.`); return; }
      for (const file of files) {
        const problem = validateEvidenceFile(file);
        if (problem) { setError(`${file.name}: ${problem}`); return; }
      }
    }
    sending.current = true;
    setPending(true);
    setError('');
    setConfirmation(null);
    try {
      const configured = readConfiguredSubmission(formElement, published.config, baseKeys);
      const payload = configuredJsonPayload(published.config, configured.answers, baseKeys);
      const idempotencyKey = getOrCreateSessionAttempt(attempt);
      const headers: Record<string, string> = actorId === undefined ? {} : { [ACTOR_INTENT_HEADER]: actorId ?? '' };
      let body: FormData | string;
      if (kind === 'return') {
        // Native submission owns these fields. Keep interface-only radio group names out of the payload.
        for (const key of new Set(form.keys())) if (!returnBaseKeys.includes(key)) form.delete(key);
        form.set('formVersion', String(payload.formVersion));
        form.set('customAnswers', JSON.stringify(payload.customAnswers));
        form.set('idempotencyKey', idempotencyKey);
        body = form;
      } else {
        headers['content-type'] = 'application/json';
        body = JSON.stringify({ orderItemId: form.get('orderItemId'), category: form.get('category'),
          subject: form.get('subject'), detail: form.get('detail'), locale: 'en-NP', idempotencyKey, ...payload });
      }
      const response = await fetch(`/orders/${encodeURIComponent(orderNumber)}/${kind === 'return' ? 'returns' : 'complaints'}`,
        { method: 'POST', headers, body }).catch(() => { throw new Error(uncertainCaseMessage(kind)); });
      const decoded: unknown = await response.json().catch(() => null);
      if (!isCurrent()) return;
      if ([401, 403, 404].includes(response.status)) {
        formElement.reset();
        setAccessDenied(true);
        router.refresh();
        return;
      }
      const result = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded as Record<string, unknown> : null;
      if (response.status === 409 && result?.code === 'stale_version') published.handleSubmissionResponse(response, 'stale_version');
      if (!response.ok) throw new Error(response.status >= 500 ? uncertainCaseMessage(kind) : typeof result?.error === 'string' ? result.error : 'We couldn’t send this request. Check your answers and try again.');
      if (!confirmedCase(result)) throw new Error(uncertainCaseMessage(kind));
      clearSessionAttempt(attempt);
      formElement.reset();
      setMode(null);
      setConfirmation({ kind, id: result.id, message: result.message });
      requestAnimationFrame(() => caseConfirmation.current?.focus());
      router.refresh();
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'We couldn’t send this request. Check your answers and try again.');
    } finally {
      sending.current = false;
      if (isCurrent()) setPending(false);
    }
  }

  function choose(next: 'item' | 'complaint' | 'urgent' | null, selected?: string) {
    if (next === null) requestAnimationFrame(() => (mode === 'item' ? itemLauncher : complaintLauncher).current?.focus());
    setMode(next);
    setHelpItem(selected);
    setError('');
    setConfirmation(null);
  }

  if (accessDenied) return <section id="order-help" role="alert" className={aftercareBox}>
    <p>Account or order access changed. Previous private request fields are hidden and original references are retained.</p>
    <button type="button" className={`${aftercareSecondary} mt-3`} onClick={() => window.location.reload()}>Reload current order</button>
  </section>;

  return <section id="order-help" className="customer-form min-w-0 scroll-mt-36 space-y-6" aria-label="Get help with an order">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h2 className="font-heading text-3xl font-semibold text-[#14213D] sm:text-4xl">Get help with an order</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#46536F]">Tell us about an item, your delivery or the whole order.</p></div>
      {mode ? <button type="button" disabled={pending} className={aftercareSecondary} onClick={() => choose(null)}>Close form</button> : null}
    </div>
    {confirmation ? <section className={`${aftercareBox} space-y-3`}>
      <output ref={caseConfirmation} tabIndex={-1} className="block font-semibold text-[#205D42]">{confirmation.message}</output>
      <Link className={aftercarePrimary} href={actorId ? customerCaseHref(confirmation.kind, confirmation.id) : `#case-${confirmation.id}`}>View your request</Link>
    </section> : null}
    {mode ? <CustomerHelpFlow key={mode} orderNumber={orderNumber} orderStatus={orderStatus} items={items}
      initialItemId={helpItem} context={context} mode={mode} startComplaint={selected => choose('urgent', selected)}
      returnForm={{ ...returnForm, pending, error, submit: event => void send('return', event) }}
      complaintForm={{ ...complaintForm, pending, error, submit: event => void send('complaint', event) }}/> : null}
    {cases.length ? <div className="min-w-0 space-y-8">
      <h2 className="text-xl font-bold text-[#14213D]">Your existing requests</h2>
      {cases.map(record => <CustomerRequestView key={`${record.kind}:${record.row.id}`} record={record} context={context} actorId={actorId} viewerScope={viewerScope}/>)}
    </div> : null}
    {mode ? null : <div className="flex flex-wrap gap-3">
      {items.some(item => item.fulfillmentStatus === 'delivered' || (!item.fulfillmentStatus && orderStatus === 'delivered'))
        ? <button ref={itemLauncher} type="button" className={aftercarePrimary} onClick={() => choose('item')}><RotateCcw className="size-4" aria-hidden="true"/> Return or replace an item</button> : null}
      <button ref={complaintLauncher} type="button" className={aftercareSecondary} onClick={() => choose('complaint')}><CircleAlert className="size-4" aria-hidden="true"/> Get help or raise a complaint</button>
    </div>}
  </section>;
}
