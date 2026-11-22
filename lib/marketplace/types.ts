export type MarketplaceRole = 'customer' | 'seller' | 'admin' | 'super_admin';

export type SellerStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'needs_changes'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type ProductStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'needs_changes'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived';

export type PayoutStatus =
  | 'scheduled'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'reversed';

export type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'packing'
  | 'ready_for_pickup'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'return_requested'
  | 'return_in_transit'
  | 'returned'
  | 'refund_processing'
  | 'refunded';

export type SupportedLocale = 'en-NP' | 'ne-NP';

export type ReturnRequestStatus =
  | 'requested'
  | 'under_investigation'
  | 'needs_customer_changes'
  | 'pending_high_value_approval'
  | 'approved'
  | 'rejected'
  | 'in_transit'
  | 'received'
  | 'resolved';

export type ComplaintStatus =
  | 'open'
  | 'assigned'
  | 'investigating'
  | 'waiting_customer'
  | 'escalated'
  | 'resolved'
  | 'closed';

/** Store every monetary value as an integer number of paisa. */
export type MoneyPaisa = number;

/** 10,000 basis points equals 100%. */
export type BasisPoints = number;

export interface EffectivePolicy<T> {
  version: string;
  effectiveFrom: string;
  value: T;
}

export interface MarketplacePolicy {
  identity: {
    brandName: string;
    operatingCountry: 'NP';
    currency: 'NPR';
    timezone: 'Asia/Kathmandu';
    supportedLocales: readonly SupportedLocale[];
    defaultLocale: SupportedLocale;
  };
  market: {
    nationwideService: boolean;
    launchPriorityRegion: 'terai';
    businessModel: 'intermediary_marketplace';
    firstPartyStoreEnabled: boolean;
  };
  tax: {
    registrationMode: 'PAN' | 'VAT';
    collectVat: boolean;
    futureStandardVatRateBps: BasisPoints;
    pricesAreCustomerFinal: boolean;
  };
  fees: {
    sellerCommissionBps: BasisPoints;
    buyerPlatformFeePaisa: MoneyPaisa;
    absorbDigitalPaymentFees: boolean;
    featuredPlacementEnabled: boolean;
  };
  payouts: {
    cadence: 'weekly';
    deliveryHoldDays: number;
    minimumPayoutPaisa: MoneyPaisa;
    newSellerReserveBps: BasisPoints;
    reserveAppliesForDays: number;
    reserveReleaseAfterDays: number;
    requiresMakerChecker: boolean;
  };
  cancellations: {
    freeBeforePacking: boolean;
    afterDispatchHandledAsReturn: boolean;
    repeatedSellerCancellationReviewCount: number;
  };
  returns: {
    generalRequestWindowDays: number;
    sealedGoodsWindowDays: number;
    deliveryDamageEvidenceWindowHours: number;
    changeOfMindEnabled: boolean;
    highValueRefundThresholdPaisa: MoneyPaisa;
    refundInitiationBusinessDays: number;
    refundCompletionCalendarDays?: number;
    digitalRefundEstimateBusinessDays: readonly [number, number];
    codRefundEstimateBusinessDays: readonly [number, number];
  };
  moderation: {
    sellerApprovalRequired: boolean;
    productApprovalRequired: boolean;
    preventSelfApproval: boolean;
    criticalProductEditsRequireReview: boolean;
  };
  shipping: {
    responsibility: 'marketplace';
    initialProvider: 'nepal_can_move';
    integrationStatus: 'merchant_contract_required';
    codEnabled: boolean;
    prepaidEnabled: boolean;
    manualFallbackEnabled: boolean;
  };
  governance: {
    policiesAreVersioned: boolean;
    orderSnapshotsCommercialTerms: boolean;
    riskyActionsRequireReason: boolean;
    riskyActionsRequireAuditLog: boolean;
  };
}
