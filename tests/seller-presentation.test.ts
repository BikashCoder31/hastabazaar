import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canEditSellerInventory,
  payoutRequestBlock,
  sellerMoney,
  sellerDate,
} from '../lib/seller/presentation';

void test('seller payout affordance permits positive balances and blocks outstanding requests', () => {
  for (const amount of [1, 99999, 100000]) assert.equal(payoutRequestBlock(amount, false), null);
  for (const amount of [0, -1]) assert.match(payoutRequestBlock(amount, false) ?? '', /positive available balance/);
  assert.match(payoutRequestBlock(1, true) ?? '', /awaiting Admin/);
});
void test('inventory controls deny unavailable and unknown listing states', () => {
  for (const status of [
    'draft',
    'submitted',
    'under_review',
    'needs_changes',
    'approved',
    'published',
  ])
    assert.equal(canEditSellerInventory(status), true);
  for (const status of ['rejected', 'archived', 'unknown', ''])
    assert.equal(canEditSellerInventory(status), false);
});
void test('seller presentation formats integer paisa and Nepal dates without changing amounts', () => {
  assert.match(sellerMoney(123456), /1,234.56/);
  assert.match(sellerMoney(-500), /5.00/);
  assert.equal(
    sellerDate(Date.UTC(2026, 8, 6, 20)),
    sellerDate(Date.UTC(2026, 8, 7, 0)),
  );
});
