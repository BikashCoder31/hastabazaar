'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendJson } from '@/lib/http/client-request';
import { payoutRequestBlock } from '@/lib/seller/presentation';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const catalogBaseKeys = ['amount', 'availablePaisa', 'note', 'requestId', 'sellerId', 'formVersion', 'customAnswers'];

export function PayoutRequestForm({
  availablePaisa,
  hasOpenRequest,
  sellerId,
}: {
  availablePaisa: number;
  hasOpenRequest: boolean;
  sellerId: string;
}) {
  const router = useRouter();
  const catalog = usePublishedFormConfig('seller.payout-request');
  const attemptKey = sessionAttemptKey('seller.payout-request', sellerId);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const blocked = payoutRequestBlock(
    availablePaisa,
    hasOpenRequest || submitted,
  );
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy || blocked || !catalog.canSubmit || !catalog.config) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const configured = readConfiguredSubmission(event.currentTarget, catalog.config, catalogBaseKeys);
      const requestId = getOrCreateSessionAttempt(attemptKey);
      await sendJson(
        '/api/seller/payout-requests',
        'POST',
        { note: form.get('note'), requestId,
          ...configuredJsonPayload(catalog.config, configured.answers, catalogBaseKeys) },
        'Payout request could not be submitted.',
      );
      setSubmitted(true);
      clearSessionAttempt(attemptKey);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Payout request could not be submitted.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-heading text-2xl">
        <HandCoins className="size-5 text-primary" />
        Request a payout
      </h2>
      <p className="mt-3 text-base leading-7 text-muted-foreground">
        Admin prepares your payout, then a Super Admin approves it.
        Submitting a request does not transfer money.
      </p>
      {blocked ? (
        <output className="mt-4 block rounded-xl bg-secondary p-4 text-sm font-semibold text-primary">
          {blocked}
        </output>
      ) : (
        <form onSubmit={submit} data-form-id="seller.payout-request" className="mt-5 space-y-3">
<p className="text-xs text-muted-foreground">* Required field</p>

          <Label htmlFor="payout-note">Note for the payout reviewer <span aria-hidden="true">*</span></Label>
          <Textarea
            id="payout-note"
            name="note"
            required
            minLength={8}
            maxLength={500}
            disabled={busy}
            placeholder="Add any relevant settlement details (8–500 characters)."
            className="min-h-24 text-base"
          />
          {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={catalogBaseKeys} /> : null}
          {catalog.status !== 'ready' ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Form configuration is unavailable. Please try again.'}</p> : null}
          <Button
            type="submit"
            disabled={busy || !catalog.canSubmit}
            className="min-h-11 rounded-full"
          >
            {busy ? 'Submitting…' : 'Send payout request'}
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
