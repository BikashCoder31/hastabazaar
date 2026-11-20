import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

void test('customer checkout shows only the arrival estimate, not delivery calculation details', async () => {
  const source = await readFile(
    new URL('../components/commerce/checkout-form.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /Estimated arrival:/);
  assert.doesNotMatch(source, /first store/i);
  assert.doesNotMatch(source, /additional store/i);
  assert.doesNotMatch(source, /Destination rate:/i);
  assert.doesNotMatch(source, /longest item preparation time/i);
  assert.doesNotMatch(source, /transitMinDays/);
  assert.doesNotMatch(source, /baseChargePaisa/);
  assert.doesNotMatch(source, /rateBand/);
  assert.doesNotMatch(source, /storeCount/);
});

void test('seller and staff order views retain protected delivery calculation details', async () => {
  const [sellerSource, staffSource] = await Promise.all([
    readFile(new URL('../app/seller/orders/order-detail.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/orders/[id]/page.tsx', import.meta.url), 'utf8'),
  ]);

  for (const source of [sellerSource, staffSource]) {
    assert.match(source, /deliveryPricing/);
    assert.match(source, /baseChargePaisa/);
    assert.match(source, /first store/i);
    assert.match(source, /additional store/i);
    assert.match(source, /originalStoreCount/);
    assert.match(source, /currentStoreCount/);
  }
});
