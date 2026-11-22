import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { updateOfferCartLine } from '../lib/cart/offer-cart';
import {
  ReviewedCheckoutChangedError,
  type ReviewedCheckoutQuote,
} from '../lib/checkout/reviewed-quote';
import { parseCheckoutInput } from '../lib/checkout/validation';
import { getCart, type CartView } from '../lib/db/repositories/cart';
import { getSellerOrderDetail } from '../lib/db/repositories/fulfillment';
import {
  getCommissionSetting,
  getRegisteredSellerTerms,
  prepareSellerCommissionAcceptance,
} from '../lib/db/repositories/marketplace-settings';
import { readOrderItemPricingSnapshots } from '../lib/db/repositories/order-item-pricing-snapshots';
import {
  createCodOrder,
  getOrderDocument,
  getOrderReceipt,
} from '../lib/db/repositories/orders';
import {
  countPublishedProducts,
  getPublishedProductBySlug,
} from '../lib/db/repositories/products';
import {
  pausePromo,
  publishPromo,
  savePromoDraft,
} from '../lib/db/repositories/promo-codes';
import { ensureWallet } from '../lib/db/repositories/wallet';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { quoteCheckoutPromo } from '../lib/incentives/quote-intent';
import { getProductWorkspace } from '../lib/products/intake-workspace';
import { getOfferStock } from '../lib/products/offer-inventory';
import {
  getProductPublicationReview,
  reviewProductPublication,
  submitProductPriceRevision,
} from '../lib/products/publication';
import { getPublicOfferSet } from '../lib/products/public-offers';
import {
  VARIANT_PRICING_CAPABILITY,
  VARIANT_PRICING_RULE_VERSION,
} from '../lib/products/variant-pricing';
import { withCheckoutAcceptanceTerms } from './helpers/checkout-acceptance-bindings';
import { publicCheckoutFixture } from './helpers/public-checkout-fixture';

type Fixture = Awaited<ReturnType<typeof publicCheckoutFixture>>;

const dropPricedAcceptanceTriggers = `DROP TRIGGER priced_order_acceptance_insert;
  DROP TRIGGER priced_order_acceptance_update;
  DROP TRIGGER priced_order_acceptance_delete;
  DROP TRIGGER priced_order_acceptance_snapshot_insert;`;

async function placeOrder(
  f: Fixture,
  reviewedQuote: ReviewedCheckoutQuote,
  promo?: {
    code: string;
    revision: number;
    quoteIntent: string;
  },
) {
  const parsed = parseCheckoutInput({
    ...f.body,
    reviewedQuote,
    useWallet: reviewedQuote.walletPaisa > 0,
    ...(promo && {
      promoCode: promo.code,
      promoRevision: promo.revision,
      promoQuoteIntent: promo.quoteIntent,
    }),
  });
  assert.ok(parsed.value, parsed.errors.join('\n'));
  const form = await validateSellerFormSubmission(
    f.db,
    'commerce.checkout',
    f.body.formVersion,
    f.body.customAnswers,
    parsed.value.idempotencyKey,
  );
  return createCodOrder(
    f.db,
    f.cartHash,
    'pricing-checkpoint-receipt',
    { ...parsed.value, customerAuthSubject: 'customer' },
    Date.now(),
    'customer',
    { versionId: form.versionId, answers: form.answers },
  );
}

async function approveMediumPrice(
  f: Fixture,
  current: Fixture['approved'],
  price: string,
) {
  const work = await getProductWorkspace(
    f.db,
    'registered-owner',
    f.attached.id,
  );
  assert.ok(work.case);
  const sent = await submitProductPriceRevision(
    f.db,
    {
      actorId: 'registered-owner',
      requestId: `pricing-submit-${price}`,
      expectedRevision: String(current.revision),
      now: Date.now(),
    },
    {
      draftId: work.id,
      baseVersionId: current.versionId,
      expectedDraftRevision: String(work.revision),
      expectedCaseId: work.case.caseId,
      expectedCaseRevision: String(work.case.revision),
      replaceVersionId: work.case.versionId,
      offerId: 'medium',
      price,
      note: 'Propose this fictional price for the same published cup size.',
    },
  );
  const review = await getProductPublicationReview(
    f.db,
    'reviewer',
    sent.caseId,
  );
  return reviewProductPublication(
    f.db,
    {
      actorId: 'reviewer',
      requestId: `pricing-approve-${price}`,
      expectedRevision: String(review.revision),
      now: Date.now(),
    },
    {
      caseId: sent.caseId,
      versionId: review.candidate.versionId,
      expectedCaseRevision: String(review.caseRevision),
      action: 'approve_and_publish',
      reason: 'Review the selling price for the same fictional physical cup.',
      checks: { sameItem: true, accurateCover: true, eligibilityEvidence: [] },
    },
  );
}

