import assert from 'node:assert/strict';
import test from 'node:test';

import {
  businessSettingDefinitions,
  getBusinessSettingDefinition,
  validateBusinessSettingValue,
} from '../lib/configuration/definitions';
import type { BusinessSettingKey } from '../lib/configuration/types';
import {
  calculateManagedEligibleBasePaisa,
  calculateManagedSaleLinkedAmounts,
  calculateFixedSupplierPurchaseAmounts,
  isManagedEntitlementEarned,
} from '../lib/managed-makers/settlement';

void test('managed retention and independent seller commission are different registered financial keys', () => {
  const independent = getBusinessSettingDefinition(
    'independent_seller_commission_bps',
  );
  const managed = getBusinessSettingDefinition(
    'managed_sale_linked_platform_retention_bps',
  );

  assert.notEqual(independent.key, managed.key);
  assert.equal(independent.defaultValue, 900);
  assert.equal(managed.defaultValue, 900);
  assert.match(managed.label, /platform retention/i);
  assert.doesNotMatch(managed.label, /maker entitlement rate/i);
  assert.equal(independent.changeControl, 'controlled');
  assert.equal(managed.changeControl, 'controlled');
  assert.equal(managed.snapshotOnTransaction, true);
});

void test('NPR 1,000 reconciles to NPR 90 retained and NPR 910 maker entitlement', () => {
  const amounts = calculateManagedSaleLinkedAmounts({
    eligibleBasePaisa: 100_000,
    platformRetentionBps: 900,
  });

  assert.deepEqual(amounts, {
    eligibleBasePaisa: 100_000,
    platformRetentionBps: 900,
    platformRetainedPaisa: 9_000,
    makerEntitlementPaisa: 91_000,
  });
  assert.equal(
    amounts.platformRetainedPaisa + amounts.makerEntitlementPaisa,
    amounts.eligibleBasePaisa,
  );
});

void test('retention rounds half-up while entitlement is the exact reconciled remainder', () => {
  assert.deepEqual(
    calculateManagedSaleLinkedAmounts({
      eligibleBasePaisa: 50,
      platformRetentionBps: 900,
    }),
    {
      eligibleBasePaisa: 50,
      platformRetentionBps: 900,
      platformRetainedPaisa: 5,
      makerEntitlementPaisa: 45,
    },
  );
  const split = calculateManagedSaleLinkedAmounts({
    eligibleBasePaisa: 101,
    platformRetentionBps: 900,
  });
  assert.equal(split.platformRetainedPaisa, 9);
  assert.equal(split.makerEntitlementPaisa, 92);
  assert.equal(split.platformRetainedPaisa + split.makerEntitlementPaisa, 101);
});

void test('maker-funded discounts reduce the eligible base but platform-funded discounts, tax, and delivery do not', () => {
  assert.equal(
    calculateManagedEligibleBasePaisa({
      productValuePaisa: 100_000,
      makerFundedDiscountPaisa: 10_000,
      platformFundedDiscountPaisa: 5_000,
      taxPaisa: 13_000,
      deliveryPaisa: 15_000,
    }),
    90_000,
  );
});

void test('expected sale-linked entitlement is earned only after delivered and paid conditions', () => {
  assert.equal(
    isManagedEntitlementEarned({ delivered: true, customerPaid: true }),
    true,
  );
  assert.equal(
    isManagedEntitlementEarned({ delivered: false, customerPaid: true }),
    false,
  );
  assert.equal(
    isManagedEntitlementEarned({ delivered: true, customerPaid: false }),
    false,
  );
  assert.equal(
    isManagedEntitlementEarned({
      delivered: true,
      customerPaid: true,
      disputed: true,
    }),
    false,
  );
});

void test('fixed supplier-price purchasing never receives the sale-linked 9% deduction', () => {
  assert.deepEqual(
    calculateFixedSupplierPurchaseAmounts({
      agreedSupplierAmountPaisa: 100_000,
    }),
    {
      agreedSupplierAmountPaisa: 100_000,
      platformRetainedPaisa: 0,
      supplierAmountOwedPaisa: 100_000,
    },
  );
});

void test('only supported, validated controls exist and demonstration defaults remain non-live', () => {
  const keys = new Set(
    businessSettingDefinitions.map((definition) => definition.key),
  );
  const requiredKeys: readonly BusinessSettingKey[] = [
    'independent_seller_commission_bps',
    'managed_sale_linked_platform_retention_bps',
    'managed_maker_program_mode',
    'managed_maker_active_model',
    'payout_processing_weekday',
    'payout_cutoff_local_time',
    'payout_timezone',
    'seller_delivery_hold_days',
    'platform_payout_minimum_paisa',
    'new_seller_reserve_bps',
    'rider_remittance_business_days',
    'rider_finance_policy',
    'open_box_category_codes',
    'open_box_service_area_codes',
    'managed_adjustment_reason_codes',
    'product_material_suggestions',
    'official_social_links',
    'first_party_analytics_policy',
    'recently_viewed_policy',
  ];
  assert.deepEqual([...keys].sort(), [...requiredKeys].sort());
  assert.equal(
    getBusinessSettingDefinition('managed_maker_program_mode').defaultValue,
    'applications_only',
  );
  assert.equal(
    getBusinessSettingDefinition('managed_maker_active_model').defaultValue,
    null,
  );
  assert.equal(
    getBusinessSettingDefinition('platform_payout_minimum_paisa').defaultValue,
    0,
  );
  assert.equal(
    getBusinessSettingDefinition('new_seller_reserve_bps').defaultValue,
    0,
  );
});

