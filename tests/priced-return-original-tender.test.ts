import assert from 'node:assert/strict';
import test from 'node:test';
import { updateOfferCartLine } from '../lib/cart/offer-cart';
import { parseCheckoutInput } from '../lib/checkout/validation';
import { addCartItem, getCart } from '../lib/db/repositories/cart';
import { createCodOrder } from '../lib/db/repositories/orders';
import { publishPromo, savePromoDraft } from '../lib/db/repositories/promo-codes';
import { ensureWallet } from '../lib/db/repositories/wallet';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { quoteCheckoutPromo } from '../lib/incentives/quote-intent';
import { VARIANT_PRICING_CAPABILITY, VARIANT_PRICING_RULE_VERSION } from '../lib/products/variant-pricing';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { publicCheckoutFixture } from './helpers/public-checkout-fixture';

type Fixture = Awaited<ReturnType<typeof publicCheckoutFixture>>;

async function publishOriginalPromo(f: Fixture, now: number) {
  const formId = 'staff.promo-code' as const;
  const versionId = 'original-tender-promo-form';
  f.sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,1,1,'published',?,'Fictional tender form','reviewer',1,'reviewer',1,'reviewer',1,?)`)
    .run(versionId, formId, JSON.stringify({ formId, fields: [] }), versionId);
  const context = {
    actorId: 'reviewer', authSubject: 'reviewer', now, reason: 'Approve fictional original promo funding.',
    form: { formId, versionId, answers: { formId, version: 1, answers: [] } },
  };
  const draft = await savePromoDraft(f.db, { ...context, requestId: 'original-tender-promo-draft', expectedVersion: 0 }, {
    code: 'TENDERFIX', label: 'Fictional checkout promo', kind: 'fixed', fixedPaisa: 100_001,
    startsAt: now - 1, endsAt: now + 86_400_000, minimumSubtotalPaisa: 0,
    totalUseLimit: 1, perCustomerUseLimit: 1, budgetPaisa: 100_001,
  });
  await publishPromo(f.db, { ...context, requestId: 'original-tender-promo-publish', expectedVersion: draft.version }, draft.campaignId);
}

async function placePricedOrder(f: Fixture, includeLegacyItem = false) {
  const now = Date.now();
  Object.assign(f.db, { [VARIANT_PRICING_CAPABILITY]: true });
  const [stale] = (await getCart(f.db, f.cartHash)).items;
  assert.ok(stale.currentChoice && typeof stale.revision === 'number');
  const { versionId, publicVersionId, pricePaisa } = stale.currentChoice;
  await updateOfferCartLine(f.db, f.cartHash, {
    itemId: stale.id, revision: stale.revision, quantity: 3,
    requestId: 'original-tender-adjusted-choice',
    refresh: { versionId, publicVersionId, pricePaisa },
  }, now);
  if (includeLegacyItem) {
    f.sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,
      price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
      SELECT 'tender-legacy-cup',seller_id,category_id,'fixture-tender-legacy-cup','TENDER-LEGACY-CUP',
        'Fictional standard cup','An original product without a variant price addition.',
        33000,5,'Fictional maker','NP','Clay','published',created_at,updated_at
      FROM products WHERE id=?`).run(f.productId);
    await addCartItem(f.db, f.cartHash, 'tender-legacy-cup', 1, now);
  }
  const cart = await getCart(f.db, f.cartHash);
  assert.equal(cart.itemSubtotalPaisa, includeLegacyItem ? 297_000 : 264_000);

  await publishOriginalPromo(f, now);
  await ensureWallet(f.db, 'customer', now);
  const walletPaisa = cart.itemSubtotalPaisa - 100_001;
  f.sqlite.prepare(`INSERT INTO gift_cards
    (id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id)
    VALUES ('tender-gift','tender-gift-hash',?,'reviewer','tender-gift-issue',1,'customer',1,'tender-gift-redeem')`).run(walletPaisa);
  f.sqlite.prepare(`INSERT INTO wallet_entries(id,user_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at)
    VALUES ('tender-credit','customer','tender-gift',?,?,'gift_card',1)`).run(walletPaisa, -walletPaisa);
  const promo = await quoteCheckoutPromo(f.db, 'customer', f.cartHash, 'TENDERFIX', now, 'customer');
  assert.equal(promo.discountPaisa, 100_001);
  const reviewedQuote = {
    ...f.body.reviewedQuote,
    lines: cart.items.map(item => ({
      id: item.id, sellerId: item.sellerId, pricePaisa: item.pricePaisa!, quantity: item.quantity,
      ...(item.offerId ? {
        offerId: item.offerId, offerVersionId: item.offerVersionId!, publicVersionId: item.publicVersionId!,
        revision: item.revision!, pricingRuleVersion: VARIANT_PRICING_RULE_VERSION,
      } : {}),
    })),
    walletPaisa,
    promoPaisa: promo.discountPaisa,
    payablePaisa: f.body.reviewedQuote.deliveryPaisa + f.serviceFee.chargedPaisa,
  };
  const parsed = parseCheckoutInput({
    ...f.body, reviewedQuote, useWallet: true,
    promoCode: promo.code, promoRevision: promo.revision, promoQuoteIntent: promo.quoteIntent,
  });
  assert.ok(parsed.value, parsed.errors.join('\n'));
  const form = await validateSellerFormSubmission(
    f.db, 'commerce.checkout', f.body.formVersion, f.body.customAnswers, parsed.value.idempotencyKey,
  );
  const placed = await createCodOrder(
    f.db, f.cartHash, 'original-tender-receipt', { ...parsed.value, customerAuthSubject: 'customer' },
    Date.now(), 'customer', { versionId: form.versionId, answers: form.answers },
  );
  const saved = f.sqlite.prepare(`SELECT o.id AS orderId, i.id AS orderItemId, d.snapshot_json AS statement
    FROM orders o JOIN order_items i ON i.order_id=o.id
    JOIN order_documents d ON d.order_id=o.id AND d.kind='order_statement'
    WHERE o.order_number=? AND i.product_id=?`)
    .get(placed.orderNumber, f.productId);
  assert.ok(saved && typeof saved.orderId === 'string' && typeof saved.orderItemId === 'string' && typeof saved.statement === 'string');
  return { orderId: saved.orderId, orderItemId: saved.orderItemId, statement: saved.statement };
}

