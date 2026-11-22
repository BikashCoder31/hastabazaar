import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import {
  incentiveItem,
  seedIncentiveCustomer,
  seedIncentiveInventory,
} from './helpers/incentive-db';
import {
  preparePromoConsumption,
  quotePromo,
} from '../lib/db/repositories/promo-codes';
import { publishForm } from './helpers/loyalty-fixture';
import {
  claimDailyPoints,
  publishLoyalty,
  redeemPoints,
  saveLoyaltyDraft,
} from '../lib/db/repositories/loyalty';

const monthStart = Date.parse('2026-11-01T00:00:00+05:45');
const now = monthStart + 60_000;
const actor = {
  id: 'super',
  authSubject: 'super',
  role: 'super_admin' as const,
};

async function fixture(t: TestContext) {
  const f = await incentiveReportDatabase();
  t.after(f.dispose);
  for (const id of [
    'super',
    'admin',
    'customer',
    'friend',
    'referrer',
    'older-customer',
  ]) {
    await seedIncentiveCustomer(f.db, id);
  }
  f.sqlite.exec(
    "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1),('admin','admin',1)",
  );
  return f;
}

void test('offer rows keep published promo economics when a draft exists and leave untracked order counts blank', async (t) => {
  const { readOffersOverview } = await import('../app/admin/offers/offer-data');
  const { db, sqlite } = await fixture(t);
  sqlite.exec(`INSERT INTO promo_campaigns
    (id,code,created_at,updated_at)
    VALUES ('current','CURRENT',1,1), ('draft','DRAFT',2,2)`);
  sqlite.exec(`INSERT INTO promo_revisions
    (campaign_id,revision,label,kind,fixed_paisa,minimum_subtotal_paisa,starts_at,ends_at,
     total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at)
    VALUES ('current',1,'Published rule','fixed',100,0,1,${now},4,1,1000,'super','publish-1','Test','test',1),
      ('current',2,'New draft','fixed',200,999,1,${now + 1},20,2,9999,'super','draft-2','Test','test',1),
      ('draft',1,'Draft only','fixed',400,0,1,${now + 1},5,1,5000,'super','draft-1','Test','test',1)`);
  sqlite.exec(
    "UPDATE promo_campaigns SET status='published',current_revision=1,draft_revision=2 WHERE id='current'",
  );
  sqlite.exec("UPDATE promo_campaigns SET draft_revision=1 WHERE id='draft'");
  await seedIncentiveInventory(db);
  const quote = await quotePromo(db, {
    userId: 'customer',
    code: 'CURRENT',
    subtotalPaisa: 10000,
    now: monthStart,
  });
  const consumption = await preparePromoConsumption(db, {
    userId: 'customer',
    orderId: 'promo-order',
    requestId: 'promo-checkout',
    now: monthStart,
    quote,
    payloadDigest: 'a'.repeat(64),
    response: { orderId: 'promo-order' },
  });
  await db.batch([
    db
      .prepare(`INSERT INTO orders
      (id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,
       item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,
       promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label)
      VALUES ('promo-order','HK-promo','customer','customer@example.test','9811111111','placed','en-NP','fixture','{}',
        10000,500,10400,'cod','unpaid',?,?,100,?,?,?,?)`)
      .bind(
        monthStart,
        monthStart,
        quote.campaignId,
        quote.revision,
        quote.code,
        quote.label,
      ),
    incentiveItem(db, 'promo-item-a', 'promo-order', 50),
    incentiveItem(db, 'promo-item-b', 'promo-order', 50),
    ...consumption,
  ]);
  sqlite.exec('PRAGMA query_only=ON');
  const result = await readOffersOverview(db, actor, 'all', 1, now);
  assert.equal(result.counts.promo, 2);
  const current = result.offers.find((offer) => offer.title === 'CURRENT');
  assert.equal(current?.status, 'Ended');
  assert.equal(current?.orders, 1);
  assert.equal(result.monthly.promo, '100');
  assert.deepEqual(current?.budget, { unit: 'paisa', used: 100, limit: 1000 });
  assert.match(current?.rule ?? '', /1\.00/);
  assert.equal(
    result.offers.find((offer) => offer.title === 'DRAFT')?.status,
    'Draft',
  );
  assert.equal(
    result.offers.find((offer) => offer.kind === 'referral')?.orders,
    0,
  );
  for (const kind of ['loyalty', 'gift']) {
    assert.equal(
      result.offers.find((offer) => offer.kind === kind)?.orders,
      null,
    );
  }
  const gift = await readOffersOverview(db, actor, 'gift', 1, now);
  assert.deepEqual(
    gift.offers.map((offer) => offer.kind),
    ['gift'],
  );
  await assert.rejects(
    readOffersOverview(db, { ...actor, authSubject: 'changed' }, 'all', 1, now),
  );
  await assert.rejects(
    readOffersOverview(
      db,
      { id: 'admin', role: 'admin', authSubject: 'admin' },
      'all',
      1,
      now,
    ),
  );
});

