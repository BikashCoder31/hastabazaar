import assert from 'node:assert/strict';
import test from 'node:test';
import { historicalCommissionDatabase } from './helpers/commission-database';
import { seedCheckoutBuyer,readyCheckoutSeller } from './helpers/checkout-contact';
import { createCodOrder } from '../lib/db/repositories/orders';
import { getCheckoutPolicyContext } from '../lib/checkout/policy-context';
import { getPlatformServiceFee } from '../lib/db/repositories/platform-service-fee';

const reviewed = {
  lines: [
    { id: 'line-a', sellerId: 'seller-a', pricePaisa: 100_000, quantity: 1 },
  ],
  deliveryPaisa: 15_000,
  walletPaisa: 0,
  referralPaisa: 5_000,
  promoPaisa: 0,
  payablePaisa: 110_000,
  policyContext: 'a'.repeat(64),
  referralCampaign: {
    enabled: 1,
    friendDiscountPaisa: 5_000,
    rewardPaisa: 2_000,
    minimumSubtotalPaisa: 50_000,
    returnWindowDays: 7,
  },
};

void test('checkout rejects a changed reviewed price, quantity, discount, wallet split, or policy', async () => {
  const { assertReviewedCheckoutQuote } =
    await import('../lib/checkout/reviewed-quote');
  assert.doesNotThrow(() => assertReviewedCheckoutQuote(reviewed, reviewed));
  for (const changed of [
    {
      ...reviewed,
      lines: [{ ...reviewed.lines[0], pricePaisa: 120_000 }],
      payablePaisa: 130_000,
    },
    {
      ...reviewed,
      lines: [{ ...reviewed.lines[0], quantity: 2 }],
      payablePaisa: 210_000,
    },
    { ...reviewed, referralPaisa: 2_500, payablePaisa: 112_500 },
    { ...reviewed, walletPaisa: 1_000, payablePaisa: 109_000 },
    { ...reviewed, policyContext: 'b'.repeat(64) },
    {
      ...reviewed,
      referralCampaign: { ...reviewed.referralCampaign, returnWindowDays: 14 },
    },
  ])
    assert.throws(
      () => assertReviewedCheckoutQuote(reviewed, changed),
      /review/i,
    );
});

void test('reviewed quote refuses malformed, incomplete and unsafe amounts', async () => {
  const { parseReviewedCheckoutQuote } =
    await import('../lib/checkout/reviewed-quote');
  for (const value of [
    null,
    {},
    { ...reviewed, payablePaisa: -1 },
    { ...reviewed, lines: [{ ...reviewed.lines[0], quantity: 0 }] },
    { ...reviewed, payablePaisa: 99 },
    { ...reviewed, policyContext: 'unversioned' },
    { ...reviewed, lines: [reviewed.lines[0], reviewed.lines[0]] },
  ])
    assert.throws(() => parseReviewedCheckoutQuote(value), /review/i);
  assert.deepEqual(parseReviewedCheckoutQuote(reviewed), reviewed);
});

void test('reviewed quote detects a pricing rule change at the same selected offer price', async () => {
  const { assertReviewedCheckoutQuote, parseReviewedCheckoutQuote } =
    await import('../lib/checkout/reviewed-quote');
  const line = {
    ...reviewed.lines[0],
    offerId: 'offer-a',
    offerVersionId: 'offer-version-a',
    publicVersionId: 'listing-version-a',
    revision: 1,
  };
  const previous = { ...reviewed, lines: [line] };
  const priced = {
    ...reviewed,
    lines: [{ ...line, pricingRuleVersion: 'variant-price-addition-v1' }],
  };

  assert.deepEqual(parseReviewedCheckoutQuote(priced), priced);
  assert.equal(JSON.stringify(parseReviewedCheckoutQuote(previous)), JSON.stringify(previous));
  assert.throws(() => assertReviewedCheckoutQuote(previous, priced), /review/i);
  assert.throws(() => assertReviewedCheckoutQuote(priced, previous), /review/i);
  assert.throws(() => parseReviewedCheckoutQuote({
    ...priced,
    lines: [{ ...priced.lines[0], publicVersionId: null }],
  }), /review/i);
});

const waivedCustomerFee = {
  enabled: true, amountPaisa: 1000, chargedPaisa: 0, versionId: 'fee-v1',
  rule: 'non_refundable_except_law_v1', schemaVersion: 2, standardPaisa: 1000,
  waivedPaisa: 1000, campaign: { id: 'customer-launch', revision: 3, name: 'Customer launch waiver' },
};

