'use client';
import { FormGuide } from '@/components/forms/form-guide';
import { useId, useRef, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

export function FirstCodConfirmation({ orderId, actorId, compact = false }: { orderId: string; actorId?: string; compact?: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
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
          headers: { 'content-type': 'application/json', ...(actorId ? { [ACTOR_INTENT_HEADER]: actorId } : {}) },
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
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Confirmation could not be saved.',
      );
      setPending(false);
    }
  }
  const form = (
      <form
        data-form-id="staff.first-cod-confirmation"
        onSubmit={submit}
        className="mt-4 space-y-3"
      >
        <FormGuide formId="staff.first-cod-confirmation" />

        <Label htmlFor={inputId}>Confirmation reason</Label>
        <Textarea
          id={inputId}
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
        <Button className="min-h-11" type="submit" disabled={pending}>
          {pending
            ? 'Saving confirmation…'
            : locked
              ? 'Retry this confirmation'
              : 'Confirmed by phone'}
        </Button>
        {compact ? <Button className="min-h-11" type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Go back</Button> : null}
      </form>
  );
  if (compact) return (
    <Dialog open={open} onOpenChange={next => { if (!pending) setOpen(next); }}>
      <DialogTrigger render={<Button className="min-h-11 whitespace-normal" />}>Confirmed by phone</DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Record phone confirmation</DialogTitle>
        <DialogDescription>Confirm that the customer wants this order before the seller starts preparing it.</DialogDescription>
        {form}
      </DialogContent>
    </Dialog>
  );
  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6" aria-labelledby={titleId}>
      <h2 id={titleId} className="font-heading text-2xl">Awaiting COD confirmation</h2>
      <p className="mt-2 text-sm leading-6">Call the customer and confirm this order before it is prepared.</p>
      {form}
    </section>
  );
}
