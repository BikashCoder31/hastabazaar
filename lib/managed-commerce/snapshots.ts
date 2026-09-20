import type { ManagedMakerCommercialModel } from '@/lib/configuration/types';
import {
  calculateFixedSupplierPurchaseAmounts,
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
  productValuePaisa: number;
  makerFundedDiscountPaisa: number;
  platformFundedDiscountPaisa: number;
  platformRetentionBps: number;
  agreedSupplierAmountPaisa?: number | null;
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
    productValuePaisa: input.productValuePaisa,
    makerFundedDiscountPaisa: input.makerFundedDiscountPaisa,
    platformFundedDiscountPaisa: input.platformFundedDiscountPaisa,
    simulationLabel: SIMULATED_RECORD_LABEL,
  };
  if (input.commercialModel === 'managed_fixed_supplier_price_v1') {
    const fixed = calculateFixedSupplierPurchaseAmounts({
      agreedSupplierAmountPaisa: input.agreedSupplierAmountPaisa ?? -1,
    });
    return Object.freeze({
      ...shared,
      eligibleBasePaisa: fixed.agreedSupplierAmountPaisa,
      platformRetentionBps: 0,
      platformRetainedPaisa: 0,
      makerEntitlementPaisa: fixed.supplierAmountOwedPaisa,
      agreedSupplierAmountPaisa: fixed.agreedSupplierAmountPaisa,
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
