import { calculateCommissionBasePaisa, calculateSellerCommissionPaisa } from '../marketplace/policy';
import { priceApprovedVariant, type ApprovedVariantPricing } from '../products/variant-pricing';

export interface VariantOrderPricingSnapshot extends ApprovedVariantPricing {
  offerId: string;
  offerVersionId: string;
  publicVersionId: string;
  quantity: number;
  discounts: {
    sellerFundedPaisa: number;
    platformPromoPaisa: number;
    platformReferralPaisa: number;
    promoCampaignId: string | null;
    promoVersion: number | null;
  };
  taxPaisa: number;
  customerSubtotalPaisa: number;
  customerTotalPaisa: number;
  creditAppliedPaisa: number;
  cashPayablePaisa: number;
  commission: {
    kind: 'registered' | 'managed_sale_linked';
    ruleVersion: string;
    settingVersionId: string | null;
    agreementVersion: string;
    acceptanceId: string | null;
    bps: number;
    basePaisa: number;
    amountPaisa: number;
  };
}

type VariantOrderPricingInput = Pick<VariantOrderPricingSnapshot,
  'sellerBasePaisa' | 'returnEligible' | 'offerId' | 'offerVersionId' | 'publicVersionId' |
  'quantity' | 'discounts' | 'taxPaisa' | 'creditAppliedPaisa'> & {
  commission: Omit<VariantOrderPricingSnapshot['commission'], 'basePaisa' | 'amountPaisa'>;
};

function money(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Order pricing requires nonnegative safe integer paisa.');
  return value;
}

/** Save both sides of an order line before any later changes to the offer or terms. */
export function buildVariantOrderPricingSnapshot(input: VariantOrderPricingInput): VariantOrderPricingSnapshot {
  const pricing = priceApprovedVariant(input.sellerBasePaisa, input.returnEligible);
  const { quantity, discounts, commission } = input;
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new RangeError('An order line requires a positive integer quantity.');
  const sellerFundedPaisa = money(discounts.sellerFundedPaisa);
  const platformFundedPaisa = money(money(discounts.platformPromoPaisa) + money(discounts.platformReferralPaisa));
  const taxPaisa = money(input.taxPaisa);
  const creditAppliedPaisa = money(input.creditAppliedPaisa);
  const customerSubtotalPaisa = money(pricing.customerUnitPaisa * quantity);
  const discountedSubtotal = money(customerSubtotalPaisa - sellerFundedPaisa - platformFundedPaisa);
  const customerTotalPaisa = money(discountedSubtotal + taxPaisa);
  const basePaisa = calculateCommissionBasePaisa({
    productValuePaisa: money(pricing.sellerBasePaisa * quantity), sellerFundedDiscountPaisa: sellerFundedPaisa,
  });
  return {
    ...pricing,
    offerId: input.offerId, offerVersionId: input.offerVersionId, publicVersionId: input.publicVersionId,
    quantity, discounts: { ...discounts }, taxPaisa, customerSubtotalPaisa, customerTotalPaisa, creditAppliedPaisa,
    cashPayablePaisa: money(customerTotalPaisa - creditAppliedPaisa),
    commission: { ...commission, basePaisa, amountPaisa: calculateSellerCommissionPaisa(basePaisa, commission.bps) },
  };
}
