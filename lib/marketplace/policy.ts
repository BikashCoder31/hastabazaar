import { LEGACY_LAUNCH_PLATFORM_SHARE_BPS } from '../configuration/commission-defaults';
import type { EffectivePolicy, MarketplacePolicy } from './types';

export const COMMISSION_BPS_DENOMINATOR = 10_000;
export const COMMISSION_RULE_VERSION = 'commission-9pct-v1';

/**
 * Historical Phase 1 policy. Current commercial rates come only from saved
 * Business Settings or an accepted transaction snapshot, never this policy.
 */
export const phaseOneMarketplacePolicy = {
  version: 'phase-1.1',
  effectiveFrom: '2026-09-18',
  value: {
    identity: {
      brandName: 'HastaBazaar',
      operatingCountry: 'NP',
      currency: 'NPR',
      timezone: 'Asia/Kathmandu',
      supportedLocales: ['en-NP', 'ne-NP'],
      defaultLocale: 'en-NP',
    },
    market: {
      nationwideService: true,
      launchPriorityRegion: 'terai',
      businessModel: 'intermediary_marketplace',
      firstPartyStoreEnabled: false,
    },
    tax: {
      registrationMode: 'PAN',
      collectVat: false,
      futureStandardVatRateBps: 1_300,
      pricesAreCustomerFinal: true,
    },
    fees: {
      sellerCommissionBps: LEGACY_LAUNCH_PLATFORM_SHARE_BPS,
      buyerPlatformFeePaisa: 0,
      absorbDigitalPaymentFees: true,
      featuredPlacementEnabled: false,
    },
    payouts: {
      cadence: 'weekly',
      deliveryHoldDays: 7,
      minimumPayoutPaisa: 100_000,
      newSellerReserveBps: 500,
      reserveAppliesForDays: 90,
      reserveReleaseAfterDays: 30,
      requiresMakerChecker: true,
    },
    cancellations: {
      freeBeforePacking: true,
      afterDispatchHandledAsReturn: true,
      repeatedSellerCancellationReviewCount: 3,
    },
    returns: {
      generalRequestWindowDays: 7,
      sealedGoodsWindowDays: 15,
      deliveryDamageEvidenceWindowHours: 48,
      changeOfMindEnabled: true,
      highValueRefundThresholdPaisa: 1_000_000,
      refundInitiationBusinessDays: 2,
      digitalRefundEstimateBusinessDays: [5, 10],
      codRefundEstimateBusinessDays: [3, 7],
    },
    moderation: {
      sellerApprovalRequired: true,
      productApprovalRequired: true,
      preventSelfApproval: true,
      criticalProductEditsRequireReview: true,
    },
    shipping: {
      responsibility: 'marketplace',
      initialProvider: 'nepal_can_move',
      integrationStatus: 'merchant_contract_required',
      codEnabled: true,
      prepaidEnabled: true,
      manualFallbackEnabled: true,
    },
    governance: {
      policiesAreVersioned: true,
      orderSnapshotsCommercialTerms: true,
      riskyActionsRequireReason: true,
      riskyActionsRequireAuditLog: true,
    },
  },
} as const satisfies EffectivePolicy<MarketplacePolicy>;

export type PhaseOneMarketplacePolicy = typeof phaseOneMarketplacePolicy;

export function percentageFromBasisPoints(basisPoints: number): number {
  return basisPoints / 100;
}

export function calculateSellerCommissionPaisa(
  itemSubtotalAfterSellerDiscountPaisa: number,
  commissionBps: number,
): number {
  if (
    !Number.isInteger(itemSubtotalAfterSellerDiscountPaisa) ||
    itemSubtotalAfterSellerDiscountPaisa < 0
  ) {
    throw new RangeError(
      'Item subtotal must be a non-negative integer number of paisa.',
    );
  }

  if (
    !Number.isInteger(commissionBps) ||
    commissionBps < 0 ||
    commissionBps > COMMISSION_BPS_DENOMINATOR
  ) {
    throw new RangeError('Commission basis points must be from 0 through 10,000.');
  }
  return roundHalfUpRatio(
    itemSubtotalAfterSellerDiscountPaisa,
    commissionBps,
    COMMISSION_BPS_DENOMINATOR,
  );
}

export function roundHalfUpRatio(
  amount: number,
  numerator: number,
  denominator: number,
): number {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new RangeError('Amount must be a non-negative safe integer.');
  if (!Number.isSafeInteger(numerator) || numerator < 0)
    throw new RangeError('Numerator must be a non-negative safe integer.');
  if (!Number.isSafeInteger(denominator) || denominator <= 0)
    throw new RangeError('Denominator must be a positive safe integer.');
  const product = BigInt(amount) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const two = BigInt(2);
  const result = (product * two + divisor) / (divisor * two);
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Rounded monetary result exceeds the safe integer range.');
  return Number(result);
}

