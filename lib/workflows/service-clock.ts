export const CONTINUOUS_CALENDAR_VERSION = 'continuous-v1';
export type ServiceClockUnit = 'elapsed_hour' | 'staffed_hour' | 'service_day' | 'calendar_day';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Prospective staff calendar only. Never recalculate an already saved dueAt. */
export function calculateServiceDueAt(input: { startedAt: number; amount: number; unit: ServiceClockUnit; calendarVersion: string }): number {
  if (input.calendarVersion !== CONTINUOUS_CALENDAR_VERSION) throw new Error('Unsupported service calendar version.');
  if (!Number.isSafeInteger(input.startedAt) || input.startedAt < 0 || !Number.isFinite(input.amount) || input.amount < 0)
    throw new Error('Invalid service clock input.');
  if (!['elapsed_hour', 'staffed_hour', 'service_day', 'calendar_day'].includes(input.unit)) throw new Error('Unsupported service clock unit.');
  // Nepal has no DST; calendar days preserve the local wall-clock time. Date-window
  // cutoffs and provider business calendars remain with their owning policy.
  const dueAt = input.startedAt + input.amount * (input.unit.endsWith('hour') ? HOUR : DAY);
  if (!Number.isSafeInteger(dueAt) || dueAt > 8_640_000_000_000_000) throw new Error('Service deadline is out of range.');
  return dueAt;
}

/** Review appointments, never bank-transfer promises. */
export function nextFinanceCheckpoint(now: number, kind: 'payout_review' | 'reconciliation'): number {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid checkpoint time.');
  if (kind !== 'payout_review' && kind !== 'reconciliation') throw new Error('Unknown finance checkpoint.');
  const nepalOffset = 20_700_000;
  const day = Math.floor((now + nepalOffset) / DAY) * DAY - nepalOffset;
  const candidate = day + (kind === 'payout_review' ? 14 : 18) * HOUR;
  return candidate >= now ? candidate : candidate + DAY;
}
