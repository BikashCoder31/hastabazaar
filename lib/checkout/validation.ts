import type { NepalAddress } from '@/lib/shipping/provider';

export const NEPAL_PROVINCES = [
  'Koshi',
  'Madhesh',
  'Bagmati',
  'Gandaki',
  'Lumbini',
  'Karnali',
  'Sudurpashchim',
] as const;

export type NepalProvince = (typeof NEPAL_PROVINCES)[number];

export interface CheckoutInput {
  customerEmail: string;
  customerPhone: string;
  locale: 'en-NP' | 'ne-NP';
  address: NepalAddress;
  termsAccepted: boolean;
  idempotencyKey: string;
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
  if (!body || typeof body !== 'object') return { errors: ['Checkout details are required.'] };
  const source = body as Record<string, unknown>;
  const rawAddress = source.address && typeof source.address === 'object'
    ? (source.address as Record<string, unknown>)
    : {};
  const value: CheckoutInput = {
    customerEmail: text(source.customerEmail).toLowerCase(),
    customerPhone: phone(source.customerPhone),
    locale: source.locale === 'ne-NP' ? 'ne-NP' : 'en-NP',
    termsAccepted: source.termsAccepted === true,
    idempotencyKey: text(source.idempotencyKey),
    address: {
      recipientName: text(rawAddress.recipientName),
      phone: phone(rawAddress.phone),
      province: text(rawAddress.province),
      district: text(rawAddress.district),
      municipality: text(rawAddress.municipality),
      ward: text(rawAddress.ward) || undefined,
      locality: text(rawAddress.locality),
      landmark: text(rawAddress.landmark) || undefined,
      postalCode: text(rawAddress.postalCode) || undefined,
    },
  };
  const errors: string[] = [];
  if (!EMAIL_PATTERN.test(value.customerEmail) || value.customerEmail.length > 254) errors.push('Enter a valid email address.');
  if (!PHONE_PATTERN.test(value.customerPhone)) errors.push('Enter a valid Nepal contact number.');
  if (value.address.recipientName.length < 2 || value.address.recipientName.length > 100) errors.push('Recipient name must be 2–100 characters.');
  if (!PHONE_PATTERN.test(value.address.phone)) errors.push('Enter a valid recipient phone number.');
  if (!NEPAL_PROVINCES.includes(value.address.province as NepalProvince)) errors.push('Select a valid Nepal province.');
  for (const [label, field, maximum] of [
    ['District', value.address.district, 80],
    ['Municipality', value.address.municipality, 100],
    ['Locality', value.address.locality, 160],
  ] as const) {
    if (field.length < 2 || field.length > maximum) errors.push(`${label} must be 2–${maximum} characters.`);
  }
  if (value.address.ward && !/^\d{1,2}$/.test(value.address.ward)) errors.push('Ward must be a number from 1–99.');
  if (value.address.landmark && value.address.landmark.length > 160) errors.push('Landmark must be 160 characters or fewer.');
  if (value.address.postalCode && value.address.postalCode.length > 12) errors.push('Postal code must be 12 characters or fewer.');
  if (!value.termsAccepted) errors.push('Accept the terms, cancellation, return, and privacy policies to place the order.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.idempotencyKey)) errors.push('Refresh checkout and try again.');
  return errors.length ? { errors } : { errors, value };
}

const TERAI_DISTRICTS = new Set([
  'bara', 'bardiya', 'banke', 'chitwan', 'dang', 'dhanusha', 'jhapa', 'kailali',
  'kanchanpur', 'kapilvastu', 'mahottari', 'morang', 'nawalparasi',
  'nawalparasi east', 'nawalparasi west', 'parsa', 'rautahat', 'rupandehi',
  'saptari', 'sarlahi', 'siraha', 'sunsari',
]);
const VALLEY_DISTRICTS = new Set(['bhaktapur', 'kathmandu', 'lalitpur']);

export function getManualDeliveryQuote(district: string): {
  chargePaisa: number;
  estimatedMinDays: number;
  estimatedMaxDays: number;
  zone: 'valley' | 'terai' | 'nationwide';
} {
  const normalized = district.trim().toLowerCase();
  if (VALLEY_DISTRICTS.has(normalized)) {
    return { chargePaisa: 15_000, estimatedMinDays: 1, estimatedMaxDays: 3, zone: 'valley' };
  }
  if (TERAI_DISTRICTS.has(normalized)) {
    return { chargePaisa: 18_000, estimatedMinDays: 2, estimatedMaxDays: 5, zone: 'terai' };
  }
  return { chargePaisa: 25_000, estimatedMinDays: 3, estimatedMaxDays: 7, zone: 'nationwide' };
}
