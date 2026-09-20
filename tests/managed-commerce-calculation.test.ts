import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  calculateFixedSupplierPurchaseAmounts,
  calculateManagedEligibleBasePaisa,
  calculateManagedSaleLinkedAmounts,
  calculateManagedSaleLinkedRefundAmounts,
} from '../lib/managed-makers/settlement';

void test('sale-linked demo preserves exact 9% retention and 91% maker entitlement', () => {
  const result = calculateManagedSaleLinkedAmounts({
    eligibleBasePaisa: 100_000,
    platformRetentionBps: 900,
  });

  assert.equal(result.platformRetainedPaisa, 9_000);
  assert.equal(result.makerEntitlementPaisa, 91_000);
  assert.equal(
    result.platformRetainedPaisa + result.makerEntitlementPaisa,
    result.eligibleBasePaisa,
  );
});

void test('only maker-funded discounts reduce the managed eligible base', () => {
  const eligibleBasePaisa = calculateManagedEligibleBasePaisa({
    productValuePaisa: 100_000,
    makerFundedDiscountPaisa: 10_000,
    platformFundedDiscountPaisa: 5_000,
    taxPaisa: 13_000,
    deliveryPaisa: 15_000,
  });

  assert.equal(eligibleBasePaisa, 90_000);
  assert.deepEqual(
    calculateManagedSaleLinkedAmounts({
      eligibleBasePaisa,
      platformRetentionBps: 900,
    }),
    {
      eligibleBasePaisa: 90_000,
      platformRetentionBps: 900,
      platformRetainedPaisa: 8_100,
      makerEntitlementPaisa: 81_900,
    },
  );
});

void test('partial refund reverses the original split and a full refund has no rounding residue', () => {
  const original = calculateManagedSaleLinkedAmounts({
    eligibleBasePaisa: 101,
    platformRetentionBps: 900,
  });
  const partial = calculateManagedSaleLinkedRefundAmounts({
    originalEligibleBasePaisa: original.eligibleBasePaisa,
    originalPlatformRetainedPaisa: original.platformRetainedPaisa,
    refundedEligibleBasePaisa: 50,
  });
  const full = calculateManagedSaleLinkedRefundAmounts({
    originalEligibleBasePaisa: original.eligibleBasePaisa,
    originalPlatformRetainedPaisa: original.platformRetainedPaisa,
    refundedEligibleBasePaisa: 101,
  });

  assert.equal(
    partial.platformRetentionReversalPaisa + partial.makerEntitlementReversalPaisa,
    50,
  );
  assert.deepEqual(full, {
    refundedEligibleBasePaisa: 101,
    platformRetentionReversalPaisa: 9,
    makerEntitlementReversalPaisa: 92,
  });
});

void test('fixed supplier-price obligations have no automatic platform percentage deduction', () => {
  assert.deepEqual(
    calculateFixedSupplierPurchaseAmounts({ agreedSupplierAmountPaisa: 100_000 }),
    {
      agreedSupplierAmountPaisa: 100_000,
      platformRetainedPaisa: 0,
      supplierAmountOwedPaisa: 100_000,
    },
  );
});

void test('managed commerce migration keeps immutable terms, ledgers, payouts, and issuer groups separate', async () => {
  const sql = await readFile('drizzle/0046_managed_commerce.sql', 'utf8');

  for (const table of [
    'managed_commercial_snapshots',
    'managed_entitlements',
    'managed_settlement_entries',
    'managed_payouts',
    'managed_payout_entries',
    'managed_invoice_groups',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${table}`));
  }
  assert.match(sql, /order_item_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
  assert.match(sql, /platform_retention_bps/i);
  assert.match(sql, /maker_entitlement_paisa/i);
  assert.match(sql, /simulation_label/i);
  assert.match(sql, /approved_by[\s\S]+prepared_by/i);
});
