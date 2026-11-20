import assert from 'node:assert/strict';
import test from 'node:test';
import { updateOfferCartLine } from '../lib/cart/offer-cart';
import { parseCheckoutInput } from '../lib/checkout/validation';
import { addCartItem, getCart } from '../lib/db/repositories/cart';
import { createManualBankOrder } from '../lib/db/repositories/orders';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { expireManualPaymentOrder } from '../lib/payments/manual-payment-lifecycle';
import { VARIANT_PRICING_CAPABILITY } from '../lib/products/variant-pricing';
import { SELLER_SHIPMENT_DELIVERY_CAPABILITY } from '../lib/returns/seller-shipment-delivery';
import { readyCheckoutSeller } from './helpers/checkout-contact';
import { publicCheckoutFixture } from './helpers/public-checkout-fixture';

type Fixture = Awaited<ReturnType<typeof publicCheckoutFixture>>;

async function placeShipmentOrder(f: Fixture) {
  Object.assign(f.db, {
    [VARIANT_PRICING_CAPABILITY]: true,
    [SELLER_SHIPMENT_DELIVERY_CAPABILITY]: () => ({
      source: 'isolated-manual-expiry-quote',
      sellerCharges: [
        { sellerId: 'registered', amountPaisa: 10_000 },
        { sellerId: 'secondary', amountPaisa: 12_500 },
      ],
    }),
  });
  const [medium] = (await getCart(f.db, f.cartHash)).items;
  assert.ok(medium.currentChoice?.orderable && typeof medium.revision === 'number');
  await updateOfferCartLine(f.db, f.cartHash, {
    itemId: medium.id,
    quantity: 3,
    revision: medium.revision,
    requestId: 'expiry-priced-medium',
    refresh: {
      versionId: medium.currentChoice.versionId,
      publicVersionId: medium.currentChoice.publicVersionId,
      pricePaisa: medium.currentChoice.pricePaisa,
    },
  }, Date.now());

  f.sqlite.exec(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
    registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,
    province,district,municipality,locality,status,created_at,updated_at)
    SELECT 'secondary','foreign','Secondary Fictional Seller','Secondary Fixture Shop','Fixture',
      'FIX-SECOND','PAN','FIX-SECOND-PAN','Fictional Owner',support_phone,'foreign@local.hastabazaar.test',
      province,district,municipality,locality,'approved',created_at,updated_at
    FROM seller_profiles WHERE id='registered';
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','seller',1);`);
  await readyCheckoutSeller({ database: f.db, sqlite: f.sqlite }, 'secondary', 'foreign', 'reviewer', Date.now());
  f.sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,
    price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
    SELECT 'secondary-cup','secondary',category_id,'fictional-expiry-cup','FIX-EXPIRY-CUP',
      'Secondary fixture cup','A retained legacy product from the other fictional seller',110000,4,
      'Fictional maker','NP','Clay','published',created_at,updated_at FROM products WHERE id=?`).run(f.productId);
  await addCartItem(f.db, f.cartHash, 'secondary-cup', 1, Date.now());

  const cart = await getCart(f.db, f.cartHash);
  const parsed = parseCheckoutInput({ ...f.body, reviewedQuote: {
    ...f.body.reviewedQuote,
    lines: cart.items.map((item) => ({
      id: item.id,
      sellerId: item.sellerId,
      pricePaisa: item.pricePaisa,
      quantity: item.quantity,
      ...(item.offerId && {
        offerId: item.offerId,
        offerVersionId: item.offerVersionId,
        publicVersionId: item.publicVersionId,
        revision: item.revision,
        pricingRuleVersion: item.selectedOffer?.pricingRuleVersion,
      }),
    })),
    deliveryPaisa: 22_500,
    payablePaisa: cart.itemSubtotalPaisa + 22_500 + f.serviceFee.chargedPaisa,
  } });
  assert.ok(parsed.value, parsed.errors.join('\n'));
  const form = await validateSellerFormSubmission(f.db, 'commerce.checkout', f.body.formVersion,
    f.body.customAnswers, parsed.value.idempotencyKey);
  const order = await createManualBankOrder(f.db, f.cartHash, 'shipment-expiry-receipt',
    { ...parsed.value, customerAuthSubject: 'customer' }, Date.now(), 'customer',
    { versionId: form.versionId, answers: form.answers });
  const id = f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)?.id;
  assert.equal(typeof id, 'string');
  return String(id);
}

void test('manual payment expiry retains original buyer amounts and claims each saved delivery unit once after rollback', async () => {
  const f = await publicCheckoutFixture({ bank: true });
  try {
    const orderId = await placeShipmentOrder(f);
    const readSavedOrder = () => ({
      pricing: f.sqlite.prepare(
        'SELECT * FROM order_item_pricing_snapshots WHERE order_id=? ORDER BY order_item_id',
      ).all(orderId),
      shipments: f.sqlite.prepare(
        'SELECT * FROM order_delivery_shipment_allocations WHERE order_id=? ORDER BY shipment_ordinal',
      ).all(orderId),
      units: f.sqlite.prepare(
        'SELECT * FROM order_delivery_unit_allocations WHERE order_id=? ORDER BY order_item_id,unit_ordinal',
      ).all(orderId),
    });
    const savedOrder = readSavedOrder();
    assert.equal(savedOrder.pricing.length, 1);
    assert.equal(savedOrder.shipments.length, 2);
    assert.equal(savedOrder.units.length, 4);
    for (const capability of [VARIANT_PRICING_CAPABILITY, SELLER_SHIPMENT_DELIVERY_CAPABILITY]) {
      assert.ok(Object.hasOwn(f.db, capability));
      assert.ok(Reflect.deleteProperty(f.db, capability));
      assert.equal(Object.hasOwn(f.db, capability), false);
    }
    const deadline = Number(f.sqlite.prepare('SELECT cutoff_at FROM manual_payment_cutoffs WHERE order_id=?').get(orderId)?.cutoff_at);
    assert.ok(Number.isSafeInteger(deadline));
    f.sqlite.function('strftime', { varargs: true }, (format) => {
      if (format === '%s') return String(Math.floor(deadline / 1000));
      if (format === '%f') return (deadline % 60000 / 1000).toFixed(3).padStart(6, '0');
      throw new Error('Unexpected fixture time format ' + String(format));
    });

    f.sqlite.exec(`CREATE TEMP TRIGGER reject_expiry_delivery_claim BEFORE INSERT ON order_delivery_unit_claims
      BEGIN SELECT RAISE(ABORT,'fictional_expiry_claim_conflict'); END`);
    await assert.rejects(expireManualPaymentOrder(f.db, orderId), /fictional_expiry_claim_conflict/);
    assert.equal(f.sqlite.prepare('SELECT status FROM orders WHERE id=?').get(orderId)?.status, 'placed');
    assert.equal(f.sqlite.prepare('SELECT closed_at FROM manual_payment_windows WHERE order_id=?').get(orderId)?.closed_at, null);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM order_cancellation_events WHERE order_id=?').get(orderId)?.count, 0);
    assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()?.reserved, 3);
    f.sqlite.exec('DROP TRIGGER reject_expiry_delivery_claim');

    assert.equal((await expireManualPaymentOrder(f.db, orderId)).state, 'expired');
    assert.equal((await expireManualPaymentOrder(f.db, orderId)).state, 'expired');
    const events = f.sqlite.prepare(`SELECT id,previous_json AS previous,next_json AS next,created_at AS createdAt
      FROM order_cancellation_events WHERE order_id=?`).all(orderId);
    assert.equal(events.length, 1);
    const previous = JSON.parse(String(events[0].previous));
    assert.equal(previous.subtotal, 374_000);
    assert.deepEqual(previous.parcels, [
      { sellerId: 'registered', amount: 274_000 },
      { sellerId: 'secondary', amount: 122_500 },
    ]);
    assert.equal(JSON.parse(String(events[0].next)).total, 0);
    const claims = f.sqlite.prepare(`SELECT allocation.amount_paisa AS amount, claim.created_at AS createdAt
      FROM order_delivery_unit_claims claim JOIN order_delivery_unit_allocations allocation
      ON allocation.order_item_id=claim.order_item_id AND allocation.unit_ordinal=claim.unit_ordinal
      WHERE claim.cancellation_event_id=? ORDER BY amount DESC`).all(events[0].id);
    assert.deepEqual(claims.map((claim) => claim.amount), [12_500, 3334, 3333, 3333]);
    assert.ok(claims.every((claim) => claim.createdAt === events[0].createdAt));
    assert.deepEqual(readSavedOrder(), savedOrder);
  } finally {
    f.dispose();
  }
});
