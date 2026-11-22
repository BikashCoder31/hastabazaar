import assert from 'node:assert/strict';
import test from 'node:test';
import { readOriginalBuyerLinePricing } from '../lib/db/repositories/order-item-pricing-snapshots';
import { getOrderReceipt } from '../lib/db/repositories/orders';
import { VARIANT_PRICING_RULE_VERSION } from '../lib/products/variant-pricing';
import { orderedLiveMakerFixture } from './helpers/ordered-live-maker-fixture';

void test('conflicting native and parsed pricing markers require buyer price reconciliation', async (t) => {
  const f = await orderedLiveMakerFixture({ variantPricing: true });
  try {
    const receipt = () => getOrderReceipt(f.db, f.order.orderNumber, null, f.buyerId);
    assert.equal((await receipt())?.items[0].unitPricePaisa, 88_000);
    const acceptance = f.sqlite.prepare('SELECT terms_snapshot_json AS terms FROM order_policy_acceptances WHERE order_id=?');
    const original = acceptance.get(f.orderId)?.terms;
    assert.ok(typeof original === 'string' && original.startsWith('{') && original.endsWith('}'));

    // Recreate stored evidence from before the acceptance update guard in this in-memory fixture.
    f.sqlite.exec('DROP TRIGGER priced_order_acceptance_update;');
    const replace = f.sqlite.prepare('UPDATE order_policy_acceptances SET terms_snapshot_json=? WHERE order_id=?');
    const native = f.sqlite.prepare(`SELECT json_extract(terms_snapshot_json,'$.variantPricingRuleVersion') AS version
      FROM order_policy_acceptances WHERE order_id=?`);
    for (const [name, terms, first, last] of [
      ['native marks the purchase', `${original.slice(0, -1)},"variantPricingRuleVersion":null}`, VARIANT_PRICING_RULE_VERSION, null],
      ['application marks the purchase', `{"variantPricingRuleVersion":null,${original.slice(1)}`, null, VARIANT_PRICING_RULE_VERSION],
    ] as const) {
      await t.test(name, async (caseTest) => {
        replace.run(terms, f.orderId);
        assert.equal(native.get(f.orderId)?.version, first);
        assert.equal(JSON.parse(terms).variantPricingRuleVersion, last);
        const reconciliation = /Reconcile the original saved buyer prices/;
        await caseTest.test('original buyer pricing', async () => {
          await assert.rejects(readOriginalBuyerLinePricing(f.db, f.orderId), reconciliation);
        });
        await caseTest.test('buyer receipt', async () => {
          await assert.rejects(receipt(), reconciliation);
        });
      });
    }
  } finally {
    f.dispose();
  }
});

void test('a default-off order remains readable without pricing snapshot storage', async () => {
  const f = await orderedLiveMakerFixture();
  try {
    f.sqlite.exec(`DROP TRIGGER priced_order_acceptance_insert;
      DROP TRIGGER priced_order_acceptance_update;
      DROP TRIGGER priced_order_acceptance_delete;
      DROP TRIGGER priced_order_acceptance_snapshot_insert;
      DROP TABLE order_item_pricing_snapshots;`);
    assert.equal(await readOriginalBuyerLinePricing(f.db, f.orderId), null);
    const receipt = await getOrderReceipt(f.db, f.order.orderNumber, null, f.buyerId);
    assert.equal(receipt?.items[0].unitPricePaisa, 80_000);
  } finally {
    f.dispose();
  }
});
