import assert from 'node:assert/strict';
import test from 'node:test';
import { VARIANT_PRICING_CAPABILITY, variantPricingEnabled } from '../lib/products/variant-pricing';
import { env } from '../lib/runtime/node-bindings';

void test('the real Node database keeps variant pricing off for missing and non-exact values', async (t) => {
  t.mock.method(env.DB, 'prepare', () => assert.fail('Pricing is Off and should not inspect the schema'));
  const original = process.env.HASTABAZAAR_VARIANT_PRICING;
  t.after(() => {
    if (original === undefined) delete process.env.HASTABAZAAR_VARIANT_PRICING;
    else process.env.HASTABAZAAR_VARIANT_PRICING = original;
  });
  delete process.env.HASTABAZAAR_VARIANT_PRICING;
  assert.equal(await variantPricingEnabled(env.DB), false);
  for (const value of ['', 'off', 'ON', 'On', ' on', 'on ', 'true', '1']) {
    process.env.HASTABAZAAR_VARIANT_PRICING = value;
    assert.equal(await variantPricingEnabled(env.DB), false, JSON.stringify(value));
  }
});

void test('exact On with the standard manifest fails closed on the real Node database binding', async (t) => {
  t.mock.method(env.DB, 'prepare', () => assert.fail('The standard manifest has no pricing schema to inspect'));
  const original = process.env.HASTABAZAAR_VARIANT_PRICING;
  t.after(() => {
    if (original === undefined) delete process.env.HASTABAZAAR_VARIANT_PRICING;
    else process.env.HASTABAZAAR_VARIANT_PRICING = original;
  });
  process.env.HASTABAZAAR_VARIANT_PRICING = 'on';
  await assert.rejects(async () => variantPricingEnabled(env.DB), /Variant pricing is temporarily unavailable/);
});

void test('the isolated D1 capability still requires an explicit boolean true', async () => {
  for (const value of [undefined, false, 'on', 1, true]) {
    const db = { [VARIANT_PRICING_CAPABILITY]: value } as unknown as D1Database;
    assert.equal(await variantPricingEnabled(db), value === true);
  }
});
