import assert from 'node:assert/strict';
import test from 'node:test';
import { refundSourceGuards } from '../lib/payments/refund-execution';
import { getRefundObligation, openRefundObligation, RefundObligationError } from '../lib/payments/refund-obligations';
import { refundFundingFixture } from './helpers/refund-funding-fixture';

void test('a saved variant refund requires its exact pricing effect through the packet transaction', async () => {
  const f = await refundFundingFixture(0, { responsibility: 'seller' });
  try {
    const { id } = await openRefundObligation(f.db, f.ctx('variant-source-probe'), {
      kind: 'return_refund', sourceId: f.refundId,
      reason: 'Use the original completed fictional order payment and refund approval.',
    });
    const obligation = await getRefundObligation(f.db, id);
    assert.ok(obligation);
    await f.db.batch(await refundSourceGuards(f.db, obligation));

    const original = f.sqlite.prepare(`SELECT c.order_item_id, r.item_amount_paisa,
      r.commission_base_refunded_paisa, r.delivery_amount_paisa
      FROM refunds r JOIN return_requests c ON c.id=r.return_request_id WHERE r.id=?`).get(f.refundId);
    assert.ok(original);
    const variantPricingEffect = {
      policyVersion: 'saved_variant_return_v1',
      orderItemId: String(original.order_item_id),
      grossItemPaisa: Number(original.item_amount_paisa),
      sellerPrincipalPaisa: Number(original.commission_base_refunded_paisa),
      unallocatedMerchandisePaisa: 0,
      savedDeliverySharePaisa: Number(original.delivery_amount_paisa),
      retainedOutboundPaisa: 0,
    };
    const marked = {
      ...obligation,
      sourceSnapshotJson: JSON.stringify({ ...JSON.parse(obligation.sourceSnapshotJson), variantPricingEffect }),
    };

    // This private fixture can model a missing or changed authority after prepare.
    f.sqlite.exec(`CREATE TEMP TABLE refund_variant_pricing_effects (
      refund_id TEXT PRIMARY KEY, order_item_id TEXT, policy_version TEXT, gross_item_paisa INTEGER,
      seller_principal_paisa INTEGER, unallocated_merchandise_paisa INTEGER,
      saved_delivery_share_paisa INTEGER, retained_outbound_paisa INTEGER
    )`);
    await assert.rejects(refundSourceGuards(f.db, marked), RefundObligationError);
    f.sqlite.prepare('INSERT INTO temp.refund_variant_pricing_effects VALUES (?,?,?,?,?,?,?,?)').run(
      f.refundId, variantPricingEffect.orderItemId, variantPricingEffect.policyVersion,
      variantPricingEffect.grossItemPaisa, variantPricingEffect.sellerPrincipalPaisa,
      variantPricingEffect.unallocatedMerchandisePaisa, variantPricingEffect.savedDeliverySharePaisa,
      variantPricingEffect.retainedOutboundPaisa,
    );
    const prepared = await refundSourceGuards(f.db, marked);
    await f.db.batch(prepared);

    f.sqlite.prepare('UPDATE temp.refund_variant_pricing_effects SET order_item_id=? WHERE refund_id=?')
      .run('foreign-order-item', f.refundId);
    await assert.rejects(f.db.batch(prepared), /operation_transaction_guards|constraint/i);
  } finally {
    f.dispose();
  }
});
