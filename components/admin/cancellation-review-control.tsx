'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const FORM_ID = 'staff.cancellation-review';
const BASE_KEYS = ['reviewId', 'action', 'note', 'fingerprint', 'requestId', 'clientAttemptId', 'formVersion', 'customAnswers'];
interface ReviewPreview {
  fingerprint: string; total: number; walletRestored: number; delivery: number;
  deliveryPricingPolicy: string | null;
}
function validPreview(value: unknown): value is ReviewPreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const preview = value as ReviewPreview;
  return typeof preview.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(preview.fingerprint)
    && [preview.total, preview.walletRestored, preview.delivery]
      .every((amount) => typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0)
    && (preview.deliveryPricingPolicy === null || preview.deliveryPricingPolicy === 'base_plus_half_per_additional_store_v1');
}
export function CancellationReviewControl({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const catalog = usePublishedFormConfig(FORM_ID);
  const formRef = useRef<HTMLFormElement>(null);
  const attemptKey = (action: 'approve' | 'reject') => sessionAttemptKey(FORM_ID, `${reviewId}:${action}`);
  const [attempts, setAttempts] = useState({ approve: false, reject: false });
  useEffect(() => { const timer = window.setTimeout(() => setAttempts({
    approve: hasSessionAttempt(sessionAttemptKey(FORM_ID, `${reviewId}:approve`)),
    reject: hasSessionAttempt(sessionAttemptKey(FORM_ID, `${reviewId}:reject`)) }), 0);
    return () => window.clearTimeout(timer); }, [reviewId]);
  const
    [note, setNote] = useState(''),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState<{
      fingerprint: string;
      total: number;
      walletRestored: number;
      delivery: number;
      deliveryPricingPolicy:string|null;
    } | null>(null),
    [busy, setBusy] = useState(false);
  async function act(action: 'preview' | 'approve' | 'reject') {
    if (!catalog.config || !catalog.canSubmit || !formRef.current) {
      setMessage(catalog.message || 'Form configuration is unavailable.'); return;
    }
    if (!formRef.current.reportValidity()) return;
    setBusy(true);
    setMessage('');
    try {
      const configured = readConfiguredSubmission(formRef.current, catalog.config, BASE_KEYS);
      const formPayload = configuredJsonPayload(catalog.config, configured.answers, BASE_KEYS);
      if (action !== 'preview') {
        getOrCreateSessionAttempt(attemptKey(action));
        setAttempts((prior) => ({ ...prior, [action]: true }));
      }
      const r = await fetch('/api/admin/cancellations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviewId,
            action,
            note,
            fingerprint: preview?.fingerprint,
            ...formPayload,
          }),
        }),
        d = (await r.json().catch(() => null)) as {
          id?: string;
          status?: string;
          ok?: boolean;
          error?: string;
          code?: string;
          fingerprint: string;
          total: number;
          walletRestored: number;
          delivery: number;
          deliveryPricingPolicy:string|null;
        } | null;
      if (d?.code === 'stale_version') catalog.handleSubmissionResponse(r, d.code);
      if (!d) throw Error('The review response could not be verified. Retry this attempt.');
      if (!r.ok) throw Error(d.error ?? 'Review failed.');
      if (action === 'preview') {
        if (!validPreview(d)) throw Error('The review preview could not be verified. Review the current amounts again.');
        setPreview(d);
      }
      else {
        const confirmed = action === 'reject' ? d.ok === true
          : typeof d.id === 'string' && Boolean(d.id.trim()) && d.status === 'cancelled';
        if (!confirmed) throw Error('The review response could not confirm this decision. Retry this attempt.');
        clearSessionAttempt(attemptKey(action));
        setAttempts((prior) => ({ ...prior, [action]: false }));
        setMessage('Decision saved.');
        router.refresh();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Review failed.');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form ref={formRef} data-form-id={FORM_ID} onSubmit={(event) => event.preventDefault()} className="space-y-3">
      <p>
        Responsible team: operations. Review production with the seller.
        Approval rechecks the readiness cutoff and current financial amounts.
      </p>
      <label className="block">
        Decision reason *
        <textarea
          required
          minLength={8}
          maxLength={300}
          className="block w-full rounded border p-2"
          value={note}
          onChange={(e) => { setNote(e.target.value); setPreview(null); }}
        />
      </label>
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /> : null}
      {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
      {(['approve', 'reject'] as const).map((action) => attempts[action] ? <div key={action} className="space-y-2 text-sm">
        <p>A prior {action === 'approve' ? 'approval' : 'rejection'} may have succeeded. Check this review before starting again.</p>
        <button type="button" disabled={busy} className="rounded border p-2" onClick={() => {
          if (!window.confirm('This cancellation decision may already have succeeded. Check the review first. Start a new local attempt?')) return;
          clearSessionAttempt(attemptKey(action));
          if (catalog.status === 'stale') catalog.refresh();
          setAttempts((prior) => ({ ...prior, [action]: false }));
          setPreview(null); setMessage('');
        }}>Start a new {action === 'approve' ? 'approval' : 'rejection'} attempt</button>
      </div> : null)}
      <button
        type="button"
        disabled={busy || !catalog.canSubmit}
        className="rounded border p-2"
        onClick={() => void act('preview')}
      >
        Review current cancellation amounts
      </button>
      {preview ? (
        <div>
          <p>
            Remaining COD {formatPaisaExact(preview.total)} · wallet restoration{' '}
            {formatPaisaExact(preview.walletRestored)} · delivery{' '}
            {formatPaisaExact(preview.delivery)}
          </p>
          <p className="text-sm text-muted-foreground">{preview.deliveryPricingPolicy?'Delivery is recalculated from the remaining store count under the saved 50%-increment policy.':'This historical order retains its recorded single-fee cancellation policy.'}</p>
          <button
            type="button"
            disabled={busy || note.trim().length < 8 || !catalog.canSubmit}
            className="rounded border p-2"
            onClick={() => void act('approve')}
          >
            Approve reviewed cancellation
          </button>
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy || note.trim().length < 8 || !catalog.canSubmit}
        className="rounded border p-2"
        onClick={() => void act('reject')}
      >
        Reject with reason
      </button>
      <output>{message}</output>
    </form>
  );
}