export function calculateCommissionBasePaisa(input: {
  productValuePaisa: number;
  sellerFundedDiscountPaisa?: number;
  platformFundedDiscountPaisa?: number;
  taxPaisa?: number;
  deliveryPaisa?: number;
}): number {
  for (const [name, value] of Object.entries(input)) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
      throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  const sellerDiscount = input.sellerFundedDiscountPaisa ?? 0;
  if (sellerDiscount > input.productValuePaisa)
    throw new RangeError('Seller-funded discount cannot exceed product value.');
  return input.productValuePaisa - sellerDiscount;
}

export function calculateCumulativeCommissionReversalPaisa(input: {
  originalBasePaisa: number;
  originalCommissionPaisa: number;
  cumulativeRefundedBasePaisa: number;
  alreadyReversedCommissionPaisa: number;
}): number {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  if (input.cumulativeRefundedBasePaisa > input.originalBasePaisa)
    throw new RangeError('Refunded commission base cannot exceed the original base.');
  if (input.originalBasePaisa === 0) {
    if (input.originalCommissionPaisa !== 0)
      throw new RangeError('A zero commission base must have zero commission.');
    return 0;
  }
  const target = roundHalfUpRatio(
    input.originalCommissionPaisa,
    input.cumulativeRefundedBasePaisa,
    input.originalBasePaisa,
  );
  if (input.alreadyReversedCommissionPaisa > target)
    throw new RangeError('Recorded commission reversals exceed the target reversal.');
  return target - input.alreadyReversedCommissionPaisa;
}

export function allocatePlatformDiscountPaisa(
  lines: readonly { key: string; productValuePaisa: number }[],
  discountPaisa: number,
): ReadonlyMap<string, number> {
  if (!Number.isSafeInteger(discountPaisa) || discountPaisa < 0)
    throw new RangeError('Platform discount must be a non-negative safe integer.');
  if (new Set(lines.map((line) => line.key)).size !== lines.length)
    throw new RangeError('Discount allocation keys must be unique.');
  const ordered = [...lines].sort((a, b) => a.key.localeCompare(b.key));
  let total = 0;
  for (const line of ordered) {
    if (!Number.isSafeInteger(line.productValuePaisa) || line.productValuePaisa < 0)
      throw new RangeError('Product values must be non-negative safe integers.');
    total += line.productValuePaisa;
    if (!Number.isSafeInteger(total))
      throw new RangeError('Product value total exceeds the safe integer range.');
  }
  if (discountPaisa > total)
    throw new RangeError('Platform discount cannot exceed product value.');
  if (total === 0) return new Map(ordered.map((line) => [line.key, 0]));
  const allocations = new Map<string, number>();
  let allocated = 0;
  for (const line of ordered) {
    const share = Math.floor(
      Number((BigInt(discountPaisa) * BigInt(line.productValuePaisa)) / BigInt(total)),
    );
    allocations.set(line.key, share);
    allocated += share;
  }
  for (const line of ordered) {
    if (allocated >= discountPaisa) break;
    allocations.set(line.key, (allocations.get(line.key) ?? 0) + 1);
    allocated += 1;
  }
  return allocations;
}

export function isCommissionEarned(input: {
  orderCompleted: boolean;
  paymentReceived: boolean;
  cancelled?: boolean;
}): boolean {
  return input.orderCompleted && input.paymentReceived && !input.cancelled;
}

export function validateMarketplacePolicy(
  policy: MarketplacePolicy,
): readonly string[] {
  const errors: string[] = [];
  const basisPointValues = [
    ['sellerCommissionBps', policy.fees.sellerCommissionBps],
    ['newSellerReserveBps', policy.payouts.newSellerReserveBps],
    ['futureStandardVatRateBps', policy.tax.futureStandardVatRateBps],
  ] as const;

  for (const [name, value] of basisPointValues) {
    if (!Number.isInteger(value) || value < 0 || value > 10_000) {
      errors.push(`${name} must be an integer from 0 through 10,000.`);
    }
  }

  if (policy.tax.registrationMode === 'PAN' && policy.tax.collectVat) {
    errors.push(
      'VAT collection cannot be enabled while the registration mode is PAN.',
    );
  }

  if (
    !Number.isInteger(policy.payouts.minimumPayoutPaisa) ||
    policy.payouts.minimumPayoutPaisa < 0
  ) {
    errors.push('minimumPayoutPaisa must be a non-negative integer.');
  }

  if (
    !Number.isInteger(policy.fees.buyerPlatformFeePaisa) ||
    policy.fees.buyerPlatformFeePaisa < 0
  ) {
    errors.push('buyerPlatformFeePaisa must be a non-negative integer.');
  }

  if (
    !Number.isInteger(policy.returns.highValueRefundThresholdPaisa) ||
    policy.returns.highValueRefundThresholdPaisa <= 0
  ) {
    errors.push('highValueRefundThresholdPaisa must be a positive integer.');
  }

  return errors;
}

const launchPolicyErrors = validateMarketplacePolicy(
  phaseOneMarketplacePolicy.value,
);

if (launchPolicyErrors.length > 0) {
  throw new Error(
    `Invalid Phase 1 marketplace policy: ${launchPolicyErrors.join(' ')}`,
  );
}
