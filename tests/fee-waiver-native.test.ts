import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customerFeeNativeFixture, seedNativeLegacyHistory } from './helpers/customer-fee-native-fixture';
import { AT, terms, feeWaiverContext as ctx } from './helpers/customer-fee-waiver-fixture';
import { readOrderMarketplaceFees } from '../lib/db/repositories/fee-waivers';
import { readOrderCustomerServiceFees } from '../lib/db/repositories/customer-service-fees';
import { mutateCustomerFeeWaiver } from '../lib/db/repositories/customer-fee-waivers';
import { createCodOrder } from '../lib/db/repositories/orders';

const enabled = process.env.HATSKALA_STAGING_NATIVE === '1';
// Four retained history scenarios + parent = 5. New mutations belong to the customer suite.
void test('native retained legacy seller fee history remains separate from corrected customer fees', { skip: !enabled }, async t => {
  const f = await customerFeeNativeFixture(), { db, monitor } = f;
  t.mock.method(Date, 'now', () => AT);
  try {
    const historical = await seedNativeLegacyHistory(db);
    const tables = ['marketplace_fee_waiver_control', 'marketplace_fee_waiver_campaigns', 'marketplace_fee_waiver_revisions', 'marketplace_fee_waiver_requests', 'order_item_marketplace_fees'];
    const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table, (await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results])));
    const before = await snapshot();
    await t.test('legacy readers retain original fully waived nine percent history and recorded customer charge', async () => {
      const fee = (await readOrderMarketplaceFees(db, [historical.itemId])).get(historical.itemId)!;
      assert.deepEqual([fee.standardBps, fee.standardPaisa, fee.waivedPaisa, fee.netPaisa], [900, 900, 900, 0]);
      const customer = (await readOrderCustomerServiceFees(db, [historical.orderId])).get(historical.orderId)!;
      assert.deepEqual([customer.source, customer.standardPaisa, customer.waivedPaisa, customer.netPaisa, customer.campaign], ['legacy_recorded', 1000, 0, 1000, null]);
    });
    await t.test('native retained revisions, receipts, identities and line evidence reject update, delete and replacement', async () => {
      for (const sql of ["UPDATE marketplace_fee_waiver_revisions SET name='changed'", 'DELETE FROM marketplace_fee_waiver_revisions', "UPDATE marketplace_fee_waiver_requests SET response_json='{}'", 'DELETE FROM marketplace_fee_waiver_requests', 'DELETE FROM marketplace_fee_waiver_campaigns', "UPDATE marketplace_fee_waiver_campaigns SET id=CONCAT(id,'x')", 'UPDATE order_item_marketplace_fees SET net_paisa=0', 'DELETE FROM order_item_marketplace_fees', 'REPLACE INTO order_item_marketplace_fees SELECT * FROM order_item_marketplace_fees', "INSERT INTO marketplace_fee_waiver_control VALUES('other',0)"]) await assert.rejects(monitor.query(sql), sql);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('customer publication never converts or replays historical seller campaign receipts', async () => {
      await assert.rejects(mutateCustomerFeeWaiver(db, ctx('native-retained-publish', 0, { now: AT }), { type: 'publish', campaignId: historical.campaign.id }));
      const draft = await mutateCustomerFeeWaiver(db, ctx('native-customer-create', 0, { now: AT }), { type: 'create', terms });
      await mutateCustomerFeeWaiver(db, ctx('native-customer-publish', 1, { now: AT }), { type: 'publish', campaignId: draft.id });
      assert.notEqual(draft.id, historical.campaign.id);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('corrected native checkout keeps twelve percent commission and creates only one customer evidence row', async () => {
      await db.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES('legacy-new-cart','legacy-new-token','NPR',1,1)").run();
      await db.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('legacy-new-line','legacy-new-cart','product',1,1,1)").run();
      const placed = await createCodOrder(db, 'legacy-new-token', 'legacy-new-receipt', { ...f.input, idempotencyKey: 'legacy-new-checkout' }, AT, 'checkout-buyer');
      const row = await db.prepare('SELECT i.commission_bps,i.commission_paisa,f.standard_paisa,f.waived_paisa,f.net_paisa FROM orders o JOIN order_items i ON i.order_id=o.id JOIN order_customer_service_fees f ON f.order_id=o.id WHERE o.order_number=?').bind(placed.orderNumber).first<{ commission_bps: number; commission_paisa: number; standard_paisa: number; waived_paisa: number; net_paisa: number }>();
      assert.deepEqual([row!.commission_bps, row!.commission_paisa, row!.standard_paisa, row!.waived_paisa, row!.net_paisa], [1200, 12000, 1000, 1000, 0]);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM order_customer_service_fees WHERE order_id=?').bind(historical.orderId).first<{ n: number }>())?.n, 0);
    });
  } finally { await f.close(); }
});
