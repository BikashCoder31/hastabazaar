import { calculatePromoDiscount } from './promo-policy';
import { calculateMarketplaceFee, type FeeWaiverCampaign } from '../marketplace/fee-waivers';
import { validateWeeklyPoints } from './loyalty-policy';
import type { LoyaltyTerms, PromoTerms } from './types';
const nepalOffset = 20700000;
export function nepalDateTimeInput(timestamp: number): string {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > 253402300799999
  )
    throw new RangeError('Choose a valid date.');
  const iso = new Date(timestamp + nepalOffset).toISOString();
  const match = iso.match(/^([+]?\d+)-(\d{2}-\d{2}T\d{2}:\d{2})/)!;
  return `${String(Number(match[1])).padStart(4, '0')}-${match[2]}`;
}
export function parseNepalDateTime(value: string): number {
  const match = value.match(/^(\d{4,6})-(\d{2}-\d{2}T\d{2}:\d{2})$/);
  if (!match)
    throw new RangeError('Choose a valid date and time in Nepal time.');
  const year = Number(match[1]);
  const isoYear = year > 9999 ? '+' + String(year).padStart(6, '0') : match[1];
  const timestamp = Date.parse(`${isoYear}-${match[2]}:00+05:45`);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > 253402300799999 ||
    nepalDateTimeInput(timestamp) !== value
  )
    throw new RangeError('Choose a valid date and time in Nepal time.');
  return timestamp;
}

const maximum = BigInt(Number.MAX_SAFE_INTEGER);
function safe(value: bigint): number {
  if (value < BigInt(0) || value > maximum)
    throw new RangeError('This amount exceeds the supported range.');
  return Number(value);
}
function positiveInteger(value: number, label: string, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
    throw new RangeError(`Enter a valid ${label}.`);
}

/** Parse decimal text without floating point multiplication or silent rounding. */
export function nprToPaisa(value: string, label = 'NPR amount'): number {
  const text = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    throw new RangeError(`Enter ${label} with up to two decimal places.`);
  const [whole, fraction = ''] = text.split('.');
  return safe(BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0')));
}
export function percentageToBps(value: string): number {
  const result = nprToPaisa(value, 'a percentage');
  if (result > 10000)
    throw new RangeError('Enter a percentage from 0 to 100%.');
  return result;
}
export function moneyInput(paisa: number): string {
  positiveInteger(paisa, 'amount', true);
  const value = BigInt(paisa);
  return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, '0')}`;
}
const nprFormatter = new Intl.NumberFormat('en-NP', {
  style: 'currency',
  currency: 'NPR',
});
export function incentiveMoney(paisa: number | string): string {
  if (
    typeof paisa === 'number'
      ? !Number.isSafeInteger(paisa)
      : !/^-?\d{1,32}$/.test(paisa)
  )
    throw new RangeError('This financial total cannot be displayed exactly.');
  const exact = BigInt(paisa),
    whole = exact / BigInt(100),
    negative = exact < BigInt(0);
  const fraction = String((negative ? -exact : exact) % BigInt(100)).padStart(
    2,
    '0',
  );
  // Formatting whole rupees as BigInt avoids rounding off the final paisa.
  return nprFormatter
    .formatToParts(negative && whole === BigInt(0) ? -0 : whole)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}
export const incentiveDate = (timestamp: number) =>
  new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(timestamp);

/** An amount illustration only: checkout separately checks time, customer limits and live budget. */
export function promoCostPreview(
  terms: PromoTerms,
  subtotalPaisa: number,
  commissionBps: number,
  feeWaiver: FeeWaiverCampaign | null = null,
) {
  positiveInteger(subtotalPaisa, 'product subtotal', true);
  positiveInteger(commissionBps, 'commission percentage', true);
  if (commissionBps > 10000)
    throw new RangeError('Commission must be between 0 and 100%.');
  const amountTerms = {
    ...terms,
    code: 'PREVIEW',
    label: 'Cost preview',
    startsAt: 0,
    endsAt: 253402300799999,
    totalUseLimit: 1,
    perCustomerUseLimit: 1,
    budgetPaisa: Number.MAX_SAFE_INTEGER,
  };
  const calculated = calculatePromoDiscount(amountTerms, subtotalPaisa);
  const eligible = subtotalPaisa >= terms.minimumSubtotalPaisa;
  const discountPaisa = eligible ? calculated : 0;
  const fee = calculateMarketplaceFee(subtotalPaisa, commissionBps, feeWaiver);
  const commissionPaisa = fee.netPaisa;
  return {
    eligible,
    discountPaisa,
    commissionPaisa,
    standardCommissionPaisa: fee.standardPaisa,
    waivedCommissionPaisa: fee.waivedPaisa,
    contributionPaisa: commissionPaisa - discountPaisa,
    customerSubtotalPaisa: subtotalPaisa - discountPaisa,
  };
}
/** Future earning estimate. Existing balances, actual claims and whole-block redemption are separate. */
export function loyaltyCostPreview(
  terms: Pick<
    LoyaltyTerms,
    | 'dailyPoints'
    | 'weeklyPoints'
    | 'graceEnabled'
    | 'pointsPerBlock'
    | 'creditPaisaPerBlock'
  >,
  participants: number,
  days: number,
) {
  for (const [label, value] of Object.entries({
    dailyPoints: terms.dailyPoints,
    pointsPerBlock: terms.pointsPerBlock,
    creditPaisaPerBlock: terms.creditPaisaPerBlock,
    participants,
    days,
  }))
    positiveInteger(value, label);
  if (
    terms.graceEnabled !== undefined &&
    typeof terms.graceEnabled !== 'boolean'
  )
    throw new RangeError('Choose a valid grace policy.');
  const schedule =
    terms.weeklyPoints === undefined
      ? undefined
      : validateWeeklyPoints(terms.weeklyPoints);
  let perCustomerPoints: bigint;
  let redemptionDays: bigint;
  if (schedule !== undefined) {
    const cyclePoints = schedule.reduce(
      (total, award) => total + BigInt(award),
      BigInt(0),
    );
    if (terms.dailyPoints !== schedule[0])
      throw new RangeError('Daily points must equal the Day 1 weekly award.');
    const duration = BigInt(days);
    perCustomerPoints = (duration / BigInt(7)) * cyclePoints;
    for (let index = 0; index < Number(duration % BigInt(7)); index++)
      perCustomerPoints += BigInt(schedule[index]);
    // Leave a positive remainder so exact cycle totals redeem on Day 7.
    const fullCycles = (BigInt(terms.pointsPerBlock) - BigInt(1)) / cyclePoints;
    let accumulated = fullCycles * cyclePoints;
    redemptionDays = fullCycles * BigInt(7);
    for (const award of schedule) {
      accumulated += BigInt(award);
      redemptionDays++;
      if (accumulated >= BigInt(terms.pointsPerBlock)) break;
    }
  } else {
    perCustomerPoints = BigInt(terms.dailyPoints) * BigInt(days);
    redemptionDays =
      (BigInt(terms.pointsPerBlock) + BigInt(terms.dailyPoints) - BigInt(1)) /
      BigInt(terms.dailyPoints);
  }
  const points = perCustomerPoints * BigInt(participants);
  return {
    projectedPoints: safe(points),
    estimatedValuePaisa: safe(
      (points * BigInt(terms.creditPaisaPerBlock)) /
        BigInt(terms.pointsPerBlock),
    ),
    daysToRedemption: safe(redemptionDays),
  };
}
