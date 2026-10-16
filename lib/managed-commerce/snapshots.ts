import type { ManagedMakerCommercialModel } from '@/lib/configuration/types';
import {
  calculateManagedEligibleBasePaisa,
  calculateManagedSaleLinkedAmounts,
} from '@/lib/managed-makers/settlement';
import { SIMULATED_RECORD_LABEL } from '@/lib/staging/environment';

export interface ManagedCommercialTerms {
  sellerId: string;
  commercialModel: ManagedMakerCommercialModel;
  legalSellerReference: string;
  invoiceIssuerReference: string;
  payoutBeneficiaryReference: string;
  agreementVersion: string;
  agreementLanguage: 'en' | 'ne';
  termsSettingVersionId: string | null;
  deliveryHoldDays: number;
  holdSettingVersionId: string | null;
  productValuePaisa: number;
  makerFundedDiscountPaisa: number;
  platformFundedDiscountPaisa: number;
  platformRetentionBps: number;
  agreedSupplierAmountPaisa?: number | null;
  acceptedManagedDetailId?: string | null;
  makerName?: string | null;
  storeName?: string | null;
  legalSellerName?: string | null;
}

function reference(label: string, value: string): string {
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > 191) {
    throw new RangeError(`${label} must contain 3–191 characters.`);
  }
  return normalized;
}

export function buildManagedCommercialSnapshot(input: ManagedCommercialTerms) {
  const shared = {
    sellerId: reference('Seller reference', input.sellerId),
    participationRoute: 'managed_maker' as const,
    commercialModel: input.commercialModel,
    legalSellerReference: reference('Legal seller reference', input.legalSellerReference),
    invoiceIssuerReference: reference('Invoice issuer reference', input.invoiceIssuerReference),
    payoutBeneficiaryReference: reference('Payout beneficiary reference', input.payoutBeneficiaryReference),
    agreementVersion: reference('Agreement version', input.agreementVersion),
    agreementLanguage: input.agreementLanguage,
    termsSettingVersionId: input.termsSettingVersionId,
    deliveryHoldDays: input.deliveryHoldDays,
    holdSettingVersionId: input.holdSettingVersionId,
    productValuePaisa: input.productValuePaisa,
    makerFundedDiscountPaisa: input.makerFundedDiscountPaisa,
    platformFundedDiscountPaisa: input.platformFundedDiscountPaisa,
    simulationLabel: SIMULATED_RECORD_LABEL,
    acceptedManagedDetailId: input.acceptedManagedDetailId ?? null,
    makerName: input.makerName ?? null,
    storeName: input.storeName ?? null,
    legalSellerName: input.legalSellerName ?? null,
  };
  if (input.commercialModel === 'managed_fixed_supplier_price_v1') {
    // Customer resale does not create or change a supplier obligation. Fixed
    // supplier money is recorded only by documented supply acceptance.
    return Object.freeze({
      ...shared,
      eligibleBasePaisa: 0,
      platformRetentionBps: 0,
      platformRetainedPaisa: 0,
      makerEntitlementPaisa: 0,
      agreedSupplierAmountPaisa: null,
    });
  }
  const eligibleBasePaisa = calculateManagedEligibleBasePaisa({
    productValuePaisa: input.productValuePaisa,
    makerFundedDiscountPaisa: input.makerFundedDiscountPaisa,
    platformFundedDiscountPaisa: input.platformFundedDiscountPaisa,
  });
  const saleLinked = calculateManagedSaleLinkedAmounts({
    eligibleBasePaisa,
    platformRetentionBps: input.platformRetentionBps,
  });
  return Object.freeze({
    ...shared,
    ...saleLinked,
    agreedSupplierAmountPaisa: null,
  });
}
