'use client';
import { FormGuide } from '@/components/forms/form-guide';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/lib/http/client-request';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const catalogBaseKeys = ['reviewId', 'body', 'version', 'idempotencyKey', 'sellerId', 'formVersion', 'customAnswers'];
export function ReviewReplyForm({
  reviewId,
  version,
  initialBody,
  status,
  sellerId,
}: {
  reviewId: string;
  version: number;
  initialBody: string;
  status: string | undefined;
  sellerId: string;
}) {
  const [body, setBody] = useState(initialBody),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const catalog = usePublishedFormConfig('seller.review-reply');
  const attemptKey = sessionAttemptKey('seller.review-reply', `${sellerId}:${reviewId}`);
  const [hasPendingAttempt, setHasPendingAttempt] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const timeout = window.setTimeout(() => setHasPendingAttempt(hasSessionAttempt(attemptKey)), 0);
    return () => window.clearTimeout(timeout);
  }, [attemptKey]);
  function resetAttempt() {
    if (!window.confirm('A previous reply may already have been saved. Check your reply history first. Starting a new attempt can create a duplicate reply. Start a new review reply attempt anyway?')) return;
    try { sessionStorage.removeItem(attemptKey); }
    catch { setMessage('Browser session storage is unavailable. Please enable it before submitting.'); return; }
    setHasPendingAttempt(false);
    setMessage('New review reply attempt ready.');
  }
  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (busy || !catalog.canSubmit || !catalog.config) return;
    const element = e.currentTarget as HTMLFormElement;
    setBusy(true);
    setMessage('');
    try {
      const configured = readConfiguredSubmission(element, catalog.config, catalogBaseKeys);
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setHasPendingAttempt(true);
      await sendJson(
        `/api/seller/reviews/${encodeURIComponent(reviewId)}/reply`,
        'POST',
        { body, version, idempotencyKey: requestId,
          ...configuredJsonPayload(catalog.config, configured.answers, catalogBaseKeys) },
        'Reply could not be saved.',
      );
      setMessage('Your reply is awaiting moderation.');
      clearSessionAttempt(attemptKey);
      setHasPendingAttempt(false);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} data-form-id="seller.review-reply" className="mt-5 border-t pt-5">
      <FormGuide formId="seller.review-reply" />

      <label className="text-sm font-semibold" htmlFor={`reply-${reviewId}`}>
        {version ? 'Edit your reply' : 'Reply to this customer'}
      </label>
      {status ? (
        <p className="mt-2 text-xs capitalize">Reply status: {status}</p>
      ) : null}
      <textarea
        id={`reply-${reviewId}`}
        required
        minLength={10}
        maxLength={2000}
        disabled={busy}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
        }}
        className="mt-3 min-h-28 w-full rounded-xl border bg-background p-3 text-sm"
      />
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={catalogBaseKeys} /> : null}
      {catalog.status !== 'ready' ? <p role="alert" className="mt-2 text-sm text-destructive">{catalog.message || 'Form configuration is unavailable. Please try again.'}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Keep it helpful and avoid personal information. New and edited replies
        appear after approval; editing removes the previous reply from public
        view while it is reviewed.
      </p>
      <button
        disabled={busy || !catalog.canSubmit}
        className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? 'Submitting…' : 'Submit reply'}
      </button>
      {hasPendingAttempt ? <button type="button" onClick={resetAttempt} disabled={busy}
        className="ml-3 mt-4 rounded-full border px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
        Start a new review reply attempt
      </button> : null}
      <output className="block mt-3 text-sm">
        {message}
      </output>
    </form>
  );
}
