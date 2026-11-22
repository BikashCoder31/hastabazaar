import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

void test('returnable variants use the approved price at the NPR 400 boundary', async () => {
  const { priceApprovedVariant } = await import('../lib/products/variant-pricing');
  assert.equal(priceApprovedVariant(39_900, true).customerUnitPaisa, 43_900);
  assert.equal(priceApprovedVariant(40_000, true).customerUnitPaisa, 48_000);
});

void test('nonreturnable variants round the uncapped addition to whole rupees per unit', async () => {
  const { priceApprovedVariant } = await import('../lib/products/variant-pricing');
  assert.equal(priceApprovedVariant(20_900, false).additionPaisa, 1_000);
  assert.equal(priceApprovedVariant(21_000, false).additionPaisa, 1_100);
  assert.equal(priceApprovedVariant(21_000, false).customerUnitPaisa * 2, 44_200);
  assert.equal(priceApprovedVariant(10_000_000, false).additionPaisa, 500_000);
  assert.throws(() => priceApprovedVariant(Number.MAX_SAFE_INTEGER, true), RangeError);
});

void test('catalogue SQL and checkout price agree for both tiers and half-rupee rounding', async () => {
  const { variantCustomerUnitPriceSql } = await import('../lib/products/variant-pricing');
  const sqlite = new DatabaseSync(':memory:');
  try {
    const priceSql = variantCustomerUnitPriceSql('base', 'returnable', 'sqlite');
    const query = sqlite.prepare(`SELECT ${priceSql} AS price FROM (SELECT ? AS base, ? AS returnable)`);
    for (const [base, returnable, expected] of [
      [39_900, 1, 43_900], [40_000, 1, 48_000], [20_900, 0, 21_900],
      [21_000, 0, 22_100], [10_000_000, 0, 10_500_000],
    ]) {
      assert.equal(query.get(base, returnable)?.price, expected);
    }
  } finally {
    sqlite.close();
  }
});

const variant = { offerId: 'offer', offerVersionId: 'option-v1', publicVersionId: 'publication-v1' };
const commission = {
  kind: 'registered' as const, ruleVersion: 'accepted-terms', settingVersionId: 'effective-setting',
  agreementVersion: 'agreement-v1', acceptanceId: 'accepted-v1', bps: 1_200,
};
const noDiscounts = {
  sellerFundedPaisa: 0, platformPromoPaisa: 0, platformReferralPaisa: 0,
  promoCampaignId: null, promoVersion: null,
};

void test('a platform coupon can lower a returnable item below NPR 400 without lowering its addition or commission base', async () => {
  const { buildVariantOrderPricingSnapshot } = await import('../lib/checkout/variant-order-pricing');
  const result = buildVariantOrderPricingSnapshot({ ...variant, sellerBasePaisa: 40_000, returnEligible: true,
    quantity: 1, discounts: { ...noDiscounts, platformPromoPaisa: 10_000, promoCampaignId: 'promo', promoVersion: 1 },
    taxPaisa: 0, creditAppliedPaisa: 0, commission });
  assert.equal(result.additionPaisa, 8_000);
  assert.equal(result.customerTotalPaisa, 38_000);
  assert.equal(result.commission.basePaisa, 40_000);
  assert.equal(result.commission.amountPaisa, 4_800);
});

void test('only seller-funded discounts reduce commission and tax and credit reconcile separately', async () => {
  const { buildVariantOrderPricingSnapshot } = await import('../lib/checkout/variant-order-pricing');
  const result = buildVariantOrderPricingSnapshot({ ...variant, sellerBasePaisa: 40_000, returnEligible: true,
    quantity: 1, discounts: { ...noDiscounts, sellerFundedPaisa: 2_000, platformReferralPaisa: 500 },
    taxPaisa: 400, creditAppliedPaisa: 1_000, commission });
  assert.equal(result.customerSubtotalPaisa, 48_000);
  assert.equal(result.customerTotalPaisa, 45_900);
  assert.equal(result.cashPayablePaisa, 44_900);
  assert.equal(result.commission.basePaisa, 38_000);
  assert.equal(result.commission.amountPaisa, 4_560);
  assert.equal(result.commission.settingVersionId, 'effective-setting');
});

void test('the order snapshot keeps the applicable contracted terms and per-unit addition', async () => {
  const { buildVariantOrderPricingSnapshot } = await import('../lib/checkout/variant-order-pricing');
  const result = buildVariantOrderPricingSnapshot({ ...variant, sellerBasePaisa: 21_000, returnEligible: false,
    quantity: 2, discounts: noDiscounts, taxPaisa: 0, creditAppliedPaisa: 0,
    commission: { ...commission, kind: 'managed_sale_linked', ruleVersion: 'contract-v2', bps: 950 } });
  assert.equal(result.customerSubtotalPaisa, 44_200);
  assert.equal(result.commission.basePaisa, 42_000);
  assert.equal(result.commission.amountPaisa, 3_990);
  assert.equal(result.commission.ruleVersion, 'contract-v2');
});
