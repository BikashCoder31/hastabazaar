import { seedVerifiedCheckoutContact } from './helpers/checkout-contact';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fixture,
  repo,
  policy,
  claim,
  ctx,
  publishForm,
  beforeBatch,
  NOW,
  TERMS,
} from './helpers/loyalty-fixture';
import { seedIncentiveInventory } from './helpers/incentive-db';
import { createCodOrder } from '../lib/db/repositories/orders';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';
import {
  createCustomerReturnRequest,
  reviewReturnAsAdmin,
  advanceReturnAsAdmin,
} from '../lib/db/repositories/returns';
import type { RedeemInput } from '../lib/incentives/types';
function input(
  requestId = 'redeem',
  points = 200,
  expectedVersion = 1,
): RedeemInput {
  return {
    ...claim(requestId, expectedVersion),
    points,
    formVersionId: 'account.points-redemption-v1',
  };
}
async function funded(points = 200, overrides = {}) {
  const f = await fixture(true, { dailyPoints: points, ...overrides });
  await publishForm(f.db, 'account.points-redemption');
  await (await repo()).claimDailyPoints(f.db, claim('fund'));
  return f;
}
async function redemption() {
  const r = await repo();
  assert.equal(
    typeof r.redeemPoints,
    'function',
    'atomic redemption repository must be implemented',
  );
  return r.redeemPoints;
}
async function snapshot(db: D1Database) {
  return {
    points: await db
      .prepare("SELECT * FROM loyalty_accounts WHERE user_id='customer'")
      .first(),
    wallet: await db
      .prepare("SELECT * FROM wallet_accounts WHERE user_id='customer'")
      .first(),
    config: await db.prepare('SELECT * FROM loyalty_config').first(),
    redemptions: (await db
      .prepare('SELECT COUNT(*) n FROM loyalty_redemptions')
      .first<{ n: number }>())!.n,
    pointsEntries: (await db
      .prepare('SELECT COUNT(*) n FROM loyalty_points_entries')
      .first<{ n: number }>())!.n,
    walletEntries: (await db
      .prepare('SELECT COUNT(*) n FROM wallet_entries')
      .first<{ n: number }>())!.n,
    answers: (await db
      .prepare(
        "SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='account.points-redemption'",
      )
      .first<{ n: number }>())!.n,
  };
}
void test('redemption math rejects nonblocks and overflow and converts 200 points to 2000 paisa', async () => {
  const p = await policy();
  assert.equal(
    typeof p.calculateRedemption,
    'function',
    'whole-block redemption policy must be implemented',
  );
  for (const points of [
    0,
    99,
    101,
    -100,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
  ])
    assert.throws(() => p.calculateRedemption(points, TERMS), {
      code: 'invalid',
    });
  assert.equal(p.calculateRedemption(200, TERMS), 2000);
  assert.throws(
    () =>
      p.calculateRedemption(200, {
        ...TERMS,
        creditPaisaPerBlock: Number.MAX_SAFE_INTEGER,
      }),
    { code: 'invalid' },
  );
});
void test('redeeming 200 posts exactly one source linked debit credit and original snapshot', async () => {
  const redeem = await redemption(),
    f = await funded();
  try {
    const result = await redeem(f.db, input());
    assert.deepEqual(
      { ...result, redemptionId: 'id' },
      {
        redemptionId: 'id',
        points: 200,
        creditPaisa: 2000,
        balancePoints: 0,
        walletBalancePaisa: 2000,
      },
    );
    const s = await snapshot(f.db);
    assert.equal(s.redemptions, 1);
    assert.equal(s.pointsEntries, 2);
    assert.equal(s.walletEntries, 1);
    assert.equal(s.answers, 0);
    const linked = await f.db
      .prepare(
        'SELECT e.points,w.amount_paisa,w.platform_amount_paisa,w.order_id,w.gift_card_id FROM loyalty_points_entries e JOIN wallet_entries w ON w.loyalty_redemption_id=e.redemption_id WHERE e.redemption_id=?',
      )
      .bind(result.redemptionId)
      .first();
    assert.deepEqual(linked, {
      points: -200,
      amount_paisa: 2000,
      platform_amount_paisa: -2000,
      order_id: null,
      gift_card_id: null,
    });
    const state = await (
      await repo()
    ).getLoyaltyState(f.db, 'super', NOW, 'super');
    assert.equal(state.redeemedPoints, 200);
    assert.equal(state.creditedPaisa, 2000);
  } finally {
    await f.dispose();
  }
});
void test('insufficient and malformed redemption leave financial state unchanged', async () => {
  const redeem = await redemption(),
    f = await funded(100);
  try {
    const before = await snapshot(f.db);
    await assert.rejects(redeem(f.db, input()), { code: 'insufficient' });
    for (const points of [0, 99, 101, -100, Number.MAX_SAFE_INTEGER + 1])
      await assert.rejects(redeem(f.db, input('bad', points)), {
        code: 'invalid',
      });
    assert.deepEqual(await snapshot(f.db), before);
  } finally {
    await f.dispose();
  }
});
void test('missing wallet is provisioned atomically and failure leaves no wallet leftovers', async () => {
  const redeem = await redemption(),
    f = await funded();
  try {
    await f.db
      .prepare("DELETE FROM wallet_accounts WHERE user_id='customer'")
      .run();
    const before = await snapshot(f.db);
    await f.db
      .prepare(
        "CREATE TRIGGER reject_loyalty_credit BEFORE INSERT ON wallet_entries WHEN NEW.kind='loyalty_redemption' BEGIN SELECT RAISE(ABORT,'injected_wallet_credit_failure'); END",
      )
      .run();
    await assert.rejects(redeem(f.db, input()));
    assert.deepEqual(await snapshot(f.db), before);
    await f.db.prepare('DROP TRIGGER reject_loyalty_credit').run();
    assert.equal((await redeem(f.db, input())).walletBalancePaisa, 2000);
  } finally {
    await f.dispose();
  }
});
void test('injected wallet-credit failure rolls points back', async () => {
  const redeem = await redemption(),
    f = await funded();
  try {
    const before = await snapshot(f.db);
    // The wallet BEFORE INSERT runs after the source-owned points debit and aborts the native trigger chain.
    await f.db
      .prepare(
        "CREATE TRIGGER reject_loyalty_credit BEFORE INSERT ON wallet_entries WHEN NEW.kind='loyalty_redemption' BEGIN SELECT CASE WHEN (SELECT balance_points FROM loyalty_accounts WHERE user_id=NEW.user_id)<>0 THEN RAISE(ABORT,'debit_not_reached') ELSE RAISE(ABORT,'injected_wallet_credit_failure') END; END",
      )
      .run();
    let nativeFailure = '';
    const checkedDb = new Proxy(f.db, {
      get(target, key) {
        if (key === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            try {
              return await target.batch(statements);
            } catch (error) {
              nativeFailure = String(error);
              throw error;
            }
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await assert.rejects(redeem(checkedDb, input()));
    assert.match(
      nativeFailure,
      /injected_wallet_credit_failure/,
      'actual native failure must occur after the debit at wallet credit',
    );
    const after = await snapshot(f.db);
    assert.deepEqual(after.points, before.points);
    assert.deepEqual(after.wallet, before.wallet);
    assert.equal(after.redemptions, 0);
    assert.deepEqual(after, before);
    await f.db.prepare('DROP TRIGGER reject_loyalty_credit').run();
    assert.equal((await redeem(f.db, input())).creditPaisa, 2000);
  } finally {
    await f.dispose();
  }
});
void test('same-amount race credits once and changed amount conflicts before fresh eligibility', async () => {
  const redeem = await redemption(),
    f = await funded();
  try {
    const outcomes = await Promise.all([
      redeem(f.db, input()),
      redeem(f.db, input()),
    ]);
    assert.deepEqual(outcomes[0], outcomes[1]);
    const original = outcomes[0];
    await (await repo()).pauseLoyalty(f.db, ctx('pause'));
    await publishForm(f.db, 'account.points-redemption', 2);
    assert.deepEqual(
      await redeem(f.db, { ...input(), now: NOW + 86400000 }),
      original,
    );
    await assert.rejects(redeem(f.db, input('redeem', 100)), {
      code: 'conflict',
    });
    await assert.rejects(redeem(f.db, { ...input(), expectedVersion: 2 }), {
      code: 'conflict',
    });
    assert.equal((await snapshot(f.db)).redemptions, 1);
  } finally {
    await f.dispose();
  }
});
void test('different-request concurrent redemptions cannot spend the same points twice', async () => {
  const redeem = await redemption(),
    f = await funded();
  try {
    const outcomes = await Promise.allSettled([
      redeem(f.db, input('one')),
      redeem(f.db, input('two')),
    ]);
    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
    assert.equal((await snapshot(f.db)).redemptions, 1);
    assert.equal(
      (await (await repo()).getRewards(f.db, 'customer', NOW)).balancePoints,
      0,
    );
  } finally {
    await f.dispose();
  }
});
for (const scenario of [
  'paused',
  'disabled',
  'exhausted',
  'expired',
  'scheduled',
])
  void test(`${scenario} earning still permits earned points redemption`, async () => {
    const redeem = await redemption(),
      f = await funded(200, {
        dailyBudgetPoints: 200,
        lifetimeBudgetPoints: 200,
      });
    try {
      const r = await repo();
      let version = 1;
      if (scenario === 'paused')
        version = (await r.pauseLoyalty(f.db, ctx('pause'))).version;
      if (['disabled', 'expired', 'scheduled'].includes(scenario)) {
        const draft = await r.saveLoyaltyDraft(f.db, ctx('draft'), {
          ...TERMS,
          dailyBudgetPoints: 200,
          lifetimeBudgetPoints: 200,
          ...(scenario === 'disabled'
            ? { enabled: false }
            : scenario === 'expired'
              ? { endsAt: NOW }
              : { startsAt: NOW + 1 }),
        });
        version = (await r.publishLoyalty(f.db, ctx('publish', draft.version)))
          .version;
      }
      assert.equal(
        (await r.getRewards(f.db, 'customer', NOW)).state.status,
        scenario==='scheduled'?'exhausted':scenario,
        'A pending change preserves the exhausted current rules and earned-point redemption',
      );
      assert.equal(
        (await redeem(f.db, input('redeem', 200, version))).creditPaisa,
        2000,
      );
    } finally {
      await f.dispose();
    }
  });
void test('current subject role status version and published empty form are checked at commit', async () => {
  const redeem = await redemption();
  for (const scenario of [
    'subject',
    'role',
    'status',
    'version',
    'form',
    'fields',
    'formId',
  ]) {
    const f = await funded();
    try {
      const before = await snapshot(f.db);
      const db = beforeBatch(f.db, async () => {
        if (scenario === 'subject')
          await f.db
            .prepare("UPDATE users SET auth_subject='new' WHERE id='customer'")
            .run();
        if (scenario === 'role')
          await f.db
            .prepare(
              "DELETE FROM user_roles WHERE user_id='customer' AND role='customer'",
            )
            .run();
        if (scenario === 'status')
          await f.db
            .prepare("UPDATE users SET status='suspended' WHERE id='customer'")
            .run();
        if (scenario === 'version')
          await f.db
            .prepare('UPDATE loyalty_config SET version=version+1')
            .run();
        if (scenario === 'form')
          await publishForm(f.db, 'account.points-redemption', 2);
        if (scenario === 'fields')
          await publishForm(f.db, 'account.points-redemption', 2, [
            { id: 'note', key: 'note', type: 'short_text' },
          ]);
        if (scenario === 'formId')
          await f.db
            .prepare(
              "UPDATE form_config_versions SET config_json=? WHERE id='account.points-redemption-v1'",
            )
            .bind(
              JSON.stringify({ formId: 'account.daily-reward', fields: [] }),
            )
            .run();
      });
      await assert.rejects(redeem(db, input()), {
        code: ['subject', 'role', 'status'].includes(scenario)
          ? 'unauthorized'
          : 'stale',
      });
      const after = await snapshot(f.db);
      assert.deepEqual(after.points, before.points);
      assert.deepEqual(after.wallet, before.wallet);
      assert.equal(after.redemptions, 0);
      assert.equal(after.walletEntries, 0);
    } finally {
      await f.dispose();
    }
  }
});
void test('exact receipt requires current authority before lookup and in native replay batch', async () => {
  const redeem = await redemption(),
    f = await funded();
  try {
    const original = await redeem(f.db, input()),
      before = await snapshot(f.db);
    await f.db
      .prepare("UPDATE users SET auth_subject='new' WHERE id='customer'")
      .run();
    await assert.rejects(redeem(f.db, input()), { code: 'unauthorized' });
    await assert.rejects(redeem(f.db, { ...input(), authSubject: 'new' }), {
      code: 'conflict',
    });
    await f.db
      .prepare("UPDATE users SET auth_subject='customer' WHERE id='customer'")
      .run();
    const db = beforeBatch(f.db, () =>
      f.db
        .prepare(
          "DELETE FROM user_roles WHERE user_id='customer' AND role='customer'",
        )
        .run(),
    );
    await assert.rejects(redeem(db, input()), { code: 'unauthorized' });
    assert.deepEqual(await snapshot(f.db), before);
    await f.db
      .prepare(
        "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('customer','customer',1)",
      )
      .run();
    assert.deepEqual(await redeem(f.db, input()), original);
  } finally {
    await f.dispose();
  }
});
void test('wallet headroom overflow rejects without debit', async () => {
  const redeem = await redemption(),
    f = await funded();
  try {
    await f.db
      .prepare(
        "INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('huge','huge-hash',?,'super','huge',1,'customer',1,'huge')",
      )
      .bind(Number.MAX_SAFE_INTEGER - 1000)
      .run();
    await f.db
      .prepare(
        "INSERT INTO wallet_entries(id,user_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('huge-credit','customer','huge',?,?,'gift_card',1)",
      )
      .bind(Number.MAX_SAFE_INTEGER - 1000, -(Number.MAX_SAFE_INTEGER - 1000))
      .run();
    const before = await snapshot(f.db);
    await assert.rejects(redeem(f.db, input()), { code: 'invalid' });
    assert.deepEqual(await snapshot(f.db), before);
  } finally {
    await f.dispose();
  }
});
async function checkoutSetup(db: D1Database) {
  await seedVerifiedCheckoutContact(db, 'customer');
  await seedIncentiveInventory(db);
  await db
    .prepare(
      "UPDATE seller_profiles SET seller_agreement_version=? WHERE id='seller'",
    )
    .bind(SELLER_AGREEMENT_VERSION)
    .run();
  await publishForm(db, 'commerce.checkout');
  await db
    .prepare(
      "INSERT INTO delivery_rate_versions(id,config_json,created_by,reason,created_at) VALUES ('loyalty-rates',?,'super','Fixture',1)",
    )
    .bind(
      JSON.stringify({
        zones: { valley: 500, terai: 500, nationwide: 500 },
        districts: {},
      }),
    )
    .run();
  await db
    .prepare(
      "UPDATE delivery_rate_current SET version_id='loyalty-rates' WHERE id='default'",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES ('loyalty-cart','loyalty-cart','NPR',253402300799999,1,1)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('loyalty-item','loyalty-cart','product',1,1,1)",
    )
    .run();
  return () =>
    createCodOrder(
      db,
      'loyalty-cart',
      'receipt',
      {
        customerEmail: 'customer@example.test',
        customerPhone: '9811111111',
        locale: 'en-NP',
        termsAccepted: true,
        idempotencyKey: 'loyalty-checkout',
        address: {
          recipientName: 'Fixture Buyer',
          phone: '9811111111',
          province: 'Bagmati',
          district: 'Kathmandu',
          municipality: 'Kathmandu',
          locality: 'Fixture locality',
        },
        useWallet: true,
        deliveryRateVersion: 'loyalty-rates',
        customerAuthSubject: 'customer',
      },
      NOW,
      'customer',
      {
        versionId: 'commerce.checkout-v1',
        answers: { formId: 'commerce.checkout', version: 1, answers: [] },
      },
    );
}
void test('real redemption checkout concurrency reconciles wallet and refund restores wallet only with no points reaward', async () => {
  const redeem = await redemption(),
    f = await funded(400);
  try {
    const first = await redeem(f.db, input('initial', 200));
    assert.equal(first.walletBalancePaisa, 2000);
    const checkout = await checkoutSetup(f.db);
    const outcomes = await Promise.allSettled([
      redeem(f.db, input('parallel', 200)),
      checkout(),
      redeem(f.db, input('parallel', 200)),
    ]);
    for (const i of [0, 2])
      if (outcomes[i].status === 'rejected')
        await redeem(f.db, input('parallel', 200));
    const placed =
      outcomes[1].status === 'fulfilled' ? outcomes[1].value : await checkout();
    const order = await f.db
      .prepare(
        'SELECT id,wallet_credit_paisa wallet FROM orders WHERE order_number=?',
      )
      .bind(placed.orderNumber)
      .first<{ id: string; wallet: number }>();
    assert.ok(order);
    assert.ok(order.wallet === 2000 || order.wallet === 4000);
    const wallet = await f.db
      .prepare(
        "SELECT balance_paisa,(SELECT SUM(amount_paisa) FROM wallet_entries WHERE user_id='customer') total FROM wallet_accounts WHERE user_id='customer'",
      )
      .first<{ balance_paisa: number; total: number }>();
    assert.equal(wallet!.balance_paisa, 4000 - order.wallet);
    assert.equal(wallet!.total, wallet!.balance_paisa);
    const before = await snapshot(f.db);
    assert.equal(before.redemptions, 2);
    assert.equal(
      (await (await repo()).getRewards(f.db, 'customer', NOW)).balancePoints,
      0,
    );
    await f.db
      .prepare(
        "UPDATE orders SET status='delivered',payment_status='paid',delivered_at=? WHERE id=?",
      )
      .bind(NOW + 1, order.id)
      .run();
    await f.db
      .prepare(
        "UPDATE order_items SET fulfillment_status='delivered' WHERE order_id=?",
      )
      .bind(order.id)
      .run();
    const item = await f.db
      .prepare('SELECT id FROM order_items WHERE order_id=?')
      .bind(order.id)
      .first<{ id: string }>();
    const returned = await createCustomerReturnRequest(f.db, {
      orderNumber: placed.orderNumber,
      receiptTokenHash: null,
      customerId: 'customer',
      orderItemId: item!.id,
      quantity: 1,
      reason: 'defective',
      requestedResolution: 'refund',
      detail: 'The fictional product has a documented defect.',
      locale: 'en-NP',
      idempotencyKey: 'return',
      evidence: [],
      now: NOW + 2,
    });
    await reviewReturnAsAdmin(f.db, {
      returnRequestId: returned.id,
      actorId: 'super',
      actorRole: 'super_admin',
      action: 'approve',
      note: 'Documented product defect approved for refund.',
      publicMessageEn: 'Refund approved.',
      publicMessageNe: 'Refund approved.',
      responsibility: 'seller',
      outcome: 'refund',
      itemRefundPaisa: 10000,
      deliveryRefundPaisa: 0,
      requestId: 'review',
      now: NOW + 3,
    });
    const base = {
      returnRequestId: returned.id,
      actorId: 'super',
      actorRole: 'super_admin' as const,
      note: 'Verified fictional refund accounting.',
      publicMessageEn: 'Refund paid.',
      publicMessageNe: 'Refund paid.',
      now: NOW + 4,
    };
    await advanceReturnAsAdmin(f.db, {
      ...base,
      action: 'start_refund',
      requestId: 'start',
    });
    await advanceReturnAsAdmin(f.db, {
      ...base,
      action: 'complete_refund',
      requestId: 'complete',
      reference: 'FICTIONAL-TRANSFER',
    });
    const after = await snapshot(f.db);
    assert.deepEqual(after.points, before.points);
    assert.equal(after.pointsEntries, before.pointsEntries);
    assert.equal(after.redemptions, 2);
    assert.deepEqual(after.config, before.config);
    assert.equal(
      (await (await repo()).getRewards(f.db, 'customer', NOW + 5))
        .walletBalancePaisa,
      4000,
    );
    assert.equal(
      (await f.db
        .prepare(
          "SELECT SUM(amount_paisa) n FROM wallet_entries WHERE kind='refund'",
        )
        .first<{ n: number }>())!.n,
      order.wallet,
    );
  } finally {
    await f.dispose();
  }
});
void test('latest matching redemption form rejects custom fields in the native batch', async () => {
  const redeem = await redemption(),
    f = await funded();
  try {
    await publishForm(f.db, 'account.points-redemption', 2, [
      {
        id: 'note',
        key: 'note',
        type: 'short_text',
        label: 'Note',
        required: false,
        status: 'active',
        order: 0,
      },
    ]);
    const before = await snapshot(f.db);
    await assert.rejects(
      redeem(f.db, {
        ...input(),
        formVersionId: 'account.points-redemption-v2',
      }),
      { code: 'stale' },
    );
    assert.deepEqual(await snapshot(f.db), before);
  } finally {
    await f.dispose();
  }
});
