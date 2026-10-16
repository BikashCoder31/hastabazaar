import { IncentiveError, type LoyaltyCycleProgress } from './types';
import { loyaltyInteger } from './loyalty-policy';

export interface PreviousLoyaltyClaim {
  localDate: string;
  cycle?: LoyaltyCycleProgress;
}

/** Calendar dates come from the server's Nepal reward boundary, never a browser. */
export function nextLoyaltyCycle(
  localDate: string,
  previous: PreviousLoyaltyClaim | null,
  graceEnabled: boolean,
): LoyaltyCycleProgress {
  const base = {
    graceUsed: false,
    graceApplied: false,
    lastClaimDate: previous?.localDate ?? null,
  };
  if (!previous?.cycle)
    return { ...base, day: 1, number: 1, resetReason: 'first_claim' };
  const old = previous.cycle;
  const gap =
    (Date.parse(localDate + 'T00:00:00Z') -
      Date.parse(previous.localDate + 'T00:00:00Z')) /
    86400000;
  if (!Number.isInteger(gap) || gap < 1) throw new IncentiveError('invalid');
  const nextNumber = old.number + 1;
  loyaltyInteger(nextNumber, 1);
  if (gap === 1 && old.day === 7)
    return {
      ...base,
      day: 1,
      number: nextNumber,
      resetReason: 'cycle_complete',
    };
  if (gap === 1)
    return {
      ...base,
      day: old.day + 1,
      number: old.number,
      graceUsed: old.graceUsed,
      resetReason: null,
    };
  if (gap === 2 && graceEnabled && !old.graceUsed && old.day < 7)
    return {
      ...base,
      day: old.day + 1,
      number: old.number,
      graceUsed: true,
      graceApplied: true,
      resetReason: null,
    };
  return { ...base, day: 1, number: nextNumber, resetReason: 'missed_day' };
}