void test('reviewed customer fee totals use the charged amount and retain full waiver evidence', async () => {
  const { parseReviewedCheckoutQuote } = await import('../lib/checkout/reviewed-quote');
  const waived = { ...reviewed, serviceFee: waivedCustomerFee };
  assert.deepEqual(parseReviewedCheckoutQuote(waived), waived);
  const ordinary = {
    ...reviewed,
    serviceFee: { ...waivedCustomerFee, chargedPaisa: 1000, waivedPaisa: 0, campaign: null },
    payablePaisa: 111_000,
  };
  assert.deepEqual(parseReviewedCheckoutQuote(ordinary), ordinary);
  assert.throws(() => parseReviewedCheckoutQuote({ ...waived, payablePaisa: 111_000 }), /review/i);
  assert.throws(() => parseReviewedCheckoutQuote({ ...ordinary, payablePaisa: 110_000 }), /review/i);
});

void test('reviewed checkout rejects changed campaign attribution even when the charge remains zero', async () => {
  const { assertReviewedCheckoutQuote } = await import('../lib/checkout/reviewed-quote');
  const quote = { ...reviewed, serviceFee: waivedCustomerFee };
  assert.doesNotThrow(() => assertReviewedCheckoutQuote(quote, quote));
  for (const attribution of [
    { id: 'replacement-campaign' }, { revision: 4 }, { name: 'Revised customer waiver' },
  ]) assert.throws(() => assertReviewedCheckoutQuote(quote, {
    ...quote,
    serviceFee: { ...waivedCustomerFee, campaign: { ...waivedCustomerFee.campaign, ...attribution } },
  }), /review/i);
  for (const serviceFee of [
    { ...waivedCustomerFee, versionId: 'fee-v2' },
    { ...waivedCustomerFee, amountPaisa: 1500, standardPaisa: 1500, waivedPaisa: 1500 },
    { ...waivedCustomerFee, enabled: false, standardPaisa: 0, waivedPaisa: 0, campaign: null },
  ]) assert.throws(() => assertReviewedCheckoutQuote(quote, { ...quote, serviceFee }), /review/i);
});

void test('reviewed waived fees still compare the full cart, discounts, delivery and policy context', async () => {
  const { assertReviewedCheckoutQuote } = await import('../lib/checkout/reviewed-quote');
  const quote = { ...reviewed, serviceFee: waivedCustomerFee };
  for (const changed of [
    { ...quote, lines: [{ ...quote.lines[0], pricePaisa: 120_000 }], payablePaisa: 130_000 },
    { ...quote, lines: [{ ...quote.lines[0], quantity: 2 }], payablePaisa: 210_000 },
    { ...quote, lines: [{ ...quote.lines[0], sellerId: 'replacement-seller' }] },
    { ...quote, deliveryPaisa: 16_000, payablePaisa: 111_000 },
    { ...quote, walletPaisa: 1000, payablePaisa: 109_000 },
    { ...quote, referralPaisa: 2500, payablePaisa: 112_500 },
    { ...quote, promoPaisa: 1000, payablePaisa: 109_000 },
    { ...quote, policyContext: 'b'.repeat(64) },
    { ...quote, referralCampaign: { ...reviewed.referralCampaign, rewardPaisa: 3000 } },
  ]) assert.throws(() => assertReviewedCheckoutQuote(quote, changed), /review/i);
});

