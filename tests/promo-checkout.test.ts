import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIncentiveDb,
  seedIncentiveCustomer,
  seedIncentiveInventory,
} from './helpers/incentive-db';
import { createCodOrder } from '../lib/db/repositories/orders';
import {
  savePromoDraft,
  publishPromo,
} from '../lib/db/repositories/promo-codes';
import { quoteOrderCredit } from '../lib/db/repositories/wallet';
import {
  parseCheckoutInput,
  type CheckoutInput,
} from '../lib/checkout/validation';
import { quoteCheckoutPromo } from '../lib/incentives/quote-intent';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';

export function checkoutInput(): CheckoutInput {
  return {
    customerEmail: 'customer@example.test',
    customerPhone: '9811111111',
    locale: 'en-NP',
    termsAccepted: true,
    idempotencyKey: crypto.randomUUID(),
    address: {
      recipientName: 'Fixture Buyer',
      phone: '9811111111',
      province: 'Bagmati',
      district: 'Kathmandu',
      municipality: 'Kathmandu',
      locality: 'Fixture locality',
    },
  };
}
export async function fixture() {
  const f = await createIncentiveDb();
  await seedIncentiveCustomer(f.db);
  await seedIncentiveCustomer(f.db, 'super');
  await seedIncentiveInventory(f.db);
  await f.db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
    )
    .run();
  await f.db
    .prepare(
      "UPDATE seller_profiles SET seller_agreement_version=? WHERE id='seller'",
    )
    .bind(SELLER_AGREEMENT_VERSION)
    .run();
  for (const id of [
    'staff.promo-code',
    'commerce.checkout',
    'commerce.promo-quote',
  ])
    await f.db
      .prepare(
        `INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?,?,1,1,'published',?,'Fixture','super',1,'super',1,'super',1,?)`,
      )
      .bind(
        id + '-v1',
        id,
        JSON.stringify({ formId: id, fields: [] }),
        id + '-seed',
      )
      .run();
  // Existing delivery rate configuration is immutable: publish a complete fictional rate version.
  await f.db
    .prepare(
      "INSERT INTO delivery_rate_versions(id,config_json,created_by,reason,created_at) VALUES ('fixture-rates',?,'super','Fictional delivery',1)",
    )
    .bind(
      JSON.stringify({
        zones: { valley: 500, terai: 500, nationwide: 500 },
        districts: {},
      }),
    )
    .run();
  await f.db
    .prepare(
      "UPDATE delivery_rate_current SET version_id='fixture-rates' WHERE id='default'",
    )
    .run();
  const context = {
    actorId: 'super',
    requestId: 'draft',
    expectedVersion: 0,
    now: 100,
    reason: 'Fictional approved campaign',
    form: {
      formId: 'staff.promo-code' as const,
      versionId: 'staff.promo-code-v1',
      answers: { formId: 'staff.promo-code' as const, version: 1, answers: [] },
    },
  };
  const draft = await savePromoDraft(f.db, context, {
    code: 'SAVE10',
    label: 'Save ten',
    kind: 'fixed',
    fixedPaisa: 1000,
    minimumSubtotalPaisa: 0,
    startsAt: 0,
    endsAt: 100000,
    totalUseLimit: 20,
    perCustomerUseLimit: 3,
    budgetPaisa: 20000,
  });
  await publishPromo(
    f.db,
    { ...context, requestId: 'publish', expectedVersion: 1 },
    draft.campaignId,
  );
  return { ...f, campaignId: draft.campaignId };
}
export async function cart(db: D1Database, token = 'cart') {
  await db
    .prepare(
      "INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES (?,?,'NPR',1000000,1,1)",
    )
    .bind(token, token)
    .run();
  await db
    .prepare(
      "INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,?,'product',1,1,1)",
    )
    .bind(token + '-item', token)
    .run();
}
void test('checkout requires paired protected promo metadata and rejects mixed referral input', () => {
  assert.equal(
    parseCheckoutInput({ ...checkoutInput(), promoCode: 'SAVE10' }).value,
    undefined,
  );
  assert.equal(
    parseCheckoutInput({
      ...checkoutInput(),
      promoCode: 'SAVE10',
      promoRevision: 1,
      promoQuoteIntent: 'a'.repeat(64),
      referralCode: 'A'.repeat(16),
    }).value,
    undefined,
  );
});
void test('wallet caps spending at merchandise less promo and rejects mixing referral', async () => {
  const f = await fixture();
  try {
    const guest = {
      userId: null,
      subtotalPaisa: 10000,
      phone: '9811111111',
      now: 100,
    };
    await assert.rejects(
      quoteOrderCredit(f.db, {
        ...guest,
        merchandiseDiscountPaisa: 1000,
      } as never),
    );
    await assert.rejects(
      quoteOrderCredit(f.db, {
        ...guest,
        userId: 'customer',
        referralCode: 'A'.repeat(16),
        merchandiseDiscountPaisa: 1000,
      } as never),
    );
  } finally {
    await f.dispose();
  }
});
void test('promo and wallet cover merchandise without changing seller gross', async () => {
  const f = await fixture();
  try {
    await cart(f.db);
    // Gift-card credit preserves the existing real source and balance triggers.
    await f.db
      .prepare(
        "INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('gift','hash',2000,'super','gift',1,'customer',1,'redeem')",
      )
      .run();
    await f.db
      .prepare(
        "INSERT INTO wallet_entries(id,user_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('gift-credit','customer','gift',2000,-2000,'gift_card',1)",
      )
      .run();
    const q = await quoteCheckoutPromo(f.db, 'customer', 'cart', 'SAVE10', 100);
    const input = {
      ...checkoutInput(),
      useWallet: true,
      deliveryRateVersion: 'fixture-rates',
      customerAuthSubject: 'customer',
      promoCode: q.code,
      promoRevision: q.revision,
      promoQuoteIntent: q.quoteIntent,
    };
    const result = await createCodOrder(
      f.db,
      'cart',
      'receipt',
      input,
      100,
      'customer',
      {
        versionId: 'commerce.checkout-v1',
        answers: { formId: 'commerce.checkout', version: 1, answers: [] },
      },
    );
    assert.equal(result.grandTotalPaisa, 7500);
    const order = await f.db
      .prepare(
        'SELECT promo_discount_paisa,referral_discount_paisa FROM orders',
      )
      .first();
    assert.equal(order?.promo_discount_paisa, 1000);
    assert.equal(order?.referral_discount_paisa, 0);
    const gross = await f.db
      .prepare(
        'SELECT SUM(line_total_paisa) AS sellerGrossPaisa FROM order_items',
      )
      .first();
    assert.equal(gross?.sellerGrossPaisa, 10000);
    const redemptions = await f.db
      .prepare('SELECT * FROM promo_redemptions')
      .all();
    assert.equal(redemptions.results.length, 1);
  } finally {
    await f.dispose();
  }
});

