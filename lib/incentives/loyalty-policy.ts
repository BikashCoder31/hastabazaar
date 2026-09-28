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
    raw.dailyBudgetPoints! < raw.dailyPoints ||
    raw.lifetimeBudgetPoints! < raw.dailyPoints
  )
    throw new IncentiveError('invalid');
  loyaltyLiability(
    raw.lifetimeBudgetPoints!,
    raw.pointsPerBlock,
    raw.creditPaisaPerBlock,
  );
  return Object.fromEntries(
    keys.map((key) => [key, raw[key]]),
  ) as unknown as LoyaltyTerms;
}
