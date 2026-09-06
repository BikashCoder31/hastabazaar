import type { EffectivePolicy, MarketplacePolicy } from './types';

/**
 * Launch defaults, not immutable business rules.
 * Persist a versioned copy when storage is introduced and snapshot the applied
 * commercial terms onto every order.
 */
export const phaseOneMarketplacePolicy = {
  version: 'phase-1.0',
  effectiveFrom: '2026-09-05',
  value: {
    identity: {
      brandName: 'Hathkriti',
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
      sellerCommissionBps: 1_200,
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
  commissionBps = phaseOneMarketplacePolicy.value.fees.sellerCommissionBps,
): number {
  if (
    !Number.isInteger(itemSubtotalAfterSellerDiscountPaisa) ||
    itemSubtotalAfterSellerDiscountPaisa < 0
  ) {
    throw new RangeError(
      'Item subtotal must be a non-negative integer number of paisa.',
    );
  }

  return Math.round(
    (itemSubtotalAfterSellerDiscountPaisa * commissionBps) / 10_000,
  );
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
