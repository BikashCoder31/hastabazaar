import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancellationPreview,
  cancelSelectedParcels,
} from '../lib/cancellation/repository';
import { addOfferCartLine, updateOfferCartLine } from '../lib/cart/offer-cart';
import {
  getDeliveryEstimate,
  parseCheckoutInput,
} from '../lib/checkout/validation';
import { addCartItem, getCart } from '../lib/db/repositories/cart';
import {
  getDeliveryRates,
  saveDeliveryRates,
} from '../lib/db/repositories/delivery-rates';
import { createCodOrder } from '../lib/db/repositories/orders';
import {
  createCustomerReturnRequest,
  reviewReturnAsAdmin,
} from '../lib/db/repositories/returns';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { getPublicOfferSet } from '../lib/products/public-offers';
import {
  ORIGINAL_DELIVERY_ALLOCATION,
  originalReturnDelivery,
} from '../lib/returns/delivery-allocation';
import {
  prepareRefundDeliveryUnitClaims,
  readUnclaimedDeliveryUnits,
  SELLER_SHIPMENT_DELIVERY_CAPABILITY,
  SELLER_SHIPMENT_DELIVERY_POLICY,
} from '../lib/returns/seller-shipment-delivery';
import { readyCheckoutSeller } from './helpers/checkout-contact';
import { publicCheckoutFixture } from './helpers/public-checkout-fixture';

type Fixture = Awaited<ReturnType<typeof publicCheckoutFixture>>;

async function setQuantity(f: Fixture, quantity: number) {
  const [item] = (await getCart(f.db, f.cartHash)).items;
  assert.ok(typeof item.revision === 'number');
  await updateOfferCartLine(
    f.db,
    f.cartHash,
    {
      itemId: item.id,
      quantity,
      revision: item.revision,
      requestId: 'delivery-checkout-quantity',
    },
    Date.now(),
  );
}

async function reviewOrder(f: Fixture, deliveryPaisa: number) {
  const cart = await getCart(f.db, f.cartHash);
  assert.equal(cart.hasUnavailableItems, false);
  const rates = await getDeliveryRates(f.db);
  const sellerIds = new Set(cart.items.map((item) => item.sellerId));
  const delivery = getDeliveryEstimate(
    f.body.address.district,
    cart.items.map((item) => item.preparationDays),
    rates,
    sellerIds.size,
  );
  assert.equal(delivery?.chargePaisa, deliveryPaisa);
  const quote = {
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
      }),
    })),
    deliveryPaisa,
    payablePaisa:
      cart.itemSubtotalPaisa + deliveryPaisa + f.serviceFee.chargedPaisa,
  };
  const parsed = parseCheckoutInput({
    ...f.body,
    deliveryRateVersion: rates.version,
    reviewedQuote: quote,
  });
  assert.ok(parsed.value, parsed.errors.join('\n'));
  const input = { ...parsed.value, customerAuthSubject: 'customer' };
  const form = await validateSellerFormSubmission(
    f.db,
    'commerce.checkout',
    f.body.formVersion,
    f.body.customAnswers,
    parsed.value.idempotencyKey,
  );
  return () =>
    createCodOrder(
      f.db,
      f.cartHash,
      'seller-shipment-receipt',
      input,
      Date.now(),
      'customer',
      { versionId: form.versionId, answers: form.answers },
    );
}

async function publishHundredRupeeRate(f: Fixture) {
  await saveDeliveryRates(f.db, {
    actorId: 'reviewer',
    expectedVersion: f.rates.version,
    now: Date.now(),
    rates: {
      zones: { valley: 10_000, terai: 18_000, nationwide: 25_000 },
      districts: {},
    },
    reason: 'Use the fictional NPR 100 one-seller delivery rate.',
  });
  const rates = await getDeliveryRates(f.db);
  assert.notEqual(rates.version, f.rates.version);
  return rates.version;
}

function placedOrder(f: Fixture, orderNumber: string) {
  const order = f.sqlite
    .prepare(`SELECT id,delivery_rate_snapshot_json AS deliveryJson
    FROM orders WHERE order_number=?`)
    .get(orderNumber);
  assert.ok(
    order &&
      typeof order.id === 'string' &&
      typeof order.deliveryJson === 'string',
  );
  return {
    id: order.id,
    delivery: JSON.parse(order.deliveryJson) as {
      unitAllocationPolicy?: string;
    },
  };
}

