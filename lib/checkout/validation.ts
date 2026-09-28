import {DEFAULT_DELIVERY_RATES,DELIVERY_PRICING_POLICY,deliveryChargeForStores,type DeliveryRates} from './delivery-rates';
import {parseLocation} from '@/lib/delivery/validation';
import type { NepalAddress } from '@/lib/shipping/provider';

import {normalizeProvince,normalizeDistrict,districtBelongsToProvince,validWard} from './nepal-address';
export {NEPAL_PROVINCES} from './nepal-address';

export interface CheckoutInput {
  customerEmail: string;
  customerPhone: string;
  deliveryFor?: 'self' | 'other';
  recipientEmail?: string;
  selectedAddressId?: string;
  saveAddressForFuture?: boolean;
  saveAddressLabel?: string;
  locale: 'en-NP' | 'ne-NP';
  address: NepalAddress;
  termsAccepted: boolean;
  idempotencyKey: string;
  deliveryRateVersion?: string;
  useWallet?: boolean;
  referralCode?: string;
  promoCode?: string;
  promoRevision?: number;
  promoQuoteIntent?: string;
  /** Server-only authenticated subject; the public parser rejects this key. */
  customerAuthSubject?: string;
  formVersion?: unknown;
  customAnswers?: unknown;
}

export interface CheckoutValidationResult {
  value?: CheckoutInput;
  errors: readonly string[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(?:\+?977)?\d{7,10}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function phone(value: unknown): string {
  return text(value).replace(/[\s()-]/g, '');
}

export function parseCheckoutInput(body: unknown): CheckoutValidationResult {
  if (!body || typeof body !== 'object')
    return { errors: ['Checkout details are required.'] };
  const source = body as Record<string, unknown>;
  const rawAddress =
    source.address && typeof source.address === 'object'
      ? (source.address as Record<string, unknown>)
      : {};
  const value: CheckoutInput = {
    customerEmail: text(source.customerEmail).toLowerCase(),
    customerPhone: phone(source.customerPhone),
    deliveryFor: source.deliveryFor === 'other' ? 'other' : 'self',
    recipientEmail:
      source.deliveryFor === 'other'
        ? text(source.recipientEmail).toLowerCase() || undefined
        : undefined,
    selectedAddressId: text(source.selectedAddressId) || undefined,
    saveAddressForFuture: source.saveAddressForFuture === true,
    saveAddressLabel: text(source.saveAddressLabel) || undefined,
    locale: source.locale === 'ne-NP' ? 'ne-NP' : 'en-NP',
    termsAccepted: source.termsAccepted === true,
    idempotencyKey: text(source.idempotencyKey),
    deliveryRateVersion: text(source.deliveryRateVersion) || undefined,
    useWallet: source.useWallet === true,
    referralCode: text(source.referralCode).toUpperCase(),
    ...(source.promoCode !== undefined ? {promoCode: text(source.promoCode).toUpperCase()} : {}),
    ...(source.promoRevision !== undefined ? {promoRevision: source.promoRevision as number} : {}),
    ...(source.promoQuoteIntent !== undefined ? {promoQuoteIntent: text(source.promoQuoteIntent)} : {}),
    formVersion: source.formVersion,
    customAnswers: source.customAnswers,
    address: {
      recipientName: text(rawAddress.recipientName),
      phone: phone(rawAddress.phone),
      province: normalizeProvince(text(rawAddress.province)) ?? text(rawAddress.province),
      district: normalizeDistrict(text(rawAddress.district)) ?? text(rawAddress.district),
      municipality: text(rawAddress.municipality),
      ward: text(rawAddress.ward) || undefined,
      locality: text(rawAddress.locality),
      landmark: text(rawAddress.landmark) || undefined,
      postalCode: text(rawAddress.postalCode) || undefined,
    },
  };
  const errors: string[] = [];
  if (Object.hasOwn(source, 'customerAuthSubject')) errors.push('Invalid checkout request.');
  if (source.promoCode !== undefined || source.promoRevision !== undefined || source.promoQuoteIntent !== undefined) {
    if (!value.promoCode || typeof source.promoCode !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(source.promoCode.trim()) ||
      !Number.isSafeInteger(value.promoRevision) || Number(value.promoRevision) < 1 ||
      !value.promoQuoteIntent || !/^[a-f0-9]{64}$/.test(value.promoQuoteIntent))
      errors.push('Apply the promo again to review the current quote.');
    if (value.referralCode) errors.push('A promo and referral code cannot be combined.');
  }
  try { value.address.location = parseLocation(rawAddress.location); } catch { errors.push('Select a valid delivery map pin or remove it.'); }
  if (value.referralCode && !/^[A-Z0-9]{16}$/.test(value.referralCode))
    errors.push('Enter a valid 16-character referral code.');
  if (
    !EMAIL_PATTERN.test(value.customerEmail) ||
    value.customerEmail.length > 254
  )
    errors.push('Enter a valid email address.');
  if (!PHONE_PATTERN.test(value.customerPhone))
    errors.push('Enter a valid Nepal contact number.');
  if (
    value.recipientEmail &&
    (!EMAIL_PATTERN.test(value.recipientEmail) || value.recipientEmail.length > 254)
  )
    errors.push('Enter a valid optional recipient email address.');
  if (value.selectedAddressId && !/^[a-zA-Z0-9_-]{1,100}$/.test(value.selectedAddressId))
    errors.push('Select a valid saved address.');
  if (value.saveAddressForFuture && value.selectedAddressId)
    errors.push('A one-order edit cannot overwrite a saved address. Save it as a new address instead.');
  if (
    value.saveAddressForFuture &&
    (!value.saveAddressLabel || value.saveAddressLabel.length > 80)
  )
    errors.push('Add a short label before saving this address for future orders.');
  if (
    value.address.recipientName.length < 2 ||
    value.address.recipientName.length > 100
  )
    errors.push('Recipient name must be 2–100 characters.');
  if (!PHONE_PATTERN.test(value.address.phone))
    errors.push('Enter a valid recipient phone number.');
  if (!normalizeProvince(value.address.province))
    errors.push('Select a valid Nepal province.');
  if (!districtBelongsToProvince(value.address.district,value.address.province))
    errors.push('Choose a district in your selected province. For Nawalparasi or Rukum, choose East or West.');
  for (const [label, field, maximum] of [
    ['District', value.address.district, 80],
    ['Municipality', value.address.municipality, 100],
    ['Locality', value.address.locality, 160],
  ] as const) {
    if (field.length < 2 || field.length > maximum)
      errors.push(`${label} must be 2–${maximum} characters.`);
  }
  if (!validWard(value.address.ward))
    errors.push('Ward must be a number from 1–99.');
  if (value.address.ward && validWard(value.address.ward)) value.address.ward=String(Number(value.address.ward));
  if (value.address.landmark && value.address.landmark.length > 160)
    errors.push('Landmark must be 160 characters or fewer.');
  if (value.address.postalCode && value.address.postalCode.length > 12)
    errors.push('Postal code must be 12 characters or fewer.');
  if (!value.termsAccepted)
    errors.push('Accept the Terms & Conditions to place the order.');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.idempotencyKey,
    )
  )
    errors.push('Refresh checkout and try again.');
  return errors.length ? { errors } : { errors, value };
}