void test('priced return units conserve the original promo and wallet with no invented cash', async () => {
  const f = await publicCheckoutFixture();
  try {
    const { orderId, orderItemId, statement } = await placePricedOrder(f);
    const { quoteOriginalBuyerMerchandiseRefund, prepareOriginalBuyerMerchandiseRefundGuard } =
      await import('../lib/incentives/original-benefit-refunds');
    assert.equal(typeof quoteOriginalBuyerMerchandiseRefund, 'function');
    const input = { orderId, orderItemId, quantity: 1 };
    let firstGuard: D1PreparedStatement[] | undefined;
    for (const [ordinal, walletPaisa, promoPaisa] of [[1, 54_666, 33_334], [2, 54_666, 33_334], [3, 54_667, 33_333]]) {
      const quote = await quoteOriginalBuyerMerchandiseRefund(f.db, { ...input, unitOrdinals: [ordinal] });
      assert.ok(quote);
      assert.equal(quote.usesVariantPricing, true);
      assert.deepEqual(quote.unitOrdinals, [ordinal]);
      assert.deepEqual(
        [quote.itemPaisa, quote.basePaisa, quote.sellerPrincipalPaisa, quote.platformAdditionPaisa,
          quote.taxPaisa, quote.walletPaisa, quote.promoPaisa, quote.discountPaisa, quote.cashMerchandisePaisa],
        [88_000, 88_000 * (ordinal - 1), 80_000, 8_000, 0, walletPaisa, promoPaisa, 0, 0],
      );
      const lock = () => f.db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(orderId);
      if (!firstGuard) firstGuard = prepareOriginalBuyerMerchandiseRefundGuard(f.db, quote);
      else await assert.rejects(f.db.batch([lock(), ...firstGuard]), /valid|operation_transaction_guards/i);
      await f.db.batch([
        lock(),
        ...prepareOriginalBuyerMerchandiseRefundGuard(f.db, quote),
        f.db.prepare(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,quantity,requested_at)
          VALUES (?,?,'damaged','Fictional approved one-unit return.','resolved',1,?)`)
          .bind('tender-return-' + ordinal, orderItemId, ordinal),
        f.db.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,item_amount_paisa,
          wallet_credit_paisa,promo_discount_paisa,credit_base_paisa,reason,liability,requested_at)
          VALUES (?,?,?,'approved',?,?,?,?,?,'Fictional approved original tender','platform',?)`)
          .bind('tender-refund-' + ordinal, orderId, 'tender-return-' + ordinal,
            quote.itemPaisa, quote.itemPaisa, quote.walletPaisa, quote.promoPaisa, quote.basePaisa, ordinal),
      ]);
    }
    await assert.rejects(quoteOriginalBuyerMerchandiseRefund(f.db, input), /reconcil|remain/i);
    assert.equal(f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE order_id=? AND kind='order_statement'")
      .get(orderId)?.snapshot_json, statement);
  } finally {
    f.dispose();
  }
});

void test('a legacy line in a priced order keeps its original saved tender and legacy pricing identity', async () => {
  const f = await publicCheckoutFixture();
  try {
    const { orderId } = await placePricedOrder(f, true);
    const itemId = f.sqlite.prepare("SELECT id FROM order_items WHERE order_id=? AND product_id='tender-legacy-cup'")
      .get(orderId)?.id;
    assert.ok(typeof itemId === 'string');
    const { quoteOriginalBuyerMerchandiseRefund, prepareOriginalBuyerMerchandiseRefundGuard } =
      await import('../lib/incentives/original-benefit-refunds');
    const quote = await quoteOriginalBuyerMerchandiseRefund(f.db, { orderId, orderItemId: itemId, quantity: 1 });
    assert.ok(quote);
    assert.equal(quote.usesVariantPricing, false);
    assert.deepEqual(
      [quote.itemPaisa, quote.sellerPrincipalPaisa, quote.platformAdditionPaisa,
        quote.walletPaisa, quote.promoPaisa, quote.cashMerchandisePaisa],
      [33_000, 33_000, 0, 20_912, 12_088, 0],
    );
    const lock = () => f.db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(orderId);
    await f.db.batch([lock(), ...prepareOriginalBuyerMerchandiseRefundGuard(f.db, quote)]);
    await assert.rejects(f.db.batch([
      lock(), ...prepareOriginalBuyerMerchandiseRefundGuard(f.db, { ...quote, usesVariantPricing: true }),
    ]), /valid|operation_transaction_guards/i);
  } finally {
    f.dispose();
  }
});

void test('historical tender remains available without the variant pricing table', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.exec('DROP TABLE order_item_pricing_snapshots');
    const { quoteOriginalBuyerMerchandiseRefund } = await import('../lib/incentives/original-benefit-refunds');
    assert.equal(await quoteOriginalBuyerMerchandiseRefund(f.db, {
      orderId: 'legacy-order', orderItemId: 'unmarked-line', quantity: 1,
    }), null);
  } finally {
    f.dispose();
  }
});