async function fixture() {
  const f = await historicalCommissionDatabase(false);
  await readyCheckoutSeller(f,'seller-a','user-a','owner');
  await seedCheckoutBuyer(f.database);
  await f.database.batch([
    f.database.prepare(
      "INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','craft','Craft',1,1,1,1)",
    ),
    f.database.prepare(
      "INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES ('product','seller-a','cat','craft','SKU','Craft','Fictional craft',100000,10,'Maker','NP','Wood','published',1,1)",
    ),
    f.database.prepare(
      "INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES ('cart','token','NPR',1,1)",
    ),
    f.database.prepare(
      "INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('line-a','cart','product',1,1,1)",
    ),
    f.database
      .prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('checkout-v1','commerce.checkout',1,1,'published','{"formId":"commerce.checkout","fields":[]}','Fictional','owner',1,'owner',1,'owner',1,'checkout-seed')`),
  ]);
  const input = {
    customerAuthSubject: 'checkout-buyer',
    customerEmail: 'buyer@example.test',
    customerPhone: '9811111111',
    locale: 'en-NP' as const,
    termsAccepted: true,
    idempotencyKey: crypto.randomUUID(),
    address: {
      recipientName: 'Fictional Buyer',
      phone: '9811111111',
      province: 'Bagmati',
      district: 'Kathmandu',
      municipality: 'Kathmandu',
      locality: 'Ward 1',
    },
    reviewedQuote: {
      ...reviewed,
      serviceFee: await getPlatformServiceFee(f.database, 100),
      referralPaisa: 0,
      payablePaisa: 115_000,
      referralCampaign: null,
      policyContext: await getCheckoutPolicyContext(),
    },
  };
  const form = {
    versionId: 'checkout-v1',
    answers: { formId: 'commerce.checkout' as const, version: 1, answers: [] },
  };
  return { ...f, input, form };
}

async function tableSnapshot(database: D1Database) {
  const tables = await database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all<{ name: string }>();
  const snapshot: Record<string, string[]> = {};
  for (const { name } of tables.results) {
    const rows = await database
      .prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
      .all();
    snapshot[name] = rows.results.map((row) => JSON.stringify(row)).sort();
  }
  return snapshot;
}

void test('real order rejects stale prices before creating order, wallet or ledger records', async () => {
  const f = await fixture();
  try {
    await f.database
      .prepare("UPDATE products SET price_paisa=120000 WHERE id='product'")
      .run();
    const before = await tableSnapshot(f.database);
    await assert.rejects(
      createCodOrder(
        f.database,
        'token',
        'receipt',
        f.input,
        1800000000000,
        'checkout-buyer',
        f.form,
      ),
      /review/i,
    );
    assert.equal(
      (
        await f.database
          .prepare('SELECT COUNT(*) AS n FROM orders')
          .first<{ n: number }>()
      )?.n,
      0,
    );
    assert.equal(
      (
        await f.database
          .prepare('SELECT COUNT(*) AS n FROM wallet_accounts')
          .first<{ n: number }>()
      )?.n,
      0,
    );
    assert.deepEqual(await tableSnapshot(f.database), before);
  } finally {
    await f.dispose();
  }
});

void test('real order preserves its original reviewed quote on identical replay after price changes', async () => {
  const f = await fixture();
  try {
    const placed = await createCodOrder(
      f.database,
      'token',
      'receipt',
      f.input,
      1800000000000,
      'checkout-buyer',
      f.form,
    );
    assert.equal(placed.grandTotalPaisa, 115_000);
    await f.database
      .prepare("UPDATE products SET price_paisa=120000 WHERE id='product'")
      .run();
    assert.deepEqual(
      await createCodOrder(
        f.database,
        'token',
        'receipt',
        f.input,
        1800000000100,
        'checkout-buyer',
        f.form,
      ),
      placed,
    );
  } finally {
    await f.dispose();
  }
});

void test('real form-backed order rejects stale policy consent without side effects', async () => {
  const f = await fixture();
  try {
    const before = await tableSnapshot(f.database);
    await assert.rejects(
      createCodOrder(
        f.database,
        'token',
        'receipt',
        {
          ...f.input,
          reviewedQuote: {
            ...f.input.reviewedQuote,
            policyContext: 'b'.repeat(64),
          },
        },
        1800000000000,
        'checkout-buyer',
        f.form,
      ),
      /review/i,
    );
    assert.deepEqual(await tableSnapshot(f.database), before);
  } finally {
    await f.dispose();
  }
});

for (const mutation of [
  "UPDATE products SET price_paisa=120000 WHERE id='product'",
  "UPDATE cart_items SET quantity=2 WHERE id='line-a'",
  "DELETE FROM cart_items WHERE id='line-a'",
]) {
  void test(
    'real checkout rolls back a commit-time cart mutation: ' + mutation,
    async () => {
      const f = await fixture();
      try {
        const batch = f.database.batch.bind(f.database);
        let raced = false;
        f.database.batch = async (statements) => {
          if (!raced) {
            raced = true;
            await f.database.prepare(mutation).run();
          }
          return batch(statements);
        };
        await assert.rejects(
          createCodOrder(
            f.database,
            'token',
            'receipt',
            f.input,
            1800000000000,
            'checkout-buyer',
            f.form,
          ),
        );
        assert.equal(raced, true);
        for (const table of [
          'orders',
          'wallet_accounts',
          'seller_ledger_entries',
          'form_answer_sets',
        ])
          assert.equal(
            (
              await f.database
                .prepare('SELECT COUNT(*) AS n FROM ' + table)
                .first<{ n: number }>()
            )?.n,
            0,
          );
      } finally {
        await f.dispose();
      }
    },
  );
}

void test('fresh public form-backed checkout requires reviewed quote before creating records', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      createCodOrder(
        f.database,
        'token',
        'receipt',
        { ...f.input, reviewedQuote: undefined },
        1800000000000,
        'checkout-buyer',
        f.form,
      ),
      /review/i,
    );
    for (const table of [
      'orders',
      'wallet_accounts',
      'seller_ledger_entries',
    ]) {
      assert.equal(
        (
          await f.database
            .prepare('SELECT COUNT(*) AS n FROM ' + table)
            .first<{ n: number }>()
        )?.n,
        0,
      );
    }
  } finally {
    await f.dispose();
  }
});

async function referralFixture() {
  const f = await fixture();
  await seedCheckoutBuyer(
    f.database,
    'referrer',
    'referrer@example.test',
    '9822222222',
  );
  await f.database
    .prepare(
      "INSERT INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES ('referrer','ABCDEF1234567890',0,1)",
    )
    .run();
  await f.database
    .prepare(
      "UPDATE referral_campaign SET enabled=1,friend_discount_paisa=5000,reward_paisa=2000,minimum_subtotal_paisa=50000,return_window_days=7 WHERE id='default'",
    )
    .run();
  return {
    ...f,
    input: {
      ...f.input,
      referralCode: 'ABCDEF1234567890',
      reviewedQuote: {
        ...f.input.reviewedQuote,
        referralPaisa: 5_000,
        payablePaisa: 110_000,
        referralCampaign: reviewed.referralCampaign,
      },
    },
  };
}

void test('real checkout rejects a referral discount changed after customer review without new records', async () => {
  const f = await referralFixture();
  try {
    await f.database
      .prepare(
        "UPDATE referral_campaign SET friend_discount_paisa=2500 WHERE id='default'",
      )
      .run();
    const before = await tableSnapshot(f.database);
    await assert.rejects(
      createCodOrder(
        f.database,
        'token',
        'receipt',
        f.input,
        1800000000000,
        'checkout-buyer',
        f.form,
      ),
      /review/i,
    );
    assert.deepEqual(await tableSnapshot(f.database), before);
  } finally {
    await f.dispose();
  }
});

void test('referral reward or wait change at commit cannot create a mixed-terms order', async () => {
  const f = await referralFixture();
  try {
    const batch = f.database.batch.bind(f.database);
    let raced = false;
    f.database.batch = async (statements) => {
      if (!raced) {
        raced = true;
        await f.database
          .prepare(
            "UPDATE referral_campaign SET reward_paisa=3000,return_window_days=14 WHERE id='default'",
          )
          .run();
      }
      return batch(statements);
    };
    await assert.rejects(
      createCodOrder(
        f.database,
        'token',
        'receipt',
        f.input,
        1800000000000,
        'checkout-buyer',
        f.form,
      ),
    );
    assert.equal(raced, true);
    for (const table of [
      'orders',
      'referral_redemptions',
      'form_answer_sets',
      'wallet_entries',
    ])
      assert.equal(
        (
          await f.database
            .prepare('SELECT COUNT(*) AS n FROM ' + table)
            .first<{ n: number }>()
        )?.n,
        0,
      );
    assert.equal(
      (
        await f.database
          .prepare('SELECT COUNT(*) AS n FROM wallet_accounts')
          .first<{ n: number }>()
      )?.n,
      1,
    );
  } finally {
    await f.dispose();
  }
});

void test('actual checkout stores saved settlement hold and version without adding a reserve', async () => {
  const f = await fixture();
  try {
    await f.database
      .prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES ('hold14','seller_delivery_hold_days',1,'14','published',1,'controlled',1,'Fictional approved hold','owner',1,'hold14')`)
      .run();
    await createCodOrder(
      f.database,
      'token',
      'receipt',
      f.input,
      1800000000000,
      'checkout-buyer',
      f.form,
    );
    const record = await f.database
      .prepare(
        'SELECT terms_snapshot_json AS snapshot FROM order_policy_acceptances',
      )
      .first<{ snapshot: string }>();
    const snapshot = JSON.parse(record!.snapshot);
    assert.equal(snapshot.registeredSettlementTerms.deliveryHoldDays, 14);
    assert.equal(
      snapshot.registeredSettlementTerms.holdSettingVersionId,
      'hold14',
    );
    assert.equal(snapshot.registeredSettlementTerms.reserveBps, 0);
    assert.deepEqual(snapshot.reviewedQuote, f.input.reviewedQuote);
  } finally {
    await f.dispose();
  }
});

void test('settlement publication between quote and commit rolls back the new order', async () => {
  const f = await fixture();
  try {
    const batch = f.database.batch.bind(f.database);
    let raced = false;
    f.database.batch = async (statements) => {
      if (!raced) {
        raced = true;
        await f.database
          .prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
          VALUES ('hold14','seller_delivery_hold_days',1,'14','published',1,'controlled',1,'Fictional approved hold','owner',1,'hold14')`)
          .run();
      }
      return batch(statements);
    };
    await assert.rejects(
      createCodOrder(
        f.database,
        'token',
        'receipt',
        f.input,
        1800000000000,
        'checkout-buyer',
        f.form,
      ),
    );
    assert.equal(raced, true);
    for (const table of [
      'orders',
      'order_policy_acceptances',
      'wallet_accounts',
      'form_answer_sets',
    ])
      assert.equal(
        (
          await f.database
            .prepare('SELECT COUNT(*) AS n FROM ' + table)
            .first<{ n: number }>()
        )?.n,
        0,
      );
  } finally {
    await f.dispose();
  }
});
