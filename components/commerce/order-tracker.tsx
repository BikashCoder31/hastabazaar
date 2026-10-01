'use client';
import Link from 'next/link';
import { useState, type SyntheticEvent } from 'react';
import { Check, Package, Truck } from 'lucide-react';
import type { OrderTracking } from '@/lib/db/repositories/order-tracking';
import { orderProgress, orderStages } from '@/lib/orders/progress';
import { sendJson } from '@/lib/http/client-request';

const date = (value: number) =>
  new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(value);
export function OrderTracker({ initialOrder }: { initialOrder: string }) {
  const [orderNumber, setOrder] = useState(initialOrder);
  const [email, setEmail] = useState('');
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function lookup(event: SyntheticEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setTracking(null);
    try {
      const result = await sendJson<{ tracking: OrderTracking }>(
        '/api/orders/track',
        'POST',
        { orderNumber, email },
        'Your order could not be found.',
      );
      setTracking(result.tracking);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const progress = tracking ? orderProgress(tracking.status) : null;
  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={lookup} className="rounded-3xl border bg-card p-6 sm:p-8">
<p className="text-xs text-muted-foreground">* Required field</p>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Order number
             <span aria-hidden="true">*</span><input
              name="orderNumber"
              disabled={busy}
              required
              maxLength={80}
              value={orderNumber}
              onChange={(e) => {
                setOrder(e.target.value);
                setTracking(null);
              }}
              placeholder="e.g. HK-…"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3"
            />
          </label>
          <label className="text-sm font-semibold">
            Checkout email
             <span aria-hidden="true">*</span><input
              name="email"
              disabled={busy}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setTracking(null);
              }}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3"
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          You’ll find your order number on your confirmation page or email.
        </p>
        <button
          disabled={busy}
          className="mt-5 rounded-full bg-primary px-7 py-3 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? 'Checking…' : tracking ? 'Refresh tracking' : 'Track order'}
        </button>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
      <div aria-live="polite" aria-busy={busy}>
        {tracking && progress ? (
          <section
            className="rounded-3xl border bg-card p-6 sm:p-8"
            aria-label="Order progress"
          >
            <div className="flex items-start gap-4">
              <span className="rounded-2xl bg-secondary p-3">
                <Package aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">
                  {tracking.orderNumber}
                </p>
                <h2 className="mt-1 font-heading text-3xl">{progress.label}</h2>
                <p className="mt-2 text-muted-foreground">{progress.detail}</p>
              </div>
            </div>
            {tracking.status !== 'cancelled' ? (
              <ol className="mt-8 space-y-5">
                {orderStages.map((stage, index) => {
                  const recorded = tracking.events.find(
                    (e) => e.status === stage.status,
                  );
                  const done = index <= progress.step;
                  return (
                    <li
                      key={stage.status}
                      aria-current={
                        index === progress.step ? 'step' : undefined
                      }
                      className="flex gap-4"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${done ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                      >
                        {done ? (
                          <Check size={16} aria-hidden="true" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <div>
                        <p
                          className={
                            done ? 'font-semibold' : 'text-muted-foreground'
                          }
                        >
                          {stage.label}
                        </p>
                        {recorded ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {date(recorded.occurredAt)} NPT
                          </p>
                        ) : null}
                        {index === progress.step ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {stage.detail}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-6 rounded-xl bg-secondary p-4">
                This order has been cancelled. Any shopping credit used is
                returned to your wallet.
              </p>
            )}
            <div className="mt-7 space-y-3 border-t pt-6 text-sm">
              {tracking.trackingCode ? (
                <p className="flex gap-2">
                  <Truck size={18} aria-hidden="true" />
                  <span>
                    Delivery reference:{' '}
                    <strong className="break-all">
                      {tracking.trackingCode}
                    </strong>
                  </span>
                </p>
              ) : null}
              {tracking.status !== 'cancelled' &&
              tracking.status !== 'delivered' ? (
                <p>
                  Estimate at checkout: {tracking.estimatedMinDays}–
                  {tracking.estimatedMaxDays} days from order placement. This is
                  an estimate, not a guaranteed arrival date.
                </p>
              ) : null}
              <p>Last order update: {date(tracking.updatedAt)} NPT</p>
              <p className="text-muted-foreground">
                Progress updates when our team records a change. Delivery
                references are for support; live courier location is not
                available.
              </p>
            </div>
          </section>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-5 text-sm font-semibold">
        <Link className="underline underline-offset-4" href="/account/orders">
          View my orders
        </Link>
        <Link className="underline underline-offset-4" href="/help#tracking">
          Need help with delivery?
        </Link>
      </div>
    </div>
  );
}
