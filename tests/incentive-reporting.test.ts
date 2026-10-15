import assert from 'node:assert/strict';
import test from 'node:test';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import {
  seedIncentiveCustomer,
  seedIncentiveInventory,
  incentiveItem,
} from './helpers/incentive-db';
import { publishForm } from './helpers/loyalty-fixture';
import * as promo from '../lib/db/repositories/promo-codes';
import * as loyalty from '../lib/db/repositories/loyalty';
import type {
  LoyaltyMutationContext,
  PromoMutationContext,
  PromoQuote,
  PromoTerms,
} from '../lib/incentives/types';

const NOW = Date.parse('2026-09-28T18:15:00Z'); // Nepal midnight on September 29.
const actor = { id: 'super', authSubject: 'super' };
async function reports() {
  const loaded =
    await import('../lib/db/repositories/incentive-reporting').catch(
      () => null,
    );
  assert.ok(loaded, 'The reporting repository must exist');
  return loaded;
}
async function fixture() {
  const f = await incentiveReportDatabase();
  for (const id of ['customer', 'other', 'super', 'admin'])
    await seedIncentiveCustomer(f.db, id);
  await f.db
    .prepare(
      "UPDATE users SET display_name='Asha Craft',email='asha@example.test' WHERE id='customer'",
    )
    .run();
  await f.db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1),('admin','admin',1)",
    )
    .run();
  await seedIncentiveInventory(f.db);
  for (const form of [
    'staff.promo-code',
    'staff.loyalty-settings',
    'account.daily-reward',
    'account.points-redemption',
  ])
    await publishForm(f.db, form);
  return f;
}
function promoContext(
  requestId: string,
  expectedVersion = 0,
  now = NOW,
): PromoMutationContext {
  return {
    actorId: 'super',
    authSubject: 'super',
    requestId,
    expectedVersion,
    now,
    reason: 'Approved report fixture',
    form: {
      formId: 'staff.promo-code',
      versionId: 'staff.promo-code-v1',
      answers: { formId: 'staff.promo-code', version: 1, answers: [] },
    },
  };
}
function loyaltyContext(
  requestId: string,
  expectedVersion = 1,
  now = NOW,
): LoyaltyMutationContext {
  return {
    ...promoContext(requestId, expectedVersion, now),
    form: {
      formId: 'staff.loyalty-settings',
      versionId: 'staff.loyalty-settings-v1',
      answers: { formId: 'staff.loyalty-settings', version: 1, answers: [] },
    },
  };
}
const promoTerms: PromoTerms = {
  code: 'SAVE10',
  label: 'Artisan gift',
  kind: 'fixed',
  fixedPaisa: 1000,
  minimumSubtotalPaisa: 0,
  startsAt: 0,
  endsAt: 253402300799999,
  totalUseLimit: 100,
  perCustomerUseLimit: 100,
  budgetPaisa: 100000,
};
async function livePromo(db: D1Database) {
  const draft = await promo.savePromoDraft(
    db,
    promoContext('promo-draft'),
    promoTerms,
  );
  return promo.publishPromo(
    db,
    promoContext('promo-publish', draft.version),
    draft.campaignId,
  );
}
async function promoOrder(db: D1Database, id: string, now: number) {
  const q: PromoQuote = await promo.quotePromo(db, {
    userId: 'customer',
    code: 'SAVE10',
    subtotalPaisa: 10000,
    now,
  });
  const consumption = await promo.preparePromoConsumption(db, {
    userId: 'customer',
    orderId: id,
    requestId: `use-${id}`,
    now,
    quote: q,
    payloadDigest: 'a'.repeat(64),
    response: { orderId: id },
  });
  await db.batch([
    db
      .prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label)
      VALUES (?,?,'customer','asha@example.test','9811111111','placed','en-NP','fixture','{}',10000,500,9500,'cod','unpaid',1,1,1000,?,?,?,?)`)
      .bind(id, `FIX-${id}`, q.campaignId, q.revision, q.code, q.label),
    incentiveItem(db, `${id}-a`, id, 500),
    incentiveItem(db, `${id}-b`, id, 500),
    ...consumption,
  ]);
}
async function liveLoyalty(db: D1Database) {
  const draft = await loyalty.saveLoyaltyDraft(
    db,
    loyaltyContext('loyalty-draft'),
    {
      enabled: true,
      dailyPoints: 100,
      pointsPerBlock: 100,
      creditPaisaPerBlock: 1000,
      startsAt: 0,
      endsAt: 253402300799999,
      dailyBudgetPoints: 10000,
      lifetimeBudgetPoints: 100000,
    },
  );
  return loyalty.publishLoyalty(
    db,
    loyaltyContext('loyalty-publish', draft.version),
  );
}
async function daily(
  db: D1Database,
  now: number,
  userId = 'customer',
  requestId = `claim-${now}`,
) {
  return loyalty.claimDailyPoints(db, {
    userId,
    authSubject: userId,
    now,
    requestId,
    expectedVersion: 3,
    formVersionId: 'account.daily-reward-v1',
  });
}

void test('reports deny ordinary staff, wrong subjects, disabled actors and revocation during a read', async () => {
  const r = await reports();
  const f = await fixture();
  try {
    for (const report of [r.getPromoAdminReport, r.getLoyaltyAdminReport]) {
      for (const identity of [
        { id: 'admin', authSubject: 'admin' },
        { id: 'super', authSubject: 'admin' },
        { id: 'missing', authSubject: 'missing' },
      ]) {
        await assert.rejects(report(f.db, identity, {}, NOW), {
          code: 'unauthorized',
        });
      }
      await f.db
        .prepare("UPDATE users SET status='disabled' WHERE id='super'")
        .run();
      await assert.rejects(report(f.db, actor, {}, NOW), {
        code: 'unauthorized',
      });
      await f.db
        .prepare("UPDATE users SET status='active' WHERE id='super'")
        .run();
      let firstAuthorityRead = true;
      const changed = new Proxy(f.db, {
        get(target, key) {
          if (key === 'prepare')
            return (sql: string) => {
              const statement = target.prepare(sql);
              if (sql.includes("role='super_admin'")) {
                const original = statement.first.bind(statement);
                statement.first = async (
                  ...args: Parameters<typeof original>
                ) => {
                  const result = await original(...args);
                  if (firstAuthorityRead) {
                    firstAuthorityRead = false;
                    await f.db
                      .prepare(
                        "DELETE FROM user_roles WHERE user_id='super' AND role='super_admin'",
                      )
                      .run();
                  }
                  return result;
                };
              }
              return statement;
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      await assert.rejects(report(changed, actor, {}, NOW), {
        code: 'unauthorized',
      });
      await f.db
        .prepare(
          "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
        )
        .run();
    }
  } finally {
    f.dispose();
  }
});

void test('promo totals use published terms and retained consumption; item commission never multiplies activity', async () => {
  const r = await reports();
  const f = await fixture();
  try {
    const live = await livePromo(f.db);
    await promoOrder(f.db, 'kept', NOW - 1);
    await promoOrder(f.db, 'cancelled', NOW);
    await f.db
      .prepare(
        "UPDATE orders SET status='cancelled',updated_at=? WHERE id='cancelled'",
      )
      .bind(NOW + 1)
      .run();
    await promo.savePromoDraft(
      f.db,
      promoContext('new-draft', live.version),
      {
        ...promoTerms,
        budgetPaisa: 999000,
        startsAt: NOW + 86400000,
        label: 'Unpublished future',
      },
      live.campaignId,
    );
    await promo.savePromoDraft(f.db, promoContext('draft-only'), {
      ...promoTerms,
      code: 'DRAFTONLY',
      budgetPaisa: 888000,
    });
    const report = await r.getPromoAdminReport(f.db, actor, {}, NOW);
    assert.deepEqual(report.totals, {
      campaigns: 2,
      active: 1,
      drafts: 2,
      usedCount: 2,
      spentPaisa: 2000,
      publishedBudgetPaisa: 100000,
      remainingBudgetPaisa: 98000,
    });
    assert.equal(report.activityCount, 2);
    assert.equal(report.filteredDiscountPaisa, 2000);
    assert.deepEqual(
      report.activity.map((row) => [
        row.orderId,
        row.commissionPaisa,
        row.discountPaisa,
      ]),
      [
        ['cancelled', 1800, 1000],
        ['kept', 1800, 1000],
      ],
    );
    assert.equal(report.activity[0].orderStatus, 'cancelled');
    assert.equal(report.activity[0].label, 'Artisan gift');
    for (const query of [
      'SAVE10',
      'Artisan gift',
      'Asha',
      'asha@example',
      'FIX-kept',
    ]) {
      const found = await r.getPromoAdminReport(f.db, actor, { query }, NOW);
      assert.ok(found.activityCount >= 1, query);
      assert.equal(found.totals.spentPaisa, 2000);
    }
    assert.equal(
      (await r.getPromoAdminReport(f.db, actor, { query: "' OR 1=1 --" }, NOW))
        .activityCount,
      0,
    );
    const day = await r.getPromoAdminReport(
      f.db,
      actor,
      { from: '2026-09-29', to: '2026-09-29' },
      NOW,
    );
    assert.equal(day.activityCount, 1);
    assert.equal(day.activity[0].orderId, 'cancelled');
    assert.equal(day.filteredDiscountPaisa, 1000);
    assert.ok(
      report.history.some((row) =>
        row.changes.some(
          (change) =>
            change.label === 'Budget' &&
            change.before.includes('1,000') &&
            change.after.includes('9,990'),
        ),
      ),
    );
    await assert.rejects(
      r.getPromoAdminReport(f.db, actor, { query: 'x'.repeat(101) }, NOW),
      RangeError,
    );
    await assert.rejects(
      r.getPromoAdminReport(f.db, actor, { from: '2026-02-30' }, NOW),
      RangeError,
    );
  } finally {
    f.dispose();
  }
});

void test('promo activity and global history paginate independently and deterministically at 25 rows', async () => {
  const r = await reports();
  const f = await fixture();
  try {
    let state = await livePromo(f.db);
    for (let i = 0; i < 27; i++)
      await promoOrder(f.db, `order-${String(i).padStart(2, '0')}`, NOW);
    for (let i = 0; i < 27; i++)
      state = await promo.savePromoDraft(
        f.db,
        promoContext(`change-${i}`, state.version, NOW + i + 1),
        { ...promoTerms, label: `Artisan ${i}` },
        state.campaignId,
      );
    const first = await r.getPromoAdminReport(f.db, actor, {}, NOW);
    const second = await r.getPromoAdminReport(
      f.db,
      actor,
      { page: 2, historyPage: 2, query: 'SAVE10' },
      NOW,
    );
    assert.equal(first.activity.length, 25);
    assert.equal(second.activity.length, 2);
    assert.equal(second.activityCount, 27);
    assert.equal(second.filteredDiscountPaisa, 27000);
    assert.equal(
      new Set([...first.activity, ...second.activity].map((row) => row.id))
        .size,
      27,
    );
    assert.equal(first.history.length, 25);
    assert.equal(second.history.length, 4);
    assert.equal(first.historyCount, 29);
    assert.equal(
      new Set([...first.history, ...second.history].map((row) => row.id)).size,
      29,
    );
    assert.equal(
      (
        await r.getPromoAdminReport(
          f.db,
          actor,
          { query: 'no customer matches' },
          NOW,
        )
      ).historyCount,
      29,
    );
    assert.equal(
      (await r.getPromoAdminReport(f.db, actor, { from: '2026-09-30' }, NOW))
        .historyCount,
      0,
    );
  } finally {
    f.dispose();
  }
});

void test('loyalty reports live terms, Nepal claim day, signed activity and current customer balances from all wallet sources', async () => {
  const r = await reports();
  const f = await fixture();
  try {
    const state = await liveLoyalty(f.db);
    await daily(f.db, NOW - 1);
    await daily(f.db, NOW);
    await daily(f.db, NOW, 'other', 'other-today');
    await loyalty.redeemPoints(f.db, {
      userId: 'customer',
      authSubject: 'customer',
      requestId: 'redeem',
      now: NOW + 1,
      expectedVersion: 3,
      points: 100,
      formVersionId: 'account.points-redemption-v1',
    });
    // Referral source credit contributes to the current wallet balance too.
    await f.db
      .prepare(
        `INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at) VALUES ('wallet-order','WALLET-1','customer','asha@example.test','9811111111','placed','en-NP','fixture','{}',10000,500,10500,'cod','unpaid',1,1)`,
      )
      .run();
    await f.db
      .prepare(
        "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('referral-fixture','customer','wallet-order',500,-500,'referral_reward',?)",
      )
      .bind(NOW)
      .run();
    await loyalty.saveLoyaltyDraft(
      f.db,
      loyaltyContext('future-terms', state.version),
      { ...state.terms, dailyPoints: 200 },
    );
    const report = await r.getLoyaltyAdminReport(
      f.db,
      actor,
      { from: '2026-09-29', to: '2026-09-29', query: 'Asha' },
      NOW,
    );
    assert.deepEqual(report.totals, {
      customers: 2,
      claimedToday: 2,
      claims: 3,
      redemptions: 1,
      issuedPoints: 300,
      redeemedPoints: 100,
      creditedPaisa: 1000,
      outstandingPoints: 200,
    });
    assert.equal(report.liveTerms.dailyPoints, 100);
    assert.equal(report.liveTerms.revision, 1);
    assert.equal(report.liveTerms.pointsPerBlock, 100);
    assert.equal(report.liveTerms.paused, false);
    assert.equal(report.activityCount, 2);
    assert.deepEqual(
      report.activity.map((row) => [row.kind, row.points, row.creditPaisa]),
      [
        ['redemption', -100, 1000],
        ['daily_claim', 100, 0],
      ],
    );
    assert.equal(report.customerCount, 1);
    assert.deepEqual(report.customers[0], {
      id: 'customer',
      name: 'Asha Craft',
      email: 'asha@example.test',
      balancePoints: 100,
      walletBalancePaisa: 1500,
      claims: 2,
      redeemedPoints: 100,
      lastActivityAt: NOW + 1,
    });
    assert.equal(
      (await r.getLoyaltyAdminReport(f.db, actor, { query: 'other' }, NOW))
        .customerCount,
      1,
    );
    assert.equal(
      (await r.getLoyaltyAdminReport(f.db, actor, { from: '2026-09-30' }, NOW))
        .customers.length,
      2,
    );
    await loyalty.pauseLoyalty(
      f.db,
      loyaltyContext('pause', state.version + 1),
    );
    const paused = await r.getLoyaltyAdminReport(f.db, actor, {}, NOW);
    assert.equal(paused.liveTerms.paused, true);
    assert.equal(paused.liveTerms.dailyPoints, 100);
    assert.ok(
      paused.history.some((row) =>
        row.changes.some(
          (change) =>
            change.label === 'Paused' &&
            change.before === 'No' &&
            change.after === 'Yes',
        ),
      ),
    );
    assert.ok(
      paused.history.some((row) =>
        row.changes.some(
          (change) =>
            change.label === 'Daily points' &&
            change.before === '100 points' &&
            change.after === '200 points',
        ),
      ),
    );
  } finally {
    f.dispose();
  }
});

void test('loyalty customers and activity have independent pagination without join multiplication', async () => {
  const r = await reports();
  const f = await fixture();
  try {
    await liveLoyalty(f.db);
    for (let i = 0; i < 27; i++) {
      const id = `participant-${String(i).padStart(2, '0')}`;
      await seedIncentiveCustomer(f.db, id);
      await daily(f.db, NOW, id, `${id}-claim`);
    }
    const first = await r.getLoyaltyAdminReport(
      f.db,
      actor,
      { query: 'participant-' },
      NOW,
    );
    const second = await r.getLoyaltyAdminReport(
      f.db,
      actor,
      { query: 'participant-', page: 2, customerPage: 2 },
      NOW,
    );
    assert.equal(first.activity.length, 25);
    assert.equal(second.activity.length, 2);
    assert.equal(second.activityCount, 27);
    assert.equal(first.customers.length, 25);
    assert.equal(second.customers.length, 2);
    assert.equal(second.customerCount, 27);
    assert.equal(
      new Set([...first.customers, ...second.customers].map((row) => row.id))
        .size,
      27,
    );
    assert.equal(second.totals.issuedPoints, 2700);
    assert.equal(second.customers[0].claims, 1);
  } finally {
    f.dispose();
  }
});

void test('disabled defaults and a saved alternative denomination never replace live loyalty terms', async () => {
  const r = await reports();
  const f = await fixture();
  try {
    const emptyPromo = await r.getPromoAdminReport(f.db, actor, {}, NOW);
    assert.equal(emptyPromo.totals.campaigns, 0);
    assert.equal(emptyPromo.totals.spentPaisa, 0);
    assert.equal(emptyPromo.activityCount, 0);
    const disabled = await r.getLoyaltyAdminReport(f.db, actor, {}, NOW);
    assert.equal(disabled.liveTerms.revision, 0);
    assert.equal(disabled.liveTerms.enabled, false);
    assert.equal(disabled.liveTerms.paused, true);
    assert.equal(disabled.totals.customers, 0);
    assert.equal(disabled.historyCount, 0);
    const live = await liveLoyalty(f.db);
    const draft = await loyalty.saveLoyaltyDraft(
      f.db,
      loyaltyContext('alternative-rate', live.version),
      { ...live.terms, pointsPerBlock: 200, creditPaisaPerBlock: 5000 },
    );
    await loyalty.claimDailyPoints(f.db, {
      userId: 'customer',
      authSubject: 'customer',
      requestId: 'lock-rate',
      now: NOW,
      expectedVersion: draft.version,
      formVersionId: 'account.daily-reward-v1',
    });
    const locked = await r.getLoyaltyAdminReport(f.db, actor, {}, NOW);
    assert.equal(locked.liveTerms.pointsPerBlock, 100);
    assert.equal(locked.liveTerms.creditPaisaPerBlock, 1000);
    assert.equal(locked.liveTerms.revision, 1);
    assert.equal(locked.totals.issuedPoints, 100);
    assert.ok(
      locked.history.some((row) =>
        row.changes.some(
          (change) =>
            change.label === 'Wallet credit per block' &&
            change.after.includes('50.00'),
        ),
      ),
    );
  } finally {
    f.dispose();
  }
});

void test('audit changes format percentages and Nepal dates and loyalty history follows its own page', async () => {
  const r = await reports();
  const f = await fixture();
  try {
    const live = await livePromo(f.db);
    await promo.savePromoDraft(
      f.db,
      promoContext('percentage-draft', live.version),
      {
        code: 'SAVE10',
        label: 'Percentage gift',
        kind: 'percentage',
        percentBps: 1250,
        maxDiscountPaisa: 5000,
        minimumSubtotalPaisa: 10000,
        startsAt: NOW,
        endsAt: NOW + 86400000,
        totalUseLimit: 100,
        perCustomerUseLimit: 100,
        budgetPaisa: 100000,
      },
      live.campaignId,
    );
    const promoHistory = (await r.getPromoAdminReport(f.db, actor, {}, NOW))
      .history;
    const changed = promoHistory.find((row) =>
      row.subjectLabel.includes('Percentage gift'),
    )!;
    assert.ok(
      changed.changes.some(
        (change) => change.label === 'Percentage' && change.after === '12.5%',
      ),
    );
    assert.ok(
      changed.changes.some(
        (change) =>
          change.label === 'Starts' && /29.*2026.*NPT/.test(change.after),
      ),
    );
    let loyaltyState = await liveLoyalty(f.db);
    for (let i = 0; i < 27; i++)
      loyaltyState = await loyalty.saveLoyaltyDraft(
        f.db,
        loyaltyContext(
          `loyalty-history-${i}`,
          loyaltyState.version,
          NOW + i + 1,
        ),
        { ...loyaltyState.terms, dailyPoints: 100 + i },
      );
    const first = await r.getLoyaltyAdminReport(
      f.db,
      actor,
      { query: 'no matching customers' },
      NOW,
    );
    const second = await r.getLoyaltyAdminReport(
      f.db,
      actor,
      { historyPage: 2 },
      NOW,
    );
    assert.equal(first.historyCount, 29);
    assert.equal(first.history.length, 25);
    assert.equal(second.history.length, 4);
    assert.equal(
      new Set([...first.history, ...second.history].map((row) => row.id)).size,
      29,
    );
    assert.equal(
      (await r.getLoyaltyAdminReport(f.db, actor, { from: '2026-09-30' }, NOW))
        .historyCount,
      0,
    );
  } finally {
    f.dispose();
  }
});

async function maximumBudgetCampaigns(db: D1Database) {
  const campaigns = [];
  for (let index = 0; index < 3; index++) {
    const draft = await promo.savePromoDraft(
      db,
      promoContext(`maximum-draft-${index}`),
      {
        code: `LARGE${index}`,
        label: 'Large valid campaign',
        kind: 'fixed',
        fixedPaisa: Number.MAX_SAFE_INTEGER,
        budgetPaisa: Number.MAX_SAFE_INTEGER,
        minimumSubtotalPaisa: 0,
        startsAt: 0,
        endsAt: 253402300799999,
        totalUseLimit: 100,
        perCustomerUseLimit: 100,
      },
    );
    campaigns.push(
      await promo.publishPromo(
        db,
        promoContext(`maximum-publish-${index}`, draft.version),
        draft.campaignId,
      ),
    );
  }
  return campaigns;
}

void test('promo published and remaining budget totals stay exact beyond the safe integer range', async () => {
  const r = await reports();
  const f = await fixture();
  try {
    await maximumBudgetCampaigns(f.db);
    // Unpublished budgets must still be excluded from both monetary totals.
    await promo.savePromoDraft(f.db, promoContext('maximum-unpublished'), {
      ...promoTerms,
      code: 'LARGEDRAFT',
      budgetPaisa: Number.MAX_SAFE_INTEGER,
    });
    const report = await r.getPromoAdminReport(f.db, actor, {}, NOW);
    assert.equal(report.totals.publishedBudgetPaisa, '27021597764222973');
    assert.equal(report.totals.remainingBudgetPaisa, '27021597764222973');
    assert.equal(report.totals.spentPaisa, 0);
    assert.equal(report.totals.campaigns, 4);
    assert.equal(report.totals.drafts, 1);
  } finally {
    f.dispose();
  }
});

void test('promo consumed and filtered discount totals stay exact across large valid source redemptions', async () => {
  const r = await reports();
  const f = await fixture();
  try {
    const campaigns = await maximumBudgetCampaigns(f.db);
    for (const [index, campaign] of campaigns.entries()) {
      const id = `maximum-order-${index}`;
      const quote = await promo.quotePromo(f.db, {
        userId: 'customer',
        code: campaign.terms.code,
        subtotalPaisa: Number.MAX_SAFE_INTEGER,
        now: NOW + index,
      });
      const consumption = await promo.preparePromoConsumption(f.db, {
        userId: 'customer',
        orderId: id,
        requestId: `maximum-use-${index}`,
        now: NOW + index,
        quote,
        payloadDigest: 'b'.repeat(64),
        response: { orderId: id },
      });
      await f.db.batch([
        f.db
          .prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label)
          VALUES (?,?,'customer','asha@example.test','9811111111','placed','en-NP','fixture','{}',?,0,0,'cod','unpaid',1,1,?,?,?,?,?)`)
          .bind(
            id,
            `FIX-${id}`,
            Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
            quote.campaignId,
            quote.revision,
            quote.code,
            quote.label,
          ),
        f.db
          .prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at,platform_discount_paisa,promo_discount_paisa,referral_discount_paisa)
          VALUES (?,?,'product','seller','Fixture Shop','Fixture product','FIX-SKU',?,1,0,0,?,1,?,?,0)`)
          .bind(
            `${id}-item`,
            id,
            Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
          ),
        ...consumption,
      ]);
    }
    const report = await r.getPromoAdminReport(
      f.db,
      actor,
      { query: 'Asha' },
      NOW,
    );
    assert.equal(report.totals.spentPaisa, '27021597764222973');
    assert.equal(report.filteredDiscountPaisa, '27021597764222973');
    assert.equal(report.totals.remainingBudgetPaisa, 0);
    assert.equal(report.totals.usedCount, 3);
    assert.equal(report.activityCount, 3);
    assert.equal(report.activity[0].discountPaisa, Number.MAX_SAFE_INTEGER);
    const selected = await r.getPromoAdminReport(
      f.db,
      actor,
      { query: 'LARGE0' },
      NOW,
    );
    assert.equal(selected.filteredDiscountPaisa, Number.MAX_SAFE_INTEGER);
    assert.equal(selected.activityCount, 1);
    const noMatches = await r.getPromoAdminReport(
      f.db,
      actor,
      { query: 'absent' },
      NOW,
    );
    assert.equal(noMatches.filteredDiscountPaisa, 0);
    assert.equal(noMatches.totals.spentPaisa, '27021597764222973');
  } finally {
    f.dispose();
  }
});