function attributeSingleSeller(f: Fixture, record?: (input: unknown) => void) {
  const source = 'isolated-checkout-attribution';
  Object.assign(f.db, {
    [SELLER_SHIPMENT_DELIVERY_CAPABILITY](input: unknown) {
      record?.(input);
      return {
        source,
        sellerCharges: [{ sellerId: 'registered', amountPaisa: 10_000 }],
      };
    },
  });
  return source;
}

async function addMoreSellerLines(f: Fixture) {
  const now = Date.now();
  const set = await getPublicOfferSet(f.db, f.productId, now);
  assert.ok(set);
  const large = set.offers.find((offer) => offer.id === 'large');
  assert.ok(large?.orderable);
  await addOfferCartLine(
    f.db,
    f.cartHash,
    {
      productId: f.productId,
      offerId: large.id,
      versionId: set.versionId,
      publicVersionId: set.publicVersionId,
      pricePaisa: large.pricePaisa,
      quantity: 2,
      requestId: 'delivery-two-large-units',
    },
    now + 1,
  );

  f.sqlite
    .exec(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
    registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,
    province,district,municipality,locality,status,created_at,updated_at)
    SELECT 'secondary','foreign','Secondary Fictional Seller','Secondary Fixture Shop','Fixture',
      'FIX-SECOND','PAN','FIX-SECOND-PAN','Fictional Owner',support_phone,'foreign@local.hastabazaar.test',
      province,district,municipality,locality,'approved',created_at,updated_at
    FROM seller_profiles WHERE id='registered';
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','seller',1);`);
  await readyCheckoutSeller(
    { database: f.db, sqlite: f.sqlite },
    'secondary',
    'foreign',
    'reviewer',
    now,
  );
  f.sqlite
    .prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,
    price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
    SELECT 'secondary-cup','secondary',category_id,'fictional-secondary-cup','FIX-SECOND-CUP',
      'Secondary fixture cup','A retained legacy product from the other fictional seller',110000,4,
      'Fictional maker','NP','Clay','published',created_at,updated_at FROM products WHERE id=?`)
    .run(f.productId);
  await addCartItem(f.db, f.cartHash, 'secondary-cup', 2, now + 2);
}

void test('checkout persists NPR 100 as the exact three purchased delivery unit shares', async () => {
  const f = await publicCheckoutFixture();
  try {
    const rateVersionId = await publishHundredRupeeRate(f);
    await setQuantity(f, 3);
    const calls: unknown[] = [];
    const source = attributeSingleSeller(f, (input) => calls.push(input));
    const submit = await reviewOrder(f, 10_000);

    f.sqlite.exec(`CREATE TEMP TRIGGER fixture_interrupt_unit_write
      BEFORE INSERT ON order_delivery_unit_allocations WHEN NEW.unit_ordinal=2
      BEGIN SELECT RAISE(ABORT,'fixture_interrupted_unit_write'); END;`);
    await assert.rejects(submit, /fixture_interrupted_unit_write/);
    f.sqlite.exec('DROP TRIGGER fixture_interrupt_unit_write');
    assert.equal(
      f.sqlite
        .prepare("SELECT COUNT(*) AS n FROM orders WHERE id<>'legacy-order'")
        .get()?.n,
      0,
    );
    for (const table of [
      'payments',
      'offer_stock_reservations',
      'order_delivery_shipment_allocations',
      'order_delivery_unit_allocations',
    ]) {
      assert.equal(
        f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n,
        0,
        table,
      );
    }
    assert.equal((await getCart(f.db, f.cartHash)).items[0].quantity, 3);
    const result = await submit();
    assert.equal(result.grandTotalPaisa, 250_000);
    const order = placedOrder(f, result.orderNumber);
    assert.equal(
      order.delivery.unitAllocationPolicy,
      SELLER_SHIPMENT_DELIVERY_POLICY,
    );
    assert.deepEqual(calls, [
      { totalPaisa: 10_000, sellerIds: ['registered'], rateVersionId },
      { totalPaisa: 10_000, sellerIds: ['registered'], rateVersionId },
    ]);

    const shipments = f.sqlite
      .prepare(`SELECT seller_id AS sellerId, amount_paisa AS amountPaisa,
      unit_count AS unitCount, policy_version AS policy, allocation_source AS source
      FROM order_delivery_shipment_allocations WHERE order_id=?`)
      .all(order.id);
    assert.deepEqual(
      shipments.map((row) => ({ ...row })),
      [
        {
          sellerId: 'registered',
          amountPaisa: 10_000,
          unitCount: 3,
          policy: SELLER_SHIPMENT_DELIVERY_POLICY,
          source,
        },
      ],
    );
    const shares = f.sqlite
      .prepare(`SELECT unit.amount_paisa AS amountPaisa FROM order_delivery_unit_allocations unit
      JOIN order_items item ON item.id=unit.order_item_id AND item.order_id=unit.order_id
      WHERE unit.order_id=? AND item.quantity=3 ORDER BY unit.shipment_unit_ordinal`)
      .all(order.id);
    assert.deepEqual(
      shares.map((share) => share.amountPaisa),
      [3_334, 3_333, 3_333],
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT 1 FROM order_delivery_allocations WHERE order_id=?')
        .get(order.id),
      undefined,
    );

    Object.assign(f.db, {
      [SELLER_SHIPMENT_DELIVERY_CAPABILITY]() {
        throw new Error('An exact replay must use the saved result.');
      },
    });
    assert.deepEqual(await submit(), result);
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT COUNT(*) AS n FROM order_delivery_shipment_allocations WHERE order_id=?',
        )
        .get(order.id)?.n,
      1,
    );
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT COUNT(*) AS n FROM order_delivery_unit_allocations WHERE order_id=?',
        )
        .get(order.id)?.n,
      3,
    );
  } finally {
    f.dispose();
  }
});

void test('checkout without trusted shipment attribution works with only the legacy allocation schema', async () => {
  const f = await publicCheckoutFixture();
  try {
    f.sqlite.exec(`DROP TRIGGER IF EXISTS delivery_shipment_marker_no_rewrite;
      DROP TABLE IF EXISTS order_delivery_unit_parcels;
      DROP TABLE IF EXISTS order_delivery_unit_claims;
      DROP TABLE IF EXISTS order_delivery_unit_allocations;
      DROP TABLE IF EXISTS order_delivery_shipment_allocations;`);
    const submit = await reviewOrder(f, 15_000);
    const result = await submit();
    assert.equal(result.grandTotalPaisa, 95_000);
    const order = placedOrder(f, result.orderNumber);
    assert.equal(order.delivery.unitAllocationPolicy, undefined);
    const saved = f.sqlite
      .prepare(`SELECT amount_paisa AS amountPaisa, original_quantity AS quantity,
      policy_version AS policy FROM order_delivery_allocations WHERE order_id=?`)
      .get(order.id);
    assert.deepEqual(
      { ...saved },
      {
        amountPaisa: 15_000,
        quantity: 1,
        policy: ORIGINAL_DELIVERY_ALLOCATION,
      },
    );
  } finally {
    f.dispose();
  }
});

void test('a partial cancellation preserves the other seller delivery charge and consumes only cancelled units', async () => {
  const f = await publicCheckoutFixture();
  try {
    await publishHundredRupeeRate(f);
    await addMoreSellerLines(f);
    Object.assign(f.db, {
      [SELLER_SHIPMENT_DELIVERY_CAPABILITY]() {
        return {
          source: 'isolated-multiple-seller-attribution',
          sellerCharges: [
            { sellerId: 'secondary', amountPaisa: 4_999 },
            { sellerId: 'registered', amountPaisa: 10_001 },
          ],
        };
      },
    });
    const submit = await reviewOrder(f, 15_000);
    const result = await submit();
    assert.equal(result.grandTotalPaisa, 515_000);
    const order = placedOrder(f, result.orderNumber);
    const shipments = f.sqlite
      .prepare(`SELECT seller_id AS seller, amount_paisa AS amount, unit_count AS count
      FROM order_delivery_shipment_allocations WHERE order_id=? ORDER BY shipment_ordinal`)
      .all(order.id);
    assert.deepEqual(
      shipments.map((row) => ({ ...row })),
      [
        { seller: 'registered', amount: 10_001, count: 3 },
        { seller: 'secondary', amount: 4_999, count: 2 },
      ],
    );

    const savedUnits = f.sqlite
      .prepare(`SELECT shipment.seller_id AS seller, offer.offer_id AS offer,
      unit.line_ordinal AS line, unit.unit_ordinal AS unit,
      unit.shipment_unit_ordinal AS shipmentUnit, unit.amount_paisa AS amount
      FROM order_delivery_unit_allocations unit
      JOIN order_delivery_shipment_allocations shipment ON shipment.id=unit.shipment_id
      LEFT JOIN order_item_offer_snapshots offer ON offer.order_item_id=unit.order_item_id
      WHERE unit.order_id=? ORDER BY shipment.shipment_ordinal,unit.shipment_unit_ordinal`);
    const units = savedUnits.all(order.id);
    assert.deepEqual(
      units.map((row) => ({ ...row })),
      [
        {
          seller: 'registered',
          offer: 'medium',
          line: 1,
          unit: 1,
          shipmentUnit: 1,
          amount: 3_334,
        },
        {
          seller: 'registered',
          offer: 'large',
          line: 2,
          unit: 1,
          shipmentUnit: 2,
          amount: 3_334,
        },
        {
          seller: 'registered',
          offer: 'large',
          line: 2,
          unit: 2,
          shipmentUnit: 3,
          amount: 3_333,
        },
        {
          seller: 'secondary',
          offer: null,
          line: 1,
          unit: 1,
          shipmentUnit: 1,
          amount: 2_500,
        },
        {
          seller: 'secondary',
          offer: null,
          line: 1,
          unit: 2,
          shipmentUnit: 2,
          amount: 2_499,
        },
      ],
    );

    const access = { orderNumber: result.orderNumber, customerId: 'customer' };
    const selected = ['registered'];
    const preview = await cancellationPreview(f.db, access, selected);
    assert.equal(preview.previous.delivery, 15_000);
    assert.equal(preview.next.delivery, 4_999);
    assert.equal(preview.next.total, 224_999);
    const command = {
      sellerIds: selected,
      fingerprint: preview.fingerprint,
      now: Date.now(),
      requestId: 'seller-shipment-partial-cancel',
      note: 'Cancel the original fictional registered seller shipment.',
    };
    const resultAfterCancel = await cancelSelectedParcels(
      f.db,
      access,
      command,
    );
    assert.deepEqual(
      await cancelSelectedParcels(f.db, access, command),
      resultAfterCancel,
    );
    const currentOrder = f.sqlite
      .prepare(`SELECT current_delivery_paisa AS delivery,
      current_total_paisa AS total FROM orders WHERE id=?`)
      .get(order.id);
    assert.deepEqual({ ...currentOrder }, { delivery: 4_999, total: 224_999 });
    assert.deepEqual(savedUnits.all(order.id), units);
    const claims = f.sqlite
      .prepare(`SELECT item.seller_id AS seller, COUNT(*) AS units, SUM(unit.amount_paisa) AS amount
      FROM order_delivery_unit_claims claim JOIN order_items item ON item.id=claim.order_item_id
      JOIN order_delivery_unit_allocations unit ON unit.order_item_id=item.id AND unit.unit_ordinal=claim.unit_ordinal
      WHERE item.order_id=? AND claim.cancellation_event_id IS NOT NULL GROUP BY item.seller_id`)
      .all(order.id);
    assert.deepEqual(
      claims.map((row) => ({ ...row })),
      [{ seller: 'registered', units: 3, amount: 10_001 }],
    );
  } finally {
    f.dispose();
  }
});

void test('two sequential return approvals reserve different immutable shares for the same three-unit line', async () => {
  const f = await publicCheckoutFixture();
  try {
    await publishHundredRupeeRate(f);
    await setQuantity(f, 3);
    attributeSingleSeller(f);
    const submit = await reviewOrder(f, 10_000);
    const result = await submit();
    const order = placedOrder(f, result.orderNumber);
    assert.equal(
      order.delivery.unitAllocationPolicy,
      SELLER_SHIPMENT_DELIVERY_POLICY,
    );
    const item = f.sqlite
      .prepare('SELECT id FROM order_items WHERE order_id=?')
      .get(order.id);
    assert.ok(typeof item?.id === 'string');
    const orderItemId = item.id;
    // Establish a delivered historical state for the in-memory return fixture.
    f.sqlite
      .prepare("UPDATE orders SET status='delivered',delivered_at=? WHERE id=?")
      .run(Date.now(), order.id);
    f.sqlite
      .prepare(
        "UPDATE order_items SET fulfillment_status='delivered' WHERE id=?",
      )
      .run(orderItemId);

    const approvals: {
      requestId: string;
      refundId: string;
      deliveryPaisa: number;
    }[] = [];
    for (const [index, expectedDeliveryPaisa] of [3_334, 3_333].entries()) {
      const request = await createCustomerReturnRequest(f.db, {
        orderNumber: result.orderNumber,
        customerId: 'customer',
        receiptTokenHash: null,
        orderItemId,
        quantity: 1,
        reason: 'defective',
        requestedResolution: 'refund',
        detail: 'A fictional delivered cup has a defect.',
        locale: 'en-NP',
        idempotencyKey: `seller-shipment-return-${index}`,
        evidence: [],
        now: Date.now(),
      });
      const entitlement = await originalReturnDelivery(f.db, request.id);
      assert.equal(entitlement.kind, 'ready');
      assert.equal(entitlement.amountPaisa, expectedDeliveryPaisa);
      await reviewReturnAsAdmin(f.db, {
        returnRequestId: request.id,
        actorId: 'reviewer',
        actorRole: 'super_admin',
        action: 'approve',
        responsibility: 'platform',
        outcome: 'refund',
        itemRefundPaisa: 80_000,
        note: 'Approve the original fictional unit value and its exact delivery share.',
        publicMessageEn: 'Your fictional return is approved.',
        publicMessageNe: 'तपाईंको फिर्ता स्वीकृत भयो।',
        requestId: `seller-shipment-approve-${index}`,
        now: Date.now(),
      });
      const refund = f.sqlite
        .prepare(
          'SELECT id,delivery_amount_paisa AS delivery FROM refunds WHERE return_request_id=?',
        )
        .get(request.id);
      assert.ok(typeof refund?.id === 'string');
      assert.equal(refund.delivery, expectedDeliveryPaisa);
      approvals.push({
        requestId: request.id,
        refundId: refund.id,
        deliveryPaisa: expectedDeliveryPaisa,
      });
      // Close the earlier case in the fixture while preserving its approved delivery reservation.
      f.sqlite
        .prepare(
          "UPDATE return_requests SET status='resolved',resolved_at=? WHERE id=?",
        )
        .run(Date.now(), request.id);
    }

    const claims = f.sqlite
      .prepare(`SELECT unit_ordinal AS unitOrdinal,refund_id AS refundId
      FROM order_delivery_unit_claims WHERE order_item_id=? ORDER BY unit_ordinal`)
      .all(orderItemId);
    assert.deepEqual(
      claims.map((row) => ({ ...row })),
      approvals.map((approval, index) => ({
        unitOrdinal: index + 1,
        refundId: approval.refundId,
      })),
    );
    for (const approval of approvals) {
      const confirmed = await originalReturnDelivery(f.db, approval.requestId);
      assert.equal(confirmed.kind, 'ready');
      assert.equal(confirmed.amountPaisa, approval.deliveryPaisa);
    }
    const remaining = { orderId: order.id, orderItemId, originalQuantity: 3 };
    assert.deepEqual(
      await readUnclaimedDeliveryUnits(f.db, { ...remaining, quantity: 1 }),
      {
        units: [{ unitOrdinal: 3, amountPaisa: 3_333 }],
        originalPaisa: 10_000,
      },
    );
    assert.equal(
      await readUnclaimedDeliveryUnits(f.db, { ...remaining, quantity: 2 }),
      null,
    );
    await assert.rejects(() =>
      f.db.batch(
        prepareRefundDeliveryUnitClaims(f.db, {
          refundId: approvals[1].refundId,
          orderItemId,
          now: Date.now(),
          units: [{ unitOrdinal: 1, amountPaisa: 3_334 }],
        }),
      ),
    );
  } finally {
    f.dispose();
  }
});
