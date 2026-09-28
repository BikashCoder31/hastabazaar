import { IncentiveError, type PromoTerms } from './types';

const ZERO = BigInt(0);
const ONE = BigInt(1);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const BASIS_POINTS = BigInt(10000);
// Epoch milliseconds through the final millisecond of year 9999 (UTC).
const MAX_CAMPAIGN_TIMESTAMP = 253402300799999;

function integer(value: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new IncentiveError('invalid');
}

/** ASCII only: Unicode case folding must never turn a lookalike into a valid code. */
export function normalizePromoCode(raw: string): string {
  if (typeof raw !== 'string') throw new IncentiveError('invalid');
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(trimmed)) throw new IncentiveError('invalid');
  return trimmed.toUpperCase();
}

function validateTerms(terms: PromoTerms): void {
  if (!terms || typeof terms !== 'object' || terms.code !== normalizePromoCode(terms.code) ||
    typeof terms.label !== 'string' || !terms.label.trim() || terms.label.length > 200) throw new IncentiveError('invalid');
  integer(terms.minimumSubtotalPaisa);
  integer(terms.startsAt, 0, MAX_CAMPAIGN_TIMESTAMP);
  integer(terms.endsAt, 0, MAX_CAMPAIGN_TIMESTAMP);
  if (terms.endsAt <= terms.startsAt) throw new IncentiveError('invalid');
  integer(terms.totalUseLimit, 1);
  integer(terms.perCustomerUseLimit, 1, terms.totalUseLimit);
  integer(terms.budgetPaisa, 1);
  if (terms.kind === 'fixed') {
    if ('percentBps' in terms || 'maxDiscountPaisa' in terms) throw new IncentiveError('invalid');
    integer(terms.fixedPaisa, 1);
  } else if (terms.kind === 'percentage') {
    if ('fixedPaisa' in terms) throw new IncentiveError('invalid');
    integer(terms.percentBps, 1, 10000);
    integer(terms.maxDiscountPaisa, 1);
  } else throw new IncentiveError('invalid');
}

/** Pure amount calculation. Eligibility (time, minimum, usage and remaining budget) is checked separately. */
export function calculatePromoDiscount(terms: PromoTerms, subtotalPaisa: number): number {
  validateTerms(terms);
  integer(subtotalPaisa);
  if (terms.kind === 'fixed') return Math.min(terms.fixedPaisa, subtotalPaisa);
  const percentagePaisa = BigInt(subtotalPaisa) * BigInt(terms.percentBps) / BASIS_POINTS;
  return Number(percentagePaisa < BigInt(terms.maxDiscountPaisa)
    ? percentagePaisa : BigInt(terms.maxDiscountPaisa));
}

/** Proportional floor followed by largest remainder; equal remainders use ascending stable keys. */
export function allocatePromoDiscount(lines: readonly { key: string; subtotalPaisa: number }[], discountPaisa: number): Record<string, number> {
  integer(discountPaisa);
  const keys = new Set<string>();
  let subtotal = ZERO;
  for (const line of lines) {
    if (typeof line.key !== 'string' || !line.key.trim() || keys.has(line.key)) throw new IncentiveError('invalid');
    keys.add(line.key);
    integer(line.subtotalPaisa);
    subtotal += BigInt(line.subtotalPaisa);
  }
  if (subtotal > MAX_SAFE || BigInt(discountPaisa) > subtotal) throw new IncentiveError('invalid');
  let allocated = ZERO;
  const portions = lines.map((line) => {
    const numerator = BigInt(line.subtotalPaisa) * BigInt(discountPaisa);
    const amount = subtotal === ZERO ? ZERO : numerator / subtotal;
    allocated += amount;
    return { key: line.key, amount, remainder: subtotal === ZERO ? ZERO : numerator % subtotal };
  });
  portions.sort((a, b) => a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const remainderCount = Number(BigInt(discountPaisa) - allocated);
  for (let index = 0; index < remainderCount; index++) portions[index].amount += ONE;
  // fromEntries defines own properties even for stable keys such as __proto__.
  return Object.fromEntries(portions.map((portion) => [portion.key, Number(portion.amount)]));
}
