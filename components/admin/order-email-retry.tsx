'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/lib/http/client-request';
import { Button } from '@/components/ui/button';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import {
  manualOrderEmailBatchSize,
  orderEmailExpiryHours,
} from '@/lib/email/order-update-policy';

export function OrderEmailRetry({ readyCount }: { readyCount: number }) {
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const router = useRouter();
  async function retry() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await sendJson<{
        sent: number;
        failed: number;
        cancelled?: number;
        pending?: boolean;
      }>(
        '/api/admin/order-emails/retry',
        'POST',
        {},
        'Email processing failed.',
      );
      setConfirm(false);
      setMessage(
        result.pending
          ? 'Sending is unavailable. Ask the site administrator to check email settings and queue readiness.'
          : `${result.sent} successfully processed · ${result.failed} failed · ${result.cancelled ?? 0} skipped. See delivery history for provider acceptance or local capture.${result.failed ? ' Eligible temporary failures continue automatically with backoff; uncertain acceptance is held for reconciliation.' : ''}`,
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Please check the queue before trying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-xl border bg-card p-4"
      aria-labelledby="send-order-emails-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="send-order-emails-title" className="font-semibold">
            Attempt eligible queued updates
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {readyCount > 0
              ? `${readyCount} ${readyCount === 1 ? 'email is' : 'emails are'} ready across the complete queue. Sending may contact customers immediately.`
              : 'No emails are ready to send. Refresh the page to check for new work.'}
          </p>
        </div>
        <Button
          type="button"
          disabled={busy || readyCount < 1}
          className="shrink-0"
          onClick={() => {
            setError('');
            setConfirm(true);
          }}
        >
          {busy
            ? 'Sending…'
            : `Try sending up to ${manualOrderEmailBatchSize} emails`}
        </Button>
      </div>
      <output aria-live="polite" className="mt-3 block text-sm">
        {message}
      </output>
      {error && !confirm ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ConfirmOperation
        open={confirm}
        onOpenChange={setConfirm}
        pending={busy}
        error={error}
        title="Send eligible order updates?"
        description={`This attempts up to ${manualOrderEmailBatchSize} eligible emails across the complete queue and may contact customers immediately. History filters do not limit sending. Eligibility is checked again. Messages ${orderEmailExpiryHours} hours old, outdated updates and recorded successes are skipped. An interrupted send may have reached the customer before success was recorded; retrying can produce a duplicate. Check the queue before another attempt.`}
        confirmLabel="Confirm sending"
        onConfirm={() => void retry()}
      />
    </section>
  );
}
