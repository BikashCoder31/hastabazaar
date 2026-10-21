/** Instants are UTC epoch milliseconds; presentation converts them to Nepal time. */
export interface FeeWaiverTerms {
  name: string;
  description: string;
  startsAt: number;
  endsAt: number;
}
export type FeeWaiverState = 'draft' | 'published' | 'paused' | 'ended';
export interface FeeWaiverCampaign extends FeeWaiverTerms {
  id: string;
  revision: number;
  state: FeeWaiverState;
}
export interface FeeWaiverContext {
  actorId: string;
  authSubject: string;
  requestId: string;
  /** Global control revision, including changes to any overlapping campaign. */
  expectedRevision: number;
  now: number;
}
export type FeeWaiverCommand =
  | { type: 'create'; terms: FeeWaiverTerms }
  | { type: 'revise'; campaignId: string; terms: FeeWaiverTerms }
  | { type: 'publish' | 'pause' | 'resume' | 'end'; campaignId: string };

export class FeeWaiverError extends Error {
  constructor(
    public readonly code: 'invalid' | 'unauthorized' | 'stale' | 'conflict',
  ) {
    super(
      {
        invalid: 'Review the campaign details and schedule.',
        unauthorized: 'Live Super Admin access is required.',
        stale: 'Fee waiver campaigns changed. Refresh and try again.',
        conflict: 'This request conflicts with an earlier fee waiver change.',
      }[code],
    );
  }
}
export function validateFeeWaiverInstant(at: number): void {
  if (!Number.isSafeInteger(at) || at < 0) throw new FeeWaiverError('invalid');
}
export function validateFeeWaiverTerms(terms: FeeWaiverTerms): void {
  if (
    !terms ||
    typeof terms !== 'object' ||
    Array.isArray(terms) ||
    typeof terms.name !== 'string' ||
    !terms.name.trim() ||
    terms.name.length > 100 ||
    typeof terms.description !== 'string' ||
    terms.description.length > 1000
  )
    throw new FeeWaiverError('invalid');
  validateFeeWaiverInstant(terms.startsAt);
  validateFeeWaiverInstant(terms.endsAt);
  if (terms.endsAt <= terms.startsAt) throw new FeeWaiverError('invalid');
}
/** One full waiver only. Sort a copy, using a locale-independent immutable ID tie-break. */
export function selectFeeWaiver(
  campaigns: FeeWaiverCampaign[],
  at: number,
): FeeWaiverCampaign | null {
  validateFeeWaiverInstant(at);
  return (
    campaigns
      .filter(
        (c) => c.state === 'published' && c.startsAt <= at && at < c.endsAt,
      )
      .sort(
        (a, b) =>
          a.startsAt - b.startsAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )[0] ?? null
  );
}
