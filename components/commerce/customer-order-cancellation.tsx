'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
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
export function CustomerOrderCancellation({
  orderNumber,
}: {
  orderNumber: string;
}) {
  const router = useRouter(),
    [choices, setChoices] = useState<Choice[] | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [reason, setReason] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    request = useRef(crypto.randomUUID());
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
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: confirm ? 'confirm' : 'preview',
            sellerIds: selected,
            fingerprint: preview?.fingerprint,
            requestId: request.current,
            reason,
          }),
        }),
        d = (await r.json()) as Preview & { error?: string; status?: string };
      if (!r.ok) throw Error(d.error);
      if (confirm) {
        setMessage(
          d.status === 'review_requested'
            ? 'Request saved. Responsible team: operations. Staff must review production before any cancellation or money changes.'
            : 'Selected parcels cancelled. The receipt shows the revised amount and wallet restoration.',
        );
        setChoices(null);
        setPreview(null);
        request.current = crypto.randomUUID();
        router.refresh();
      } else setPreview(d);
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
        <>
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
                disabled={busy || reason.trim().length < 8}
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
              disabled={busy || !selected.length}
              className="rounded border px-4 py-2"
              onClick={() => void submit(false)}
            >
              Review cancellation amounts
            </button>
          )}
        </>
      ) : null}
      {message ? <output>{message}</output> : null}
    </section>
  );
}