async function refreshCartChoice(
  f: Fixture,
  requestId: string,
  quantity: number,
  pricePaisa: number,
) {
  const [line] = (await getCart(f.db, f.cartHash)).items;
  assert.ok(line?.currentChoice?.orderable);
  assert.equal(line.currentChoice.pricePaisa, pricePaisa);
  assert.ok(typeof line.revision === 'number');
  await updateOfferCartLine(
    f.db,
    f.cartHash,
    {
      itemId: line.id,
      quantity,
      revision: line.revision,
      requestId,
      refresh: {
        versionId: line.currentChoice.versionId,
        publicVersionId: line.currentChoice.publicVersionId,
        pricePaisa: line.currentChoice.pricePaisa,
      },
    },
    Date.now(),
  );
  const cart = await getCart(f.db, f.cartHash);
  assert.equal(cart.hasUnavailableItems, false);
  assert.equal(cart.items[0].pricePaisa, pricePaisa);
  return cart;
}

function reviewedCartQuote(
  f: Fixture,
  cart: CartView,
  amounts: {
    pricingRuleVersion?: typeof VARIANT_PRICING_RULE_VERSION;
    promoPaisa?: number;
    walletPaisa?: number;
  } = {},
): ReviewedCheckoutQuote {
  const [item] = cart.items;
  assert.ok(
    item.offerId &&
      item.offerVersionId &&
      item.publicVersionId &&
      item.pricePaisa !== null,
  );
  assert.ok(typeof item.revision === 'number');
  const { pricingRuleVersion, promoPaisa = 0, walletPaisa = 0 } = amounts;
  const retained = f.body.reviewedQuote;
  return {
    ...retained,
    lines: [
      {
        id: item.id,
        sellerId: item.sellerId,
        pricePaisa: item.pricePaisa,
        quantity: item.quantity,
        offerId: item.offerId,
        offerVersionId: item.offerVersionId,
        publicVersionId: item.publicVersionId,
        revision: item.revision,
        ...(pricingRuleVersion === undefined ? {} : { pricingRuleVersion }),
      },
    ],
    promoPaisa,
    walletPaisa,
    payablePaisa:
      cart.itemSubtotalPaisa +
      retained.deliveryPaisa +
      f.serviceFee.chargedPaisa -
      promoPaisa -
      walletPaisa,
  };
}

function publishFixtureRate(
  f: Fixture,
  version: number,
  bps: number,
  now: number,
) {
  const id = `pricing-checkpoint-rate-${version}`;
  f.sqlite
    .prepare(`INSERT INTO business_setting_versions(
    id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id
  ) VALUES (?,'independent_seller_commission_bps',?,?,'published',1,'controlled',?,
    'Explicit isolated pricing-checkpoint seller terms','reviewer',?,?)`)
    .run(id, version, JSON.stringify(bps), now, now, id);
  return id;
}

async function acceptStandardCommission(f: Fixture) {
  const now = Date.now();
  const settingVersionId = publishFixtureRate(f, 2, 1_200, now);
  const terms = await getRegisteredSellerTerms(f.db, now);
  assert.equal(terms.versionId, settingVersionId);
  const requestId = 'pricing-checkpoint-accept-standard-rate';
  const acceptance = await prepareSellerCommissionAcceptance(f.db, {
    sellerId: 'registered',
    actorId: 'registered-owner',
    requestId,
    now,
    context: terms.context,
    mode: 'approved_seller',
  });
  await f.db.batch(acceptance.statements);
  const row = f.sqlite
    .prepare(
      'SELECT id FROM seller_agreement_acceptance_history WHERE acceptance_request_id=?',
    )
    .get(requestId);
  assert.equal(typeof row?.id, 'string');
  return {
    settingVersionId,
    agreementVersion: terms.agreementVersion,
    acceptanceId: row!.id,
  };
}

