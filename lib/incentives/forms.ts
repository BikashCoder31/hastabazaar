import type { FormCapabilities, FormDefinition } from '../forms/types';

export const INCENTIVE_FORM_IDS = Object.freeze({
  promoCode: 'staff.promo-code',
  loyaltySettings: 'staff.loyalty-settings',
  dailyReward: 'account.daily-reward',
  pointsRedemption: 'account.points-redemption',
  promoQuote: 'commerce.promo-quote',
} as const);

export type IncentiveFormId = typeof INCENTIVE_FORM_IDS[keyof typeof INCENTIVE_FORM_IDS];
// A contract is not a registry entry: downstream tested receivers add adapterId before registration.
export type IncentiveFormContract = Omit<FormDefinition, 'id' | 'adapterId'> & { readonly id: IncentiveFormId };

const commonKeys = ['actorId', 'userId', 'customerId', 'requestId', 'idempotencyKey', 'now', 'expectedVersion',
  'version', 'revision', 'formId', 'formVersion', 'formVersionId', 'versionId', 'customAnswers', 'answers',
  'reason', 'action', 'enabled', 'paused', 'campaignId', 'status', 'role', 'terms', 'form',
  'amount', 'amountPaisa', 'discount', 'price', 'balance', 'budget', 'rate'] as const;
const promoKeys = ['code', 'promoCode', 'promoRevision', 'label', 'kind', 'fixedPaisa', 'percentBps', 'maxDiscountPaisa',
  'minimumSubtotalPaisa', 'startsAt', 'endsAt', 'totalUseLimit', 'perCustomerUseLimit', 'budgetPaisa',
  'usedCount', 'spentPaisa', 'maximumCustomerUsedCount', 'subtotalPaisa', 'discountPaisa', 'expiresAt'] as const;
const loyaltyKeys = ['dailyPoints', 'pointsPerBlock', 'creditPaisaPerBlock', 'startsAt', 'endsAt', 'dailyBudgetPoints',
  'lifetimeBudgetPoints', 'rateLocked', 'issuedPoints', 'redeemedPoints', 'outstandingPoints', 'issuedTodayPoints',
  'points', 'creditPaisa', 'balancePoints', 'walletBalancePaisa', 'localDate', 'date', 'claimId', 'redemptionId',
  'awardedPoints', 'claimedToday', 'nextClaimAt', 'amount', 'amountPaisa', 'rate', 'balance', 'budget'] as const;
const contextTypes = Object.freeze(['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone'] as const);

function contract(id: IncentiveFormId, route: string, audience: FormDefinition['audience'], keys: readonly string[], recordContext: boolean): IncentiveFormContract {
  const capabilities: FormCapabilities = Object.freeze({
    explanation: recordContext
      ? 'Safe explanatory context may be recorded with an authorized administrative mutation. Financial terms, grants, request identity, versions and immutable accounting stay server enforced.'
      : 'This action permits no custom answers. Identity, dates, quotes, points, rates, money, budgets, balances, versions and exact replay stay server enforced.',
    customFieldTypes: recordContext ? contextTypes : Object.freeze([]),
    answerBehavior: recordContext ? 'record' : 'none',
  });
  return Object.freeze({ id, route, audience, mode: recordContext ? 'operation' : 'transaction', capabilities,
    baseFields: Object.freeze([...new Set([...commonKeys, ...keys])].map((key) => Object.freeze({
      key, type: 'existing', label: key, capability: 'protected' as const,
      explanation: 'Financial rules, authentication, authorization, request identity and version provenance cannot be custom questions.',
    }))),
  });
}

/** Not registered or advertised as working until actual server receivers are implemented and tested. */
export const INCENTIVE_FORM_CONTRACTS: Readonly<Record<IncentiveFormId, IncentiveFormContract>> = Object.freeze({
  'staff.promo-code': contract('staff.promo-code', '/api/admin/promo-codes', 'super_admin', promoKeys, true),
  'staff.loyalty-settings': contract('staff.loyalty-settings', '/api/admin/loyalty', 'super_admin', loyaltyKeys, true),
  'account.daily-reward': contract('account.daily-reward', '/api/account/rewards/claim', 'customer', loyaltyKeys, false),
  'account.points-redemption': contract('account.points-redemption', '/api/account/rewards/redeem', 'customer', loyaltyKeys, false),
  'commerce.promo-quote': contract('commerce.promo-quote', '/api/checkout/promo', 'customer', promoKeys, false),
});
