import { COMMISSION_BPS_DENOMINATOR, roundHalfUpRatio } from '../marketplace/policy';

function nonNegativePaisa(label: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer number of paisa.`);
  }
  return value;
}

export function calculateManagedEligibleBasePaisa(input: {
  productValuePaisa: number;
  makerFundedDiscountPaisa?: number;
  platformFundedDiscountPaisa?: number;
  taxPaisa?: number;
  deliveryPaisa?: number;
}): number {
  const productValuePaisa = nonNegativePaisa(
    'Product value',
    input.productValuePaisa,
  );
  const makerFundedDiscountPaisa = nonNegativePaisa(
    'Maker-funded discount',
    input.makerFundedDiscountPaisa ?? 0,
  );
  nonNegativePaisa(
    'Platform-funded discount',
    input.platformFundedDiscountPaisa ?? 0,
  );
  nonNegativePaisa('Tax', input.taxPaisa ?? 0);
  nonNegativePaisa('Delivery', input.deliveryPaisa ?? 0);
  if (makerFundedDiscountPaisa > productValuePaisa) {
    throw new RangeError('Maker-funded discount cannot exceed product value.');
  }
  return productValuePaisa - makerFundedDiscountPaisa;
}

export function calculateManagedSaleLinkedAmounts(input: {
  eligibleBasePaisa: number;
  platformRetentionBps?: number;
}) {
  const eligibleBasePaisa = nonNegativePaisa(
    'Eligible base',
    input.eligibleBasePaisa,
  );
  const platformRetentionBps = input.platformRetentionBps ?? 900;
  if (
    !Number.isSafeInteger(platformRetentionBps) ||
    platformRetentionBps < 0 ||
    platformRetentionBps > COMMISSION_BPS_DENOMINATOR
  ) {
    throw new RangeError('Platform retention basis points must be from 0 through 10,000.');
  }
  const platformRetainedPaisa = roundHalfUpRatio(
    eligibleBasePaisa,
    platformRetentionBps,
    COMMISSION_BPS_DENOMINATOR,
  );
  return Object.freeze({
    eligibleBasePaisa,
    platformRetentionBps,
    platformRetainedPaisa,
    makerEntitlementPaisa: eligibleBasePaisa - platformRetainedPaisa,
  });
}

export function isManagedEntitlementEarned(input: {
  delivered: boolean;
  customerPaid: boolean;
  disputed?: boolean;
  refunded?: boolean;
}): boolean {
  return (
    input.delivered &&
    input.customerPaid &&
    !input.disputed &&
    !input.refunded
  );
}

export function calculateFixedSupplierPurchaseAmounts(input: {
  agreedSupplierAmountPaisa: number;
}) {
  const agreedSupplierAmountPaisa = nonNegativePaisa(
    'Agreed supplier amount',
    input.agreedSupplierAmountPaisa,
  );
  return Object.freeze({
    agreedSupplierAmountPaisa,
    platformRetainedPaisa: 0,
    supplierAmountOwedPaisa: agreedSupplierAmountPaisa,
  });
}