async function publishPlatformPromo(f: Fixture) {
  const formId = 'staff.promo-code';
  const versionId = 'pricing-checkpoint-promo-form';
  const now = Date.now();
  f.sqlite
    .prepare(`INSERT INTO form_config_versions(
    id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,
    published_by,published_at,last_request_id
  ) VALUES (?,?,1,1,'published',?,'Fictional campaign form','reviewer',?,'reviewer',?,'reviewer',?,?)`)
    .run(
      versionId,
      formId,
      JSON.stringify({ formId, fields: [] }),
      now,
      now,
      now,
      versionId,
    );
  const ctx = {
    actorId: 'reviewer',
    authSubject: 'reviewer',
    now,
    reason: 'Approve fictional platform funding.',
    form: { formId, versionId, answers: { formId, version: 1, answers: [] } },
  } as const;
  const draft = await savePromoDraft(
    f.db,
    { ...ctx, requestId: 'pricing-promo-draft', expectedVersion: 0 },
    {
      code: 'FIXPRICE',
      label: 'Fictional price checkpoint',
      kind: 'fixed',
      fixedPaisa: 20_000,
      startsAt: now - 1,
      endsAt: now + 86_400_000,
      minimumSubtotalPaisa: 0,
      totalUseLimit: 3,
      perCustomerUseLimit: 1,
      budgetPaisa: 60_000,
    },
  );
  const promo = await publishPromo(
    f.db,
    {
      ...ctx,
      requestId: 'pricing-promo-publish',
      expectedVersion: draft.version,
    },
    draft.campaignId,
  );
  return () =>
    pausePromo(
      f.db,
      {
        ...ctx,
        now: Date.now(),
        requestId: 'pricing-promo-pause',
        expectedVersion: promo.version,
      },
      promo.campaignId,
    );
}

async function seedShoppingCredit(f: Fixture) {
  await ensureWallet(f.db, 'customer');
  f.sqlite
    .exec(`INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,
    redeemed_by,redeemed_at,redemption_request_id)
    VALUES ('pricing-gift','pricing-gift-hash',2000,'reviewer','pricing-gift-issue',1,'customer',1,'pricing-gift-redeem');
    INSERT INTO wallet_entries(id,user_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at)
    VALUES ('pricing-credit','customer','pricing-gift',2000,-2000,'gift_card',1);`);
}

