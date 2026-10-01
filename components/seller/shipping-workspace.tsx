'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PackageCheck, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
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
import { StatusBadge } from '@/components/admin/status-badge';
import { sendJson } from '@/lib/http/client-request';
import type { ShippingJobRow } from '@/lib/db/repositories/operations';

export function SellerShippingWorkspace({
  jobs,
  orders,
}: {
  jobs: readonly ShippingJobRow[];
  orders: readonly { id: string; orderNumber: string }[];
}) {
  const router = useRouter();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function requestJob(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await sendJson(
        '/api/seller/shipping',
        'POST',
        {
          orderId: form.get('orderId'),
          direction: form.get('direction'),
          note: form.get('note'),
          requestId,
        },
        'Shipping request could not be sent.',
      );
      setMessage(
        'Request recorded for manual coordination. A pickup is not booked yet.',
      );
      setRequestId(crypto.randomUUID());
      element.reset();
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Shipping request could not be sent.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="seller-form space-y-6">
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-2xl">
          <Truck className="size-5 text-primary" />
          Request coordination
        </h2>
        {orders.length ? (
          <form
            onSubmit={requestJob}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
<p className="text-xs text-muted-foreground">* Required field</p>

            <div className="space-y-2">
              <Label htmlFor="shipping-order">Order <span aria-hidden="true">*</span></Label>
              <NativeSelect
                id="shipping-order"
                name="orderId"
                required
                disabled={busy}
                className="w-full"
              >
                <NativeSelectOption value="">
                  Select your order
                </NativeSelectOption>
                {orders.map((order) => (
                  <NativeSelectOption key={order.id} value={order.id}>
                    {order.orderNumber}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shipping-direction">Direction</Label>
              <NativeSelect
                id="shipping-direction"
                name="direction"
                disabled={busy}
                className="w-full"
              >
                <NativeSelectOption value="outbound">
                  Customer delivery
                </NativeSelectOption>
                <NativeSelectOption value="return">
                  Return pickup
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="shipping-note">Pickup note <span aria-hidden="true">*</span></Label>
              <Input
                id="shipping-note"
                name="note"
                required
                minLength={8}
                disabled={busy}
                placeholder="Include packing or collection details for operations."
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="min-h-11 w-fit rounded-full"
            >
              {busy ? 'Sending…' : 'Request coordination'}
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            You can request shipping once an order contains items from your
            shop.
          </p>
        )}
        {message ? (
          <output className="mt-4 block text-sm text-primary">{message}</output>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
      <section>
        <h2 className="mb-4 font-heading text-2xl">Shipping records</h2>
        {jobs.length ? (
          <div className="space-y-4">
            {jobs.map((job) => (
              <ShippingRecord key={job.id + ':' + job.status} job={job} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-base text-muted-foreground">
            No shipping coordination records yet.
          </p>
        )}
      </section>
    </div>
  );
}

function ShippingRecord({ job }: { job: ShippingJobRow }) {
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function recordPickup() {
    if (busy || job.status !== 'pickup_scheduled') return;
    setBusy(true);
    setError('');
    try {
      await sendJson(
        '/api/seller/shipping/' + encodeURIComponent(job.id),
        'POST',
        { action: 'picked_up', note, requestId },
        'Pickup could not be recorded.',
      );
      setConfirm(false);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Pickup could not be recorded.',
      );
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  const pickupTime = (value: number) =>
    new Intl.DateTimeFormat('en-NP', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kathmandu',
    }).format(value);
  return (
    <article className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="break-all font-semibold">{job.orderNumber}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.direction === 'return' ? 'Return pickup' : 'Customer delivery'}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Tracking reference</dt>
          <dd className="mt-1 break-all font-medium">
            {job.trackingCode || 'Not assigned'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Label reference</dt>
          <dd className="mt-1 break-all font-medium">
            {job.labelReference || 'Not recorded'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Pickup window (Nepal time)</dt>
          <dd className="mt-1">
            {job.pickupWindowStart
              ? pickupTime(job.pickupWindowStart)
              : 'No time recorded'}
            {job.pickupWindowEnd ? ' – ' + pickupTime(job.pickupWindowEnd) : ''}
          </dd>
        </div>
      </dl>
      {job.status === 'pickup_scheduled' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) setConfirm(true);
          }}
          className="mt-5 space-y-3 border-t pt-5"
        >
<p className="text-xs text-muted-foreground">* Required field</p>

          <Label htmlFor={'pickup-' + job.id}>
            Collection confirmation note <span aria-hidden="true">*</span>
          </Label>
          <Input
            id={'pickup-' + job.id}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            minLength={8}
            required
            disabled={busy}
            placeholder="Record who collected the parcel and when."
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy || note.trim().length < 8}
            className="min-h-11 rounded-full"
          >
            <PackageCheck />
            Confirm carrier pickup
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!busy) setConfirm(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Has this parcel been collected?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm only after the physical pickup. This records the handover
              for operations; it does not contact the carrier or mark the order
              delivered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Go back</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void recordPickup();
              }}
            >
              {busy ? 'Recording…' : 'Record pickup'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
