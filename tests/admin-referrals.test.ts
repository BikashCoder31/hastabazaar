import assert from 'node:assert/strict';
import test from 'node:test';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import {
  seedIncentiveCustomer,
  seedIncentiveInventory,
  incentiveItem,
} from './helpers/incentive-db';

const NOW = Date.parse('2026-10-15T18:15:00.000Z'); // October 16, midnight in Nepal.
const DAY = 86_400_000;
const actor = { id: 'super', authSubject: 'super' };
async function reporting() {
  const loaded = await import('../lib/db/repositories/admin-referrals').catch(
    () => null,
  );
  assert.ok(loaded, 'The read-only Super Admin referral report must exist');
  return loaded;
}
async function fixture() {
  const f = await incentiveReportDatabase();
  for (const id of ['super', 'admin', 'referrer'])
    await seedIncentiveCustomer(f.db, id);
  f.sqlite.exec(
    "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1),('admin','admin',1)",
  );
  async function referral(
    id: string,
    acceptedAt = NOW,
    deliveredAt: number | null = null,
  ) {
    await seedIncentiveCustomer(f.db, `buyer-${id}`);
    await f.db
      .prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,
      shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,
      created_at,updated_at,referral_discount_paisa,delivered_at)
      VALUES (?, ?, ?, ?, ?, ?, 'en-NP','fixture','{}',10000,500,9500,'cod',?, ?, ?,1000,?)`)
      .bind(
        id,
        `HK-${id}`,
        `buyer-${id}`,
        `buyer-${id}@example.test`,
        `phone-${id}`,
        deliveredAt === null ? 'confirmed' : 'delivered',
        deliveredAt === null ? 'pending' : 'paid',
        acceptedAt,
        acceptedAt,
        deliveredAt,
      )
      .run();
    await f.db
      .prepare(`INSERT INTO referral_redemptions(customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at)
      VALUES (?,'referrer',?,?,500,7,?)`)
      .bind(`buyer-${id}`, id, `phone-${id}`, acceptedAt)
      .run();
  }
  async function captured(id: string) {
    await f.db
      .prepare(`INSERT INTO payments(id,order_id,provider,method,status,amount_paisa,idempotency_key,created_at,updated_at)
      VALUES (?,?,'cod','cod','captured',9500,?,?,?)`)
      .bind(`payment-${id}`, id, `payment-${id}`, NOW, NOW)
      .run();
  }
  async function issued(id: string, at = NOW) {
    await f.db
      .prepare(`INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
      VALUES (?,'referrer',?,500,-500,'referral_reward',?)`)
      .bind(`reward:${id}`, id, at)
      .run();
  }
  return { ...f, referral, captured, issued };
}

void test('referral report refuses other roles, forged identities and revoked Super Admins', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    for (const who of [
      { id: 'admin', authSubject: 'admin' },
      { ...actor, authSubject: 'wrong' },
    ])
      await assert.rejects(getReferralAdminReport(f.db, who, {}, NOW), {
        code: 'unauthorized',
      });
    f.sqlite.exec(
      "DELETE FROM user_roles WHERE user_id='super' AND role='super_admin'",
    );
    await assert.rejects(getReferralAdminReport(f.db, actor, {}, NOW), {
      code: 'unauthorized',
    });
  } finally {
    f.dispose();
  }
});

void test('empty report returns zero totals without provisioning wallets or changing records', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    const before = f.sqlite.prepare('SELECT total_changes() n').get()?.n;
    f.sqlite.exec('PRAGMA query_only=ON');
    const result = await getReferralAdminReport(f.db, actor, {}, NOW);
    assert.deepEqual(result.totals, {
      discountPaisa: 0,
      waitingPaisa: 0,
      issuedPaisa: 0,
      balancePaisa: 0,
      referralOrders: 0,
    });
    assert.deepEqual(result.activity, []);
    assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n, before);
  } finally {
    f.dispose();
  }
});

void test('a Super Admin revoked while queries run cannot receive the assembled report', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    const prepare = f.db.prepare.bind(f.db);
    f.db.prepare = ((sql: string) => {
      const statement = prepare(sql);
      if (sql.includes('SELECT * FROM activity')) {
        const all = statement.all.bind(statement);
        statement.all = async <T = Record<string, unknown>>() => {
          const result = await all<T>();
          f.sqlite.exec(
            "DELETE FROM user_roles WHERE user_id='super' AND role='super_admin'",
          );
          return result;
        };
      }
      return statement;
    }) as typeof f.db.prepare;
    await assert.rejects(getReferralAdminReport(f.db, actor, {}, NOW), {
      code: 'unauthorized',
    });
  } finally {
    f.dispose();
  }
});

void test('wallet totals preserve every paisa when the aggregate exceeds a safe JavaScript number', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    await f.referral('large');
    for (const id of ['super', 'admin', 'referrer'])
      await f.db
        .prepare(`INSERT INTO wallet_entries
      (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES (?,?,'large',?,?,'refund',?)`)
        .bind(
          `large-${id}`,
          id,
          Number.MAX_SAFE_INTEGER,
          -Number.MAX_SAFE_INTEGER,
          NOW,
        )
        .run();
    const result = await getReferralAdminReport(f.db, actor, {}, NOW);
    assert.equal(result.totals.balancePaisa, '27021597764222973');
    assert.equal(result.totals.issuedPaisa, 0);
  } finally {
    f.dispose();
  }
});

void test('all four filters use Nepal calendar acceptance dates, including the exact midnight boundary', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    await f.referral('midnight', NOW);
    await f.referral('before', NOW - 1);
    await f.referral('six', NOW - 6 * DAY);
    await f.referral('seven', NOW - 7 * DAY);
    await f.referral('twentynine', NOW - 29 * DAY);
    await f.referral('thirty', NOW - 30 * DAY);
    await f.referral('future', NOW + 1);
    for (const [period, count] of [
      ['today', 1],
      ['7d', 3],
      ['30d', 5],
      ['all', 6],
    ] as const) {
      const result = await getReferralAdminReport(f.db, actor, { period }, NOW);
      assert.equal(result.totals.referralOrders, count, period);
      assert.equal(result.totals.discountPaisa, count * 1000, period);
      assert.equal(result.totals.waitingPaisa, count * 500, period);
      assert.equal(result.activityCount, count, period);
      assert.match(result.range.description, /Nepal time/);
    }
  } finally {
    f.dispose();
  }
});

void test('issued totals follow immutable reward event dates and balances ignore all report filters', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    await f.referral('old', NOW - 30 * DAY);
    await f.issued('old', NOW);
    await f.referral('new', NOW);
    await f.issued('new', NOW - 1);
    f.sqlite
      .exec(`INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES
      ('spend','referrer','old',-100,100,'order_spend',${NOW}),
      ('restore','referrer','old',50,-50,'refund',${NOW})`);
    const today = await getReferralAdminReport(
      f.db,
      actor,
      { period: 'today' },
      NOW,
    );
    assert.equal(today.totals.issuedPaisa, 500);
    assert.equal(today.totals.waitingPaisa, 0);
    assert.equal(today.totals.balancePaisa, 950);
    assert.deepEqual(
      today.activity.map((row) => [row.orderId, row.reason]),
      [['new', 'issued']],
    );
    const searched = await getReferralAdminReport(
      f.db,
      actor,
      { period: 'all', query: 'missing', status: 'blocked', page: 999 },
      NOW,
    );
    assert.equal(searched.totals.balancePaisa, 950);
    assert.equal(searched.totals.issuedPaisa, 1000);
    assert.equal(searched.totals.referralOrders, 2);
    assert.equal(searched.activityCount, 0);
    assert.equal(searched.page, 1);
  } finally {
    f.dispose();
  }
});

void test('read-only progress mirrors captured payment and strict snapshotted waiting gates without releasing rewards', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    await f.referral('delivery');
    await f.referral('payment', NOW - 8 * DAY, NOW - 8 * DAY);
    await f.referral('equal', NOW - 7 * DAY, NOW - 7 * DAY);
    await f.captured('equal');
    await f.referral('ready', NOW - 8 * DAY, NOW - 7 * DAY - 1);
    await f.captured('ready');
    f.sqlite.exec(
      'UPDATE referral_campaign SET reward_paisa=9999,return_window_days=30',
    );
    f.sqlite.exec('PRAGMA query_only=ON');
    const report = await getReferralAdminReport(f.db, actor, {}, NOW);
    assert.deepEqual(
      Object.fromEntries(
        report.activity.map((row) => [row.orderId, row.reason]),
      ),
      {
        delivery: 'delivery_pending',
        ready: 'ready',
        equal: 'waiting_period',
        payment: 'payment_pending',
      },
    );
    assert.equal(report.totals.waitingPaisa, 2000);
    assert.equal(report.totals.issuedPaisa, 0);
    assert.equal(
      f.sqlite.prepare('SELECT count(*) n FROM wallet_entries').get()?.n,
      0,
    );
    assert.equal(
      report.activity.find((row) => row.orderId === 'equal')?.eligibleAt,
      NOW,
    );
  } finally {
    f.dispose();
  }
});

void test('cancelled and refunded rewards do not inflate pending, while issued history survives later cancellation', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    for (const id of ['cancel', 'refund', 'issued', 'inactive'])
      await f.referral(id);
    await f.issued('issued');
    f.sqlite.exec(
      "UPDATE orders SET status='cancelled' WHERE id IN ('cancel','issued'); UPDATE orders SET payment_status='refunded' WHERE id='refund'; UPDATE users SET status='disabled' WHERE id='referrer'",
    );
    const report = await getReferralAdminReport(f.db, actor, {}, NOW);
    assert.equal(report.totals.waitingPaisa, 0);
    assert.equal(report.totals.issuedPaisa, 500);
    assert.equal(report.totals.discountPaisa, 2000);
    assert.deepEqual(
      Object.fromEntries(
        report.activity.map((row) => [row.orderId, row.reason]),
      ),
      {
        refund: 'order_refunded',
        issued: 'issued',
        inactive: 'account_inactive',
        cancel: 'order_cancelled',
      },
    );
  } finally {
    f.dispose();
  }
});

void test('return, complaint and COD explanations match the real release gates without duplicate totals', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    await seedIncentiveCustomer(f.db, 'customer');
    await seedIncentiveInventory(f.db);
    await f.referral('blocked', NOW - 8 * DAY, NOW - 8 * DAY);
    await f.captured('blocked');
    await incentiveItem(f.db, 'item', 'blocked').run();
    await f.db
      .prepare(`INSERT INTO payments(id,order_id,provider,method,status,amount_paisa,idempotency_key,created_at,updated_at)
      VALUES ('another-payment','blocked','cod','cod','captured',1,'another-payment',?,?)`)
      .bind(NOW, NOW)
      .run();
    const reason = async () =>
      (await getReferralAdminReport(f.db, actor, {}, NOW)).activity[0]?.reason;
    f.sqlite
      .exec(`INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at)
      VALUES ('job','blocked','seller','outbound','delivered','super','job',1,1);
      INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,collected_paisa,remitted_paisa,created_at) VALUES ('job',9500,9500,9499,1)`);
    assert.equal(await reason(), 'cod_unsettled');
    f.sqlite.exec(
      "UPDATE shipping_parcels SET remitted_paisa=9500; UPDATE shipping_jobs SET status='dispatched'",
    );
    assert.equal(await reason(), 'cod_unsettled');
    f.sqlite.exec("UPDATE shipping_jobs SET status='cancelled'");
    assert.equal(await reason(), 'ready');
    f.sqlite
      .exec(`INSERT INTO complaints(id,reference_number,order_id,category,subject,detail,status,created_at,updated_at)
      VALUES ('complaint','CMP-TEST','blocked','product','Fictional','Evidence','open',1,1)`);
    assert.equal(await reason(), 'complaint_open');
    for (const status of ['resolved', 'closed']) {
      f.sqlite.prepare('UPDATE complaints SET status=?').run(status);
      assert.equal(await reason(), 'ready', status);
    }
    f.sqlite
      .exec(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at,resolution_outcome)
      VALUES ('return','item','Fictional','Evidence','requested',1,NULL)`);
    assert.equal(await reason(), 'return_open');
    for (const status of ['rejected', 'cancelled']) {
      f.sqlite.prepare('UPDATE return_requests SET status=?').run(status);
      assert.equal(await reason(), 'ready', status);
    }
    for (const outcome of ['refund', 'replacement', 'return_to_origin']) {
      f.sqlite
        .prepare(
          "UPDATE return_requests SET status='resolved',resolution_outcome=?",
        )
        .run(outcome);
      assert.equal(await reason(), 'return_completed', outcome);
    }
    f.sqlite.exec(
      "UPDATE return_requests SET status='resolved',resolution_outcome=NULL",
    );
    assert.equal(await reason(), 'return_open');
    f.sqlite.exec(
      "UPDATE return_requests SET status='cancelled'; UPDATE orders SET current_subtotal_paisa=1000,current_delivery_paisa=500,current_wallet_paisa=0,current_discount_paisa=100,current_total_paisa=1400,payment_status='part_refunded'",
    );
    assert.equal(await reason(), 'order_refunded');
    const report = await getReferralAdminReport(f.db, actor, {}, NOW);
    assert.equal(
      report.totals.discountPaisa,
      1000,
      'Gross saved discount is not replaced by the current cancellation-adjusted amount',
    );
    assert.equal(report.totals.waitingPaisa, 0);
    assert.equal(report.totals.referralOrders, 1);
  } finally {
    f.dispose();
  }
});