async function assertOriginalAcceptanceIsRetained(f: Fixture, orderId: string) {
  const readAll = () =>
    f.sqlite.prepare('SELECT * FROM order_policy_acceptances ORDER BY id').all();
  const acceptance = () =>
    f.sqlite
      .prepare('SELECT * FROM order_policy_acceptances WHERE order_id=?')
      .get(orderId);
  const original = acceptance();
  assert.ok(original);
  assert.equal(original.actor_user_id, 'customer');
  const legacy = {
    id: 'legacy-acceptance',
    order_id: 'legacy-order',
    request_id: 'legacy-consent',
  };
  f.sqlite.prepare(`INSERT INTO order_policy_acceptances
    (id,order_id,policy_version,terms_snapshot_json,acceptance_method,request_id,accepted_at)
    VALUES (?,?,'legacy','{}','affirmative_checkbox',?,1)`)
    .run(legacy.id, legacy.order_id, legacy.request_id);
  const before = readAll();
  const immutable = /priced_order_acceptance_immutable/;
  assert.equal(
    f.sqlite.prepare('PRAGMA recursive_triggers').get()?.recursive_triggers,
    0,
  );

  for (const change of [
    "terms_snapshot_json=json_remove(terms_snapshot_json,'$.variantPricingRuleVersion')",
    "terms_snapshot_json=json_set(terms_snapshot_json,'$.reviewedQuote.lines[0].pricePaisa',40000)",
    "id='other-acceptance'",
    "order_id='legacy-order'",
    "policy_version='other-terms'",
    "acceptance_method='other-method'",
    'actor_user_id=NULL',
    "actor_user_id='foreign'",
    "request_id='other-request'",
    'accepted_at=accepted_at+1',
  ]) {
    assert.throws(
      () => f.sqlite.prepare(`UPDATE order_policy_acceptances SET ${change} WHERE order_id=?`).run(orderId),
      immutable,
      change,
    );
  }
  assert.throws(
    () => f.sqlite.prepare('DELETE FROM order_policy_acceptances WHERE order_id=?').run(orderId),
    immutable,
  );

  for (const key of ['id', 'order_id', 'request_id'] as const) {
    const value = original[key];
    assert.ok(typeof value === 'string');
    const replacement = { ...legacy, [key]: value };
    assert.throws(
      () => f.sqlite.prepare(`INSERT OR REPLACE INTO order_policy_acceptances
        (id,order_id,policy_version,terms_snapshot_json,acceptance_method,request_id,accepted_at)
        VALUES (?,?,'changed','{}','affirmative_checkbox',?,1)`)
        .run(replacement.id, replacement.order_id, replacement.request_id),
      immutable,
      key,
    );
    assert.throws(
      () => f.sqlite.prepare(`UPDATE OR REPLACE order_policy_acceptances SET ${key}=? WHERE id=?`)
        .run(value, legacy.id),
      immutable,
      key,
    );
  }
  assert.deepEqual(readAll(), before);

  // Rehearse adding the triggers over populated 0162 in the in-memory checkout fixture.
  // A separate fictional actor lets their foreign-key deletion succeed without touching the buyer.
  f.sqlite.exec(dropPricedAcceptanceTriggers);
  f.sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at)
    VALUES ('pricing-acceptance-actor','pricing-actor@local.hastabazaar.test','Fixture actor','active',1,1)`);
  f.sqlite.prepare("UPDATE order_policy_acceptances SET actor_user_id='pricing-acceptance-actor' WHERE order_id=?").run(orderId);
  const beforeMigration = readAll();
  const migration = new URL('../drizzle/0163_priced_order_acceptance_lock.sql', import.meta.url);
  f.sqlite.exec(await readFile(migration, 'utf8'));
  assert.deepEqual(readAll(), beforeMigration);
  f.sqlite.exec("DELETE FROM users WHERE id='pricing-acceptance-actor'");
  assert.deepEqual({ ...acceptance() }, { ...original, actor_user_id: null });

  assert.equal(
    f.sqlite.prepare("UPDATE order_policy_acceptances SET terms_snapshot_json='legacy-terms' WHERE id=?").run(legacy.id).changes,
    1,
  );
  assert.equal(
    f.sqlite.prepare('DELETE FROM order_policy_acceptances WHERE id=?').run(legacy.id).changes,
    1,
  );
}

void test('default-off checkout preserves the published selling price without pricing snapshot storage', async () => {
  const f = await publicCheckoutFixture();
  try {
    f.sqlite.exec(`${dropPricedAcceptanceTriggers} DROP TABLE order_item_pricing_snapshots;`);
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT name FROM sqlite_schema WHERE name='order_item_pricing_snapshots'",
        )
        .get(),
      undefined,
    );
    assert.equal(
      (await getPublishedProductBySlug(f.db, f.slug))?.pricePaisa,
      80_000,
    );
    assert.equal(f.cart.items[0].pricePaisa, 80_000);
    assert.equal(f.cart.items[0].selectedOffer?.pricingRuleVersion, undefined);
    assert.equal(f.body.reviewedQuote.lines[0].pricePaisa, 80_000);

    const placed = await placeOrder(f, f.body.reviewedQuote);
    assert.equal(placed.grandTotalPaisa, 95_000);
    const receipt = await getOrderReceipt(
      f.db,
      placed.orderNumber,
      null,
      'customer',
    );
    assert.ok(receipt);
    assert.equal(receipt.items[0].unitPricePaisa, 80_000);
    assert.equal(receipt.grandTotalPaisa, 95_000);
    const document = await getOrderDocument(
      f.db,
      placed.orderNumber,
      receipt.documents[0].id,
      null,
      'customer',
    );
    assert.equal(document?.snapshot.items[0].unitPricePaisa, 80_000);
  } finally {
    f.dispose();
  }
});

void test('an adjusted variant requires a new quote and retains its original acceptance, coupon, tender and commission after changes', async () => {
  const f = await publicCheckoutFixture();
  try {
    const approved = await approveMediumPrice(f, f.approved, '400');
    const originalCart = await refreshCartChoice(
      f,
      'pricing-review-base-amount',
      2,
      40_000,
    );
    const originalQuote = reviewedCartQuote(f, originalCart);
    assert.equal(originalQuote.payablePaisa, 95_000);
    assert.equal(
      await countPublishedProducts(f.db, { minimumPricePaisa: 45_000 }),
      0,
    );
    const commissionProof = await acceptStandardCommission(f);
    const pauseCampaign = await publishPlatformPromo(f);
    await seedShoppingCredit(f);

    Object.assign(f.db, { [VARIANT_PRICING_CAPABILITY]: true });
    const offerSet = await getPublicOfferSet(f.db, f.productId);
    assert.ok(offerSet);
    const medium = offerSet.offers.find((row) => row.id === 'medium');
    assert.equal(medium?.pricePaisa, 48_000);
    assert.equal(medium?.pricingRuleVersion, VARIANT_PRICING_RULE_VERSION);
    assert.equal(
      (await getPublishedProductBySlug(f.db, f.slug))?.pricePaisa,
      48_000,
    );
    assert.equal(
      await countPublishedProducts(f.db, { minimumPricePaisa: 45_000 }),
      1,
    );

    const staleCart = await getCart(f.db, f.cartHash);
    assert.equal(staleCart.hasUnavailableItems, true);
    assert.equal(staleCart.items[0].pricePaisa, 40_000);
    assert.equal(staleCart.items[0].currentChoice?.pricePaisa, 48_000);
    await assert.rejects(
      () => placeOrder(f, originalQuote),
      ReviewedCheckoutChangedError,
    );
    const cart = await refreshCartChoice(
      f,
      'pricing-review-adjusted-amount',
      2,
      48_000,
    );
    assert.equal(cart.itemSubtotalPaisa, 96_000);
    const pricingRuleVersion = cart.items[0].selectedOffer?.pricingRuleVersion;
    assert.equal(pricingRuleVersion, VARIANT_PRICING_RULE_VERSION);
    await assert.rejects(
      () => placeOrder(f, originalQuote),
      ReviewedCheckoutChangedError,
    );

    const promo = await quoteCheckoutPromo(
      f.db,
      'customer',
      f.cartHash,
      'FIXPRICE',
      Date.now(),
      'customer',
    );
    assert.equal(promo.discountPaisa, 20_000);
    const tender = { promoPaisa: promo.discountPaisa, walletPaisa: 2_000 };
    const quoteWithoutPricingRule = reviewedCartQuote(f, cart, tender);
    await assert.rejects(
      () => placeOrder(f, quoteWithoutPricingRule, promo),
      ReviewedCheckoutChangedError,
    );
    const quote = reviewedCartQuote(f, cart, {
      ...tender,
      pricingRuleVersion,
    });
    const database = withCheckoutAcceptanceTerms(f.db, (terms) => ({
      ...terms,
      reviewedQuote: {
        ...quote,
        lines: quote.lines.map((line) => ({ ...line, pricePaisa: line.pricePaisa - 1 })),
      },
    }));
    await assert.rejects(
      () => placeOrder({ ...f, db: database }, quote, promo),
      /priced_order_acceptance_mismatch/,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM orders WHERE id<>'legacy-order'",
        )
        .get()?.count,
      0,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS count FROM order_policy_acceptances').get()?.count,
      0,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS count FROM payments').get()?.count,
      0,
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) AS count FROM order_item_pricing_snapshots')
        .get()?.count,
      0,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS count FROM promo_redemptions').get()
        ?.count,
      0,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT balance_paisa FROM wallet_accounts WHERE user_id='customer'",
        )
        .get()?.balance_paisa,
      2_000,
    );
    assert.equal((await getOfferStock(f.db, 'medium'))?.reserved, 0);

    assert.equal(quote.payablePaisa, 89_000);
    const placed = await placeOrder(f, quote, promo);
    assert.equal(placed.grandTotalPaisa, 89_000);
    assert.equal((await getOfferStock(f.db, 'medium'))?.reserved, 2);

    const order = f.sqlite
      .prepare('SELECT id FROM orders WHERE order_number=?')
      .get(placed.orderNumber);
    assert.equal(typeof order?.id, 'string');
    const orderId = String(order!.id);
    const saved = await readOrderItemPricingSnapshots(f.db, orderId);
    assert.equal(saved.length, 1);
    const [{ orderItemId, snapshot }] = saved;
    const { commission, ...pricing } = snapshot;
    assert.deepEqual(pricing, {
      offerId: 'medium',
      offerVersionId: offerSet.versionId,
      publicVersionId: offerSet.publicVersionId,
      ruleVersion: VARIANT_PRICING_RULE_VERSION,
      quantity: 2,
      sellerBasePaisa: 40_000,
      returnEligible: true,
      additionPaisa: 8_000,
      customerUnitPaisa: 48_000,
      discounts: {
        sellerFundedPaisa: 0,
        platformPromoPaisa: 20_000,
        platformReferralPaisa: 0,
        promoCampaignId: promo.campaignId,
        promoVersion: promo.revision,
      },
      taxPaisa: 0,
      customerSubtotalPaisa: 96_000,
      customerTotalPaisa: 76_000,
      creditAppliedPaisa: 2_000,
      cashPayablePaisa: 74_000,
    });
    assert.equal(commission.kind, 'registered');
    assert.equal(commission.bps, 1_200);
    assert.equal(commission.basePaisa, 80_000);
    assert.equal(commission.amountPaisa, 9_600);
    assert.equal(commission.settingVersionId, commissionProof.settingVersionId);
    assert.equal(commission.agreementVersion, commissionProof.agreementVersion);
    assert.equal(commission.acceptanceId, commissionProof.acceptanceId);

    const item = f.sqlite
      .prepare(`SELECT unit_price_paisa AS unit, line_total_paisa AS total,
      commission_rule_version AS rule, commission_paisa AS commission FROM order_items WHERE id=?`)
      .get(orderItemId);
    assert.ok(item);
    assert.equal(item.unit, 40_000);
    assert.equal(item.total, 80_000);
    assert.equal(item.commission, 9_600);
    assert.equal(item.rule, commission.ruleVersion);
    assert.throws(
      () =>
        f.sqlite
          .prepare(
            'UPDATE order_item_pricing_snapshots SET snapshot_json=snapshot_json WHERE order_item_id=?',
          )
          .run(orderItemId),
      /order_item_pricing_immutable/,
    );

    Object.assign(f.db, { [VARIANT_PRICING_CAPABILITY]: false });
    await assertOriginalAcceptanceIsRetained(f, orderId);
    await approveMediumPrice(f, approved, '475');
    assert.equal(
      (await getPublishedProductBySlug(f.db, f.slug))?.pricePaisa,
      47_500,
    );
    assert.equal((await pauseCampaign()).paused, true);
    const later = Date.now();
    publishFixtureRate(f, 3, 1_400, later);
    assert.equal((await getCommissionSetting(f.db, later)).basisPoints, 1_400);

    assert.deepEqual(await readOrderItemPricingSnapshots(f.db, orderId), saved);
    const receipt = await getOrderReceipt(
      f.db,
      placed.orderNumber,
      null,
      'customer',
    );
    assert.ok(receipt);
    assert.equal(receipt.items[0].unitPricePaisa, 48_000);
    assert.equal(receipt.items[0].lineTotalPaisa, 96_000);
    assert.equal(receipt.itemSubtotalPaisa, 96_000);
    assert.equal(receipt.promoDiscountPaisa, 20_000);
    assert.equal(receipt.walletCreditPaisa, 2_000);
    assert.equal(receipt.grandTotalPaisa, 89_000);
    const seller = await getSellerOrderDetail(f.db, orderId, 'registered');
    assert.ok(seller);
    assert.equal(seller.items[0].unitPricePaisa, 40_000);
    assert.equal(seller.items[0].lineTotalPaisa, 80_000);
    assert.equal(seller.items[0].commissionPaisa, 9_600);
    const document = await getOrderDocument(
      f.db,
      placed.orderNumber,
      receipt.documents[0].id,
      null,
      'customer',
    );
    assert.ok(document);
    assert.equal(document.snapshot.items[0].unitPricePaisa, 48_000);
    assert.equal(document.snapshot.items[0].lineTotalPaisa, 96_000);
    assert.equal(document.snapshot.itemSubtotalPaisa, 96_000);
    assert.equal(document.snapshot.promoDiscountPaisa, 20_000);
    assert.equal(document.snapshot.walletCreditPaisa, 2_000);
    assert.equal(document.snapshot.grandTotalPaisa, 89_000);
  } finally {
    f.dispose();
  }
});
