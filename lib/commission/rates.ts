export const COMMISSION_NOTICE_DAYS = 15;
export const COMMISSION_NOTICE_MS = COMMISSION_NOTICE_DAYS * 86_400_000;
export const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;

export interface SellerCommissionTerms {
  basisPoints: number;
  version: string;
  acceptedAt: number | null;
}

export interface CommissionRateChange {
  id: string;
  basisPoints: number;
  effectiveAt: number;
  agreementVersion: string;
  termsText: string;
  reason: string;
  createdAt: number;
  createdByName: string;
  acceptedSellers: number;
  status: 'scheduled' | 'active' | 'previous' | 'cancelled';
  cancelledAt: number | null;
  cancelledByName: string | null;
  cancellationReason: string | null;
}

export interface CommissionRateState {
  asOf: number;
  revision: number;
  current: SellerCommissionTerms;
  approvedSellers: number;
  history: CommissionRateChange[];
}

export function percentToBasisPoints(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new RangeError('Enter a commission percentage.');
  const text = String(value).trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text))
    throw new RangeError(
      'Enter a rate from 0 to 100%, with up to two decimal places.',
    );
  const bps = Math.round(Number(text) * 100);
  if (bps > 10000) throw new RangeError('Enter a rate from 0 to 100%.');
  return bps;
}

/** datetime-local inputs are explicitly interpreted in Nepal time. */
export function parseNepalDateTime(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new RangeError('Choose an effective date and time in Nepal time.');
  const timestamp = Date.parse(`${value}:00+05:45`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp + NEPAL_OFFSET_MS).toISOString().slice(0, 16) !== value
  )
    throw new RangeError('Choose a valid effective date and time.');
  return timestamp;
}

export const nepalDateTimeInput = (timestamp: number) =>
  new Date(timestamp + NEPAL_OFFSET_MS).toISOString().slice(0, 16);

export function commissionFeeScheduleText(
  basisPoints: number,
  effectiveAt: number,
): string {
  const date = new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(effectiveAt));
  return `Seller Commission Fee Schedule\n\nRate: ${basisPoints / 100}% of the product selling value after seller-funded discounts. Separately stated product taxes and delivery charges are excluded. Hastabazaar-funded discounts do not reduce the seller's agreed product value.\n\nEffective from ${date} (Nepal time), for new orders placed after both this date and your explicit acceptance. Commission is earned only on completed, paid product sales. Refunds reverse commission proportionally using the original order snapshot. No joining fee.\n\nThis versioned fee schedule supplements the Seller Marketplace Agreement and replaces only the commission rate for future orders you receive after accepting it. Existing orders, refunds, invoices and settlements retain their recorded terms. Until you accept, your previously accepted effective commission rate continues to apply.`;
}
