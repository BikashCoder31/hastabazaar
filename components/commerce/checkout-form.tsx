'use client';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import {canonicalKey} from '@/lib/forms/field-keys';
import { SellerDisclosure } from './seller-disclosure';
import { CustomerServiceFeeBreakdown } from './customer-service-fee-breakdown';

import { FormGuide } from '@/components/forms/form-guide';
import Link from 'next/link';
import {ContactVerificationPanel} from '@/components/account/contact-verification';
import type {CheckoutContactPolicy, ContactVerificationStatus} from '@/lib/auth/contact-verification';
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission, digestFormRequest } from '@/lib/forms/client-submission';
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
import { DELIVERY_ESTIMATE_NOTICE } from '@/lib/checkout/delivery-presentation';
import { normalizeNepalMobile } from '@/lib/auth/nepal-phone';
import type { CustomerAddressRow } from '@/lib/db/repositories/customers';
import type { CheckoutPromoQuote } from '@/lib/incentives/types';
import { normalizePromoCode } from '@/lib/incentives/promo-policy';
import {calculateBenefitTotals} from '@/lib/incentives/benefit-combinations';
import type { ReferralCampaign } from '@/lib/db/repositories/wallet';
import { parseReviewedCheckoutQuote, type NcmDemoDeliveryQuote, type ReviewedCheckoutQuote } from '@/lib/checkout/reviewed-quote';

type CartData = import('@/lib/db/repositories/cart').CartView;

const checkoutBaseKeys = [
  'paymentMethod','customerEmail', 'customerPhone', 'recipientEmail', 'recipientName',
  'recipientPhone', 'province', 'district', 'municipality', 'ward',
  'locality', 'landmark', 'postalCode', 'latitude', 'longitude',
  'saveAddressLabel', 'deliveryFor', 'termsAccepted', 'referralCode', 'promoCode', 'promoRevision', 'promoQuoteIntent',
];

const checkoutBuiltInKeys = new Set(checkoutBaseKeys.map(canonicalKey));

