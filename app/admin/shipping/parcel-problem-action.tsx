'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore, type SubmitEvent } from 'react';
import { useDenyStaffReview } from '@/components/admin/staff-review-access-boundary';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { useOwnedFormScope } from '@/components/forms/use-owned-form-scope';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/client-submission';

const formId = 'staff.parcel-control';
const baseKeys = ['jobId', 'version', 'action', 'note', 'method', 'riderEmail', 'courierName', 'trackingCode',
  'trackingUrl', 'reference', 'amount', 'amountPaisa', 'cashRecordId', 'requestId'];
const subscribeToAttempt = () => () => undefined;

const actionLabels = {
  retry: 'Ask the courier to try delivery again',
  return_to_origin: 'Send the parcel back to the seller',
  receive_return: 'Confirm the seller received the parcel',
};
type ParcelAction = keyof typeof actionLabels;

export function ParcelProblemAction({ actorId, orderId, jobId, version, returning }: {
  actorId: string;
  orderId: string;
  jobId: string;
  version: number;
  returning: boolean;
}) {
  const router = useRouter();
  const scope = useOwnedFormScope(JSON.stringify([actorId, jobId, version]));
  const denyReview = useDenyStaffReview();
  const catalog = usePublishedFormConfig(formId);
  const [choice, setChoice] = useState<ParcelAction | ''>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [, setAttemptRevision] = useState(0);
  const inFlight = useRef(false);
  const fingerprint = useRef<string | null>(null);
  const attemptKey = sessionAttemptKey(formId, jobId);
  const attemptPresent = useSyncExternalStore(subscribeToAttempt, () => hasSessionAttempt(attemptKey), () => false);
  const actions: ParcelAction[] = returning ? ['receive_return', 'retry'] : ['retry', 'return_to_origin'];

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scope.isCurrent() || inFlight.current || !choice || !catalog.canSubmit || !catalog.config) return;
    const form = event.currentTarget;
    const submittedNote = new FormData(form).get('note');
    if (typeof submittedNote !== 'string') return;
    setError('');
    setMessage('');
    try {
      const configured = readConfiguredSubmission(form, catalog.config, baseKeys);
      const payload = {
        jobId, version, action: choice, note: submittedNote,
        method: '', riderEmail: '', courierName: '', trackingCode: '', trackingUrl: '', reference: '',
        ...configuredJsonPayload(catalog.config, configured.answers, baseKeys),
      };
      const currentFingerprint = JSON.stringify(payload);
      if (fingerprint.current && fingerprint.current !== currentFingerprint)
        throw new Error('These details differ from the prior attempt. Check its outcome before starting a new attempt.');
      const requestId = getOrCreateSessionAttempt(attemptKey);
      fingerprint.current = currentFingerprint;
      setAttemptRevision((revision) => revision + 1);
      inFlight.current = true;
      setBusy(true);
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/parcels`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, requestId }),
      });
      if (!scope.isCurrent()) return;
      if ((response.status === 401 || response.status === 403) && denyReview) {
        denyReview();
        router.refresh();
        return;
      }
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; code?: string } | null;
      if (!scope.isCurrent()) return;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok || result?.ok !== true || result.error)
        throw new Error(result?.error ?? 'The parcel update could not be confirmed. Check the parcel and retry with the same request.');
      clearSessionAttempt(attemptKey);
      fingerprint.current = null;
      setAttemptRevision((revision) => revision + 1);
      form.reset();
      setChoice('');
      setMessage('Parcel action saved.');
      router.refresh();
    } catch (cause) {
      if (scope.isCurrent()) setError(cause instanceof Error ? cause.message : 'The parcel action could not be saved.');
    } finally {
      inFlight.current = false;
      if (scope.isCurrent()) setBusy(false);
    }
  }

  return (
    <form data-form-id={formId} onSubmit={submit} className="min-w-0 space-y-3">
      <fieldset disabled={busy} className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm font-semibold text-[#46536F]">Choose what happens</legend>
        {actions.map((action) => (
          <label key={action} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#D3C5AD] px-3.5 py-2 text-sm font-semibold has-checked:border-[#14213D] has-checked:bg-[#14213D] has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[#A8232E]">
            <input required type="radio" name="action" value={action} checked={choice === action} className="sr-only" onChange={() => setChoice(action)} />
            {actionLabels[action]}
          </label>
        ))}
        <label className="block pt-1.5">
          <span className="sr-only">Note for the record</span>
          <textarea name="note" rows={2} required minLength={8} maxLength={500}
            placeholder="Note for the record (what the customer or courier said)"
            className="block min-h-16 w-full rounded-xl border border-[#D3C5AD] bg-white px-3.5 py-3 text-sm" />
        </label>
        {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={baseKeys} /> : null}
      </fieldset>
      {!catalog.canSubmit ? <output className="block text-sm text-[#46536F]">{catalog.message || 'Loading the parcel action form…'}</output> : null}
      {attemptPresent ? <div className="space-y-1 text-sm">
        <p>A prior parcel action may have succeeded. Retry only with the same details.</p>
        <button type="button" disabled={busy} className="min-h-11 underline underline-offset-4" onClick={() => {
          if (!window.confirm('A parcel action may already have succeeded. Check the parcel first. Start a new request reference?')) return;
          clearSessionAttempt(attemptKey);
          fingerprint.current = null;
          setAttemptRevision((revision) => revision + 1);
          setError('');
          if (catalog.status === 'stale') catalog.refresh();
        }}>Start a new attempt</button>
      </div> : null}
      {error ? <p role="alert" className="text-sm text-[#A8232E]">{error}</p> : null}
      {message ? <output className="block text-sm">{message}</output> : null}
      {choice ? <button disabled={busy || !catalog.canSubmit} className="min-h-11 rounded-xl bg-[#14213D] px-4 py-2 text-left text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Saving…' : `Save: ${actionLabels[choice]}`}
      </button> : null}
    </form>
  );
}
