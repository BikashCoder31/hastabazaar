import assert from 'node:assert/strict';
import test from 'node:test';
import { VARIANT_PRICING_RULE_VERSION } from '../lib/products/variant-pricing';
import { recordedReturnCourierExpenses } from '../lib/returns/courier-expenses';
import { securityDatabase } from './helpers/security-database';

void test('conflicting saved price markers leave linked courier invoices visible for reconciliation', async () => {
  const { db, sqlite, dispose } = securityDatabase();
  try {
    sqlite.exec(`CREATE TABLE return_requests(id, order_item_id, return_shipment_reference);
      CREATE TABLE order_items(id, order_id, seller_id);
      CREATE TABLE order_policy_acceptances(order_id, terms_snapshot_json);
      CREATE TABLE shipping_jobs(id, order_id, seller_id, direction, tracking_code, claim_reference);
      CREATE TABLE parcel_courier_costs(id, shipping_job_id, amount_paisa, evidence_reference, created_at);
      INSERT INTO return_requests VALUES ('case', 'item', 'matched-tracking');
      INSERT INTO order_items VALUES ('item', 'order', 'seller');
      INSERT INTO order_policy_acceptances VALUES ('order', '{}');
      INSERT INTO shipping_jobs VALUES
        ('outbound', 'order', 'seller', 'outbound', NULL, NULL),
        ('matched-return', 'order', 'seller', 'return', 'matched-tracking', 'carrier-claim'),
        ('another-return', 'order', 'seller', 'return', 'another-tracking', NULL),
        ('another-seller', 'order', 'another-seller', 'outbound', NULL, NULL);
      INSERT INTO parcel_courier_costs VALUES
        ('first-invoice', 'outbound', 12000, 'outbound-invoice', 1),
        ('second-invoice', 'matched-return', 9000, 'reverse-invoice', 2),
        ('unrelated-return-invoice', 'another-return', 99000, 'unrelated-return', 3),
        ('unrelated-seller-invoice', 'another-seller', 99000, 'unrelated-seller', 4);`);
    const save = sqlite.prepare('UPDATE order_policy_acceptances SET terms_snapshot_json = ?');
    const read = () => recordedReturnCourierExpenses(db, 'case');

    for (const terms of [
      `{"variantPricingRuleVersion":"${VARIANT_PRICING_RULE_VERSION}","variantPricingRuleVersion":null}`,
      `{"variantPricingRuleVersion":null,"variantPricingRuleVersion":"${VARIANT_PRICING_RULE_VERSION}"}`,
    ]) {
      save.run(terms);
      assert.deepEqual(await read(), {
        needsPricingReconciliation: true,
        expenses: [
          { id: 'first-invoice', direction: 'outbound', amountPaisa: 12_000, evidenceReference: 'outbound-invoice', claimReference: null },
          { id: 'second-invoice', direction: 'return', amountPaisa: 9_000, evidenceReference: 'reverse-invoice', claimReference: 'carrier-claim' },
        ],
      });
    }

    save.run(JSON.stringify({ variantPricingRuleVersion: VARIANT_PRICING_RULE_VERSION }));
    const confirmed = await read();
    assert.equal(confirmed.needsPricingReconciliation, false);
    assert.deepEqual(confirmed.expenses.map(expense => expense.amountPaisa), [12_000, 9_000]);

    save.run('{"termsVersion":"legacy"}');
    assert.deepEqual(await read(), { expenses: [], needsPricingReconciliation: false });
  } finally {
    dispose();
  }
});