function money(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

import type {CheckoutPaymentCapabilities} from '@/lib/checkout/payment-capabilities';
import { serviceFeeSnapshot, INITIAL_PLATFORM_SERVICE_FEE, type PlatformServiceFeeSnapshot } from '@/lib/checkout/platform-service-fee';

export function CheckoutForm(props:Omit<Parameters<typeof ScopedCheckoutForm>[0],'attemptScope'|'isCurrentScope'>){
  const scope=JSON.stringify([props.customerId??null,props.cartScope??null]);
  const lease=useMemo(()=>({scope}),[scope]);
  const currentScope=useRef<typeof lease|null>(null);
  useLayoutEffect(()=>{currentScope.current=lease;return()=>{if(currentScope.current===lease)currentScope.current=null;};},[lease]);
  return <ScopedCheckoutForm key={scope} {...props} attemptScope={scope} isCurrentScope={()=>currentScope.current===lease}/>;
}

function ScopedCheckoutForm({
  attemptScope,isCurrentScope,
  paymentCapabilities={cod:false,manual_bank:false,state:'unknown'},
  pricingRuleVersion,
  serviceFee = serviceFeeSnapshot(INITIAL_PLATFORM_SERVICE_FEE, null),
  deliveryRates = DEFAULT_DELIVERY_RATES,
  ncmDemoQuotesEnabled = false,
  customerEmail,
  customerPhone,
  contactStatus,
  contactPolicy = 'email_and_phone',
  customerId,
  customerDisplayName,
  savedAddresses = [],
  walletBalancePaisa = 0,
  referralCampaign,
  initialReferralCode = '',
  policyContext,
}: {
  attemptScope:string;
  isCurrentScope:()=>boolean;
  cartScope?:string;
  paymentCapabilities?:CheckoutPaymentCapabilities;
  pricingRuleVersion?: ReviewedCheckoutQuote['lines'][number]['pricingRuleVersion'];
  serviceFee?: PlatformServiceFeeSnapshot;
  deliveryRates?: DeliveryRates;
  ncmDemoQuotesEnabled?: boolean;
  customerEmail?: string;
  customerPhone?: string;
  contactStatus?: ContactVerificationStatus|null;
  contactPolicy?: CheckoutContactPolicy;
  customerId?:string;
  customerDisplayName?: string;
  savedAddresses?: readonly CustomerAddressRow[];
  walletBalancePaisa?: number;
  referralCampaign?: ReferralCampaign;
  initialReferralCode?: string;
  policyContext?: string;
}) {
  const stillCurrent=useRef(true);
  useEffect(()=>{stillCurrent.current=true;return()=>{stillCurrent.current=false;};},[]);
  const [legacyAcknowledged,setLegacyAcknowledged]=useState(false);
  const legacyAttempt=useSyncExternalStore(subscribeToCheckoutAttempt,()=>hasSessionAttempt(sessionAttemptKey('commerce.checkout','cart')),()=>false);
  const published = usePublishedFormConfig('commerce.checkout', { enabled: Boolean(customerId) });
  const initialAddress =
    savedAddresses.find((item) => item.isDefault) ?? savedAddresses[0];
  const [cart, setCart] = useState<CartData | null>(null);
  const [paymentMethod,setPaymentMethod]=useState<'cod'|'manual_bank'>(paymentCapabilities.manual_bank&&!paymentCapabilities.cod?'manual_bank':'cod');
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
  const [province, setProvince] = useState<string>(
    normalizeProvince(initialAddress?.province ?? '') ?? '',
  );
  const [district, setDistrict] = useState(
    normalizeDistrict(initialAddress?.district ?? '') ??
      initialAddress?.district ??
      '',
  );
  const [acceptedPolicyContext, setAcceptedPolicyContext] = useState<string | null>(null);
  const accepted = Boolean(policyContext) && acceptedPolicyContext === policyContext;
  const [submitting, setSubmitting] = useState(false);
  const [currentContacts,setCurrentContacts]=useState<ContactVerificationStatus|null>(contactStatus??null);
  const accountPhone = normalizeNepalMobile(customerPhone ?? '');
  const contactsVerified=Boolean(accountPhone)&&
    normalizeNepalMobile(currentContacts?.phone ?? '') === accountPhone &&
    currentContacts?.emailVerified===true&&
    (contactPolicy==='email_only'||currentContacts?.phoneVerified===true);
  const [error, setError] = useState('');
  const [accessDenied,setAccessDenied]=useState(false);
  useEffect(()=>{
    if(!customerId)return;
    const denied=(event:Event)=>{
      if((event as CustomEvent<{actorId?:unknown}>).detail?.actorId!==customerId||!stillCurrent.current||!isCurrentScope())return;
      checkoutFormRef.current?.reset();setCurrentContacts(null);setAccessDenied(true);
    };
    window.addEventListener('hb:account-access-denied',denied);
    return()=>window.removeEventListener('hb:account-access-denied',denied);
  },[customerId,isCurrentScope]);
  const [contactReload,setContactReload]=useState(0);
  const [quoteChanged, setQuoteChanged] = useState(false);
  const errorSummary = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error && cart) errorSummary.current?.focus();
  }, [error, cart]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const checkoutAttemptKey = sessionAttemptKey('commerce.checkout', attemptScope);
  const retainedAttempt = useSyncExternalStore(subscribeToCheckoutAttempt,()=>hasSessionAttempt(checkoutAttemptKey),()=>false);
  const [selectedAddress, setSelectedAddress] = useState<
    CustomerAddressRow | undefined
  >(initialAddress);
  const [deliveryFor, setDeliveryFor] = useState<'self' | 'other'>('self');
  const [recipientEmail, setRecipientEmail] = useState('');
  // Keep these legacy controls available only when reconstructing a retained request.
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

  const estimatedDelivery = useMemo(
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
  const [ncmQuoteAttempt, setNcmQuoteAttempt] = useState(0);
  const ncmQuoteRequest = useMemo(() => {
    if (!ncmDemoQuotesEnabled || quoteChanged || !cart?.items.length || cart.hasUnavailableItems || !districtBelongsToProvince(district, province)) return null;
    return { district, attempt: ncmQuoteAttempt };
  }, [ncmDemoQuotesEnabled, quoteChanged, cart, district, province, ncmQuoteAttempt]);
  const [ncmQuoteResult, setNcmQuoteResult] = useState<{
    request: NonNullable<typeof ncmQuoteRequest>;
    quote?: { quotes: NcmDemoDeliveryQuote[]; deliveryPaisa: number };
    error?: string;
  }>();
  useEffect(() => {
    if (!ncmQuoteRequest) return;
    const controller = new AbortController();
    fetch('/api/checkout/ncm-demo-quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: controller.signal, body: JSON.stringify({ district: ncmQuoteRequest.district }),
    }).then(async response => {
      const result = await response.json().catch(() => null) as { quotes?: NcmDemoDeliveryQuote[]; deliveryPaisa?: number; error?: unknown } | null;
      if (!response.ok || !Array.isArray(result?.quotes) || typeof result.deliveryPaisa !== 'number' ||
        !Number.isSafeInteger(result.deliveryPaisa) || result.deliveryPaisa < 0)
        throw new Error(typeof result?.error === 'string' ? result.error : 'NCM demo delivery quotes are unavailable.');
      if (!controller.signal.aborted) setNcmQuoteResult({
        request: ncmQuoteRequest, quote: { quotes: result.quotes, deliveryPaisa: result.deliveryPaisa },
      });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setNcmQuoteResult({
        request: ncmQuoteRequest,
        error: error instanceof Error ? error.message : 'NCM demo delivery quotes are unavailable.',
      });
    });
    return () => controller.abort();
  }, [ncmQuoteRequest]);
  const currentNcmQuote = ncmQuoteResult?.request === ncmQuoteRequest ? ncmQuoteResult : undefined;
  const delivery = !ncmDemoQuotesEnabled ? estimatedDelivery : estimatedDelivery && currentNcmQuote?.quote
    ? { ...estimatedDelivery, chargePaisa: currentNcmQuote.quote.deliveryPaisa } : null;

  const itemSubtotal = cart?.itemSubtotalPaisa ?? 0;
  const referralDiscount = !currentPromoQuote && referralCode.trim() && referralCampaign?.enabled &&
    itemSubtotal >= referralCampaign.minimumSubtotalPaisa ? referralCampaign.friendDiscountPaisa : 0;
  const walletUsed = useWallet
    ? Math.min(walletBalancePaisa, itemSubtotal - referralDiscount - (currentPromoQuote?.discountPaisa ?? 0)) : 0;
  let total:number|null=null;
  try{total=calculateBenefitTotals({merchandisePaisa:itemSubtotal,promoPaisa:currentPromoQuote?.discountPaisa??0,referralPaisa:referralDiscount,creditPaisa:walletUsed,deliveryPaisa:delivery?.chargePaisa??0,customerFeePaisa:serviceFee.chargedPaisa}).payablePaisa;}catch{/* Preserve the cart and require a new review of invalid benefit amounts. */}

  // The submit event supplies the clock; read it only when checking a new order.
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
    nativeEvent?: Event;
  },now:()=>number) {
    event.preventDefault();
    if(!isCurrentScope())return;
    const retryPrior = (event.nativeEvent as SubmitEvent | undefined)?.submitter?.hasAttribute('data-checkout-retry') === true;
    if(!retryPrior&&legacyAttempt&&!legacyAcknowledged){setError('Check your orders before explicitly starting a new attempt.');return;}
    if(!retryPrior&&!paymentCapabilities[paymentMethod]){setError('This payment method is currently unavailable. Choose an available method; your cart remains saved.');return;}
    if(total===null&&!retryPrior){setError('Review the updated merchandise and benefits before placing this order.');return;}
    if (
      !cart ||
      (!retryPrior && (!cart.items.length || !delivery)) ||
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
      paymentMethod:retryPrior?retainedRetry?.paymentMethod??'cod':paymentMethod,
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
      reviewedQuote: retryPrior ? retainedRetry?.reviewedQuote : {
        lines: cart.items.map(item => {
          const { id, sellerId, pricePaisa, quantity, offerId, offerVersionId, publicVersionId, revision } = item;
          const pricedOffer = pricingRuleVersion
            && item.selectedOffer?.pricingRuleVersion === pricingRuleVersion
            && offerId && offerVersionId && publicVersionId && Number.isSafeInteger(revision);
          return {
            id, sellerId, pricePaisa, quantity,
            ...(offerId ? { offerId, offerVersionId, publicVersionId, revision } : {}),
            ...(pricedOffer ? { pricingRuleVersion } : {}),
          };
        }),
        deliveryPaisa: delivery?.chargePaisa ?? 0, walletPaisa: walletUsed,
        ...(currentNcmQuote?.quote ? { ncmDemoQuotes: currentNcmQuote.quote.quotes } : {}),
        referralPaisa: referralDiscount, promoPaisa: currentPromoQuote?.discountPaisa ?? 0,
        payablePaisa: total, policyContext, serviceFee,
        referralCampaign: !requestPromo && referralCode.trim() ? referralCampaign ?? null : null,
      },
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
    if (!retainedRetry && !checkoutIntent.current && currentPromoQuote && (currentPromoQuote.subtotalPaisa !== cart.itemSubtotalPaisa || currentPromoQuote.expiresAt <= now())) {
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
      if(!stillCurrent.current||!isCurrentScope())return;
      if (retainedRetry && retainedRetry.intentHash !== intentHash)
        throw new Error('This order differs from the prior attempt. Re-enter the original fields and use Retry prior order attempt. If the form cannot reproduce those fields, check your orders before explicitly starting a new attempt.');
      if (!retainedRetry) {
        if (typeof parsed.value.formVersion !== 'number' || !Number.isSafeInteger(parsed.value.formVersion) || typeof parsed.value.deliveryRateVersion !== 'string')
          throw new Error('Order version information is unavailable. Refresh before submitting.');
        const metadata:CheckoutRetryMetadata = {version:1,requestId,intentHash,...(parsed.value.paymentMethod?{paymentMethod:parsed.value.paymentMethod}:{}),formVersion:parsed.value.formVersion,
          deliveryRateVersion:parsed.value.deliveryRateVersion,useWallet:parsed.value.useWallet===true,reviewedQuote:parsed.value.reviewedQuote,...(requestPromo?{promo:requestPromo}:{})};
        saveCheckoutRetry(checkoutAttemptKey,metadata);
      }
      checkoutIntent.current = intent;
      setAttemptRevision(value=>value+1);
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [ACTOR_INTENT_HEADER]:customerId??'' },
        body: JSON.stringify(parsed.value),
      });
      const decoded: unknown = await response.json().catch(() => null);
      const result = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
        ? decoded as Record<string, unknown> : null;
      if(!stillCurrent.current||!isCurrentScope())return;
      if(response.status===401||response.status===403&&result?.code!=='contact_verification_required'){
        checkoutFormRef.current?.reset();setAccessDenied(true);
        throw new Error('The signed-in account or access changed. Reload checkout for the current account. The original attempt reference remains with its original account and cart.');
      }
      if(response.status===403&&result?.code==='contact_verification_required'){setCurrentContacts(null);setContactReload(value=>value+1);}
      if (response.status === 409 && result?.code === 'stale_version')
        published.handleSubmissionResponse(response, 'stale_version');
      if ((response.status === 409 && result?.code === 'quote_changed') ||
        (ncmDemoQuotesEnabled && response.status === 503 && result?.code === 'ncm_quote_unavailable')) {
        setQuoteChanged(true);
        if (ncmDemoQuotesEnabled) setNcmQuoteResult(undefined);
      }
      if (!response.ok)
        throw new Error(typeof result?.error === 'string' ? result.error : 'Order could not be placed.');
      if (typeof result?.orderNumber !== 'string' || result.orderNumber.trim().length === 0 || result.orderNumber.length > 100)
        throw new Error('The order result could not be confirmed. Retry this same request to check its result.');
      clearCheckoutRetry(checkoutAttemptKey);
      window.location.assign(
        `/orders/${encodeURIComponent(result.orderNumber)}`,
      );
    } catch (reason) {
      if(!stillCurrent.current||!isCurrentScope())return;
      setError(
        reason instanceof Error ? reason.message : 'Order could not be placed.',
      );
      submittingRef.current = false;
      if(stillCurrent.current)setSubmitting(false);
    }
  }

  if(accessDenied)return <section className="space-y-4 rounded-xl border p-5"><p role="alert">The signed-in account or access changed. Previous private checkout fields are hidden. Reload checkout for the current account.{retainedAttempt?' The original attempt reference has been kept; check the original account’s orders before starting another attempt.':''}</p><Button type="button" onClick={()=>window.location.reload()}>Reload current checkout</Button></section>;
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

  const recoveryOnly=cart.items.length===0&&retainedAttempt;
  return (
    <form
      ref={checkoutFormRef}
      data-form-id="commerce.checkout"
      onSubmit={event=>void submit(event,Date.now)}
      className="customer-form grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]"
    >
      <FormGuide formId="commerce.checkout" />
      {legacyAttempt&&!legacyAcknowledged?<p role="alert" className="rounded-xl border p-4 lg:col-span-2">A prior order attempt could not be matched safely to this account and cart. Check your orders before explicitly starting a new attempt.</p>:null}

      <div className="space-y-6">
        <ContactVerificationPanel key={`${customerId??'guest'}:${customerEmail??''}:${customerPhone??''}:${contactReload}`}
          ownerKey={customerId} initialStatus={contactStatus} onStatusChange={setCurrentContacts}
          contactPolicy={contactPolicy}/>
        <section className="rounded-2xl border bg-card p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <MapPin className="size-5" />
            </span>
            <h2 className="font-heading text-2xl">Where should it go?</h2>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Fields marked required must be completed. Optional fields can be left blank.</p>
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
                    normalizeProvince(address?.province ?? '') ?? '',
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
            key={selectedAddress?.id ?? 'new'}
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
                  value={recipientEmail}
                  onChange={event => setRecipientEmail(event.target.value)}
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
            <div className="space-y-2">
              <Field
                id="customerPhone"
                label="Contact phone"
                type="tel"
                autoComplete="tel"
                placeholder="98XXXXXXXX"
                defaultValue={customerPhone ?? ''}
                readOnly={Boolean(customerEmail)}
                aria-describedby="checkout-contact-phone-help"
                required
              />
              <p id="checkout-contact-phone-help" className="text-xs leading-5 text-muted-foreground">
                {accountPhone ? 'Uses the Nepal mobile saved in your account.' : 'Add a valid Nepal mobile to your account before ordering.'}{' '}
                <Link href="/account/profile" className="underline">Update contact phone</Link>.
              </p>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="province" required>Province</FieldLabel>
              <Select
                name="province"
                required
                value={province || null}
                onValueChange={(value) => setProvince(value ?? '')}
              >
                <SelectTrigger id="province" aria-required="true" className="h-11 w-full">
                  <SelectValue placeholder="Select a province" />
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
                disabled={!normalizeProvince(province)}
                onChange={(event) => setDistrict(event.target.value)}
                required
              />
              <datalist id="checkout-districts">
                {(normalizeProvince(province) ? DISTRICTS_BY_PROVINCE[normalizeProvince(province)!] : []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </datalist>
              <p
                id="district-help"
                className="text-xs leading-5 text-muted-foreground"
              >
                {!province ? 'Select a province first, then choose your district.' : district && !districtBelongsToProvince(district, province)
                  ? 'Choose a district in this province. Nawalparasi and Rukum need East or West.'
                  : ncmDemoQuotesEnabled ? 'Choose Kathmandu to request an NCM demo delivery quote for each seller.'
                    : `Choose or type your district. ${DELIVERY_ESTIMATE_NOTICE}`}
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
            <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
              Your delivery address is saved automatically after your order is placed. An unchanged saved address is reused. Edited details are saved as a new address; existing saved addresses stay unchanged.
            </p>
            {retainedAttempt && customerEmail && !selectedAddress ? (
              <div className="space-y-3 sm:col-span-2 rounded-xl border bg-muted/25 p-4">
                <p className="text-xs leading-5 text-muted-foreground">For an older order retry, restore its original save choice and label. New delivery addresses are now saved automatically.</p>
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
            ) : null}
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <Banknote className="size-5 text-primary" />
            <h2 className="font-heading text-2xl">Payment</h2>
          </div>
          <div className="mt-5 space-y-3">
            {paymentCapabilities.cod?<label className="block rounded-xl border p-4"><input type="radio" name="paymentMethod" value="cod" checked={paymentMethod==='cod'} onChange={()=>setPaymentMethod('cod')} disabled={submitting}/> <span className="font-semibold">Cash on delivery</span><p className="mt-1 text-sm leading-6 text-muted-foreground">Pay the remaining cash total to the delivery representative for each parcel.</p></label>:null}
            {paymentCapabilities.manual_bank?<label className="block rounded-xl border p-4"><input type="radio" name="paymentMethod" value="manual_bank" checked={paymentMethod==='manual_bank'} onChange={()=>setPaymentMethod('manual_bank')} disabled={submitting}/> <span className="font-semibold">Manual bank transfer</span><p className="mt-1 text-sm leading-6 text-muted-foreground">Your order will provide original company bank instructions and a 24-hour payment deadline. Submit the amount and payment date after transferring; a reference or image is optional. Preparation starts after verified funds and release checks.</p></label>:null}
            {!paymentCapabilities.cod&&!paymentCapabilities.manual_bank?<p>New payment methods are currently unavailable for this cart. A retained prior attempt can still be checked below.</p>:null}
          </div>
        </section>
        {published.config && published.config.fields.some((field) =>
          field.status === 'active' && !checkoutBuiltInKeys.has(canonicalKey(field.key))) ? (
          <section className="rounded-2xl border bg-card p-5 sm:p-7">
            <h2 className="font-heading text-2xl">Order details</h2>
            <ConfiguredFields config={published.config} baseKeys={checkoutBaseKeys} />
          </section>
        ) : published.config ? (
          <input type="hidden" name="formVersion" value={published.config.version} />
        ) : null}
        {published.status !== 'inactive' && !published.canSubmit ? (
          <section className="space-y-3 rounded-2xl border bg-card p-5 sm:p-7" aria-label="Checkout preparation">
            <output className="block" aria-live="polite">
              {published.status === 'loading'
                ? 'Preparing checkout…'
                : published.status === 'stale'
                  ? 'Checkout details changed. Reload checkout and review your answers before trying again.'
                  : 'We couldn’t prepare checkout. Please retry.'}
            </output>
            <p className="text-sm text-muted-foreground">
              Your entered details stay in this page while checkout reloads. Review them before placing your order.
            </p>
            <Button type="button" variant="outline" disabled={published.status === 'loading' || submitting}
              onClick={published.refresh}>
              {published.status === 'loading' ? 'Loading checkout…' : 'Retry loading checkout'}
            </Button>
          </section>
        ) : null}
      </div>
      <aside className="h-fit self-start rounded-2xl border bg-card p-6">
        <h2 className="font-heading text-2xl">{recoveryOnly?'Check prior order attempt':'Your order'}</h2>
        <Link href="/cart" className="section-link mt-1">
          Edit your cart →
        </Link>
        {!recoveryOnly?<>
        <ul className="mt-5 space-y-4">
          {cart.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 text-sm">
              <span className="min-w-0">
                <strong className="block">
                  {item.nameEn} × {item.quantity}
                </strong>
                {item.selectedOffer ? <span className="block text-xs text-muted-foreground">{item.selectedOffer.selection.map(option=>`${option.name}: ${option.value}`).join(' / ')} · {item.selectedOffer.unitsPerOffer} {item.selectedOffer.baseUnit} per offer · {item.selectedOffer.sku}</span> : null}
                <span className="text-muted-foreground">
                  {item.tradingName}
                  <SellerDisclosure managed={item.participationRoute === 'managed_maker'} supplierName={item.makerName ?? item.tradingName} legalSellerName={item.legalSellerName} />
                </span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-semibold">
                {item.pricePaisa === null ? 'Review price' : money(item.pricePaisa * item.quantity)}
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
                  Applies to products. {serviceFee.chargedPaisa > 0 ? 'Delivery and the customer service fee remain' : 'Delivery remains'} payable {paymentMethod === 'manual_bank' ? 'by bank transfer' : 'in cash'}.
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
            <dd>{delivery ? money(delivery.chargePaisa) : ncmDemoQuotesEnabled && quoteChanged ? 'Review delivery quotes' : currentNcmQuote?.error ? 'Quote unavailable' : ncmQuoteRequest ? 'Quote pending' : 'Enter district'}</dd>
          </div>
          {currentNcmQuote?.quote?.quotes.map(quote => (
            <div key={quote.sellerId} className="flex justify-between gap-4 text-sm">
              <dt className="min-w-0 break-words">{cart.items.find(item => item.sellerId === quote.sellerId)?.tradingName ?? quote.originBranch} · {quote.originBranch} to {quote.destinationBranch}</dt>
              <dd className="shrink-0 whitespace-nowrap">{money(quote.amountPaisa)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t pt-4 text-base font-semibold">
            <dt>
              {delivery ? paymentMethod==='manual_bank'?'Total by bank transfer':'Total on delivery' : 'Subtotal before delivery'}
            </dt>
            <dd>{total===null?'Review updated benefits':money(total)}</dd>
          </div>
        </dl>
        {ncmQuoteRequest && !currentNcmQuote ? <output className="mt-3 block text-sm">Checking NCM demo delivery quotes…</output> : null}
        {currentNcmQuote?.error ? (
          <div className="mt-3 space-y-2 text-sm">
            <p role="alert">{currentNcmQuote.error}</p>
            <Button type="button" variant="outline" onClick={() => setNcmQuoteAttempt(attempt => attempt + 1)}>Retry delivery quotes</Button>
          </div>
        ) : null}
        <CustomerServiceFeeBreakdown
          className="mt-3 border-t pt-3"
          standardPaisa={'standardPaisa' in serviceFee ? serviceFee.standardPaisa : serviceFee.chargedPaisa}
          waivedPaisa={'waivedPaisa' in serviceFee ? serviceFee.waivedPaisa : 0}
          netPaisa={serviceFee.chargedPaisa}
          campaignName={'campaign' in serviceFee ? serviceFee.campaign?.name ?? null : null}
          source="estimate"
        />
        {delivery ? (
          <p className="mt-4 flex gap-2 text-sm leading-6 text-muted-foreground">
            <Truck className="mt-1 size-4 shrink-0 text-primary" />
            {ncmDemoQuotesEnabled ? 'Marketplace arrival estimate' : 'Estimated arrival:'} {delivery.estimatedMinDays}–
            {delivery.estimatedMaxDays} days {paymentMethod==='manual_bank'?'after verified payment and fulfillment release':'after ordering'}.
          </p>
        ) : null}
        </>:<p className="mt-5 text-sm leading-6">Your cart is currently empty. A prior attempt may have completed. Re-enter its original details and retry the same request to check its result. No new price or arrival estimate is available here.</p>}
        <label
          htmlFor="checkout-terms"
          className="mt-6 flex cursor-pointer items-start gap-3 text-sm leading-6"
        >
          <Checkbox
            id="checkout-terms"
            checked={accepted}
            onCheckedChange={(value) => setAcceptedPolicyContext(value === true ? policyContext ?? null : null)}
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
            . <span className="text-xs text-muted-foreground">(required)</span>
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
        {quoteChanged ? <Button type="button" variant="outline" className="mt-3 w-full" disabled={submitting} onClick={() => {
          if (submittingRef.current) return;
          clearCheckoutRetry(checkoutAttemptKey);
          window.location.reload();
        }}>Review updated checkout</Button> : null}
        {!recoveryOnly?<Button
          type="submit"
          disabled={(legacyAttempt&&!legacyAcknowledged) || !paymentCapabilities[paymentMethod] || submitting || promoPending || cart.items.length === 0 || cart.hasUnavailableItems || !published.canSubmit || !contactsVerified || !accepted || !delivery}
          className="mt-6 h-12 w-full rounded-full text-base"
        >
          <LockKeyhole /> {submitting ? 'Placing order…' : paymentMethod==='manual_bank'?'Place bank-transfer order':'Place COD order'}
        </Button>:null}
        {retainedAttempt ? <div className="mt-3 space-y-2 rounded-xl border p-3">
          <p className="text-sm">A prior order attempt may already have completed. Re-enter its original details to check the same request. Retained promo terms are used only for replay and are not a current offer. Retry uses the original shopping-credit choice, even if your current balance changed.</p>
          <Button type="submit" data-checkout-retry className="w-full" variant="outline" disabled={submitting || !published.canSubmit}>Retry prior order attempt</Button>
        </div> : null}
        <Button type="button" variant="outline" className="mt-3 w-full" disabled={submitting} onClick={() => {
          if (!window.confirm("The prior order may already have completed. Check your orders before starting a new attempt to avoid duplicates.")) return;
          setLegacyAcknowledged(true); clearCheckoutRetry(checkoutAttemptKey); freshAttempts.current.clear(); checkoutIntent.current = null; setAttemptRevision(value=>value+1); setError(""); setQuoteChanged(false); published.refresh();
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
  required,
  ...props
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      <Input id={id} name={id} className="h-11 text-base" required={required} {...props} />
    </div>
  );
}

function FieldLabel({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
  const alreadyOptional = typeof children === 'string' && /\(optional\)/i.test(children);
  return <Label htmlFor={htmlFor}>
    {children}
    {required ? <><span aria-hidden="true"> *</span><span className="text-xs text-muted-foreground">(required)</span></>
      : !alreadyOptional ? <span className="text-xs text-muted-foreground">(optional)</span> : null}
  </Label>;
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
  <Link href="/promo-code-terms" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">Promo code terms</Link>
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
  paymentMethod?:'cod'|'manual_bank';
  version: 1;
  requestId: string;
  intentHash: string;
  formVersion: number;
  deliveryRateVersion: string;
  useWallet: boolean;
  promo?: { code: string; revision: number; quoteIntent: string };
  reviewedQuote?: ReviewedCheckoutQuote;
}
function validCheckoutRetry(value: unknown, requestId: string): value is CheckoutRetryMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const metadata = value as Record<string,unknown>;
  if (Object.keys(metadata).some(key=>!['version','requestId','intentHash','formVersion','deliveryRateVersion','useWallet','promo','reviewedQuote','paymentMethod'].includes(key)) ||
    metadata.version !== 1 || typeof metadata.useWallet !== 'boolean' || metadata.requestId !== requestId || !/^[0-9a-f-]{36}$/i.test(requestId) ||
    typeof metadata.intentHash !== 'string' || !/^[0-9a-f]{64}$/.test(metadata.intentHash) ||
    typeof metadata.formVersion !== 'number' || !Number.isSafeInteger(metadata.formVersion) || metadata.formVersion < 1 ||
    typeof metadata.deliveryRateVersion !== 'string' || !metadata.deliveryRateVersion.trim() || metadata.deliveryRateVersion.length > 120)
    return false;
  if(metadata.paymentMethod!==undefined&&metadata.paymentMethod!=='cod'&&metadata.paymentMethod!=='manual_bank')return false;
  if (metadata.reviewedQuote !== undefined) {
    try { parseReviewedCheckoutQuote(metadata.reviewedQuote); } catch { return false; }
  }
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
    if (raw.length > 16384) throw new Error();
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
    if (raw.length > 16384) throw new Error();
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
