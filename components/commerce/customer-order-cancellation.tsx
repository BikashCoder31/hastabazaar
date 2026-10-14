'use client';
import { FormGuide } from '@/components/forms/form-guide';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const FORM_ID = 'commerce.order-cancellation';
const BASE_KEYS = ['action', 'sellerIds', 'fingerprint', 'requestId', 'reason', 'formVersion', 'customAnswers'];
interface Choice {
  id: string;
  name: string;
  eligible: boolean;
  reviewRequired: boolean;
}
interface Preview {
  fingerprint: string;
  reviewRequired: boolean;
  walletRestored: number;
  discountRemoved: number;
  delivery: number;
  total: number;
  collected: number;
  deliveryPricingPolicy: string | null;
}
function validPreview(value: unknown): value is Preview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const preview = value as Preview;
  return typeof preview.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(preview.fingerprint)
    && typeof preview.reviewRequired === 'boolean'
    && [preview.walletRestored, preview.discountRemoved, preview.delivery, preview.total, preview.collected]
      .every((amount) => typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0)
    && preview.collected <= preview.total
    && (preview.deliveryPricingPolicy === null || preview.deliveryPricingPolicy === 'base_plus_half_per_additional_store_v1');
}
export function CustomerOrderCancellation({
  orderNumber,
}: {
  orderNumber: string;
}) {
  const router = useRouter();
  const catalog = usePublishedFormConfig(FORM_ID);
  const formRef = useRef<HTMLFormElement>(null);
  const attemptKey = sessionAttemptKey(FORM_ID, orderNumber);
  const [attemptPresent, setAttemptPresent] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setAttemptPresent(hasSessionAttempt(attemptKey)), 0); return () => window.clearTimeout(timer); }, [attemptKey]);
  const
    [choices, setChoices] = useState<Choice[] | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [reason, setReason] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const url = '/orders/' + encodeURIComponent(orderNumber) + '/cancel';
  async function open() {
    setBusy(true);
    try {
      const r = await fetch(url),
        d = (await r.json()) as { error?: string; choices: Choice[] };
      if (!r.ok) throw Error(d.error ?? 'Request failed.');
      setChoices(d.choices);
      setMessage('');
    } catch {
      setMessage('Cancellation options are unavailable. Refresh the order.');
    } finally {
      setBusy(false);
    }
  }
  async function submit(confirm: boolean) {
    if (!catalog.config || !catalog.canSubmit || !formRef.current) {
      setMessage(catalog.message || 'Form configuration is unavailable.'); return;
    }
    if (!formRef.current.reportValidity()) return;
    setBusy(true);
    setMessage('');
    try {
      const configured = readConfiguredSubmission(formRef.current, catalog.config, BASE_KEYS);
      const formPayload = configuredJsonPayload(catalog.config, configured.answers, BASE_KEYS);
      const requestId = confirm ? getOrCreateSessionAttempt(attemptKey) : undefined;
      if (confirm) setAttemptPresent(true);
      const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: confirm ? 'confirm' : 'preview',
            sellerIds: selected,
            fingerprint: preview?.fingerprint,
            requestId,
            reason,
            ...formPayload,
          }),
        }),
        d = (await r.json().catch(() => null)) as (Preview & { id?: string; error?: string; status?: string; code?: string }) | null;
      if (d?.code === 'stale_version') catalog.handleSubmissionResponse(r, d.code);
      if (!d) throw Error('The cancellation response could not be verified. Retry this attempt.');
      if (!r.ok) throw Error(d.error);
      if (confirm) {
        if (typeof d.id !== 'string' || !d.id.trim() || !['cancelled', 'review_requested'].includes(d.status ?? ''))
          throw Error('The cancellation response could not confirm this action. Retry this attempt.');
        setMessage(
          d.status === 'review_requested'
            ? 'Request saved. Responsible team: operations. Staff must review production before any cancellation or money changes.'
            : 'Selected parcels cancelled. The receipt shows the revised amount and wallet restoration.',
        );
        setChoices(null);
        setPreview(null);
        clearSessionAttempt(attemptKey);
        setAttemptPresent(false);
        router.refresh();
      } else {
        if (!validPreview(d)) throw Error('The cancellation preview could not be verified. Review the current amounts again.');
        setPreview(d);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Request failed.');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="w-full space-y-3 rounded-xl border p-4">
      <button
        disabled={busy}
        className="rounded border px-4 py-2"
        onClick={() => void open()}
      >
        Cancel order or seller parcels
      </button>
      {choices ? (
        <form ref={formRef} data-form-id={FORM_ID} onSubmit={(event) => event.preventDefault()} className="space-y-3">
      <FormGuide formId={FORM_ID} />

          <p>
            Cancellation is available until the selected seller parcel is ready
            for pickup. Custom-made production already started requires staff
            review.
          </p>
          {choices.map((c) => (
            <label key={c.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                disabled={!c.eligible || busy}
                checked={selected.includes(c.id)}
              onChange={(e) => {
                  setSelected(
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((id) => id !== c.id),
                  );
                  setPreview(null);
                }}
              />
              <span>
                {c.name} —{' '}
                {!c.eligible
                  ? 'Readiness cutoff reached'
                  : c.reviewRequired
                    ? 'Staff production review required'
                    : 'Available to cancel'}
              </span>
            </label>
          ))}
          <label className="block">
            Reason <span aria-hidden="true">*</span>
            <textarea
              required
              minLength={8}
              maxLength={300}
              className="mt-1 block w-full rounded border p-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /> : null}
          {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
          {attemptPresent ? <div className="space-y-2 text-sm">
            <p>A prior cancellation may have succeeded. Check the order before starting a new attempt.</p>
            <button type="button" disabled={busy} className="rounded border px-4 py-2" onClick={() => {
              if (!window.confirm('A cancellation or review request may already have succeeded. Check the order first. Start a new request reference?')) return;
              clearSessionAttempt(attemptKey); setAttemptPresent(false); setPreview(null); setMessage('');
              if (catalog.status === 'stale') catalog.refresh();
            }}>Start a new cancellation attempt</button>
          </div> : null}
          {preview ? (
            <div className="space-y-2 rounded bg-muted p-3">
              <p>
                Delivery after cancellation: {formatPaisaExact(preview.delivery)}
              </p>
              <p>
                Wallet credit to restore:{' '}
                {formatPaisaExact(preview.walletRestored)}
              </p>
              <p>
                Friend discount removed from cancelled items:{' '}
                {formatPaisaExact(preview.discountRemoved)}
              </p>
              <p className="font-semibold">
                Remaining order COD: {formatPaisaExact(preview.total)}
              </p>
              <p>Already collected: {formatPaisaExact(preview.collected)}</p>
              <p>
                Still to collect:{' '}
                {formatPaisaExact(preview.total - preview.collected)}
              </p>
              <p>
                {preview.reviewRequired
                  ? 'These amounts are an estimate for staff review. Nothing changes until staff approves a current eligible request.'
                  : preview.deliveryPricingPolicy
                    ? 'Delivery was recalculated from the remaining stores: the first store pays the destination base and each additional store adds 50% of that base. Previously recorded collections remain separate.'
                    : 'This historical order keeps its recorded single-fee cancellation rule while any parcel continues. Previously recorded collections remain separate.'}
              </p>
              <button
                type="button"
                disabled={busy || reason.trim().length < 8 || !catalog.canSubmit}
                className="rounded bg-primary px-4 py-2 text-primary-foreground"
                onClick={() => void submit(true)}
              >
                {preview.reviewRequired
                  ? 'Request staff review'
                  : 'Confirm cancellation and revised amount'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || !selected.length || !catalog.canSubmit}
              className="rounded border px-4 py-2"
              onClick={() => void submit(false)}
            >
              Review cancellation amounts
            </button>
          )}
        </form>
      ) : null}
      {message ? <output>{message}</output> : null}
    </section>
  );
}
