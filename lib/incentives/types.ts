import type { FormAnswerSnapshot, FormId } from '../forms/types';

interface PromoCommonTerms {
  readonly code: string;
  readonly label: string;
  readonly minimumSubtotalPaisa: number;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly totalUseLimit: number;
  readonly perCustomerUseLimit: number;
  readonly budgetPaisa: number;
}

export type PromoTerms = PromoCommonTerms &
  (
    | {
        readonly kind: 'fixed';
        readonly fixedPaisa: number;
        readonly percentBps?: never;
        readonly maxDiscountPaisa?: never;
      }
    | {
        readonly kind: 'percentage';
        readonly percentBps: number;
        readonly maxDiscountPaisa: number;
        readonly fixedPaisa?: never;
      }
  );

export interface PromoQuote {
  readonly campaignId: string;
  readonly revision: number;
  readonly code: string;
  readonly label: string;
  readonly discountPaisa: number;
  readonly subtotalPaisa: number;
  readonly expiresAt: number;
  readonly minimumSubtotalPaisa: number;
}

export interface PromoState {
  readonly version: number;
  readonly publishedRevision: number | null;
  readonly draftRevision: number | null;
  readonly campaignId: string;
  readonly revision: number;
  readonly terms: PromoTerms;
  readonly paused: boolean;
  readonly usedCount: number;
  readonly spentPaisa: number;
  readonly maximumCustomerUsedCount: number;
}

export interface IncentiveFormSubmission {
  readonly formId: FormId;
  readonly versionId: string;
  readonly answers: FormAnswerSnapshot;
}

export interface MutationContext {
  readonly actorId: string;
  readonly requestId: string;
  readonly now: number;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly form: IncentiveFormSubmission;
}

/** Promo administrative identity is derived by the server and checked at commit/replay. */
export interface PromoMutationContext extends MutationContext {
  readonly authSubject: string;
}

/** Staff identity is derived by the server and checked again when loyalty settings commit. */
export interface LoyaltyMutationContext extends MutationContext {
  readonly authSubject: string;
}

export interface LoyaltyTerms {
  readonly enabled: boolean;
  readonly dailyPoints: number;
  readonly pointsPerBlock: number;
  readonly creditPaisaPerBlock: number;
  readonly startsAt: number | null;
  readonly endsAt: number | null;
  readonly dailyBudgetPoints: number | null;
  readonly lifetimeBudgetPoints: number | null;
}

export interface LoyaltyLiability {
  readonly wholeBlocks: number;
  readonly creditPaisa: number;
  readonly remainingPoints: number;
}
export interface CustomerLoyaltyState {
  readonly version: number;
  readonly revision: number;
  readonly enabled: boolean;
  readonly paused: boolean;
  readonly dailyPoints: number;
  readonly pointsPerBlock: number;
  readonly creditPaisaPerBlock: number;
  readonly startsAt: number | null;
  readonly endsAt: number | null;
  readonly status: 'active' | 'scheduled' | 'expired' | 'paused' | 'disabled' | 'exhausted';
}
export interface LoyaltyDenomination {
  readonly pointsPerBlock: number;
  readonly creditPaisaPerBlock: number;
}
export interface LoyaltyState {
  readonly revision: number;
  readonly publishedRevision: number;
  readonly draftRevision: number | null;
  readonly paused: boolean;
  readonly creditedPaisa: number;
  readonly liability: LoyaltyLiability;
  /** Null for disabled defaults or an unrepresentable saved draft budget at the locked rate. */
  readonly maximumLiability: LoyaltyLiability | null;
  readonly version: number;
  readonly terms: LoyaltyTerms;
  readonly rateLocked: boolean;
  readonly lockedDenomination: LoyaltyDenomination | null;
  readonly issuedPoints: number;
  readonly redeemedPoints: number;
  readonly outstandingPoints: number;
  readonly issuedTodayPoints: number;
}

