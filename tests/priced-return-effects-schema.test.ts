import assert from 'node:assert/strict';
import test from 'node:test';
import { updateOfferCartLine } from '../lib/cart/offer-cart';
import { parseCheckoutInput } from '../lib/checkout/validation';
import { getCart } from '../lib/db/repositories/cart';
import { readOrderItemPricingSnapshots } from '../lib/db/repositories/order-item-pricing-snapshots';
import { createCodOrder } from '../lib/db/repositories/orders';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { VARIANT_PRICING_CAPABILITY, VARIANT_PRICING_RULE_VERSION } from '../lib/products/variant-pricing';
import { SELLER_SHIPMENT_DELIVERY_CAPABILITY, SELLER_SHIPMENT_DELIVERY_POLICY } from '../lib/returns/seller-shipment-delivery';
import { publicCheckoutFixture } from './helpers/public-checkout-fixture';

void test('priced return authority separates the seller principal, requires original delivery evidence, and preserves native costs', async () => {
  const fixture = await publicCheckoutFixture();
  try {
    const { db, sqlite, body, cartHash } = fixture;
    assert.ok(sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='refund_variant_pricing_effects'").get(),
      'The installed migrations must include priced return authority');
    const deliveryPaisa = body.reviewedQuote.deliveryPaisa;
    assert.equal(deliveryPaisa, 15000);
    Object.assign(db, {
      [VARIANT_PRICING_CAPABILITY]: true,
      [SELLER_SHIPMENT_DELIVERY_CAPABILITY]: () => ({
        source: 'fictional-original-shipment',
        sellerCharges: [{ sellerId: 'registered', amountPaisa: deliveryPaisa }],
      }),
    });
    const [stale] = (await getCart(db, cartHash)).items;
    assert.ok(stale.currentChoice?.orderable && typeof stale.revision === 'number');
    const { versionId, publicVersionId, pricePaisa } = stale.currentChoice;
    await updateOfferCartLine(db, cartHash, {
      itemId: stale.id, quantity: 2, revision: stale.revision, requestId: 'authority-cart-refresh',
      refresh: { versionId, publicVersionId, pricePaisa },
    }, Date.now());
    const cart = await getCart(db, cartHash);
    const [line] = cart.items;
    assert.equal(cart.hasUnavailableItems, false);
    assert.equal(cart.itemSubtotalPaisa, 176000);
    const parsed = parseCheckoutInput({
      ...body,
      reviewedQuote: {
        ...body.reviewedQuote,
        payablePaisa: cart.itemSubtotalPaisa + deliveryPaisa + fixture.serviceFee.chargedPaisa,
        lines: [{
          id: line.id, sellerId: line.sellerId, pricePaisa: line.pricePaisa, quantity: line.quantity,
          offerId: line.offerId, offerVersionId: line.offerVersionId, publicVersionId: line.publicVersionId,
          revision: line.revision, pricingRuleVersion: line.selectedOffer?.pricingRuleVersion,
        }],
      },
    });
    assert.ok(parsed.value, parsed.errors.join('\n'));
    const form = await validateSellerFormSubmission(
      db, 'commerce.checkout', body.formVersion, body.customAnswers, parsed.value.idempotencyKey,
    );
    const now = Date.now();
    const order = await createCodOrder(db, cartHash, 'authority-receipt', {
      ...parsed.value, customerAuthSubject: 'customer',
    }, now, 'customer', { versionId: form.versionId, answers: form.answers });
    const item = sqlite.prepare(`SELECT i.id,i.order_id,o.return_policy_snapshot_json AS policy,
      json_extract(o.delivery_rate_snapshot_json,'$.unitAllocationPolicy') AS deliveryPolicy
      FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.order_number=?`).get(order.orderNumber);
    assert.ok(item && typeof item.order_id === 'string' && typeof item.id === 'string');
    const { order_id: orderId, id: orderItemId } = item;
    const [saved] = await readOrderItemPricingSnapshots(db, orderId);
    assert.ok(saved);
    assert.equal(saved.orderItemId, orderItemId);
    assert.equal(saved.snapshot.ruleVersion, VARIANT_PRICING_RULE_VERSION);
    assert.equal(saved.snapshot.sellerBasePaisa, 80000);
    assert.equal(saved.snapshot.additionPaisa, 8000);
    assert.equal(saved.snapshot.quantity, 2);
    assert.equal(item.deliveryPolicy, SELLER_SHIPMENT_DELIVERY_POLICY);
    const units = sqlite.prepare(`SELECT amount_paisa FROM order_delivery_unit_allocations
      WHERE order_item_id=? ORDER BY unit_ordinal`).all(orderItemId);
    assert.deepEqual(units.map(unit => unit.amount_paisa), [7500, 7500]);
    const claim = sqlite.prepare(`INSERT INTO order_delivery_unit_claims
      (order_item_id,unit_ordinal,refund_id,cancellation_event_id,created_at) VALUES (?,?,?,NULL,?)`);

    const caseInsert = sqlite.prepare(`INSERT INTO return_requests
      (id,order_item_id,reason,detail,status,responsibility,quantity,requested_at,reviewed_by,policy_snapshot_json)
      VALUES (?,?,?,'Fictional review evidence','pending_high_value_approval',?,1,?,'reviewer',?)`);
    const refundInsert = sqlite.prepare(`INSERT INTO refunds
      (id,order_id,return_request_id,status,amount_paisa,item_amount_paisa,delivery_amount_paisa,commission_base_refunded_paisa,
       liability,reason,approved_by,requested_at)
      VALUES (?,?,?,'pending_high_value_approval',?,?,?,?,?,'Fictional approval','reviewer',?)`);
    const effect = sqlite.prepare(`INSERT INTO refund_variant_pricing_effects
      (refund_id,order_item_id,policy_version,quantity,unit_ordinals_json,gross_item_paisa,seller_principal_paisa,
       platform_addition_paisa,tax_paisa,unallocated_merchandise_paisa,saved_delivery_share_paisa,retained_outbound_paisa,
       voluntary_policy_version,decision_evidence_reference,correct_seller_fulfillment,approved_by,created_at)
      VALUES (?,?,'saved_variant_return_v1',1,?,88000,?,?,0,?,7500,?,?,'FICTIONAL-CASE-DECISION',?,'reviewer',?)`);
    const cost = sqlite.prepare(`INSERT INTO refund_cost_allocations
      (refund_id,component,party,seller_id,amount_paisa,policy_version,created_by,created_at)
      VALUES (?,?,?,?,?,'approved_original_refund_costs_v1','reviewer',?)`);

    // The legacy cost rule remains usable when no authority sidecar is present.
    caseInsert.run('historical-case', orderItemId, 'damaged', 'seller', now, item.policy);
    refundInsert.run('historical-refund', orderId, 'historical-case', 80000, 80000, 0, 80000, 'seller', now);
    assert.throws(() => cost.run('historical-refund', 'merchandise', 'seller', 'registered', 79999, now), /refund_cost_requires_original_authorization/);
    cost.run('historical-refund', 'merchandise', 'seller', 'registered', 80000, now);
    sqlite.prepare("UPDATE refunds SET status='rejected' WHERE id='historical-refund'").run();

    caseInsert.run('seller-case', orderItemId, 'damaged', 'seller', now, item.policy);
    refundInsert.run('seller-refund', orderId, 'seller-case', 95500, 88000, 7500, 80000, 'seller', now);
    assert.throws(() => effect.run('seller-refund', orderItemId, '[1]', 80000, 8000, 8000, 0, null, 0, now), /priced_return_effect_original_mismatch/);
    claim.run(orderItemId, 1, 'seller-refund', now);
    assert.throws(() => effect.run('seller-refund', orderItemId, '[3]', 80000, 8000, 8000, 0, null, 0, now), /priced_return_effect_original_mismatch/);
    assert.throws(() => effect.run('seller-refund', orderItemId, '[1]', 80000, 8001, 8000, 0, null, 0, now), /priced_return_effect_original_mismatch/);
    effect.run('seller-refund', orderItemId, '[1]', 80000, 8000, 8000, 0, null, 0, now);
    assert.throws(() => cost.run('seller-refund', 'merchandise', 'seller', 'registered', 88000, now), /refund_cost_requires_original_authorization/);
    assert.throws(() => cost.run('seller-refund', 'original_delivery', 'seller', 'registered', 7500, now), /refund_cost_requires_original_authorization/);
    cost.run('seller-refund', 'merchandise', 'seller', 'registered', 80000, now);
    cost.run('seller-refund', 'original_delivery', 'platform', null, 7500, now);
    assert.throws(() => sqlite.exec("UPDATE refunds SET delivery_amount_paisa=0 WHERE id='seller-refund'"), /priced_return_effect_original_retained/);
    assert.throws(() => sqlite.exec("UPDATE refund_variant_pricing_effects SET tax_paisa=1 WHERE refund_id='seller-refund'"), /priced_return_effect_history_retained/);
    assert.throws(() => sqlite.exec("DELETE FROM refund_variant_pricing_effects WHERE refund_id='seller-refund'"), /priced_return_effect_history_retained/);
    assert.throws(() => sqlite.exec(`INSERT OR REPLACE INTO refund_variant_pricing_effects SELECT *
      FROM refund_variant_pricing_effects WHERE refund_id='seller-refund'`), /priced_return_effect_history_retained/);
    assert.throws(() => sqlite.exec("INSERT OR REPLACE INTO refunds SELECT * FROM refunds WHERE id='seller-refund'"), /FOREIGN KEY/);

    caseInsert.run('voluntary-case', orderItemId, 'change_of_mind', 'platform', now, item.policy);
    refundInsert.run('voluntary-refund', orderId, 'voluntary-case', 88000, 88000, 0, 0, 'platform', now);
    claim.run(orderItemId, 2, 'voluntary-refund', now);
    const policyVersion = 'disclosed_voluntary_delivery_v1';
    assert.throws(() => effect.run('voluntary-refund', orderItemId, '[2]', 0, 8000, 0, 7500, policyVersion, 1, now), /priced_return_effect_original_mismatch/);
    const disclosure = {
      version: policyVersion, legalAuthorityReference: 'FICTIONAL-ORDER-TIME-APPROVAL',
      disclosureVersion: 'fictional-original-v1', disclosedAtCheckout: true, outboundRefundPromised: false, reversePaidByBuyer: true,
    };
    const policy = JSON.stringify({ ...JSON.parse(String(item.policy)), voluntaryDelivery: disclosure });
    sqlite.prepare('UPDATE orders SET return_policy_snapshot_json=? WHERE id=?').run(policy, orderId);
    assert.throws(() => effect.run('voluntary-refund', orderItemId, '[2]', 0, 8000, 0, 7500, policyVersion, 1, now), /priced_return_effect_original_mismatch/);
    sqlite.prepare("UPDATE refunds SET status='rejected' WHERE id='voluntary-refund'").run();
    sqlite.prepare("DELETE FROM order_delivery_unit_claims WHERE refund_id='voluntary-refund'").run();
    caseInsert.run('disclosed-case', orderItemId, 'change_of_mind', 'platform', now, policy);
    refundInsert.run('disclosed-refund', orderId, 'disclosed-case', 88000, 88000, 0, 0, 'platform', now);
    claim.run(orderItemId, 2, 'disclosed-refund', now);
    assert.throws(() => effect.run('disclosed-refund', orderItemId, '[1]', 0, 8000, 0, 7500, policyVersion, 1, now), /priced_return_effect_original_mismatch/);
    assert.throws(() => effect.run('disclosed-refund', orderItemId, '[2]', 0, 8000, 0, 7500, policyVersion, 0, now), /priced_return_effect_original_mismatch/);
    effect.run('disclosed-refund', orderItemId, '[2]', 0, 8000, 0, 7500, policyVersion, 1, now);
    cost.run('disclosed-refund', 'merchandise', 'platform', null, 88000, now);
  } finally {
    fixture.dispose();
  }
});
