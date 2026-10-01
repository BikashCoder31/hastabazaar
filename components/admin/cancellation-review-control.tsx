'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
export function CancellationReviewControl({ reviewId }: { reviewId: string }) {
  const router = useRouter(),
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
  async function act(action: string) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/cancellations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviewId,
            action,
            note,
            fingerprint: preview?.fingerprint,
          }),
        }),
        d = (await r.json()) as {
          error?: string;
          fingerprint: string;
          total: number;
          walletRestored: number;
          delivery: number;
          deliveryPricingPolicy:string|null;
        };
      if (!r.ok) throw Error(d.error ?? 'Review failed.');
      if (action === 'preview') setPreview(d);
      else {
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
    <div className="space-y-3">
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
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        disabled={busy}
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
            disabled={busy || note.trim().length < 8}
            className="rounded border p-2"
            onClick={() => void act('approve')}
          >
            Approve reviewed cancellation
          </button>
        </div>
      ) : null}
      <button
        disabled={busy || note.trim().length < 8}
        className="rounded border p-2"
        onClick={() => void act('reject')}
      >
        Reject with reason
      </button>
      <output>{message}</output>
    </div>
  );
}