void test('stale promo price and commit-time price or authority changes reject without any order', async () => {
  const f = await fixture();
  try {
    await cart(f.db);
    const q = await quoteCheckoutPromo(f.db, 'customer', 'cart', 'SAVE10', 100);
    const input = {
      ...checkoutInput(),
      deliveryRateVersion: 'fixture-rates',
      customerAuthSubject: 'customer',
      promoCode: q.code,
      promoRevision: q.revision,
      promoQuoteIntent: q.quoteIntent,
    };
    await f.db
      .prepare("UPDATE products SET price_paisa=11000 WHERE id='product'")
      .run();
    await assert.rejects(
      createCodOrder(f.db, 'cart', 'receipt', input, 100, 'customer'),
    );
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM orders')
          .first<{ n: number }>()
      )?.n,
      0,
    );
  } finally {
    await f.dispose();
  }
});
void test('concurrent last-use, per-customer and final-budget batches allow only valid winners', async () => {
  const f = await fixture();
  try {
    let successes = 0;
    for (const [code, totalUseLimit, perCustomerUseLimit, budgetPaisa] of [
      ['LASTUSE', 1, 1, 20000],
      ['LASTUSER', 20, 1, 20000],
      ['LASTBUDGET', 20, 3, 1000],
    ] as const) {
      const context = {
        actorId: 'super',
        requestId: code + '-draft',
        expectedVersion: 0,
        now: 100,
        reason: 'Finite fictional race limit',
        form: {
          formId: 'staff.promo-code' as const,
          versionId: 'staff.promo-code-v1',
          answers: {
            formId: 'staff.promo-code' as const,
            version: 1,
            answers: [],
          },
        },
      };
      const d = await savePromoDraft(f.db, context, {
        code,
        label: 'Save ten',
        kind: 'fixed',
        fixedPaisa: 1000,
        minimumSubtotalPaisa: 0,
        startsAt: 0,
        endsAt: 100000,
        totalUseLimit,
        perCustomerUseLimit,
        budgetPaisa,
      });
      await publishPromo(
        f.db,
        { ...context, requestId: code + '-pub', expectedVersion: 1 },
        d.campaignId,
      );
      const tokens = [code + '-one', code + '-two'];
      for (const token of tokens) await cart(f.db, token);
      const quotes = await Promise.all(
        tokens.map((token) =>
          quoteCheckoutPromo(f.db, 'customer', token, code, 100),
        ),
      );
      let arrived = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const db = {
        prepare: f.db.prepare.bind(f.db),
        batch: async (statements: D1PreparedStatement[]) => {
          if (++arrived === 2) release();
          await gate;
          return f.db.batch(statements);
        },
      } as D1Database;
      const results = await Promise.allSettled(
        tokens.map((token, i) =>
          createCodOrder(
            db,
            token,
            token,
            {
              ...checkoutInput(),
              deliveryRateVersion: 'fixture-rates',
              customerAuthSubject: 'customer',
              promoCode: code,
              promoRevision: quotes[i].revision,
              promoQuoteIntent: quotes[i].quoteIntent,
            },
            100,
            'customer',
          ),
        ),
      );
      assert.equal(arrived, 2);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      successes++;
      const counter = await f.db
        .prepare(
          'SELECT used_count,spent_paisa FROM promo_campaigns WHERE id=?',
        )
        .bind(d.campaignId)
        .first<{ used_count: number; spent_paisa: number }>();
      assert.equal(counter?.used_count, 1);
      assert.equal(counter?.spent_paisa, 1000);
    }
    for (const table of ['orders', 'promo_redemptions'])
      assert.equal(
        (
          await f.db
            .prepare(`SELECT COUNT(*) n FROM ${table}`)
            .first<{ n: number }>()
        )?.n,
        successes,
      );
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT inventory_quantity n FROM products WHERE id='product'",
          )
          .first<{ n: number }>()
      )?.n,
      100 - successes,
    );
  } finally {
    await f.dispose();
  }
});