void test('Recently Viewed defaults are configurable and strictly bounded', () => {
  const definition = getBusinessSettingDefinition('recently_viewed_policy');
  assert.deepEqual(definition.defaultValue, { maxItems: 12, retentionDays: 90 });
  assert.deepEqual(
    validateBusinessSettingValue('recently_viewed_policy', { maxItems: 8, retentionDays: 30 }),
    { maxItems: 8, retentionDays: 30 },
  );
  assert.throws(
    () => validateBusinessSettingValue('recently_viewed_policy', { maxItems: 25, retentionDays: 90 }),
    /item limit/i,
  );
  assert.throws(
    () => validateBusinessSettingValue('recently_viewed_policy', { maxItems: 12, retentionDays: 90, rawSql: 'SELECT 1' }),
    /unknown field/i,
  );
});

void test('first-party analytics policy is disabled by default and strictly bounded', () => {
  const definition = getBusinessSettingDefinition(
    'first_party_analytics_policy',
  );
  assert.equal(definition.defaultValue.enabled, false);
  assert.equal(definition.defaultValue.retentionDays, 90);
  assert.deepEqual(
    validateBusinessSettingValue('first_party_analytics_policy', {
      enabled: true,
      retentionDays: 30,
      excludedEmailDomains: ['EXAMPLE.TEST'],
      excludedPathPrefixes: ['/admin/'],
    }),
    {
      enabled: true,
      retentionDays: 30,
      excludedEmailDomains: ['example.test'],
      excludedPathPrefixes: ['/admin'],
    },
  );
  assert.throws(
    () =>
      validateBusinessSettingValue('first_party_analytics_policy', {
        enabled: true,
        retentionDays: 366,
        excludedEmailDomains: [],
        excludedPathPrefixes: [],
      }),
    /retention/i,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue('first_party_analytics_policy', {
        enabled: true,
        retentionDays: 30,
        excludedEmailDomains: [],
        excludedPathPrefixes: [],
        executableFormula: 'collect_everything()',
      }),
    /unknown field/i,
  );
});

void test('rider finance is controlled, unconfigured by default, and rejects executable or malformed values', () => {
  const definition = getBusinessSettingDefinition('rider_finance_policy');
  assert.equal(definition.changeControl, 'controlled');
  assert.equal(definition.snapshotOnTransaction, true);
  assert.equal(definition.defaultValue.cashExposureLimitPaisa, null);
  const value = validateBusinessSettingValue('rider_finance_policy', {
    cashExposureLimitPaisa: 500_000,
    operatingWeekdays: ['sunday', 'monday'],
    holidayDates: ['2026-09-20'],
    remittanceCutoffLocalTime: '17:00',
    completedTripPaisa: 10_000,
    failedTripPaisa: 5_000,
    returnTripPaisa: 7_500,
    receivingAccountLabel: 'SIMULATED CASH DESK — NO REAL FUNDS',
  });
  assert.equal(value.cashExposureLimitPaisa, 500_000);
  assert.throws(
    () =>
      validateBusinessSettingValue('rider_finance_policy', {
        ...value,
        executableFormula: 'customer_cash - payout()',
      }),
    /unknown field/i,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue('rider_finance_policy', {
        ...value,
        operatingWeekdays: ['saturday', 'saturday'],
      }),
    /duplicate/i,
  );
});

void test('official Hastabazaar social links are normalized and validated', () => {
  const socialLinks = {
    linkedin: 'https://linkedin.com/company/hastabazaar',
    x: 'https://x.com/Hastabazaar',
    tiktok: 'https://tiktok.com/@hastabazaar',
    instagram: 'https://instagram.com/hastabazaar',
    facebook: 'https://www.facebook.com/hastabazaar',
    youtube: 'https://www.youtube.com/@hastabazaar',
  };
  assert.deepEqual(
    validateBusinessSettingValue('official_social_links', socialLinks),
    socialLinks,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue('official_social_links', {
        ...socialLinks,
        instagram: 'javascript:alert(1)',
      }),
    /instagram/i,
  );
});

void test('unknown keys, executable formulas, and invalid financial values fail closed', () => {
  assert.throws(
    () => getBusinessSettingDefinition('raw_sql' as BusinessSettingKey),
    /unknown business setting/i,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue(
        'managed_sale_linked_platform_retention_bps',
        'eligible_base * 0.09',
      ),
    /integer/i,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue(
        'managed_sale_linked_platform_retention_bps',
        10_001,
      ),
    /0 through 10,000/i,
  );
  assert.throws(
    () => calculateManagedSaleLinkedAmounts({ eligibleBasePaisa: -1 }),
    RangeError,
  );
});