const TERAI_DISTRICTS = new Set([
  'bara',
  'bardiya',
  'banke',
  'chitwan',
  'dang',
  'dhanusha',
  'jhapa',
  'kailali',
  'kanchanpur',
  'kapilvastu',
  'mahottari',
  'morang',
  'nawalparasi',
  'nawalparasi east',
  'nawalparasi west',
  'parsa',
  'rautahat',
  'rupandehi',
  'saptari',
  'sarlahi',
  'siraha',
  'sunsari',
]);
const VALLEY_DISTRICTS = new Set(['bhaktapur', 'kathmandu', 'lalitpur']);

// The destination rate is the first-store base. Each additional distinct store
// adds half of that base. Preparation runs in parallel; use the slowest item.
export function getDeliveryEstimate(district: string, preparationDays: readonly number[], rates:DeliveryRates=DEFAULT_DELIVERY_RATES, storeCount=1) {
  if (!normalizeDistrict(district)) return null;
  const base = getManualDeliveryQuote(district);
  const canonical=normalizeDistrict(district)!;
  const override=rates.districts[canonical];
  const baseChargePaisa=override??rates.zones[base.zone];
  const transit={...base,chargePaisa:deliveryChargeForStores(baseChargePaisa,storeCount),baseChargePaisa,storeCount,pricingPolicy:DELIVERY_PRICING_POLICY,rateVersion:rates.version,rateBand:override!==undefined?canonical:base.zone};
  const preparation = Math.max(0, ...preparationDays);
  return {
    ...transit,
    preparationDays: preparation,
    transitMinDays: transit.estimatedMinDays,
    transitMaxDays: transit.estimatedMaxDays,
    estimatedMinDays: preparation + transit.estimatedMinDays,
    estimatedMaxDays: preparation + transit.estimatedMaxDays,
  };
}

export function getManualDeliveryQuote(district: string): {
  chargePaisa: number;
  estimatedMinDays: number;
  estimatedMaxDays: number;
  zone: 'valley' | 'terai' | 'nationwide';
} {
  const canonical = normalizeDistrict(district);
  if (!canonical) throw new Error('Choose a recognized delivery district.');
  const normalized = canonical.toLowerCase();
  if (VALLEY_DISTRICTS.has(normalized)) {
    return {
      chargePaisa: 15_000,
      estimatedMinDays: 1,
      estimatedMaxDays: 3,
      zone: 'valley',
    };
  }
  if (TERAI_DISTRICTS.has(normalized)) {
    return {
      chargePaisa: 18_000,
      estimatedMinDays: 2,
      estimatedMaxDays: 5,
      zone: 'terai',
    };
  }
  return {
    chargePaisa: 25_000,
    estimatedMinDays: 3,
    estimatedMaxDays: 7,
    zone: 'nationwide',
  };
}