void test('failed promo batch leaves no wallet provisioning or order/redemption/form writes', async () => {
  const f = await fixture();
  try {
    await cart(f.db);
    await f.db
      .prepare("DELETE FROM wallet_accounts WHERE user_id='customer'")
      .run();
    const q = await quoteCheckoutPromo(f.db, 'customer', 'cart', 'SAVE10', 100);
    const input = {
      ...checkoutInput(),
      deliveryRateVersion: 'fixture-rates',
      customerAuthSubject: 'customer',
      promoCode: q.code,
      promoRevision: q.revision,
      promoQuoteIntent: q.quoteIntent,
    };
    const before = (await f.db
      .prepare('SELECT COUNT(*) n FROM form_answer_sets')
      .first<{ n: number }>())!.n;
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) =>
        f.db.batch([
          ...statements,
          f.db.prepare(
            "INSERT INTO operation_transaction_guards(id,valid) VALUES ('forced-failure',0)",
          ),
        ]),
    } as D1Database;
    await assert.rejects(
      createCodOrder(db, 'cart', 'receipt', input, 100, 'customer', {
        versionId: 'commerce.checkout-v1',
        answers: { formId: 'commerce.checkout', version: 1, answers: [] },
      }),
    );
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT COUNT(*) n FROM wallet_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      0,
    );
    for (const table of ['orders', 'promo_redemptions', 'order_items'])
      assert.equal(
        (
          await f.db
            .prepare(`SELECT COUNT(*) n FROM ${table}`)
            .first<{ n: number }>()
        )?.n,
        0,
      );
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM form_answer_sets')
          .first<{ n: number }>()
      )?.n,
      before,
    );
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT inventory_quantity n FROM products WHERE id='product'",
          )
          .first<{ n: number }>()
      )?.n,
      100,
    );
  } finally {
    await f.dispose();
  }
});