void test('monthly offer costs preserve exact paisa and apply the Nepal month boundary to recorded costs', async (t) => {
  const { readOffersOverview } = await import('../app/admin/offers/offer-data');
  const { db, sqlite } = await fixture(t);
  const order = sqlite.prepare(`INSERT INTO orders
    (id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,
     shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,
     payment_mode,payment_status,created_at,updated_at,referral_discount_paisa)
    VALUES (?,?,?,?,?,?,'en-NP','test','{}',10000,500,9500,'cod','pending',?,?,?)`);
  order.run(
    'before',
    'HK-before',
    'older-customer',
    'before@example.test',
    'before',
    'confirmed',
    monthStart - 1,
    monthStart - 1,
    0,
  );
  order.run(
    'referral',
    'HK-referral',
    'friend',
    'referral@example.test',
    'friend',
    'confirmed',
    monthStart,
    monthStart,
    1000,
  );
  order.run(
    'cancelled',
    'HK-cancelled',
    'customer',
    'cancelled@example.test',
    'cancelled',
    'cancelled',
    now,
    now,
    900,
  );
  sqlite
    .prepare(`INSERT INTO referral_redemptions
    (customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at)
    VALUES (?,?,?,?,?,?,?)`)
    .run('friend', 'referrer', 'referral', 'friend', 500, 7, monthStart);
  sqlite
    .prepare(`INSERT INTO referral_redemptions
    (customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at)
    VALUES (?,?,?,?,?,?,?)`)
    .run('customer', 'referrer', 'cancelled', 'cancelled', 500, 7, now);
  sqlite
    .prepare(`INSERT INTO wallet_entries
    (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
    VALUES ('reward','referrer','referral',?,?, 'referral_reward',?)`)
    .run(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, now);
  for (const form of [
    'staff.loyalty-settings',
    'account.daily-reward',
    'account.points-redemption',
  ]) {
    await publishForm(db, form);
  }
  const loyaltyActor = {
    actorId: actor.id,
    authSubject: actor.authSubject,
    now: monthStart - 86_400_000,
    reason: 'Test published loyalty rules',
    form: {
      formId: 'staff.loyalty-settings' as const,
      versionId: 'staff.loyalty-settings-v1',
      answers: {
        formId: 'staff.loyalty-settings' as const,
        version: 1,
        answers: [],
      },
    },
  };
  const draft = await saveLoyaltyDraft(
    db,
    { ...loyaltyActor, requestId: 'draft-loyalty', expectedVersion: 1 },
    {
      enabled: true,
      dailyPoints: 100,
      pointsPerBlock: 100,
      creditPaisaPerBlock: 500,
      startsAt: monthStart - 86_400_000,
      endsAt: now + 86_400_000,
      dailyBudgetPoints: 1000,
      lifetimeBudgetPoints: 10000,
    },
  );
  const live = await publishLoyalty(db, {
    ...loyaltyActor,
    requestId: 'publish-loyalty',
    expectedVersion: draft.version,
  });
  for (const [request, at] of [
    ['before', monthStart - 1],
    ['inside', now],
  ] as const) {
    const customer = {
      userId: 'customer',
      authSubject: 'customer',
      now: at,
      expectedVersion: live.version,
    };
    await claimDailyPoints(db, {
      ...customer,
      requestId: 'claim-' + request,
      formVersionId: 'account.daily-reward-v1',
    });
    await redeemPoints(db, {
      ...customer,
      requestId: 'redeem-' + request,
      formVersionId: 'account.points-redemption-v1',
      points: 100,
    });
  }
  sqlite.exec('PRAGMA query_only=ON');
  const result = await readOffersOverview(db, actor, 'all', 1, now);
  assert.equal(result.averageSubtotalPaisa, 10000);
  assert.equal(result.monthly.referral, '9007199254741991');
  assert.equal(result.monthly.loyalty, '500');
  assert.equal(result.monthly.total, '9007199254742491');
  assert.equal(
    result.offers.find((offer) => offer.kind === 'referral')?.orders,
    2,
  );
});