void test('an existing referral credit with a noncanonical entry id is still reported as issued exactly once', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    await f.referral('legacy');
    f.sqlite
      .exec(`INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
      VALUES ('legacy-issued-credit','referrer','legacy',500,-500,'referral_reward',${NOW})`);
    const report = await getReferralAdminReport(f.db, actor, {}, NOW);
    assert.equal(report.totals.issuedPaisa, 500);
    assert.equal(report.totals.waitingPaisa, 0);
    assert.equal(report.activity[0]?.reason, 'issued');
  } finally {
    f.dispose();
  }
});

void test('activity search treats SQL wildcards literally and pages ties deterministically without filtering totals', async () => {
  const { getReferralAdminReport } = await reporting();
  const f = await fixture();
  try {
    for (let i = 0; i < 27; i++)
      await f.referral(`tie-${String(i).padStart(2, '0')}`);
    f.sqlite.exec(
      "UPDATE users SET display_name='Maker %_ literal' WHERE id='referrer'",
    );
    const first = await getReferralAdminReport(
      f.db,
      actor,
      { query: '%_' },
      NOW,
    );
    const second = await getReferralAdminReport(
      f.db,
      actor,
      { query: '%_', page: 2 },
      NOW,
    );
    assert.equal(first.activityCount, 27);
    assert.equal(first.activity.length, 25);
    assert.equal(first.activity[0]?.orderId, 'tie-26');
    assert.deepEqual(
      second.activity.map((row) => row.orderId),
      ['tie-01', 'tie-00'],
    );
    const missing = await getReferralAdminReport(
      f.db,
      actor,
      { query: "' OR 1=1--" },
      NOW,
    );
    assert.equal(missing.activityCount, 0);
    assert.equal(missing.totals.discountPaisa, 27000);
    assert.equal(
      (await getReferralAdminReport(f.db, actor, { status: 'issued' }, NOW))
        .activityCount,
      0,
    );
  } finally {
    f.dispose();
  }
});
