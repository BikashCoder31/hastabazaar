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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission, digestFormRequest } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

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
import type { CheckoutPromoQuote } from '@/lib/incentives/types';
import { normalizePromoCode } from '@/lib/incentives/promo-policy';
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
  'saveAddressLabel', 'deliveryFor', 'termsAccepted', 'referralCode', 'promoCode', 'promoRevision', 'promoQuoteIntent',
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
  const [promoQuote, setPromoQuote] = useState<CheckoutPromoQuote | null>(null);
  const [promoPendingFor, setPromoPendingFor] = useState<{subtotalPaisa:number;pending:boolean}|null>(null);
  const promoPending=promoPendingFor?.subtotalPaisa===cart?.itemSubtotalPaisa && promoPendingFor?.pending===true;
  const currentPromoQuote=promoQuote?.subtotalPaisa===cart?.itemSubtotalPaisa?promoQuote:null;
  const checkoutIntent = useRef<string | null>(null);
  const freshAttempts = useRef(new Set<string>());
  const [,setAttemptRevision] = useState(0);
  const checkoutFormRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
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
  const retainedAttempt = useSyncExternalStore(subscribeToCheckoutAttempt,()=>hasSessionAttempt(checkoutAttemptKey),()=>false);
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
    nativeEvent?: Event;
  }) {
    event.preventDefault();
    const retryPrior = (event.nativeEvent as SubmitEvent | undefined)?.submitter?.hasAttribute('data-checkout-retry') === true;
    if (
      !cart ||
      (!retryPrior && cart.items.length === 0) ||
      submittingRef.current || (!retryPrior && promoPending) ||
      (!retryPrior && cart.hasUnavailableItems) ||
      !published.canSubmit || !published.config
    )
      return;
    setError('');
    const data = new FormData(event.currentTarget);
    let configured;
    let requestId: string;
    let retainedRetry: CheckoutRetryMetadata | null;
    try {
      configured = readConfiguredSubmission(event.currentTarget, published.config, checkoutBaseKeys);
      const hadAttempt = hasSessionAttempt(checkoutAttemptKey);
      requestId = getOrCreateSessionAttempt(checkoutAttemptKey);
      if (!hadAttempt) freshAttempts.current.add(requestId);
      retainedRetry = readCheckoutRetry(checkoutAttemptKey,requestId);
      if ((hadAttempt && !retainedRetry && !freshAttempts.current.has(requestId)) || (retryPrior && !retainedRetry))
        throw new Error('The prior order retry metadata is unavailable. Check your orders before explicitly starting a new attempt.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Form answers could not be read.');
      return;
    }
    const requestPromo = retryPrior ? retainedRetry?.promo : currentPromoQuote ? {code:currentPromoQuote.code,revision:currentPromoQuote.revision,quoteIntent:currentPromoQuote.quoteIntent} : undefined;
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
      deliveryRateVersion: retryPrior ? retainedRetry?.deliveryRateVersion : deliveryRates.version,
      useWallet: retryPrior ? retainedRetry?.useWallet : useWallet,
      referralCode: requestPromo ? undefined : referralCode.trim().toUpperCase(),
      ...(requestPromo ? {promoCode:requestPromo.code,promoRevision:requestPromo.revision,promoQuoteIntent:requestPromo.quoteIntent} : {}),
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
      ...(retryPrior && retainedRetry ? {formVersion:retainedRetry.formVersion} : {}),
    };
    const parsed = parseCheckoutInput(request);
    if (!parsed.value) {
      setError(parsed.errors.join(' '));
      return;
    }
    if (!retainedRetry && !checkoutIntent.current && currentPromoQuote && (currentPromoQuote.subtotalPaisa !== cart.itemSubtotalPaisa || currentPromoQuote.expiresAt <= Date.now())) {
      setError('Promo terms need a fresh quote. Apply again and review the discount.'); return;
    }
    const intent = JSON.stringify(parsed.value);
    if (checkoutIntent.current && checkoutIntent.current !== intent) {
      setError('This order differs from the prior attempt. Check whether it completed, then explicitly start a new attempt.'); return;
    }
    // Guard before hashing or storage: an async digest must not allow another submit to dispatch.
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const intentHash = await digestFormRequest(parsed.value);
      if (retainedRetry && retainedRetry.intentHash !== intentHash)
        throw new Error('This order differs from the prior attempt. Re-enter the original fields and use Retry prior order attempt. If the form cannot reproduce those fields, check your orders before explicitly starting a new attempt.');
      if (!retainedRetry) {
        if (typeof parsed.value.formVersion !== 'number' || !Number.isSafeInteger(parsed.value.formVersion) || typeof parsed.value.deliveryRateVersion !== 'string')
          throw new Error('Order version information is unavailable. Refresh before submitting.');
        const metadata:CheckoutRetryMetadata = {version:1,requestId,intentHash,formVersion:parsed.value.formVersion,
          deliveryRateVersion:parsed.value.deliveryRateVersion,useWallet:parsed.value.useWallet===true,...(requestPromo?{promo:requestPromo}:{})};
        saveCheckoutRetry(checkoutAttemptKey,metadata);
      }
      checkoutIntent.current = intent;
      setAttemptRevision(value=>value+1);
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.value),
      });
      const decoded: unknown = await response.json().catch(() => null);
      const result = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
        ? decoded as Record<string, unknown> : null;
      if (response.status === 409 && result?.code === 'stale_version')
        published.handleSubmissionResponse(response);
      if (!response.ok)
        throw new Error(typeof result?.error === 'string' ? result.error : 'Order could not be placed.');
      if (typeof result?.orderNumber !== 'string' || result.orderNumber.trim().length === 0 || result.orderNumber.length > 100)
        throw new Error('The order result could not be confirmed. Retry this same request to check its result.');
      clearCheckoutRetry(checkoutAttemptKey);
      window.location.assign(
        `/orders/${encodeURIComponent(result.orderNumber)}`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Order could not be placed.',
      );
      submittingRef.current = false;
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
  if (!cart || (cart.items.length === 0 && !retainedAttempt))
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
        <Button nativeButton={false} render={<Link href="/shop" />} className="mt-5 rounded-full">
          Return to collection
        </Button>
      </div>
    );

  const referralDiscount =
    !currentPromoQuote && referralCode.trim() &&
    referralCampaign?.enabled &&
    cart.itemSubtotalPaisa >= referralCampaign.minimumSubtotalPaisa
      ? referralCampaign.friendDiscountPaisa
      : 0;
  const walletUsed = useWallet
    ? Math.min(walletBalancePaisa, cart.itemSubtotalPaisa - referralDiscount - (currentPromoQuote?.discountPaisa ?? 0))
    : 0;
  const total =
    cart.itemSubtotalPaisa +
    (delivery?.chargePaisa ?? 0) -
    referralDiscount -
    (currentPromoQuote?.discountPaisa ?? 0) -
    walletUsed;
  return (
    <form
      ref={checkoutFormRef}
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
            <CheckoutPromoControl key={cart.itemSubtotalPaisa} subtotalPaisa={cart.itemSubtotalPaisa} referralCode={referralCode} onQuote={setPromoQuote} onPending={pending=>setPromoPendingFor({subtotalPaisa:cart.itemSubtotalPaisa,pending})} disabled={submitting} />
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
            to use a promo code, referral code or wallet credit.
          </p>
        )}
        <dl data-promo-discount-paisa={currentPromoQuote?.discountPaisa ?? 0} className="mt-6 space-y-3 border-t pt-5 text-sm">
          {currentPromoQuote ? <div className="flex justify-between"><dt>Promo discount · {currentPromoQuote.code}</dt><dd>−{money(currentPromoQuote.discountPaisa)}</dd></div> : null}
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
            <dd>{money(total)}</dd>
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
          disabled={submitting || promoPending || cart.items.length === 0 || cart.hasUnavailableItems || !published.canSubmit}
          className="mt-6 h-12 w-full rounded-full text-base"
        >
          <LockKeyhole /> {submitting ? 'Placing order…' : 'Place COD order'}
        </Button>
        {retainedAttempt ? <div className="mt-3 space-y-2 rounded-xl border p-3">
          <p className="text-sm">A prior order attempt may already have completed. Re-enter its original details to check the same request. Retained promo terms are used only for replay and are not a current offer. Retry uses the original shopping-credit choice, even if your current balance changed.</p>
          <Button type="submit" data-checkout-retry className="w-full" variant="outline" disabled={submitting || !published.canSubmit}>Retry prior order attempt</Button>
        </div> : null}
        <Button type="button" variant="outline" className="mt-3 w-full" disabled={submitting} onClick={() => {
          if (!window.confirm("The prior order may already have completed. Check your orders before starting a new attempt to avoid duplicates.")) return;
          clearCheckoutRetry(checkoutAttemptKey); freshAttempts.current.clear(); checkoutIntent.current = null; setAttemptRevision(value=>value+1); setError(""); published.refresh();
        }}>Start a new order attempt</Button>
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

