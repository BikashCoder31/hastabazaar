'use client';
import { useRef, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
export function FirstCodConfirmation({ orderId }: { orderId: string }) {
  const router = useRouter();
  const attempt = useRef<{ requestId: string; reason: string } | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (reason.trim().length < 8) {
      setError(
        'Describe how you confirmed the buyer and order, using at least 8 characters.',
      );
      return;
    }
    attempt.current ??= {
      requestId: crypto.randomUUID(),
      reason: reason.trim(),
    };
    setLocked(true);
    setPending(true);
    try {
      const response = await fetch(
        '/api/admin/orders/' +
          encodeURIComponent(orderId) +
          '/first-cod-confirmation',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(attempt.current),
        },
      );
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || result?.ok !== true)
        throw new Error(
          result?.error ||
            'Confirmation could not be verified. Retry the same decision.',
        );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Confirmation could not be saved.',
      );
      setPending(false);
    }
  }
  return (
    <section
      className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6"
      aria-labelledby="cod-confirmation-title"
    >
      <h2 id="cod-confirmation-title" className="font-heading text-2xl">
        Awaiting COD confirmation
      </h2>
      <p className="mt-2 text-sm leading-6">
        This buyer has no delivered order history and placed a cash-on-delivery
        order of NPR 5,000 or more before shopping credit. Confirm the buyer and
        order before releasing packing or delivery.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Label htmlFor="cod-confirmation-reason">Confirmation reason</Label>
        <Textarea
          id="cod-confirmation-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={8}
          maxLength={500}
          required
          disabled={locked}
          placeholder="Record how you confirmed the buyer and this order."
        />
        <p className="text-sm">
          This records your approval and reason in the audit history.
          Cancellation remains available.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending
            ? 'Saving confirmation…'
            : locked
              ? 'Retry this confirmation'
              : 'Confirm COD order'}
        </Button>
      </form>
    </section>
  );
}