/** userId and now must be derived by the server, never copied from client input. */
export interface ClaimInput {
  readonly authSubject: string;
  readonly userId: string;
  readonly requestId: string;
  readonly expectedVersion: number;
  readonly now: number;
  readonly formVersionId: string;
}

export interface RedeemInput extends ClaimInput {
  readonly points: number;
}

/** Stored snapshots are returned unchanged on an authorized exact replay. */
export interface ClaimResult {
  readonly claimId: string;
  readonly localDate: string;
  readonly awardedPoints: number;
  readonly balancePoints: number;
}

export interface RedemptionResult {
  readonly redemptionId: string;
  readonly points: number;
  readonly creditPaisa: number;
  readonly balancePoints: number;
  readonly walletBalancePaisa: number;
}

export type RewardHistoryEntry = (
  | { readonly kind: 'daily_claim'; readonly result: ClaimResult }
  | { readonly kind: 'redemption'; readonly result: RedemptionResult }
) & { readonly createdAt: number };

/** Repositories use default limit 20, maximum 50 and an opaque owner-bound cursor. */
export interface RewardsView {
  readonly balancePoints: number;
  readonly walletBalancePaisa: number;
  readonly claimedToday: boolean;
  readonly nextClaimAt: number;
  readonly state: CustomerLoyaltyState;
  readonly history: readonly RewardHistoryEntry[];
  readonly nextCursor: string | null;
}

export type IncentiveErrorCode =
  | 'invalid'
  | 'unauthorized'
  | 'unavailable'
  | 'stale'
  | 'conflict'
  | 'insufficient'
  | 'exhausted';

const PUBLIC_ERROR_MESSAGES: Readonly<Record<IncentiveErrorCode, string>> =
  Object.freeze({
    invalid: 'Invalid incentive request.',
    unauthorized: 'You are not authorized to perform this action.',
    unavailable: 'This incentive is currently unavailable.',
    stale: 'Incentive terms have changed. Please try again.',
    conflict: 'This request conflicts with a previous request.',
    insufficient: 'There is not enough available balance.',
    exhausted: 'This incentive limit has been reached.',
  });

export class IncentiveError extends Error {
  constructor(readonly code: IncentiveErrorCode) {
    super(PUBLIC_ERROR_MESSAGES[code]);
    this.name = 'IncentiveError';
  }
}

export interface PromoQuoteInput {
  readonly userId: string;
  readonly code: string;
  readonly subtotalPaisa: number;
  readonly now: number;
}
/** Server-derived canonical checkout intent and original order response. Never copy digest/response from a client. */
export interface PromoConsumptionInput {
  readonly userId: string;
  readonly orderId: string;
  readonly requestId: string;
  readonly quote: PromoQuote;
  readonly now: number;
  readonly payloadDigest: string;
  readonly response: Readonly<Record<string, unknown>>;
}
export interface PromoListInput {
  readonly actorId: string;
  readonly authSubject: string;
  readonly cursor?: string;
  readonly limit?: number;
}
export interface PromoDetailInput {
  readonly actorId: string;
  readonly authSubject: string;
  readonly campaignId: string;
}
export interface PromoRedemptionListInput extends PromoListInput {
  readonly campaignId: string;
}
export interface PromoCampaignPage {
  readonly campaigns: readonly PromoState[];
  readonly nextCursor: string | null;
}
export interface PromoRedemptionSummary {
  readonly redemptionId: string;
  readonly orderId: string;
  readonly revision: number;
  readonly discountPaisa: number;
  readonly createdAt: number;
}
export interface PromoRedemptionPage {
  readonly redemptions: readonly PromoRedemptionSummary[];
  readonly nextCursor: string | null;
}

/** Quote confirmation binds live cart lines and campaign terms; amounts are always rederived. */
export interface CheckoutPromoQuote extends PromoQuote { readonly quoteIntent: string; }
export interface PromoQuoteLine { readonly id:string; readonly productId:string; readonly sellerId:string; readonly pricePaisa:number; readonly quantity:number; }