void test('ASCII promo parsing rejects Unicode case-folded aliases', () => {
  assert.equal(
    parseCheckoutInput({
      ...checkoutInput(),
      promoCode: 'saſe',
      promoRevision: 1,
      promoQuoteIntent: 'a'.repeat(64),
    }).value,
    undefined,
  );
});
void test('multi-line original and current promo allocations equal platform funded snapshots', async () => {
  const f = await fixture();
  try {
    const row = await f.db
      .prepare("SELECT * FROM products WHERE id='product'")
      .first<Record<string, string | number | null>>();
    const second = {
      ...row!,
      id: 'product2',
      slug: 'product-two',
      sku: 'FIX-TWO',
      price_paisa: 9999,
    };
    await f.db
      .prepare(
        `INSERT INTO products(${Object.keys(second).join(',')}) VALUES (${Object.keys(
          second,
        )
          .map(() => '?')
          .join(',')})`,
      )
      .bind(...Object.values(second))
      .run();
    await cart(f.db);
    await f.db
      .prepare(
        "INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('cart-item2','cart','product2',1,1,1)",
      )
      .run();
    const q = await quoteCheckoutPromo(f.db, 'customer', 'cart', 'SAVE10', 100);
    await createCodOrder(
      f.db,
      'cart',
      'receipt',
      {
        ...checkoutInput(),
        deliveryRateVersion: 'fixture-rates',
        customerAuthSubject: 'customer',
        promoCode: q.code,
        promoRevision: q.revision,
        promoQuoteIntent: q.quoteIntent,
      },
      100,
      'customer',
    );
    const lines = (
      await f.db
        .prepare(
          'SELECT promo_discount_paisa,current_promo_discount_paisa,referral_discount_paisa,platform_discount_paisa,commission_base_paisa,line_total_paisa FROM order_items',
        )
        .all<{
          promo_discount_paisa: number;
          current_promo_discount_paisa: number;
          referral_discount_paisa: number;
          platform_discount_paisa: number;
          commission_base_paisa: number;
          line_total_paisa: number;
        }>()
    ).results;
    assert.equal(
      lines.reduce((n, l) => n + l.promo_discount_paisa, 0),
      1000,
    );
    for (const line of lines) {
      assert.equal(line.platform_discount_paisa, line.promo_discount_paisa);
      assert.equal(
        line.current_promo_discount_paisa,
        line.promo_discount_paisa,
      );
      assert.equal(line.referral_discount_paisa, 0);
      assert.equal(line.commission_base_paisa, line.line_total_paisa);
    }
  } finally {
    await f.dispose();
  }
});

