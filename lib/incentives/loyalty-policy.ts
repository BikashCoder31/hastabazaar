import {
  IncentiveError,
  type LoyaltyTerms,
  type LoyaltyLiability,
} from './types';
const MAX_TIME = 253402300799999;
export function loyaltyInteger(
  value: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new IncentiveError('invalid');
}
export function nepalRewardDay(now: number): {
  localDate: string;
  nextClaimAt: number;
} {
  loyaltyInteger(now, 0, MAX_TIME);
  const shifted = now + 20700000;
  const date = new Date(shifted).toISOString().slice(0, 10);
  const nextClaimAt =
    (Math.floor(shifted / 86400000) + 1) * 86400000 - 20700000;
  return { localDate: date, nextClaimAt };
}
export function loyaltyLiability(
  points: number,
  pointsPerBlock: number,
  creditPaisaPerBlock: number,
): LoyaltyLiability {
  loyaltyInteger(points);
  loyaltyInteger(pointsPerBlock, 1);
  loyaltyInteger(creditPaisaPerBlock, 1);
  const blocks = BigInt(points) / BigInt(pointsPerBlock),
    credit = blocks * BigInt(creditPaisaPerBlock);
  if (credit > BigInt(Number.MAX_SAFE_INTEGER))
    throw new IncentiveError('invalid');
  return {
    wholeBlocks: Number(blocks),
    creditPaisa: Number(credit),
    remainingPoints: Number(BigInt(points) % BigInt(pointsPerBlock)),
  };
}
export function validateLoyaltyTerms(raw: LoyaltyTerms): LoyaltyTerms {
  const keys = [
    'enabled',
    'dailyPoints',
    'weeklyPoints',
    'graceEnabled',
    'pointsPerBlock',
    'creditPaisaPerBlock',
    'startsAt',
    'endsAt',
    'dailyBudgetPoints',
    'lifetimeBudgetPoints',
  ] as const;
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).some(
      (key) => !keys.includes(key as (typeof keys)[number]),
    ) ||
    typeof raw.enabled !== 'boolean'
  )
    throw new IncentiveError('invalid');
  if (raw.graceEnabled !== undefined && typeof raw.graceEnabled !== 'boolean')
    throw new IncentiveError('invalid');
  const weekly =
    raw.weeklyPoints === undefined
      ? undefined
      : validateWeeklyPoints(raw.weeklyPoints);
  if (weekly && raw.dailyPoints !== weekly[0])
    throw new IncentiveError('invalid');
  if (!weekly && raw.graceEnabled === true) throw new IncentiveError('invalid');
  for (const key of [
    'dailyPoints',
    'pointsPerBlock',
    'creditPaisaPerBlock',
    'dailyBudgetPoints',
    'lifetimeBudgetPoints',
  ] as const)
    loyaltyInteger(raw[key]!, 1);
  loyaltyInteger(raw.startsAt!, 0, MAX_TIME);
  loyaltyInteger(raw.endsAt!, 1, MAX_TIME);
  if (
    raw.endsAt! <= raw.startsAt! ||
    raw.dailyBudgetPoints! < (weekly?.[6] ?? raw.dailyPoints) ||
    raw.lifetimeBudgetPoints! < (weekly?.[6] ?? raw.dailyPoints)
  )
    throw new IncentiveError('invalid');
  loyaltyLiability(
    raw.lifetimeBudgetPoints!,
    raw.pointsPerBlock,
    raw.creditPaisaPerBlock,
  );
  const normalized = Object.fromEntries(
    keys
      .filter((key) => key !== 'weeklyPoints' && key !== 'graceEnabled')
      .map((key) => [key, raw[key]]),
  ) as unknown as LoyaltyTerms;
  return weekly
    ? {
        ...normalized,
        weeklyPoints: weekly,
        graceEnabled: raw.graceEnabled ?? false,
      }
    : normalized;
}

export function validateWeeklyPoints(value: readonly number[]): number[] {
  if (!Array.isArray(value) || value.length !== 7)
    throw new IncentiveError('invalid');
  let total = BigInt(0);
  for (let index = 0; index < 7; index++) {
    loyaltyInteger(value[index], 1);
    if (index > 0 && value[index] <= value[index - 1])
      throw new IncentiveError('invalid');
    total += BigInt(value[index]);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new IncentiveError('invalid');
  return [...value];
}

/** Exact positive whole blocks; BigInt prevents money multiplication from rounding. */
export function calculateRedemption(
  points: number,
  terms: LoyaltyTerms,
): number {
  loyaltyInteger(points, 1);
  loyaltyInteger(terms.pointsPerBlock, 1);
  loyaltyInteger(terms.creditPaisaPerBlock, 1);
  if (points % terms.pointsPerBlock !== 0) throw new IncentiveError('invalid');
  const credit =
    (BigInt(points) / BigInt(terms.pointsPerBlock)) *
    BigInt(terms.creditPaisaPerBlock);
  if (credit > BigInt(Number.MAX_SAFE_INTEGER))
    throw new IncentiveError('invalid');
  return Number(credit);
}
