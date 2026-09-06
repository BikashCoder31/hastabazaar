'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ShippingJobRow } from '@/lib/db/repositories/operations';

interface OrderOption {
  id: string;
  orderNumber: string;
}
export function ShippingConsole({
  jobs,
  orders = [],
  admin = false,
}: {
  jobs: readonly ShippingJobRow[];
  orders?: readonly OrderOption[];
  admin?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function requestJob(form: FormData) {
    setBusy(true);
    setError('');
    const response = await fetch('/api/seller/shipping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId: form.get('orderId'),
        direction: form.get('direction'),
        note: form.get('note'),
        requestId: crypto.randomUUID(),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok) return setError(body.error ?? 'Shipping request failed.');
    router.refresh();
  }
  async function act(id: string, form: FormData) {
    setBusy(true);
    setError('');
    const endpoint = admin
      ? `/api/admin/shipping/${id}`
      : `/api/seller/shipping/${id}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: form.get('action'),
        note: form.get('note'),
        labelReference: form.get('labelReference') || undefined,
        trackingCode: form.get('trackingCode') || undefined,
        claimReference: form.get('claimReference') || undefined,
        reconciliationStatus: form.get('reconciliationStatus') || undefined,
        requestId: crypto.randomUUID(),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok) return setError(body.error ?? 'Shipping action failed.');
    router.refresh();
  }
  return (
    <div className="space-y-5">
      {!admin ? (
        <form
          action={requestJob}
          className="grid gap-3 rounded-2xl border bg-card p-5 md:grid-cols-4"
        >
          <select
            name="orderId"
            required
            className="rounded-lg border bg-background p-3"
          >
            <option value="">Select order</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber}
              </option>
            ))}
          </select>
          <select
            name="direction"
            className="rounded-lg border bg-background p-3"
          >
            <option value="outbound">Customer delivery</option>
            <option value="return">Return pickup</option>
          </select>
          <input
            name="note"
            required
            minLength={8}
            placeholder="Pickup note"
            className="rounded-lg border bg-background p-3"
          />
          <button
            disabled={busy}
            className="rounded-lg bg-primary p-3 font-semibold text-primary-foreground"
          >
            Request coordination
          </button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {jobs.length ? (
        jobs.map((job) => (
          <article key={job.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <strong>{job.orderNumber}</strong>
                <p className="text-sm text-muted-foreground">
                  {job.sellerName} · {job.direction.replace('_', ' ')}
                </p>
              </div>
              <span className="capitalize">
                {job.status.replaceAll('_', ' ')}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>Tracking: {job.trackingCode ?? 'Pending'}</div>
              <div>Label: {job.labelReference ?? 'Pending'}</div>
              <div>Reconciliation: {job.reconciliationStatus}</div>
            </dl>
            <form
              action={act.bind(null, job.id)}
              className="mt-4 grid gap-2 md:grid-cols-3"
            >
              {admin ? (
                <>
                  <select
                    name="action"
                    className="rounded-lg border bg-background p-2 text-sm"
                  >
                    <option value="record_label">Record label</option>
                    <option value="schedule_pickup">Schedule pickup</option>
                    <option value="picked_up">Picked up</option>
                    <option value="in_transit">In transit</option>
                    <option value="delivered">Delivered</option>
                    <option value="open_claim">Open claim</option>
                    <option value="resolve_claim">Resolve claim</option>
                    <option value="reconcile">Reconcile</option>
                  </select>
                  <input
                    name="labelReference"
                    placeholder="Label reference"
                    className="rounded-lg border bg-background p-2 text-sm"
                  />
                  <input
                    name="trackingCode"
                    placeholder="Tracking code"
                    className="rounded-lg border bg-background p-2 text-sm"
                  />
                  <input
                    name="claimReference"
                    placeholder="Claim reference"
                    className="rounded-lg border bg-background p-2 text-sm"
                  />
                  <select
                    name="reconciliationStatus"
                    className="rounded-lg border bg-background p-2 text-sm"
                  >
                    <option value="">No reconciliation change</option>
                    <option value="matched">Matched</option>
                    <option value="variance">Variance</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </>
              ) : (
                <input type="hidden" name="action" value="picked_up" />
              )}
              <input
                name="note"
                required
                minLength={8}
                placeholder="Operational note"
                className="rounded-lg border bg-background p-2 text-sm"
              />
              <button
                disabled={busy}
                className="rounded-lg border p-2 text-sm font-semibold"
              >
                {admin ? 'Apply action' : 'Confirm carrier pickup'}
              </button>
            </form>
          </article>
        ))
      ) : (
        <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          No shipping coordination records.
        </p>
      )}
    </div>
  );
}
