import { seedVerifiedCheckoutContact } from './helpers/checkout-contact';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  repo,
  policy,
  fixture,
  claim,
  ctx,
  TERMS,
  NOW,
  counts,
  publishForm,
  beforeBatch,
} from './helpers/loyalty-fixture';
void test('Nepal reward day changes at 18:15 UTC with server epoch milliseconds', async () => {
  const p = await policy();
  assert.deepEqual(p.nepalRewardDay(Date.parse('2026-09-28T18:14:59Z')), {
    localDate: '2026-09-28',
    nextClaimAt: Date.parse('2026-09-28T18:15:00Z'),
  });
  assert.deepEqual(p.nepalRewardDay(Date.parse('2026-09-28T18:15:00Z')), {
    localDate: '2026-09-29',
    nextClaimAt: Date.parse('2026-09-29T18:15:00Z'),
  });
  for (const n of [NaN, Infinity, -1, 1.5])
    assert.throws(() => p.nepalRewardDay(n));
});
void test('same-date parallel claims award exactly ten points', async () => {
  const r = await repo(),
    f = await fixture();
  try {
    const results = await Promise.allSettled([
      r.claimDailyPoints(f.db, claim('device1')),
      r.claimDailyPoints(f.db, claim('device2')),
    ]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    const claimRows = (
      await f.db.prepare('SELECT * FROM loyalty_daily_claims').all()
    ).results;
    assert.equal(claimRows.length, 1);
    const view = await r.getRewards(f.db, 'customer', NOW);
    assert.equal(view.balancePoints, 10);
    assert.equal(
      (await r.getLoyaltyState(f.db, 'super', NOW, 'super')).issuedTodayPoints,
      10,
    );
    assert.deepEqual(await counts(f.db), [1, 1, 1, 1, 0]);
  } finally {
    await f.dispose();
  }
});
void test('exact claim retries preserve original snapshot across midnight pause and form publication; changed intent conflicts', async () => {
  const r = await repo(),
    f = await fixture();
  try {
    const original = await r.claimDailyPoints(f.db, claim());
    await r.pauseLoyalty(f.db, ctx('pause'));
    await publishForm(f.db, 'account.daily-reward', 2);
    assert.deepEqual(
      await r.claimDailyPoints(
        f.db,
        claim('claim', 1, 'customer', NOW + 86400000),
      ),
      original,
    );
    await assert.rejects(
      r.claimDailyPoints(f.db, { ...claim(), expectedVersion: 2 }),
      { code: 'conflict' },
    );
    await f.db
      .prepare(
        "UPDATE users SET auth_subject='new-identity' WHERE id='customer'",
      )
      .run();
    await assert.rejects(r.claimDailyPoints(f.db, claim()), {
      code: 'unauthorized',
    });
    assert.deepEqual(await counts(f.db), [1, 1, 1, 1, 0]);
  } finally {
    await f.dispose();
  }
});
void test('same day stays globally consumed after campaign revision change', async () => {
  const r = await repo(),
    f = await fixture();
  try {
    await r.claimDailyPoints(f.db, claim());
    const draft = await r.saveLoyaltyDraft(f.db, ctx('draft'), {
      ...TERMS,
      dailyPoints: 20,
    });
    const pub = await r.publishLoyalty(f.db, ctx('publish', draft.version));
    await assert.rejects(
      r.claimDailyPoints(f.db, claim('second', pub.version)),
      { code: 'conflict' },
    );
    assert.equal((await r.getRewards(f.db, 'customer', NOW)).balancePoints, 10);
  } finally {
    await f.dispose();
  }
});
for (const budget of ['dailyBudgetPoints', 'lifetimeBudgetPoints'] as const)
  void test(`${budget} final-budget native race never exceeds ten`, async () => {
    const r = await repo(),
      f = await fixture(true, { [budget]: 10 });
    try {
      const result = await Promise.allSettled([
        r.claimDailyPoints(f.db, claim('one')),
        r.claimDailyPoints(f.db, claim('two', 1, 'other')),
      ]);
      assert.equal(result.filter((x) => x.status === 'fulfilled').length, 1);
      assert.equal(
        (await r.getLoyaltyState(f.db, 'super', NOW, 'super')).issuedPoints,
        10,
      );
      assert.equal((await counts(f.db))[1], 1);
    } finally {
      await f.dispose();
    }
  });
void test('paused disabled inactive expired and stale claims leave no financial entries', async () => {
  const r = await repo();
  for (const scenario of [
    'paused',
    'disabled',
    'inactive',
    'expired',
    'stale',
  ]) {
    const f = await fixture(
      true,
      scenario === 'disabled' ? { enabled: false } : {},
    );
    try {
      if (scenario === 'paused')
        await f.db.prepare('UPDATE loyalty_config SET paused=1').run();
      if (scenario === 'inactive')
        await f.db
          .prepare("UPDATE users SET status='suspended' WHERE id='customer'")
          .run();
      await assert.rejects(
        r.claimDailyPoints(
          f.db,
          claim(
            'new',
            scenario === 'stale' ? 2 : 1,
            'customer',
            scenario === 'expired' ? 253402300799999 : NOW,
          ),
        ),
      );
      assert.deepEqual(await counts(f.db), [0, 0, 0, 0, 0]);
    } finally {
      await f.dispose();
    }
  }
});
void test('authority subject role config and no-answer form are rechecked at native commit', async () => {
  const r = await repo();
  for (const scenario of ['subject', 'role', 'config', 'form']) {
    const f = await fixture();
    try {
      const db = beforeBatch(f.db, async () => {
        if (scenario === 'subject')
          await f.db
            .prepare(
              "UPDATE users SET auth_subject='replacement' WHERE id='customer'",
            )
            .run();
        if (scenario === 'role')
          await f.db
            .prepare(
              "DELETE FROM user_roles WHERE user_id='customer' AND role='customer'",
            )
            .run();
        if (scenario === 'config')
          await f.db.prepare('UPDATE loyalty_config SET paused=1').run();
        if (scenario === 'form')
          await publishForm(f.db, 'account.daily-reward', 2);
      });
      await assert.rejects(r.claimDailyPoints(db, claim()));
      assert.deepEqual(await counts(f.db), [0, 0, 0, 0, 0]);
    } finally {
      await f.dispose();
    }
  }
});
void test('GET is read-only with owner-bound bounded private-free history', async () => {
  const r = await repo(),
    f = await fixture();
  try {
    await f.db
      .prepare("DELETE FROM wallet_accounts WHERE user_id='other'")
      .run();
    const before = await counts(f.db);
    const empty = await r.getRewards(f.db, 'other', NOW);
    assert.equal(empty.walletBalancePaisa, 0);
    assert.deepEqual(await counts(f.db), before);
    assert.equal(
      await f.db
        .prepare("SELECT 1 FROM wallet_accounts WHERE user_id='other'")
        .first(),
      null,
    );
    await r.claimDailyPoints(f.db, claim('day1'));
    await r.claimDailyPoints(
      f.db,
      claim('day2', 1, 'customer', NOW + 86400000),
    );
    const first = await r.getRewards(
      f.db,
      'customer',
      NOW + 86400000,
      undefined,
      1,
    );
    assert.equal(first.history.length, 1);
    assert.ok(first.nextCursor);
    const second = await r.getRewards(
      f.db,
      'customer',
      NOW + 86400000,
      first.nextCursor!,
      1,
    );
    assert.equal(second.history.length, 1);
    assert.notDeepEqual(first.history, second.history);
    await assert.rejects(r.getRewards(f.db, 'other', NOW, first.nextCursor!), {
      code: 'invalid',
    });
    for (const n of [0, 51, 1.5])
      await assert.rejects(r.getRewards(f.db, 'customer', NOW, undefined, n));
    for (const key of [
      'terms',
      'issuedPoints',
      'outstandingPoints',
      'dailyBudgetPoints',
      'lifetimeBudgetPoints',
      'reason',
      'createdBy',
    ])
      assert.equal(Object.hasOwn(first.state, key), false, key);
  } finally {
    await f.dispose();
  }
});
void test('failure after trigger posting rolls back source ledger counters and account', async () => {
  const r = await repo(),
    f = await fixture();
  try {
    const db = new Proxy(f.db, {
      get(target, key) {
        if (key === 'batch')
          return (statements: D1PreparedStatement[]) =>
            target.batch([
              ...statements,
              target.prepare(
                "INSERT INTO staff_permission_guards(id,valid) VALUES ('injected',0)",
              ),
            ]);
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await assert.rejects(r.claimDailyPoints(db, claim()));
    assert.deepEqual(await counts(f.db), [0, 0, 0, 0, 0]);
    assert.equal((await r.getLoyaltyState(f.db, 'super', NOW, 'super')).issuedPoints, 0);
  } finally {
    await f.dispose();
  }
});

void test('no-answer claim commit rejects protected financial questions in a corrupted published configuration', async () => {
  const r = await repo(),
    f = await fixture();
  try {
    await publishForm(f.db, 'account.daily-reward', 2, [
      {
        id: 'points',
        key: 'points',
        label: 'Points override',
        type: 'number',
        required: false,
        status: 'active',
        order: 0,
      },
    ]);
    await assert.rejects(
      r.claimDailyPoints(f.db, {
        ...claim(),
        formVersionId: 'account.daily-reward-v2',
      }),
      { code: 'stale' },
    );
    assert.deepEqual(await counts(f.db), [0, 0, 0, 0, 0]);
  } finally {
    await f.dispose();
  }
});

void test('claims without a wallet never provision shopping credit', async () => {
  const r = await repo(),
    f = await fixture();
  try {
    await f.db
      .prepare("DELETE FROM wallet_accounts WHERE user_id='other'")
      .run();
    const result = await r.claimDailyPoints(
      f.db,
      claim('no-wallet', 1, 'other'),
    );
    assert.equal(result.awardedPoints, 10);
    assert.equal(
      await f.db
        .prepare("SELECT 1 FROM wallet_accounts WHERE user_id='other'")
        .first(),
      null,
    );
    assert.equal(
      (await r.getRewards(f.db, 'other', NOW)).walletBalancePaisa,
      0,
    );
  } finally {
    await f.dispose();
  }
});
void test('claim wallet-first serialization remains compatible with concurrent checkout and trigger-owned redemption', async () => {
  const r = await repo(),
    f = await fixture(true, { dailyPoints: 100 });
  try {
    const { seedIncentiveInventory } = await import('./helpers/incentive-db');
    const { SELLER_AGREEMENT_VERSION } =
      await import('../lib/content/legal-policies');
    const { savePromoDraft, publishPromo } =
      await import('../lib/db/repositories/promo-codes');
    const { quoteCheckoutPromo } =
      await import('../lib/incentives/quote-intent');
    const { createCodOrder } = await import('../lib/db/repositories/orders');
    await seedIncentiveInventory(f.db);
    await f.db
      .prepare(
        'UPDATE seller_profiles SET seller_agreement_version=? WHERE id=?',
      )
      .bind(SELLER_AGREEMENT_VERSION, 'seller')
      .run();
    for (const id of [
      'staff.promo-code',
      'commerce.checkout',
      'commerce.promo-quote',
    ])
      await publishForm(f.db, id);
    await f.db
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
    await f.db
      .prepare(
        "UPDATE delivery_rate_current SET version_id='loyalty-rates' WHERE id='default'",
      )
      .run();
    const promoContext = {
      ...ctx('promo-draft', 0),
      form: {
        formId: 'staff.promo-code',
        versionId: 'staff.promo-code-v1',
        answers: { formId: 'staff.promo-code', version: 1, answers: [] },
      },
    };
    const draft = await savePromoDraft(f.db, promoContext, {
      code: 'WALLET10',
      label: 'Fixture',
      kind: 'fixed',
      fixedPaisa: 1000,
      minimumSubtotalPaisa: 0,
      startsAt: 0,
      endsAt: 253402300799999,
      totalUseLimit: 10,
      perCustomerUseLimit: 10,
      budgetPaisa: 10000,
    });
    await publishPromo(
      f.db,
      { ...promoContext, requestId: 'promo-publish', expectedVersion: 1 },
      draft.campaignId,
    );
    await f.db
      .prepare(
        "INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('gift','loyalty-gift-hash',2000,'super','gift',1,'customer',1,'redeem')",
      )
      .run();
    await f.db
      .prepare(
        "INSERT INTO wallet_entries(id,user_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('gift-credit','customer','gift',2000,-2000,'gift_card',1)",
      )
      .run();
    await f.db
      .prepare(
        "INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES ('loyalty-cart','loyalty-cart','NPR',253402300799999,1,1)",
      )
      .run();
    await f.db
      .prepare(
        "INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('loyalty-cart-item','loyalty-cart','product',1,1,1)",
      )
      .run();
    await r.claimDailyPoints(f.db, claim('fund'));
    const now = NOW + 86400000,
      q = await quoteCheckoutPromo(
        f.db,
        'customer',
        'loyalty-cart',
        'WALLET10',
        now,
        'customer',
      );
    await seedVerifiedCheckoutContact(f.db, 'customer');
    const input = {
      customerEmail: 'customer@example.test',
      customerPhone: '9811111111',
      locale: 'en-NP' as const,
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
      promoCode: q.code,
      promoRevision: q.revision,
      promoQuoteIntent: q.quoteIntent,
    };
    // This is the reviewed Task 8 source-insert contract, not a Task 10 repository implementation.
    const redemption = f.db.batch([
      f.db.prepare(
        "UPDATE wallet_accounts SET balance_paisa=balance_paisa WHERE user_id='customer'",
      ),
      f.db.prepare(
        "UPDATE users SET updated_at=updated_at WHERE id='customer'",
      ),
      f.db.prepare(
        "UPDATE user_roles SET assigned_at=assigned_at WHERE user_id='customer' AND role='customer'",
      ),
      f.db.prepare(
        "UPDATE loyalty_accounts SET balance_points=balance_points WHERE user_id='customer'",
      ),
      f.db.prepare(
        "UPDATE loyalty_config SET version=version WHERE id='default'",
      ),
      f.db
        .prepare(`INSERT INTO loyalty_redemptions(id,user_id,actor_id,request_id,payload_digest,revision,points,credit_paisa,response_json,form_version_id,created_at)
 SELECT 'native-redeem','customer','customer','native-redeem',?,1,100,1000,
 json_object('redemptionId','native-redeem','points',100,'creditPaisa',1000,'balancePoints',a.balance_points-100,'walletBalancePaisa',w.balance_paisa+1000),'fixture',?
 FROM loyalty_accounts a JOIN wallet_accounts w ON w.user_id=a.user_id WHERE a.user_id='customer'`)
        .bind('a'.repeat(64), now),
    ]);
    const operations = await Promise.allSettled([
      r.claimDailyPoints(f.db, claim('tomorrow', 1, 'customer', now)),
      redemption,
      createCodOrder(
        f.db,
        'loyalty-cart',
        'loyalty-receipt',
        input,
        now,
        'customer',
        {
          versionId: 'commerce.checkout-v1',
          answers: { formId: 'commerce.checkout', version: 1, answers: [] },
        },
      ),
    ]);
    assert.equal(operations[1].status, 'fulfilled', JSON.stringify(operations));
    // A balance snapshot conflict is retried using the same intentional request.
    if (operations[0].status === 'rejected')
      await r.claimDailyPoints(f.db, claim('tomorrow', 1, 'customer', now));
    if (operations[2].status === 'rejected')
      await createCodOrder(
        f.db,
        'loyalty-cart',
        'loyalty-receipt',
        input,
        now,
        'customer',
        {
          versionId: 'commerce.checkout-v1',
          answers: { formId: 'commerce.checkout', version: 1, answers: [] },
        },
      );
    const state = await r.getLoyaltyState(f.db, 'super', now, 'super');
    assert.equal(state.issuedPoints, 200);
    assert.equal(state.redeemedPoints, 100);
    assert.equal(state.creditedPaisa, 1000);
    assert.equal(
      (await r.getRewards(f.db, 'customer', now)).balancePoints,
      100,
    );
    const wallet = await f.db
      .prepare(
        "SELECT balance_paisa,(SELECT SUM(amount_paisa) FROM wallet_entries WHERE user_id='customer') total FROM wallet_accounts WHERE user_id='customer'",
      )
      .first<{ balance_paisa: number; total: number }>();
    assert.equal(wallet!.balance_paisa, wallet!.total);
    assert.ok(wallet!.balance_paisa >= 0);
    assert.equal(
      (await f.db
        .prepare(
          "SELECT COUNT(*) n FROM wallet_entries WHERE kind='loyalty_redemption'",
        )
        .first<{ n: number }>())!.n,
      1,
    );
    assert.equal(
      (await f.db
        .prepare('SELECT COUNT(*) n FROM orders')
        .first<{ n: number }>())!.n,
      1,
    );
  } finally {
    await f.dispose();
  }
});

for (const budget of ['dailyBudgetPoints', 'lifetimeBudgetPoints'] as const)
  void test(`public rewards expose ${budget} exhaustion without private counters and recover only eligible daily headroom`, async () => {
    const r = await repo(),
      f = await fixture(true, { [budget]: 15 });
    try {
      assert.equal(
        (await r.getRewards(f.db, 'other', NOW)).state.status,
        'active',
      );
      await r.claimDailyPoints(f.db, claim('use-ten'));
      const before = await counts(f.db),
        unclaimed = await r.getRewards(f.db, 'other', NOW);
      assert.equal(unclaimed.claimedToday, false);
      assert.equal(
        unclaimed.state.status,
        'exhausted',
        'five remaining points cannot cover a ten-point award',
      );
      for (const key of [
        'dailyBudgetPoints',
        'lifetimeBudgetPoints',
        'issuedPoints',
        'issuedTodayPoints',
        'redeemedPoints',
        'creditedPaisa',
        'outstandingPoints',
        'liability',
        'maximumLiability',
        'reason',
      ])
        assert.equal(Object.hasOwn(unclaimed.state, key), false, key);
      assert.deepEqual(await counts(f.db), before);
      const draft = await r.saveLoyaltyDraft(f.db, ctx('remaining-zero'), {
        ...TERMS,
        [budget]: 10,
      });
      const published = await r.publishLoyalty(
        f.db,
        ctx('publish-zero', draft.version),
      );
      assert.equal(
        (await r.getRewards(f.db, 'other', NOW)).state.status,
        'exhausted',
        'zero remaining points are exhausted',
      );
      const midnight = Date.parse('2026-09-28T18:15:00Z');
      assert.equal(
        (await r.getRewards(f.db, 'other', midnight)).state.status,
        budget === 'dailyBudgetPoints' ? 'active' : 'exhausted',
      );
      // Existing pause, disabled, scheduled and expired states take precedence over budget headroom.
      const paused = await r.pauseLoyalty(
        f.db,
        ctx('pause-headroom', published.version),
      );
      assert.equal(
        (await r.getRewards(f.db, 'other', NOW)).state.status,
        'paused',
      );
      const disabled = await r.saveLoyaltyDraft(
        f.db,
        ctx('disabled-headroom', paused.version),
        { ...TERMS, [budget]: 10, enabled: false },
      );
      const disabledLive = await r.publishLoyalty(
        f.db,
        ctx('publish-disabled', disabled.version),
      );
      assert.equal(
        (await r.getRewards(f.db, 'other', NOW)).state.status,
        'disabled',
      );
      const scheduled = await r.saveLoyaltyDraft(
        f.db,
        ctx('scheduled-headroom', disabledLive.version),
        { ...TERMS, [budget]: 10, startsAt: midnight + 1000 },
      );
      const scheduledLive = await r.publishLoyalty(
        f.db,
        ctx('publish-scheduled', scheduled.version),
      );
      assert.equal(
        (await r.getRewards(f.db, 'other', NOW)).state.status,
        'scheduled',
      );
      const expired = await r.saveLoyaltyDraft(
        f.db,
        ctx('expired-headroom', scheduledLive.version),
        { ...TERMS, [budget]: 10, endsAt: NOW + 1 },
      );
      await r.publishLoyalty(f.db, ctx('publish-expired', expired.version));
      assert.equal(
        (await r.getRewards(f.db, 'other', NOW + 1)).state.status,
        'expired',
      );
    } finally {
      await f.dispose();
    }
  });
