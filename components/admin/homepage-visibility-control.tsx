'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function HomepageVisibilityControl({
  productId,
  productName,
  hidden,
  version,
  lastReason,
}: {
  productId: string;
  productName: string;
  hidden: boolean;
  version: number;
  lastReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');
  const nextHidden = !hidden;

  function prepare() {
    setReason('');
    setError('');
    setRequestId(crypto.randomUUID());
    setOpen(true);
  }

  async function submit(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (reason.trim().length < 8) {
      setError('Add a clear reason of at least 8 characters.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(productId)}/homepage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hidden: nextHidden,
            expectedVersion: version,
            reason,
            requestId,
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Homepage visibility could not be updated.');
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Homepage visibility could not be updated.',
      );
    } finally {
      setPending(false);
    }
  }

  const Icon = hidden ? Eye : EyeOff;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={
            hidden
              ? 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground'
              : 'rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary'
          }
        >
          {hidden ? 'Hidden from homepage' : 'Eligible for homepage'}
        </span>
        <Button
          type="button"
          variant={hidden ? 'default' : 'outline'}
          size="sm"
          onClick={prepare}
        >
          <Icon /> {hidden ? 'Show on homepage' : 'Hide from homepage'}
        </Button>
      </div>
      {lastReason ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Last decision: {lastReason}
        </p>
      ) : null}
      {error && !open ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {nextHidden ? 'Hide' : 'Show'} {productName} on the homepage?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {nextHidden
                ? 'The product will leave Offers, Latest, and Top Products. It will remain published in the shop and existing links will continue working.'
                : 'The product can appear again when it qualifies for Offers, Latest, or Top Products.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label htmlFor={`homepage-reason-${productId}`} className="text-sm font-semibold">
              Decision reason
            </label>
            <Textarea
              id={`homepage-reason-${productId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Record why this product should be hidden or restored."
            />
            <p className="text-xs text-muted-foreground">
              Required. This decision is recorded in the staff audit log.
            </p>
            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={nextHidden ? 'destructive' : 'default'}
              disabled={pending}
              onClick={submit}
            >
              {pending
                ? 'Saving…'
                : nextHidden
                  ? 'Hide from homepage'
                  : 'Show on homepage'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
