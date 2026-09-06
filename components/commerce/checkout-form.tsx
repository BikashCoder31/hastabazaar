'use client';

import Link from 'next/link';
import { Banknote, LockKeyhole, MapPin, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getManualDeliveryQuote,
  NEPAL_PROVINCES,
} from '@/lib/checkout/validation';
import type { CustomerAddressRow } from '@/lib/db/repositories/customers';

interface CartData {
  items: {
    id: string;
    nameEn: string;
    tradingName: string;
    pricePaisa: number;
    quantity: number;
  }[];
  itemSubtotalPaisa: number;
  itemCount: number;
  hasUnavailableItems: boolean;
}

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export function CheckoutForm({
  customerEmail,
  customerPhone,
  savedAddresses = [],
}: {
  customerEmail?: string;
  customerPhone?: string;
  savedAddresses?: readonly CustomerAddressRow[];
}) {
  const initialAddress =
    savedAddresses.find((item) => item.isDefault) ?? savedAddresses[0];
  const [cart, setCart] = useState<CartData | null>(null);
  const [province, setProvince] = useState(
    initialAddress?.province ?? 'Madhesh',
  );
  const [district, setDistrict] = useState(initialAddress?.district ?? '');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [selectedAddress, setSelectedAddress] = useState<
    CustomerAddressRow | undefined
  >(initialAddress);

  useEffect(() => {
    void fetch('/api/cart', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Cart could not be loaded.');
        setCart((await response.json()) as CartData);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : 'Cart could not be loaded.',
        ),
      );
  }, []);

  const delivery = useMemo(
    () =>
      district.trim().length >= 2 ? getManualDeliveryQuote(district) : null,
    [district],
  );

  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (!cart || cart.items.length === 0) return;
    setSubmitting(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const request = {
      customerEmail: data.get('customerEmail'),
      customerPhone: data.get('customerPhone'),
      locale: 'en-NP',
      termsAccepted: accepted,
      idempotencyKey,
      address: {
        recipientName: data.get('recipientName'),
        phone: data.get('recipientPhone'),
        province,
        district: data.get('district'),
        municipality: data.get('municipality'),
        ward: data.get('ward'),
        locality: data.get('locality'),
        landmark: data.get('landmark'),
        postalCode: data.get('postalCode'),
      },
    };
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      const result = (await response.json()) as {
        orderNumber?: string;
        error?: string;
      };
      if (!response.ok || !result.orderNumber)
        throw new Error(result.error || 'Order could not be placed.');
      window.location.assign(
        `/orders/${encodeURIComponent(result.orderNumber)}`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Order could not be placed.',
      );
      setSubmitting(false);
    }
  }

  if (!cart && !error)
    return (
      <div className="rounded-3xl border bg-card p-8 text-muted-foreground">
        Preparing secure checkout…
      </div>
    );
  if (!cart || cart.items.length === 0)
    return (
      <div className="rounded-3xl border bg-card p-8">
        <p className="font-semibold">{error || 'Your cart is empty.'}</p>
        <Button render={<Link href="/shop" />} className="mt-5 rounded-full">
          Return to collection
        </Button>
      </div>
    );

  const total = cart.itemSubtotalPaisa + (delivery?.chargePaisa ?? 0);
  return (
    <form
      onSubmit={submit}
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border bg-card p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <MapPin className="size-5 text-primary" />
            <h2 className="font-heading text-2xl">Delivery details</h2>
          </div>
          {savedAddresses.length ? (
            <div className="mt-5 space-y-2">
              <Label htmlFor="savedAddress">Saved address</Label>
              <select
                id="savedAddress"
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                value={selectedAddress?.id ?? ''}
                onChange={(event) => {
                  const address = savedAddresses.find(
                    (item) => item.id === event.target.value,
                  );
                  setSelectedAddress(address);
                  if (address) {
                    setProvince(address.province);
                    setDistrict(address.district);
                  }
                }}
              >
                <option value="">Enter another address</option>
                {savedAddresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.label} — {address.locality}, {address.district}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div
            key={selectedAddress?.id ?? 'new'}
            className="mt-6 grid gap-5 sm:grid-cols-2"
          >
            <Field
              id="recipientName"
              label="Recipient name"
              autoComplete="name"
              defaultValue={selectedAddress?.recipientName}
              required
            />
            <Field
              id="recipientPhone"
              label="Recipient phone"
              type="tel"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
              defaultValue={selectedAddress?.phone ?? customerPhone}
              required
            />
            <Field
              id="customerEmail"
              label="Order email"
              type="email"
              autoComplete="email"
              defaultValue={customerEmail}
              readOnly={Boolean(customerEmail)}
              required
            />
            <Field
              id="customerPhone"
              label="Contact phone"
              type="tel"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
              defaultValue={customerPhone ?? selectedAddress?.phone}
              required
            />
            <div className="space-y-2">
              <Label htmlFor="province">Province</Label>
              <Select
                value={province}
                onValueChange={(value) => setProvince(value ?? 'Madhesh')}
              >
                <SelectTrigger id="province" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEPAL_PROVINCES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              id="district"
              label="District"
              autoComplete="address-level2"
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              required
            />
            <Field
              id="municipality"
              label="Municipality / rural municipality"
              autoComplete="address-level3"
              defaultValue={selectedAddress?.municipality}
              required
            />
            <Field
              id="ward"
              label="Ward number"
              inputMode="numeric"
              placeholder="Optional"
              defaultValue={selectedAddress?.ward ?? ''}
            />
            <div className="sm:col-span-2">
              <Field
                id="locality"
                label="Street, tole or locality"
                autoComplete="street-address"
                defaultValue={selectedAddress?.locality}
                required
              />
            </div>
            <Field
              id="landmark"
              label="Nearby landmark"
              placeholder="Optional"
              defaultValue={selectedAddress?.landmark ?? ''}
            />
            <Field
              id="postalCode"
              label="Postal code"
              autoComplete="postal-code"
              placeholder="Optional"
              defaultValue={selectedAddress?.postalCode ?? ''}
            />
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <Banknote className="size-5 text-primary" />
            <h2 className="font-heading text-2xl">Payment</h2>
          </div>
          <div className="mt-5 rounded-xl border-2 border-primary bg-primary/5 p-4">
            <p className="font-semibold">Cash on delivery</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Pay the full amount to the delivery representative when your order
              arrives. No online payment is collected now.
            </p>
          </div>
        </section>
      </div>
      <aside className="h-fit rounded-2xl border bg-card p-6 lg:sticky lg:top-28">
        <h2 className="font-heading text-2xl">Your order</h2>
        <ul className="mt-5 space-y-4">
          {cart.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 text-sm">
              <span>
                <strong className="block">
                  {item.nameEn} × {item.quantity}
                </strong>
                <span className="text-muted-foreground">
                  {item.tradingName}
                </span>
              </span>
              <span className="font-semibold">
                {money(item.pricePaisa * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-6 space-y-3 border-t pt-5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Items</dt>
            <dd>{money(cart.itemSubtotalPaisa)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd>{delivery ? money(delivery.chargePaisa) : 'Enter district'}</dd>
          </div>
          <div className="flex justify-between border-t pt-4 text-base font-semibold">
            <dt>Total</dt>
            <dd>{delivery ? money(total) : money(cart.itemSubtotalPaisa)}</dd>
          </div>
        </dl>
        {delivery ? (
          <p className="mt-4 flex gap-2 text-sm leading-6 text-muted-foreground">
            <Truck className="mt-1 size-4 shrink-0 text-primary" />
            Estimated delivery: {delivery.estimatedMinDays}–
            {delivery.estimatedMaxDays} days.
          </p>
        ) : null}
        <label
          htmlFor="checkout-terms"
          className="mt-6 flex cursor-pointer items-start gap-3 text-sm leading-6"
        >
          <Checkbox
            id="checkout-terms"
            checked={accepted}
            onCheckedChange={setAccepted}
            className="mt-1"
          />
          <span>
            I affirmatively accept checkout policy phase-1.0, including
            cancellation before packing, item-level returns, privacy use, and
            the{' '}
            <Link
              href="/help"
              className="font-semibold text-primary hover:underline"
              target="_blank"
            >
              support process
            </Link>
            , for this COD order.
          </span>
        </label>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={
            submitting || !accepted || !delivery || cart.hasUnavailableItems
          }
          className="mt-6 h-12 w-full rounded-full text-base"
        >
          <LockKeyhole /> {submitting ? 'Placing order…' : 'Place COD order'}
        </Button>
        <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
          Availability and price are verified again before confirmation.
        </p>
      </aside>
    </form>
  );
}

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} className="h-11 text-base" {...props} />
    </div>
  );
}
