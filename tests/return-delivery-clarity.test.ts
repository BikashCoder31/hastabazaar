import assert from 'node:assert/strict';
import test from 'node:test';
import { DELIVERY_ESTIMATE_NOTICE, deliveryDistrictFeedback } from '../lib/checkout/delivery-presentation';
import { DEFAULT_DELIVERY_RATES } from '../lib/checkout/delivery-rates';
import { getDeliveryEstimate } from '../lib/checkout/validation';
import { publicPages } from '../lib/content/public-pages';
import { phaseOneMarketplacePolicy } from '../lib/marketplace/policy';
import { productReturnDisclosure } from '../lib/returns/presentation';

const policy = phaseOneMarketplacePolicy.value.returns;
const stale = 'Returns or exchanges are accepted within 10 days of delivery under the standard Hastabazaar return policy.';

void test('eligible items keep approved standard and intact-seal windows without implying undocumented exclusions', () => {
  const disclosure = productReturnDisclosure(true, null, policy);
  assert.match(disclosure.eligibility, /7 days after delivery/);
  assert.match(disclosure.eligibility, /15 days.*seal remains intact/);
  assert.match(disclosure.conditions, /No additional item-specific return conditions are provided/);
  assert.doesNotMatch(disclosure.conditions, /no.*exclusions|excluded from change-of-mind/i);
});

void test('an excluded item without extra conditions acknowledges its exclusion instead of denying exclusions', () => {
  for (const conditions of [null, '', '   ', stale]) {
    const disclosure = productReturnDisclosure(false, conditions, policy);
    assert.match(disclosure.eligibility, /Not eligible for change-of-mind returns/);
    assert.match(disclosure.conditions, /This item is excluded from change-of-mind returns/);
    assert.match(disclosure.conditions, /problem-item protections below still apply/);
    assert.doesNotMatch(disclosure.conditions, /no.*exclusions|10 days|custom|perishable/i);
  }
});

void test('globally disabled change-of-mind returns explain the policy state without inventing an item reason', () => {
  const disclosure = productReturnDisclosure(true, null, { ...policy, changeOfMindEnabled: false });
  assert.match(disclosure.eligibility, /Not eligible/);
  assert.match(disclosure.conditions, /unavailable under the current marketplace policy/);
  assert.doesNotMatch(disclosure.conditions, /This item is excluded|custom|perishable/i);
});

void test('explicit product conditions and problem-item protections survive every eligibility state', () => {
  const conditions = 'Personalised item. Keep the supplied accessories.';
  for (const eligible of [true, false]) {
    for (const changeOfMindEnabled of [true, false]) {
      const disclosure = productReturnDisclosure(eligible, stale + '\n' + conditions, { ...policy, changeOfMindEnabled });
      assert.equal(disclosure.conditions, conditions);
      assert.match(disclosure.protection, /Wrong, damaged, defective, counterfeit, materially misdescribed or unreasonably late/);
      assert.match(disclosure.protection, /48 hours.*later reports receive manual review and photos are optional/);
    }
  }
});

void test('empty, unknown and ambiguous districts cannot produce a delivery estimate', () => {
  for (const value of ['', ' ', 'Atlantis', 'Kathmandu<script>', 'Nawalparasi', 'Rukum']) {
    const feedback = deliveryDistrictFeedback(value);
    assert.equal(feedback.district, null);
    assert.equal(feedback.status, value.trim() ? 'invalid' : 'empty');
    assert.equal(getDeliveryEstimate(value, [2]), null);
  }
  assert.match(deliveryDistrictFeedback('Nawalparasi').message, /Choose East or West/);
  assert.match(deliveryDistrictFeedback('RUKUM').message, /Choose East or West/);
  assert.match(deliveryDistrictFeedback('Atlantis').message, /No delivery charge is available/);
});

void test('district matching retains approved spelling aliases and normalizes case/space without guessing', () => {
  for (const [input, canonical] of [
    ['  kAtHmAnDu  ', 'Kathmandu'], ['DHANUSA', 'Dhanusha'],
    ['nawalpur', 'Nawalparasi East'], ['Western Rukum', 'Rukum West'],
  ] as const) {
    assert.deepEqual(deliveryDistrictFeedback(input), { status: 'valid', district: canonical, message: `Estimate for ${canonical}.` });
    assert.deepEqual(getDeliveryEstimate(input, [2]), getDeliveryEstimate(canonical, [2]));
  }
  assert.equal(deliveryDistrictFeedback('Katmandu').status, 'invalid');
});

void test('normalized district overrides retain base plus half per extra store and preparation arithmetic', () => {
  const rates = { ...DEFAULT_DELIVERY_RATES, districts: { Kathmandu: 19001 } };
  for (const [storeCount, chargePaisa] of [[1, 19001], [2, 28502], [3, 38002]] as const) {
    const quote = getDeliveryEstimate('  KATHMANDU  ', [1, 4, 0], rates, storeCount)!;
    assert.equal(quote.chargePaisa, chargePaisa);
    assert.equal(quote.baseChargePaisa, 19001);
    assert.equal(quote.storeCount, storeCount);
    assert.equal(quote.preparationDays, 4);
    assert.equal(quote.estimatedMinDays, 5);
    assert.equal(quote.estimatedMaxDays, 7);
  }
});

void test('delivery summaries distinguish an estimate from an accepted address without promising check timing', () => {
  assert.match(DELIVERY_ESTIMATE_NOTICE, /does not confirm delivery availability/);
  assert.match(DELIVERY_ESTIMATE_NOTICE, /address accepted for your order/);
  assert.doesNotMatch(DELIVERY_ESTIMATE_NOTICE, /confirmed during order processing|guaranteed/i);
  const help = publicPages.about.sections.flatMap((section) => section.paragraphs).join('\n');
  const shipping = publicPages.shipping.sections.flatMap((section) => section.paragraphs).join('\n');
  assert.match(help, /estimate does not confirm delivery availability/);
  assert.match(help, /full delivery charge and order total before you confirm/);
  assert.match(shipping, /addresses accepted for your order/);
  assert.match(shipping, /each additional store adds 50% of the base/);
});
