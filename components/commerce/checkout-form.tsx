'use client';

import Link from 'next/link';
import {
  DEFAULT_DELIVERY_RATES,
  type DeliveryRates,
} from '@/lib/checkout/delivery-rates';
import {
  DISTRICTS_BY_PROVINCE,
  normalizeProvince,
  normalizeDistrict,
  districtBelongsToProvince,
} from '@/lib/checkout/nepal-address';
import { LocationPicker } from '@/components/delivery/location-picker';
import { Banknote, LockKeyhole, MapPin, Truck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getDeliveryEstimate,
  parseCheckoutInput,
  NEPAL_PROVINCES,
} from '@/lib/checkout/validation';
import type { CustomerAddressRow } from '@/lib/db/repositories/customers';
import type { ReferralCampaign } from '@/lib/db/repositories/wallet';

interface CartData {
  items: {
    id: string;
    sellerId: string;
    nameEn: string;
    tradingName: string;
    pricePaisa: number;
    quantity: number;
    preparationDays: number;
  }[];
  itemSubtotalPaisa: number;
  itemCount: number;
  hasUnavailableItems: boolean;
}

const checkoutBaseKeys = [
  'customerEmail', 'customerPhone', 'recipientEmail', 'recipientName',
  'recipientPhone', 'province', 'district', 'municipality', 'ward',
  'locality', 'landmark', 'postalCode', 'latitude', 'longitude',
  'saveAddressLabel', 'deliveryFor', 'termsAccepted', 'referralCode',
];

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export function CheckoutForm({
  deliveryRates = DEFAULT_DELIVERY_RATES,
  customerEmail,
  customerPhone,
  customerDisplayName,
  savedAddresses = [],
  walletBalancePaisa = 0,
  referralCampaign,
  initialReferralCode = '',
}: {
  deliveryRates?: DeliveryRates;
  customerEmail?: string;
  customerPhone?: string;
  customerDisplayName?: string;
  savedAddresses?: readonly CustomerAddressRow[];
  walletBalancePaisa?: number;
  referralCampaign?: ReferralCampaign;
  initialReferralCode?: string;
}) {
  const published = usePublishedFormConfig('commerce.checkout');
  const initialAddress =
    savedAddresses.find((item) => item.isDefault) ?? savedAddresses[0];
  const [cart, setCart] = useState<CartData | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [referralCode, setReferralCode] = useState(
    customerEmail ? initialReferralCode : '',
  );
  const [province, setProvince] = useState(
    normalizeProvince(initialAddress?.province ?? '') ?? 'Madhesh',
  );
  const [district, setDistrict] = useState(
    normalizeDistrict(initialAddress?.district ?? '') ??
      initialAddress?.district ??
      '',
  );
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const errorSummary = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error && cart) errorSummary.current?.focus();
  }, [error, cart]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const checkoutAttemptKey = sessionAttemptKey('commerce.checkout', 'cart');
  const [selectedAddress, setSelectedAddress] = useState<
    CustomerAddressRow | undefined
  >(initialAddress);
  const [deliveryFor, setDeliveryFor] = useState<'self' | 'other'>('self');
  const [saveAddressForFuture, setSaveAddressForFuture] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/cart', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Cart could not be loaded.');
        const nextCart = (await response.json()) as CartData;
        if (active) setCart(nextCart);
      })
      .catch(
        (reason: unknown) =>
          active &&
          setError(
            reason instanceof Error
              ? reason.message
              : 'Cart could not be loaded.',
          ),
      );
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const delivery = useMemo(
    () =>
      cart && districtBelongsToProvince(district, province)
        ? getDeliveryEstimate(
            district,
            cart.items.map((item) => item.preparationDays),
            deliveryRates,
            new Set(cart.items.map((item) => item.sellerId)).size,
          )
        : null,
    [district, province, cart, deliveryRates],
  );

  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (
      !cart ||
      cart.items.length === 0 ||
      submitting ||
      cart.hasUnavailableItems ||
      !published.canSubmit || !published.config
    )
      return;
    setError('');
    const data = new FormData(event.currentTarget);
    let configured;
    let requestId: string;
    try {
      configured = readConfiguredSubmission(event.currentTarget, published.config, checkoutBaseKeys);
      requestId = getOrCreateSessionAttempt(checkoutAttemptKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Form answers could not be read.');
      return;
    }
    const request = {
      customerEmail: data.get('customerEmail'),
      customerPhone: data.get('customerPhone'),
      deliveryFor,
      recipientEmail:
        deliveryFor === 'other' ? data.get('recipientEmail') : undefined,
      selectedAddressId: selectedAddress?.id,
      saveAddressForFuture:
        Boolean(customerEmail) && !selectedAddress && saveAddressForFuture,
      saveAddressLabel: data.get('saveAddressLabel'),
      locale: 'en-NP',
      termsAccepted: accepted,
      idempotencyKey: requestId,
      deliveryRateVersion: deliveryRates.version,
      useWallet,
      referralCode: referralCode.trim().toUpperCase(),
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
        location:
          data.get('latitude') && data.get('longitude')
            ? {
                latitude: Number(data.get('latitude')),
                longitude: Number(data.get('longitude')),
              }
            : undefined,
      },
      ...configuredJsonPayload(published.config, configured.answers, checkoutBaseKeys),
    };
    const parsed = parseCheckoutInput(request);
    if (!parsed.value) {
      setError(parsed.errors.join(' '));
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.value),
      });
      const result = (await response.json()) as {
        orderNumber?: string;
        error?: string;
        code?: string;
      };
      if (response.status === 409 && result.code === 'stale_version')
        published.handleSubmissionResponse(response);
      if (!response.ok || !result.orderNumber)
        throw new Error(result.error || 'Order could not be placed.');
      clearSessionAttempt(checkoutAttemptKey);
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
      <div className="grid gap-6 lg:grid-cols-[1fr_23rem]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
        <output className="sr-only">Preparing your checkout…</output>
      </div>
    );
  if (!cart || cart.items.length === 0)
    return (
      <div className="rounded-3xl border bg-card p-8">
        <p role={error ? 'alert' : undefined} className="font-semibold">
          {error || 'Your cart is empty.'}
        </p>
        {error ? (
          <Button
            className="mr-3 mt-5 rounded-full"
            onClick={() => {
              setError('');
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Try loading again
          </Button>
        ) : null}
        <Button render={<Link href="/shop" />} className="mt-5 rounded-full">
          Return to collection
        </Button>
      </div>
    );

  const referralDiscount =
    referralCode.trim() &&
    referralCampaign?.enabled &&
    cart.itemSubtotalPaisa >= referralCampaign.minimumSubtotalPaisa
      ? referralCampaign.friendDiscountPaisa
      : 0;
  const walletUsed = useWallet
    ? Math.min(walletBalancePaisa, cart.itemSubtotalPaisa - referralDiscount)
    : 0;
  const total =
    cart.itemSubtotalPaisa +
    (delivery?.chargePaisa ?? 0) -
    referralDiscount -
    walletUsed;
  return (
    <form
      data-form-id="commerce.checkout"
      onSubmit={submit}
      className="customer-form grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border bg-card p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <MapPin className="size-5" />
            </span>
            <h2 className="font-heading text-2xl">Where should it go?</h2>
          </div>
          <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">Who will receive this order?</legend>
            {(['self', 'other'] as const).map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm">
                <input
                  type="radio"
                  name="deliveryFor"
                  value={value}
                  checked={deliveryFor === value}
                  onChange={() => setDeliveryFor(value)}
                />
                <span>{value === 'self' ? 'For myself' : 'For someone else'}</span>
              </label>
            ))}
          </fieldset>
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
                  setProvince(
                    normalizeProvince(address?.province ?? '') ?? 'Madhesh',
                  );
                  setDistrict(
                    normalizeDistrict(address?.district ?? '') ??
                      address?.district ??
                      '',
                  );
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
            key={`${selectedAddress?.id ?? 'new'}:${deliveryFor}`}
            className="mt-6 grid gap-5 sm:grid-cols-2"
          >
            <Field
              id="recipientName"
              label="Recipient name"
              autoComplete="name"
              defaultValue={selectedAddress?.recipientName ?? (deliveryFor === 'self' ? customerDisplayName : '')}
              required
            />
            {deliveryFor === 'other' ? (
              <div className="space-y-2 sm:col-span-2">
                <Field
                  id="recipientEmail"
                  label="Recipient email (optional)"
                  type="email"
                  autoComplete="email"
                  aria-describedby="recipient-email-help"
                />
                <p id="recipient-email-help" className="text-xs leading-5 text-muted-foreground">
                  Used only for delivery authorization messages. It does not give access to your account, invoice, or order history. A recipient does not need an email account; you can authorize delivery instead.
                </p>
              </div>
            ) : null}
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
            <div className="space-y-2">
              <Field
                id="district"
                label="District"
                autoComplete="address-level2"
                list="checkout-districts"
                aria-describedby="district-help"
                aria-invalid={Boolean(
                  district && !districtBelongsToProvince(district, province),
                )}
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
                required
              />
              <datalist id="checkout-districts">
                {DISTRICTS_BY_PROVINCE[
                  normalizeProvince(province) ?? 'Madhesh'
                ].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </datalist>
              <p
                id="district-help"
                className="text-xs leading-5 text-muted-foreground"
              >
                {district && !districtBelongsToProvince(district, province)
                  ? 'Choose a district in this province. Nawalparasi and Rukum need East or West.'
                  : 'Choose or type your district. The estimate uses our manual tariff; courier coverage is confirmed during order processing.'}
              </p>
            </div>
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
              pattern="0?[1-9]|[1-9][0-9]"
              title="Ward number from 1 to 99"
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
            <LocationPicker
              key={selectedAddress?.id ?? 'new-pin'}
              initial={
                selectedAddress?.latitude != null &&
                selectedAddress?.longitude != null
                  ? {
                      latitude: selectedAddress.latitude,
                      longitude: selectedAddress.longitude,
                    }
                  : undefined
              }
            />
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
            {customerEmail && !selectedAddress ? (
              <div className="space-y-3 sm:col-span-2 rounded-xl border bg-muted/25 p-4">
                <label htmlFor="save-address-for-future" className="flex items-start gap-3 text-sm">
                  <Checkbox
                    id="save-address-for-future"
                    checked={saveAddressForFuture}
                    onCheckedChange={(value) => setSaveAddressForFuture(value === true)}
                  />
                  <span>
                    Save this address for future orders
                    <span className="mt-1 block text-xs text-muted-foreground">
                      This does not change your profile or any existing saved address.
                    </span>
                  </span>
                </label>
                {saveAddressForFuture ? (
                  <Field id="saveAddressLabel" label="Address label" maxLength={80} placeholder="Home, workshop, gift recipient…" required />
                ) : null}
              </div>
            ) : selectedAddress ? (
              <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
                Changes made here apply to this order only. Update the saved entry from My account if you want to reuse those changes.
              </p>
            ) : null}
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
              Pay the remaining cash total to the delivery representative when
              each parcel arrives. Any shopping credit used is shown in your
              order summary.
            </p>
          </div>
        </section>
        {published.config ? (
          <section className="rounded-2xl border bg-card p-5 sm:p-7">
            <h2 className="font-heading text-2xl">Order details</h2>
            <ConfiguredFields config={published.config} baseKeys={checkoutBaseKeys} />
          </section>
        ) : null}
        {!published.canSubmit ? <output>{published.message || 'Loading form…'}</output> : null}
      </div>
      <aside className="h-fit rounded-2xl border bg-card p-6 lg:sticky lg:top-40">
        <h2 className="font-heading text-2xl">Your order</h2>
        <Link href="/cart" className="section-link mt-1">
          Edit your cart →
        </Link>
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
        {customerEmail ? (
          <div className="mt-6 space-y-4 rounded-xl border bg-muted/30 p-4">
            <div>
              <Label htmlFor="referral-code">
                Have a friend’s referral code?
              </Label>
              <Input
                id="referral-code"
                className="mt-2 uppercase"
                value={referralCode}
                maxLength={16}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="16-character code"
                autoComplete="off"
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                First order only.{' '}
                {referralCampaign
                  ? `Rs. ${referralCampaign.friendDiscountPaisa / 100} off Rs. ${referralCampaign.minimumSubtotalPaisa / 100}+ in products. `
                  : ''}
                Eligibility is checked when you place the order. Clear the code
                to order without the offer.
              </p>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={useWallet}
                onCheckedChange={(v) => setUseWallet(v === true)}
                disabled={!walletBalancePaisa}
              />
              <span>
                Use shopping credit · {money(walletBalancePaisa)} available
                <span className="mt-1 block text-xs text-muted-foreground">
                  Applies to products. Delivery remains payable in cash.
                </span>
              </span>
            </label>
          </div>
        ) : (
          <p className="mt-5 text-sm">
            <Link
              href="/login?return_to=%2Fcheckout"
              className="font-semibold text-primary underline"
            >
              Sign in
            </Link>{' '}
            to use a referral code or wallet credit.
          </p>
        )}
        <dl className="mt-6 space-y-3 border-t pt-5 text-sm">
          {referralDiscount > 0 ? (
            <div className="flex justify-between">
              <dt>Referral discount (subject to eligibility)</dt>
              <dd>−{money(referralDiscount)}</dd>
            </div>
          ) : null}
          {walletUsed > 0 ? (
            <div className="flex justify-between">
              <dt>Shopping credit</dt>
              <dd>−{money(walletUsed)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Items</dt>
            <dd>{money(cart.itemSubtotalPaisa)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd>{delivery ? money(delivery.chargePaisa) : 'Enter district'}</dd>
          </div>
          <div className="flex justify-between border-t pt-4 text-base font-semibold">
            <dt>
              {delivery ? 'Total on delivery' : 'Subtotal before delivery'}
            </dt>
            <dd>{delivery ? money(total) : money(cart.itemSubtotalPaisa)}</dd>
          </div>
        </dl>
        {delivery ? (
          <p className="mt-4 flex gap-2 text-sm leading-6 text-muted-foreground">
            <Truck className="mt-1 size-4 shrink-0 text-primary" />
            Estimated arrival: {delivery.estimatedMinDays}–
            {delivery.estimatedMaxDays} days after ordering.
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
            I agree to the{' '}
            <Link
              href="/terms"
              className="font-semibold text-primary underline"
              target="_blank"
            >
              Terms & Conditions
            </Link>
            .
          </span>
        </label>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your information is handled under our{' '}
            <Link
              href="/privacy"
              className="font-semibold text-primary underline"
              target="_blank"
            >
              Privacy Policy
            </Link>{' '}
          and your purchase is also covered by our{' '}
          <Link href="/returns" className="font-semibold text-primary underline" target="_blank">
            Return, Exchange, Cancellation & Refund Policy
          </Link>{' '}
          and{' '}
          <Link href="/shipping" className="font-semibold text-primary underline" target="_blank">
            Shipping & Delivery Policy
          </Link>
          .
        </p>
        {error ? (
          <p
            role="alert"
            ref={errorSummary}
            tabIndex={-1}
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}
        {cart.hasUnavailableItems ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
          >
            An item’s availability changed. Return to your cart to update it
            before placing the order.
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={submitting || cart.hasUnavailableItems || !published.canSubmit}
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