/** Mounted only for authenticated checkout. Guests do not load quote configuration. */
function CheckoutPromoControl({ subtotalPaisa, referralCode, onQuote, onPending, disabled }: {
 subtotalPaisa:number; referralCode:string; onQuote:(quote:CheckoutPromoQuote|null)=>void; onPending:(pending:boolean)=>void; disabled:boolean;
}) {
 const published=usePublishedFormConfig('commerce.promo-quote');
 const [code,setCode]=useState(''); const [quote,setQuote]=useState<CheckoutPromoQuote|null>(null);
 const [loading,setLoading]=useState(false); const [message,setMessage]=useState('');
 const generation=useRef(0);
 useEffect(()=>{const requestGeneration=generation;return ()=>{requestGeneration.current++;};},[]);
 function remove(){generation.current++;setCode('');setQuote(null);onQuote(null);setLoading(false);onPending(false);setMessage('');}
 async function apply(){
  if(disabled||!published.canSubmit||!published.config)return;
  let normalized;
  try{normalized=normalizePromoCode(code);}catch{setMessage('Use 3–32 letters, numbers, hyphens or underscores.');return;}
  const token=++generation.current;setLoading(true);onPending(true);setMessage('');
  try{
   const response=await fetch('/api/checkout/promo',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({code:normalized,formVersion:published.config.version,customAnswers:[]})});
   const decoded:unknown=await response.json();
   if(token!==generation.current)return;
   const result=decoded!==null&&typeof decoded==='object'&&!Array.isArray(decoded)?decoded as Record<string,unknown>:{};
   if(response.status===409&&result.code==='stale_version')published.handleSubmissionResponse(response,'stale_version');
   if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'Promo could not be quoted.');
   if(!validCheckoutPromoQuote(decoded)||decoded.code!==normalized||decoded.subtotalPaisa!==subtotalPaisa||decoded.discountPaisa>subtotalPaisa||decoded.expiresAt<=Date.now())
    throw new Error('The promo quote could not be verified. Review your cart and try again.');
   const nextQuote=decoded;
   if(quote&&(quote.revision!==nextQuote.revision||quote.discountPaisa!==nextQuote.discountPaisa||quote.quoteIntent!==nextQuote.quoteIntent)&&
    !window.confirm('Promo terms changed. Apply the newly quoted discount of '+money(nextQuote.discountPaisa)+'?')){
     setQuote(null);onQuote(null);setMessage('Changed promo terms were not accepted. Apply again to review them.');return;}
   setQuote(nextQuote);onQuote(nextQuote);setCode(normalized);setMessage('Applied '+normalized+' · '+nextQuote.label);
  }catch(reason){if(token===generation.current){setQuote(null);onQuote(null);setMessage(reason instanceof Error?reason.message:'Promo could not be quoted.');}}
  finally{if(token===generation.current){setLoading(false);onPending(false);}}
 }
 return <div className="space-y-2">
  <Label htmlFor="promo-code">Promo code</Label>
  <Input id="promo-code" autoComplete="off" maxLength={32} value={code} disabled={disabled}
   onChange={event=>{generation.current++;setCode(event.target.value);setQuote(null);onQuote(null);setLoading(false);onPending(false);setMessage('');}}/>
  <div className="flex flex-wrap gap-2"><Button type="button" onClick={()=>void apply()} disabled={disabled||!code.trim()||!published.canSubmit}>Apply promo</Button>
   <Button type="button" variant="outline" onClick={remove} disabled={disabled||!code}>Remove promo</Button></div>
  {loading?<output data-promo-loading>Checking promo…</output>:null}
  {message?<p role={quote?'status':'alert'} className="text-sm">{message}</p>:null}
  {published.message?<p role="alert">{published.message}<Button type="button" onClick={published.refresh}>Refresh promo form</Button></p>:null}
  {quote?<p className="text-xs">Minimum products: {money(quote.minimumSubtotalPaisa)}. Ends {new Date(quote.expiresAt).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'})}. Live revision {quote.revision}.</p>:null}
  <p className="text-xs text-muted-foreground">Promo and referral discounts cannot be combined.{referralCode.trim()&&quote?' Your promo is selected; the referral code will not be submitted.':''} Delivery remains payable. Apply again to review updated terms.</p>
 </div>;
}


function validCheckoutPromoQuote(value:unknown):value is CheckoutPromoQuote {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const q=value as Record<string,unknown>;
 return typeof q.campaignId==='string'&&q.campaignId.length>0&&typeof q.code==='string'&&typeof q.label==='string'&&
 typeof q.revision==='number'&&Number.isSafeInteger(q.revision)&&q.revision>0&&
 typeof q.discountPaisa==='number'&&Number.isSafeInteger(q.discountPaisa)&&q.discountPaisa>=0&&
 typeof q.subtotalPaisa==='number'&&Number.isSafeInteger(q.subtotalPaisa)&&q.subtotalPaisa>=0&&
 typeof q.minimumSubtotalPaisa==='number'&&Number.isSafeInteger(q.minimumSubtotalPaisa)&&q.minimumSubtotalPaisa>=0&&
 typeof q.expiresAt==='number'&&Number.isSafeInteger(q.expiresAt)&&typeof q.quoteIntent==='string'&&/^[0-9a-f]{64}$/.test(q.quoteIntent);
}


const subscribeToCheckoutAttempt = () => () => undefined;
interface CheckoutRetryMetadata {
  version: 1;
  requestId: string;
  intentHash: string;
  formVersion: number;
  deliveryRateVersion: string;
  useWallet: boolean;
  promo?: { code: string; revision: number; quoteIntent: string };
}
function validCheckoutRetry(value: unknown, requestId: string): value is CheckoutRetryMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const metadata = value as Record<string,unknown>;
  if (Object.keys(metadata).some(key=>!['version','requestId','intentHash','formVersion','deliveryRateVersion','useWallet','promo'].includes(key)) ||
    metadata.version !== 1 || typeof metadata.useWallet !== 'boolean' || metadata.requestId !== requestId || !/^[0-9a-f-]{36}$/i.test(requestId) ||
    typeof metadata.intentHash !== 'string' || !/^[0-9a-f]{64}$/.test(metadata.intentHash) ||
    typeof metadata.formVersion !== 'number' || !Number.isSafeInteger(metadata.formVersion) || metadata.formVersion < 1 ||
    typeof metadata.deliveryRateVersion !== 'string' || !metadata.deliveryRateVersion.trim() || metadata.deliveryRateVersion.length > 120)
    return false;
  if (metadata.promo === undefined) return true;
  if (!metadata.promo || typeof metadata.promo !== 'object' || Array.isArray(metadata.promo)) return false;
  const promo = metadata.promo as Record<string,unknown>;
  if (Object.keys(promo).some(key=>!['code','revision','quoteIntent'].includes(key)) ||
    typeof promo.code !== 'string' || typeof promo.revision !== 'number' || !Number.isSafeInteger(promo.revision) || promo.revision < 1 ||
    typeof promo.quoteIntent !== 'string' || !/^[0-9a-f]{64}$/.test(promo.quoteIntent)) return false;
  try { return normalizePromoCode(promo.code) === promo.code; } catch { return false; }
}
function readCheckoutRetry(key: string, requestId: string): CheckoutRetryMetadata | null {
  try {
    const raw = sessionStorage.getItem(key+':retry-metadata');
    if (raw === null) return null;
    if (raw.length > 1024) throw new Error();
    const decoded:unknown = JSON.parse(raw);
    if (!validCheckoutRetry(decoded,requestId)) throw new Error();
    return decoded;
  } catch {
    throw new Error('The prior order retry metadata could not be verified. Check your orders before explicitly starting a new attempt.');
  }
}
function saveCheckoutRetry(key: string, metadata: CheckoutRetryMetadata): void {
  try {
    if (!validCheckoutRetry(metadata,metadata.requestId)) throw new Error();
    const raw = JSON.stringify(metadata);
    if (raw.length > 1024) throw new Error();
    sessionStorage.setItem(key+':retry-metadata',raw);
  } catch {
    throw new Error('Browser session storage could not retain this order attempt. No order was sent. Enable storage before retrying.');
  }
}
function clearCheckoutRetry(key: string): void {
  clearSessionAttempt(key);
  try { sessionStorage.removeItem(key+':retry-metadata'); }
  catch { /* A confirmed result cannot be reversed by storage failure. */ }
}
