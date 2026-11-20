import assert from 'node:assert/strict';
import test from 'node:test';
import type { VariantOrderPricingSnapshot } from '../lib/checkout/variant-order-pricing';
import { addOfferCartLine } from '../lib/cart/offer-cart';
import { createCodOrder } from '../lib/db/repositories/orders';
import { getPublicOfferSet } from '../lib/products/public-offers';
import { seedVerifiedCheckoutContact } from './helpers/checkout-contact';
import { publishedOfferFixture } from './helpers/public-offer-fixture';

void test('pricing snapshots bind the retained order and offer and cannot be replaced', async () => {
  const fixture = await publishedOfferFixture();
  try {
    const { db, sqlite, productId } = fixture;
    assert.ok(sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='order_item_pricing_snapshots'").get(),
      'The real migrations must create the pricing snapshot table');
    const { prepareOrderItemPricingSnapshot, readOrderItemPricingSnapshots } =
      await import('../lib/db/repositories/order-item-pricing-snapshots');
    const now = Date.now();
    const offers = await getPublicOfferSet(db, productId);
    const offer = offers?.offers.find(row => row.id === 'medium');
    assert.ok(offers?.publicVersionId && offer);
    await seedVerifiedCheckoutContact(db, 'customer', '9811111111', fixture.now);
    await addOfferCartLine(db, 'snapshot-cart', {
      productId,
      offerId: offer.id,
      versionId: offers.versionId,
      publicVersionId: offers.publicVersionId,
      pricePaisa: offer.pricePaisa,
      quantity: 1,
      requestId: 'snapshot-cart-add',
    }, now);
    const order = await createCodOrder(db, 'snapshot-cart', 'snapshot-receipt', {
      customerAuthSubject: 'customer',
      customerEmail: 'customer@local.hastabazaar.test',
      customerPhone: '9811111111',
      locale: 'en-NP',
      termsAccepted: true,
      idempotencyKey: 'variant-pricing-schema',
      address: {
        recipientName: 'Fictional buyer', phone: '9811111111', province: 'Bagmati',
        district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional locality',
      },
    }, now, 'customer');
    const item = sqlite.prepare(`SELECT order_items.* FROM order_items
      JOIN orders ON orders.id=order_items.order_id WHERE orders.order_number=?`).get(order.orderNumber);
    assert.ok(item);
    assert.equal(item.unit_price_paisa, 80000);
    assert.equal(item.return_eligible_snapshot, 1);
    const orderId = String(item.order_id);
    const orderItemId = String(item.id);
    const createdAt = Number(item.created_at);
    const snapshot: VariantOrderPricingSnapshot = {
      offerId: offer.id, offerVersionId: offers.versionId, publicVersionId: offers.publicVersionId,
      ruleVersion: 'variant-price-addition-v1',
      sellerBasePaisa: 80000, returnEligible: true, additionPaisa: 8000, customerUnitPaisa: 88000,
      quantity: 1,
      discounts: {
        sellerFundedPaisa: 0, platformPromoPaisa: 0, platformReferralPaisa: 0,
        promoCampaignId: null, promoVersion: null,
      },
      taxPaisa: 0, customerSubtotalPaisa: 88000, customerTotalPaisa: 88000,
      creditAppliedPaisa: 0, cashPayablePaisa: 88000,
      commission: {
        kind: 'registered', ruleVersion: String(item.commission_rule_version), settingVersionId: null,
        agreementVersion: String(item.seller_agreement_version), acceptanceId: null,
        bps: Number(item.commission_bps), basePaisa: Number(item.commission_base_paisa),
        amountPaisa: Number(item.commission_paisa),
      },
    };

    assert.deepEqual(await readOrderItemPricingSnapshots(db, orderId), []);
    const insert = sqlite.prepare(`INSERT INTO order_item_pricing_snapshots
      (order_item_id, order_id, snapshot_json, created_at) VALUES (?, ?, ?, ?)`);
    assert.throws(() => insert.run(orderItemId, orderId, JSON.stringify(snapshot), createdAt), /order_item_pricing_immutable/);
    assert.deepEqual(await readOrderItemPricingSnapshots(db, orderId), []);

    // Simulate the initial checkout batch before consent is written, using only this fixture.
    assert.equal(sqlite.prepare('DELETE FROM order_policy_acceptances WHERE order_id=?').run(orderId).changes, 1);
    assert.throws(() => insert.run(orderItemId, 'legacy-order', JSON.stringify(snapshot), createdAt), /order_item_pricing_mismatch/);
    assert.throws(() => insert.run(orderItemId, orderId, JSON.stringify({ ...snapshot, offerVersionId: 'other-version' }), createdAt), /order_item_pricing_mismatch/);
    assert.throws(() => insert.run(orderItemId, orderId, JSON.stringify({
      ...snapshot, commission: { ...snapshot.commission, amountPaisa: snapshot.commission.amountPaisa - 1 },
    }), createdAt), /order_item_pricing_mismatch/);
    assert.throws(() => insert.run(orderItemId, orderId, JSON.stringify({ ...snapshot, cashPayablePaisa: 1 }), createdAt), /order_item_pricing_mismatch/);
    const wrongAddition = {
      ...snapshot, additionPaisa: 4000, customerUnitPaisa: 84000,
      customerSubtotalPaisa: 84000, customerTotalPaisa: 84000, cashPayablePaisa: 84000,
    };
    assert.throws(() => insert.run(orderItemId, orderId, JSON.stringify(wrongAddition), createdAt), /order_item_pricing_mismatch/);

    await db.batch([prepareOrderItemPricingSnapshot(db, { orderItemId, orderId, snapshot, createdAt })]);
    assert.deepEqual(await readOrderItemPricingSnapshots(db, orderId), [{ orderItemId, snapshot }]);
    assert.deepEqual(await readOrderItemPricingSnapshots(db, 'legacy-order'), []);
    assert.throws(() => sqlite.prepare('UPDATE order_item_pricing_snapshots SET snapshot_json=? WHERE order_item_id=?')
      .run('{}', orderItemId), /order_item_pricing_immutable/);
    assert.throws(() => sqlite.prepare('DELETE FROM order_item_pricing_snapshots WHERE order_item_id=?')
      .run(orderItemId), /order_item_pricing_immutable/);
    assert.throws(() => sqlite.prepare(`INSERT OR REPLACE INTO order_item_pricing_snapshots
      (order_item_id, order_id, snapshot_json, created_at) VALUES (?, ?, ?, ?)`)
      .run(orderItemId, orderId, JSON.stringify(snapshot), createdAt), /order_item_pricing_immutable/);
    assert.deepEqual(await readOrderItemPricingSnapshots(db, orderId), [{ orderItemId, snapshot }]);
  } finally {
    fixture.dispose();
  }
});