void test('commit-time price, seller owner, cart and customer changes abort the actual order batch', async () => {
  const f = await fixture();
  try {
    await cart(f.db);
    const seller = await f.db
      .prepare("SELECT * FROM seller_profiles WHERE id='seller'")
      .first<Record<string, string | number | null>>();
    const second = {
      ...seller!,
      id: 'seller2',
      user_id: 'super',
      registration_number: 'FIX-TWO',
      tax_registration_number: 'FIX-PAN-TWO',
    };
    await f.db
      .prepare(
        `INSERT INTO seller_profiles(${Object.keys(second).join(',')}) VALUES (${Object.keys(
          second,
        )
          .map(() => '?')
          .join(',')})`,
      )
      .bind(...Object.values(second))
      .run();
    for (const mutate of [
      "UPDATE products SET price_paisa=11000 WHERE id='product'",
      "UPDATE products SET seller_id='seller2' WHERE id='product'",
      "UPDATE cart_items SET quantity=2 WHERE cart_id='cart'",
      "DELETE FROM user_roles WHERE user_id='customer' AND role='customer'",
      "UPDATE users SET status='suspended' WHERE id='customer'",
    ]) {
      const q = await quoteCheckoutPromo(
        f.db,
        'customer',
        'cart',
        'SAVE10',
        100,
      );
      const input = {
        ...checkoutInput(),
        deliveryRateVersion: 'fixture-rates',
        customerAuthSubject: 'customer',
        promoCode: q.code,
        promoRevision: q.revision,
        promoQuoteIntent: q.quoteIntent,
      };
      let intercepted = false;
      const db = {
        prepare: f.db.prepare.bind(f.db),
        batch: async (statements: D1PreparedStatement[]) => {
          intercepted = true;
          await f.db.prepare(mutate).run();
          return f.db.batch(statements);
        },
      } as D1Database;
      await assert.rejects(
        createCodOrder(db, 'cart', 'receipt', input, 100, 'customer'),
      );
      assert.equal(intercepted, true);
      assert.equal(
        (
          await f.db
            .prepare('SELECT COUNT(*) n FROM orders')
            .first<{ n: number }>()
        )?.n,
        0,
      );
      assert.equal(
        (
          await f.db
            .prepare('SELECT COUNT(*) n FROM promo_redemptions')
            .first<{ n: number }>()
        )?.n,
        0,
      );
      await f.db
        .prepare(
          "UPDATE products SET price_paisa=10000,seller_id='seller' WHERE id='product'",
        )
        .run();
      await f.db
        .prepare("UPDATE cart_items SET quantity=1 WHERE cart_id='cart'")
        .run();
      await f.db
        .prepare("UPDATE users SET status='active' WHERE id='customer'")
        .run();
      await f.db
        .prepare(
          "INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES ('customer','customer',1)",
        )
        .run();
    }
  } finally {
    await f.dispose();
  }
});
void test('authorized exact promo replay after expiry returns original receipt and rechecks current customer authority', async () => {
  const f = await fixture();
  try {
    await cart(f.db);
    const q = await quoteCheckoutPromo(f.db, 'customer', 'cart', 'SAVE10', 100);
    const input = {
      ...checkoutInput(),
      deliveryRateVersion: 'fixture-rates',
      customerAuthSubject: 'customer',
      promoCode: q.code,
      promoRevision: q.revision,
      promoQuoteIntent: q.quoteIntent,
    };
    const form = {
      versionId: 'commerce.checkout-v1',
      answers: { formId: 'commerce.checkout', version: 1, answers: [] },
    };
    const result = await createCodOrder(
      f.db,
      'cart',
      'receipt',
      input,
      100,
      'customer',
      form,
    );
    await f.db
      .prepare(
        'UPDATE orders SET current_total_paisa=0,current_subtotal_paisa=0,current_delivery_paisa=0,current_wallet_paisa=0,current_discount_paisa=0,current_promo_discount_paisa=0 WHERE order_number=?',
      )
      .bind(result.orderNumber)
      .run();
    assert.deepEqual(
      await createCodOrder(
        f.db,
        'cart',
        'receipt',
        input,
        100001,
        'customer',
        form,
      ),
      result,
    );
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM promo_redemptions')
          .first<{ n: number }>()
      )?.n,
      1,
    );
    await assert.rejects(
      createCodOrder(
        f.db,
        'cart',
        'receipt',
        { ...input, customerPhone: '9811111112' },
        100001,
        'customer',
        form,
      ),
    );
    await assert.rejects(
      createCodOrder(
        f.db,
        'cart',
        'receipt',
        { ...input, promoQuoteIntent: 'b'.repeat(64) },
        100001,
        'customer',
        form,
      ),
    );
    await f.db
      .prepare(
        "DELETE FROM user_roles WHERE user_id='customer' AND role='customer'",
      )
      .run();
    await assert.rejects(
      createCodOrder(f.db, 'cart', 'receipt', input, 100001, 'customer', form),
    );
    await f.db
      .prepare(
        "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('customer','customer',1)",
      )
      .run();
    let intercepted = false;
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        intercepted = true;
        await f.db
          .prepare("UPDATE users SET status='suspended' WHERE id='customer'")
          .run();
        return f.db.batch(statements);
      },
    } as D1Database;
    await assert.rejects(
      createCodOrder(db, 'cart', 'receipt', input, 100001, 'customer', form),
    );
    assert.equal(intercepted, true);
    await f.db
      .prepare("UPDATE users SET status='active' WHERE id='customer'")
      .run();
    await cart(f.db, 'guest');
    await assert.rejects(
      createCodOrder(
        f.db,
        'guest',
        'guest',
        { ...input, idempotencyKey: crypto.randomUUID() },
        100,
        null,
      ),
    );
    const guest = await createCodOrder(
      f.db,
      'guest',
      'guest',
      { ...checkoutInput(), deliveryRateVersion: 'fixture-rates' },
      100,
      null,
    );
    assert.equal(guest.grandTotalPaisa, 10500);
  } finally {
    await f.dispose();
  }
});

