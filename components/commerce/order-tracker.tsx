'use client';
import Link from 'next/link';
import { useState, type SyntheticEvent } from 'react';
import { Package } from 'lucide-react';
import type { OrderTracking } from '@/lib/db/repositories/order-tracking';
import { CustomerParcelCard } from '@/components/commerce/customer-parcel-card';
import { customerDateTime, customerParcelState } from '@/lib/orders/customer-parcel-state';
import { HttpResponseError, sendJson } from '@/lib/http/client-request';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { queryFieldPresentation } from '@/lib/catalog/shop-query';
import type { PublishedFormConfig } from '@/lib/forms/types';

export function OrderTracker({
  initialOrder,
  compact = false,
  presentationConfig,
  presentationUnavailable = false,
}: {
  initialOrder: string;
  compact?: boolean;
  presentationConfig?: PublishedFormConfig | null;
  presentationUnavailable?: boolean;
}) {
  // Tracking has a fixed identity contract. Optional published text changes only
  // its presentation, and a known missing publication does not block lookup.
  const [retryPresentation, setRetryPresentation] = useState(false);
  const published = usePublishedFormConfig('commerce.order-tracking', {
    enabled: presentationConfig === undefined || retryPresentation,
  });
  const config = published.config ?? presentationConfig;
  const presentationFailed =
    !config &&
    (published.status === 'unavailable' ||
      (presentationUnavailable && !retryPresentation));
  const presentationLoading =
    retryPresentation && published.status === 'loading';
  function reloadPresentation() {
    if (presentationConfig === undefined || retryPresentation)
      published.refresh();
    setRetryPresentation(true);
  }
  const orderField = queryFieldPresentation('commerce.order-tracking', config, 'orderNumber', { label: 'Order number', placeholder: 'e.g. HK-…' });
  const emailField = queryFieldPresentation('commerce.order-tracking', config, 'email', { label: 'Checkout email', placeholder: 'you@example.com' });
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
    try {
      const result = await sendJson<{ tracking: OrderTracking }>(
        '/api/orders/track',
        'POST',
        { orderNumber, email },
        'Your order could not be found.',
      );
      setTracking(result.tracking);
    } catch (e) {
      if (e instanceof HttpResponseError && e.status < 500 && e.status !== 408 && e.status !== 429) setTracking(null);
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const parcels = tracking?.parcels?.length ? tracking.parcels : tracking ? [{
    status: tracking.status, courierName: null, trackingReference: tracking.trackingCode, trackingUrl: null,
    stageTimes: { placed: tracking.placedAt, delivered: tracking.deliveredAt ?? undefined },
  }] : [];
  return (
    <div className={compact ? "min-w-0 space-y-4" : "mt-6 min-w-0 space-y-6"}>
      <form data-form-id="commerce.order-tracking" onSubmit={lookup} className={compact ? "min-w-0 space-y-3" : "min-w-0 rounded-2xl border border-[#E3D6C3] bg-[#FDFAF5] p-4 sm:p-6"}>
<p className="mb-2 text-xs text-muted-foreground">* Required field</p>
        <div className={compact ? "grid gap-3" : "grid min-w-0 gap-4 sm:grid-cols-2"}>
          <label className="text-sm font-semibold">
            {orderField.label}
             <span aria-hidden="true">*</span><input
              name="orderNumber"
              disabled={busy}
              required
              maxLength={80}
              value={orderNumber}
              onChange={(e) => {
                setOrder(e.target.value);
                setTracking(null);
                setError('');
              }}
              placeholder={orderField.placeholder}
              aria-describedby={orderField.helpText ? 'tracking-order-help' : undefined}
              className="mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-[#DACBB4] bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]"
            />
            {orderField.helpText ? <span id="tracking-order-help" className="mt-1 block text-xs text-muted-foreground">{orderField.helpText}</span> : null}
          </label>
          <label className="text-sm font-semibold">
            {emailField.label}
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
                setError('');
              }}
              placeholder={emailField.placeholder}
              aria-describedby={emailField.helpText ? 'tracking-email-help' : undefined}
              className="mt-1.5 min-h-11 w-full min-w-0 rounded-lg border border-[#DACBB4] bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]"
            />
            {emailField.helpText ? <span id="tracking-email-help" className="mt-1 block text-xs text-muted-foreground">{emailField.helpText}</span> : null}
          </label>
        </div>
        {presentationFailed || presentationLoading ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <output className="text-muted-foreground" aria-live="polite">
              {presentationLoading
                ? 'Loading tracking form…'
                : 'You can still track your order using your order number and checkout email.'}
            </output>
            <button
              type="button"
              onClick={reloadPresentation}
              disabled={presentationLoading}
              className="min-h-11 rounded-lg px-2 font-semibold underline underline-offset-4 disabled:opacity-60"
            >
              Reload tracking form
            </button>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-muted-foreground">
          You’ll find your order number on your confirmation page or email.
        </p>
        <button
          disabled={busy}
          className="mt-4 min-h-11 w-full rounded-[9px] bg-[#14213D] px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-60 sm:w-auto"
        >
          {busy ? 'Checking…' : error ? 'Retry tracking' : tracking ? 'Refresh tracking' : compact ? 'Find my order' : 'Track order'}
        </button>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
      <div aria-live="polite" aria-busy={busy}>
        {tracking ? (
          <section className="space-y-4" aria-label="Order progress">
            {error ? <output className="block rounded-xl bg-secondary p-3 text-sm">Last successful tracking is shown. It may be out of date.</output> : null}
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E8E0D6]"><Package className="size-5" aria-hidden="true" /></span>
              <h2 className="min-w-0 wrap-anywhere font-heading text-2xl">Order {tracking.orderNumber}</h2>
            </div>
            {parcels.map((parcel, index) => (
              <CustomerParcelCard key={index} title={`Parcel ${index + 1}`} parcel={parcel}
                state={customerParcelState({ status: parcel.status })} />
            ))}
            {tracking.status === 'cancelled' ? (
              <p className="rounded-xl bg-secondary p-3 text-sm">This order has been cancelled. Any shopping credit used is returned to your wallet.</p>
            ) : null}
            <div className="space-y-2 text-sm text-[#465573]">
              {!['cancelled', 'delivered'].includes(tracking.status) && tracking.estimatedMinDays !== null && tracking.estimatedMaxDays !== null ? (
                <p>Delivery estimate at checkout: {tracking.estimatedMinDays}–{tracking.estimatedMaxDays} days from order placement.</p>
              ) : null}
              <p>Last order update: {customerDateTime(tracking.updatedAt)} Nepal time</p>
            </div>
          </section>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-5 text-sm font-semibold">
        <Link className="inline-flex min-h-11 items-center rounded-md text-[#A8232E] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]" href="/account/orders">
          View my orders
        </Link>
        <Link className="inline-flex min-h-11 items-center rounded-md text-[#A8232E] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]" href="/help#tracking">
          Need help with delivery?
        </Link>
      </div>
    </div>
  );
}
