import assert from 'node:assert/strict';
import test from 'node:test';
import { getDeliveryEstimate } from '../lib/checkout/validation';
import { productReturnDisclosure } from '../lib/returns/presentation';
import { phaseOneMarketplacePolicy } from '../lib/marketplace/policy';

void test('delivery needs a district and includes preparation in every zone', () => {
  assert.equal(getDeliveryEstimate('', [5]), null);
  assert.equal(getDeliveryEstimate(' ', [5]), null);
  for (const [district, charge, min, max] of [
    [' Kathmandu ', 15000, 1, 3], ['DHANUSHA', 18000, 2, 5], ['Dolpa', 25000, 3, 7],
  ] as const) {
    const quote = getDeliveryEstimate(district, [5])!;
    assert.equal(quote.chargePaisa, charge);
    assert.equal(quote.estimatedMinDays, min + 5);
    assert.equal(quote.estimatedMaxDays, max + 5);
    assert.equal(quote.preparationDays, 5);
  }
});

void test('mixed sellers and quantities retain one order charge and the longest preparation time', () => {
  assert.deepEqual(getDeliveryEstimate('Kathmandu', [0, 5, 2, 5]), getDeliveryEstimate('Kathmandu', [5]));
  assert.equal(getDeliveryEstimate('Kathmandu', [0])?.estimatedMinDays, 1);
});

void test('delivery adds half the destination base for each additional store', () => {
  const estimate = getDeliveryEstimate as unknown as (
    district: string,
    preparationDays: readonly number[],
    rates: undefined,
    storeCount: number,
  ) => ReturnType<typeof getDeliveryEstimate>;
  for (const [storeCount, chargePaisa] of [
    [1, 15_000],
    [2, 22_500],
    [3, 30_000],
    [4, 37_500],
  ] as const) {
    assert.equal(
      estimate('Kathmandu', [2], undefined, storeCount)?.chargePaisa,
      chargePaisa,
    );
  }
});

void test('return disclosure uses current policy and preserves item conditions and exclusions', () => {
  const policy = phaseOneMarketplacePolicy.value.returns;
  const yes = productReturnDisclosure(true, 'Unused only. Custom engraving excluded.', policy);
  assert.match(yes.eligibility, /7 days after delivery/);
  assert.equal(yes.conditions, 'Unused only. Custom engraving excluded.');
  const no = productReturnDisclosure(false, 'Personalised item.', policy);
  assert.match(no.eligibility, /Not eligible for change-of-mind/);
  assert.equal(no.conditions, 'Personalised item.');
  assert.match(no.protection, /48 hours/);
  assert.match(no.protection, /photos are optional/i);
  assert.match(productReturnDisclosure(true, null, policy).conditions, /No additional item-specific/);
  assert.match(productReturnDisclosure(true, '', {...policy, changeOfMindEnabled: false}).eligibility, /Not eligible/);
  assert.match(productReturnDisclosure(true, '', {...policy, generalRequestWindowDays: 14}).eligibility, /14 days/);
});