void test('promo checkout rejects identity relink before financial batch or authorized replay', async () => {
  const f = await fixture();
  try {
    await cart(f.db);
    const q = await quoteCheckoutPromo(f.db, 'customer', 'cart', 'SAVE10', 100);
    const input = {
      ...checkoutInput(),
      deliveryRateVersion: 'fixture-rates',
      customerAuthSubject: 'customer',
      promoCode: q.code,
      promoRevision: q.revision,
      promoQuoteIntent: q.quoteIntent,
    };
    let intercepted = false;
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        intercepted = true;
        await f.db
          .prepare(
            "UPDATE users SET auth_subject='relinked' WHERE id='customer'",
          )
          .run();
        return f.db.batch(statements);
      },
    } as D1Database;
    await assert.rejects(
      createCodOrder(db, 'cart', 'receipt', input, 100, 'customer'),
    );
    assert.equal(intercepted, true);
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM orders')
          .first<{ n: number }>()
      )?.n,
      0,
    );
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM promo_redemptions')
          .first<{ n: number }>()
      )?.n,
      0,
    );
    await f.db
      .prepare("UPDATE users SET auth_subject='customer' WHERE id='customer'")
      .run();
    const result = await createCodOrder(
      f.db,
      'cart',
      'receipt',
      input,
      100,
      'customer',
    );
    await assert.rejects(
      createCodOrder(db, 'cart', 'receipt', input, 100001, 'customer'),
    );
    await f.db
      .prepare("UPDATE users SET auth_subject='customer' WHERE id='customer'")
      .run();
    assert.deepEqual(
      await createCodOrder(f.db, 'cart', 'receipt', input, 100001, 'customer'),
      result,
    );
  } finally {
    await f.dispose();
  }
});
void test('checkout rejects browser-supplied internal customer subject', () => {
  assert.equal(
    parseCheckoutInput({ ...checkoutInput(), customerAuthSubject: 'attacker' })
      .value,
    undefined,
  );
});

void test('promo totals preserve safe merchandise-bound integers and reject unsafe totals before batch', async (t) => {
  const f = await fixture();
  try {
    await f.db
      .prepare("UPDATE products SET price_paisa=? WHERE id='product'")
      .bind(Number.MAX_SAFE_INTEGER)
      .run();
    const campaign = async (code: string, discount: number) => {
      const context = {
        actorId: 'super',
        requestId: code + '-draft',
        expectedVersion: 0,
        now: 100,
        reason: 'Fictional integer-bound campaign',
        form: {
          formId: 'staff.promo-code' as const,
          versionId: 'staff.promo-code-v1',
          answers: {
            formId: 'staff.promo-code' as const,
            version: 1,
            answers: [],
          },
        },
      };
      const draft = await savePromoDraft(f.db, context, {
        code,
        label: 'Integer boundary',
        kind: 'fixed',
        fixedPaisa: discount,
        minimumSubtotalPaisa: 0,
        startsAt: 0,
        endsAt: 100000,
        totalUseLimit: 1,
        perCustomerUseLimit: 1,
        budgetPaisa: discount,
      });
      await publishPromo(
        f.db,
        { ...context, requestId: code + '-pub', expectedVersion: 1 },
        draft.campaignId,
      );
    };
    await campaign('FULLBOUND', Number.MAX_SAFE_INTEGER);
    await campaign('UNSAFEBOUND', 1);
    await t.test(
      'a full merchandise-bound discount leaves exactly delivery',
      async () => {
        await cart(f.db, 'bound');
        const q = await quoteCheckoutPromo(
          f.db,
          'customer',
          'bound',
          'FULLBOUND',
          100,
        );
        await assert.doesNotReject(async () => {
          const result = await createCodOrder(
            f.db,
            'bound',
            'bound',
            {
              ...checkoutInput(),
              deliveryRateVersion: 'fixture-rates',
              customerAuthSubject: 'customer',
              promoCode: q.code,
              promoRevision: q.revision,
              promoQuoteIntent: q.quoteIntent,
            },
            100,
            'customer',
          );
          assert.equal(result.grandTotalPaisa, 500);
        });
      },
    );
    await t.test(
      'an unsafe final amount rejects before any financial batch',
      async () => {
        await cart(f.db, 'unsafe');
        const q = await quoteCheckoutPromo(
          f.db,
          'customer',
          'unsafe',
          'UNSAFEBOUND',
          100,
        );
        let attempted = false;
        const db = {
          prepare: f.db.prepare.bind(f.db),
          batch: async (statements: D1PreparedStatement[]) => {
            attempted = true;
            return f.db.batch(statements);
          },
        } as D1Database;
        await assert.rejects(
          createCodOrder(
            db,
            'unsafe',
            'unsafe',
            {
              ...checkoutInput(),
              deliveryRateVersion: 'fixture-rates',
              customerAuthSubject: 'customer',
              promoCode: q.code,
              promoRevision: q.revision,
              promoQuoteIntent: q.quoteIntent,
            },
            100,
            'customer',
          ),
        );
        assert.equal(attempted, false);
      },
    );
  } finally {
    await f.dispose();
  }
});
