'use client';
import { FormGuide } from '@/components/forms/form-guide';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
export function GiftCardForm({ issue = false }: { issue?: boolean }) {
  const router = useRouter(),
    request = useRef(crypto.randomUUID());
  const formId = issue ? 'commerce.gift-card-issue' : 'commerce.gift-card-redeem';
  const attemptKey = sessionAttemptKey('commerce.gift-card-issue', 'current-staff');
  const published = usePublishedFormConfig(formId);
  const [hasPendingAttempt, setHasPendingAttempt] = useState(false);
  useEffect(() => {
    if (!issue) return;
    const timeout = window.setTimeout(() => setHasPendingAttempt(hasSessionAttempt(attemptKey)), 0);
    return () => window.clearTimeout(timeout);
  }, [issue, attemptKey]);
  const [value, setValue] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<{
      code: string | null;
      id: string;
      amountPaisa: number;
    } | null>(null);
  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!published.canSubmit || !published.config) throw new Error(published.message || 'Form configuration is unavailable.');
      const configured = readConfiguredSubmission(e.currentTarget, published.config, ['amount', 'code']);
      const requestId = issue ? getOrCreateSessionAttempt(attemptKey) : request.current;
      if (issue) setHasPendingAttempt(true);
      const response = await fetch(
        issue ? '/api/admin/gift-cards' : '/api/account/gift-cards',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            ...(issue ? { amount: value } : { code: value }),
            ...configuredJsonPayload(published.config, configured.answers, ['amount', 'code']),
          }),
        },
      );
      const decoded: unknown = await response.json().catch(() => null);
      const data = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
        ? decoded as Record<string, unknown> : null;
      if (!response.ok) {
        if (response.status === 409 && data?.code === 'stale_version')
          published.handleSubmissionResponse(response, 'stale_version');
        setError(typeof data?.error === 'string' ? data.error : 'The operation could not be completed.');
        return;
      }
      if (!data || typeof data.id !== 'string' || data.id.trim().length === 0 || data.id.length > 100 ||
        typeof data.amountPaisa !== 'number' || !Number.isSafeInteger(data.amountPaisa) || data.amountPaisa <= 0 ||
        typeof data.duplicate !== 'boolean' || issue && !(data.duplicate === true && data.code === null ||
          data.duplicate === false && typeof data.code === 'string' && data.code.trim().length > 0 && data.code.length <= 60))
        throw new Error('The result could not be confirmed.');
      setResult({ id: data.id, amountPaisa: data.amountPaisa, code: issue ? data.code as string | null : null });
      if (issue) { clearSessionAttempt(attemptKey); setHasPendingAttempt(false); }
      setValue('');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith('Browser session storage')
        ? cause.message : 'Connection interrupted. Retry this same request to check its result.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="gift-cards" className="rounded-3xl border bg-card p-6">
      <h2 className="font-heading text-2xl">
        {issue ? 'Issue a gift card' : 'Redeem a gift card'}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {issue
          ? 'Choose the shopping-credit value. Anyone with the code can redeem it once while signed in. There is no expiry.'
          : 'Add shopping-only credit to your wallet. Gift cards can be redeemed once and do not expire. Credit cannot be deposited or withdrawn.'}
      </p>
      <Link href="/gift-card-terms" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">Gift card terms</Link>
      {result ? (
        <output className="mt-4 block space-y-3">
          <p>
            {issue
              ? 'Gift card issued.'
              : 'Gift card redeemed. Shopping credit added.'}
          </p>
          {issue && result.code ? (
            <>
              <p className="font-semibold">
                Copy this code now. It will not be shown again after you leave
                this page.
              </p>
              <code className="block break-all rounded border p-3 select-all">
                {result.code}
              </code>
              <button
                type="button"
                className="underline"
                onClick={() => navigator.clipboard.writeText(result.code!)}
              >
                Copy code
              </button>
            </>
          ) : issue ? (
            <p>
              The issuance already completed. The secret code cannot be
              recovered. Review the safe issuance record.
            </p>
          ) : null}
          <p className="text-sm">Reference: {result.id}</p>
          <button
            type="button"
            className="rounded border px-4 py-2"
            onClick={() => {
              setResult(null);
              request.current = crypto.randomUUID();
            }}
          >
            {issue ? 'Issue another gift card' : 'Redeem another code'}
          </button>
        </output>
      ) : (
        <form data-form-id={issue ? 'commerce.gift-card-issue' : 'commerce.gift-card-redeem'} className="mt-4 space-y-3" onSubmit={submit}>
      <FormGuide formId={issue ? 'commerce.gift-card-issue' : 'commerce.gift-card-redeem'} />

          <label className="block text-sm font-medium">
            {issue ? 'Amount in NPR' : 'Gift card code'}<span aria-hidden="true"> *</span>
            <input
              required
              maxLength={issue ? 17 : 60}
              inputMode={issue ? 'decimal' : 'text'}
              autoComplete="off"
              spellCheck={false}
              type={issue ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-2 block w-full rounded-lg border bg-background p-3"
            />
          </label>
          {published.config ? <ConfiguredFields config={published.config} baseKeys={['amount', 'code']} /> : null}
          {!published.canSubmit ? <output className="text-sm">{published.message || 'Loading form…'}</output> : null}
          <button
            disabled={busy || !published.canSubmit}
            className="rounded-lg bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50"
          >
            {busy
              ? 'Saving…'
              : issue
                ? 'Issue gift card'
                : 'Redeem into wallet'}
          </button>
        </form>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {issue && hasPendingAttempt && !result ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>A prior issuance may already have succeeded. Check the issuance record before starting a separate attempt.</p>
          <button type="button" disabled={busy} className="underline" onClick={() => {
            if (!window.confirm('A prior gift card may already have been issued. Start a separate issuance attempt?')) return;
            clearSessionAttempt(attemptKey);
            request.current = crypto.randomUUID();
            setHasPendingAttempt(false);
            setError('');
          }}>Start a separate issuance attempt</button>
        </div>
      ) : null}
    </section>
  );
}
