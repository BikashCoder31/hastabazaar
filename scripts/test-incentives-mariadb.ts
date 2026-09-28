import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import { claimDailyPoints, redeemPoints } from '../lib/db/repositories/loyalty';
import {
  quotePromo,
  preparePromoConsumption,
} from '../lib/db/repositories/promo-codes';
import { buildFormAnswerInsert } from '../lib/db/repositories/form-answers';
import { saveFormDraft } from '../lib/db/repositories/form-catalog';
import {
  seedIncentiveCustomer,
  seedIncentiveInventory,
  incentiveItem,
} from '../tests/helpers/incentive-db';
import { publishForm, claim, NOW } from '../tests/helpers/loyalty-fixture';

/** mysql client directives are consumed here, never sent to the SQL server. */
export function mariaStatements(sql: string): string[] {
  let delimiter = ';',
    buffer = '';
  const statements: string[] = [];
  for (const line of sql.split(/\r?\n/)) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (directive) {
      assert.ok(
        !buffer.trim() ||
          buffer
            .trim()
            .split('\n')
            .every((l) => !l.trim() || l.trim().startsWith('--')),
        'Unterminated SQL before DELIMITER',
      );
      delimiter = directive[1];
      continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      statements.push(buffer.trimEnd().slice(0, -delimiter.length));
      buffer = '';
    }
  }
  assert.ok(
    !buffer.trim() ||
      buffer
        .trim()
        .split('\n')
        .every((l) => !l.trim() || l.trim().startsWith('--')),
    'Unterminated SQL at end of fixture',
  );
  return statements.filter((s) => s.trim());
}
export async function seedCompatibility(db: D1Database) {
  for (const id of ['customer', 'other', 'super'])
    await seedIncentiveCustomer(db, id);
  await db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
    )
    .run();
  for (const form of [
    'account.daily-reward',
    'account.points-redemption',
    'staff.loyalty-settings',
  ])
    await publishForm(db, form);
  await db
    .prepare(
      "INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at) VALUES (1,1,200,100,1000,0,253402300799999,1000,10000,'super','fixture-terms','ISOLATED SCHEMA FIXTURE, not admin acceptance','staff.loyalty-settings-v1',1)",
    )
    .run();
  await db
    .prepare(
      "UPDATE loyalty_config SET current_revision=1,paused=0 WHERE id='default'",
    )
    .run();
}
export async function conservation(db: D1Database) {
  const awarded = await claimDailyPoints(db, claim('conserved-claim'));
  assert.equal(awarded.awardedPoints, 200);
  const input = {
    ...claim('conserved-redemption'),
    points: 200,
    formVersionId: 'account.points-redemption-v1',
  };
  const redemption = await redeemPoints(db, input);
  const linked = await db
    .prepare(
      'SELECT -e.points pointsDebited,w.amount_paisa walletCreditedPaisa FROM loyalty_points_entries e JOIN wallet_entries w ON w.loyalty_redemption_id=e.redemption_id AND w.user_id=e.user_id WHERE e.redemption_id=?',
    )
    .bind(redemption.redemptionId)
    .all<{ pointsDebited: number; walletCreditedPaisa: number }>();
  assert.equal(linked.results[0].pointsDebited, 200);
  assert.equal(linked.results[0].walletCreditedPaisa, 2000);
  assert.equal(linked.results.length, 1);
  const receipt = await db
    .prepare('SELECT response_json FROM loyalty_redemptions WHERE id=?')
    .bind(redemption.redemptionId)
    .first<{ response_json: string }>();
  assert.equal(
    typeof receipt!.response_json,
    'string',
    'D1 receipt JSON remains raw TEXT across the adapter',
  );
  assert.deepEqual(
    await redeemPoints(db, { ...input, now: NOW + 86400000 }),
    redemption,
  );
  const totals = await db
    .prepare(
      "SELECT (SELECT balance_points FROM loyalty_accounts WHERE user_id='customer') points,(SELECT SUM(points) FROM loyalty_points_entries WHERE user_id='customer') pointsSum,(SELECT balance_paisa FROM wallet_accounts WHERE user_id='customer') wallet,(SELECT SUM(amount_paisa) FROM wallet_entries WHERE user_id='customer') walletSum,(SELECT redeemed_points FROM loyalty_config) redeemed,(SELECT credited_paisa FROM loyalty_config) credited",
    )
    .first();
  assert.deepEqual(totals, {
    points: 0,
    pointsSum: 0,
    wallet: 2000,
    walletSum: 2000,
    redeemed: 200,
    credited: 2000,
  });
  assert.equal(
    (await db
      .prepare(
        'SELECT COUNT(*) n FROM wallet_entries WHERE loyalty_redemption_id=?',
      )
      .bind(redemption.redemptionId)
      .first<{ n: number }>())!.n,
    1,
  );
}
export async function jsonGuards(
  db: D1Database,
  kind: 'all' | 'array' | 'boolean' = 'all',
) {
  if (kind !== 'boolean')
    for (const form of ['account.daily-reward', 'account.points-redemption']) {
      const sql = `SELECT EXISTS(SELECT 1 FROM form_config_versions v WHERE v.id=? AND v.form_id='${form}' AND v.status='published' AND v.version=(SELECT MAX(version) FROM form_config_versions WHERE form_id=v.form_id AND status='published') AND json_extract(v.config_json,'$.formId')=v.form_id AND json_type(v.config_json,'$.fields')='array' AND json_array_length(v.config_json,'$.fields')=0) valid`;
      assert.equal(
        (await db
          .prepare(sql)
          .bind(form + '-v1')
          .first<{ valid: number }>())!.valid,
        1,
      );
    }
  if (kind !== 'array')
    for (const [value, valid] of [
      [true, 1],
      [false, 0],
      ['true', 0],
      [null, 0],
    ] as const) {
      assert.equal(
        (await db
          .prepare(
            "SELECT COALESCE(json_extract(next_json,'$.incentivesIncluded')=1,0) valid FROM (SELECT ? next_json) evidence",
          )
          .bind(JSON.stringify({ incentivesIncluded: value }))
          .first<{ valid: number }>())!.valid,
        valid,
      );
    }
}
export async function promoImmutable(db: D1Database) {
  await seedIncentiveInventory(db);
  const label = 'न'.repeat(100);
  await db
    .prepare(
      "INSERT INTO promo_campaigns(id,code,created_at,updated_at) VALUES ('compat-promo','SAVE10',1,1)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at) VALUES ('compat-promo',1,?,'fixed',1000,0,0,253402300799999,10,2,10000,'super','compat-promo-revision','SCHEMA ONLY','fixture',1)",
    )
    .bind(label)
    .run();
  await db
    .prepare(
      "UPDATE promo_campaigns SET current_revision=1,status='published' WHERE id='compat-promo'",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label) VALUES ('compat-order','COMPAT-ORDER','customer','customer@example.test','9811111111','placed','en-NP','fixture','{}',10000,500,9500,'cod','unpaid',1,1,1000,'compat-promo',1,'SAVE10',?)",
    )
    .bind(label)
    .run();
  await incentiveItem(db, 'compat-item', 'compat-order', 1000).run();
  await db
    .prepare(
      "INSERT INTO promo_redemptions(id,campaign_id,revision,customer_id,order_id,actor_id,request_id,payload_digest,response_json,discount_paisa,subtotal_paisa,created_at) VALUES ('compat-promo-source','compat-promo',1,'customer','compat-order','customer','compat-promo-request',?,'{}',1000,10000,10)",
    )
    .bind('a'.repeat(64))
    .run();
  await assert.rejects(
    db
      .prepare("UPDATE orders SET promo_code='save10' WHERE id='compat-order'")
      .run(),
  );
  await assert.rejects(
    db
      .prepare(
        "UPDATE promo_revisions SET label=? WHERE campaign_id='compat-promo' AND revision=1",
      )
      .bind('न'.repeat(99) + 'N')
      .run(),
  );
  assert.equal(
    (await db
      .prepare("SELECT promo_label label FROM orders WHERE id='compat-order'")
      .first<{ label: string }>())!.label,
    label,
  );
}

export async function financialSnapshot(db: D1Database) {
  const tables = [
    'loyalty_accounts',
    'loyalty_daily_claims',
    'loyalty_points_entries',
    'loyalty_redemptions',
    'loyalty_config',
    'loyalty_day_issuance',
    'wallet_accounts',
    'wallet_entries',
    'form_answer_sets',
    'audit_logs',
  ];
  const snapshot: Record<string, unknown> = {};
  for (const table of tables)
    snapshot[table] = (
      await db.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all()
    ).results;
  return snapshot;
}
export async function walletFailure(
  db: D1Database,
  inject: () => Promise<unknown>,
  remove: () => Promise<unknown>,
) {
  await claimDailyPoints(
    db,
    claim('rollback-fund', 1, 'customer', NOW + 86400000),
  );
  const before = await financialSnapshot(db);
  await inject();
  const input = {
    ...claim('rollback-redeem', 1, 'customer', NOW + 86400000),
    points: 200,
    formVersionId: 'account.points-redemption-v1',
  };
  try {
    await assert.rejects(redeemPoints(db, input));
    assert.deepEqual(await financialSnapshot(db), before);
  } finally {
    await remove();
  }
  assert.equal((await redeemPoints(db, input)).creditPaisa, 2000);
}
export async function concurrency(db: D1Database) {
  const claims = await Promise.allSettled([
    claimDailyPoints(db, claim('parallel-a', 1, 'other')),
    claimDailyPoints(db, claim('parallel-b', 1, 'other')),
  ]);
  assert.equal(claims.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await db
      .prepare(
        "SELECT COUNT(*) n FROM loyalty_daily_claims WHERE user_id='other'",
      )
      .first<{ n: number }>())!.n,
    1,
  );
  const inputs = ['overspend-a', 'overspend-b'].map((request) => ({
    ...claim(request, 1, 'other'),
    points: 200,
    formVersionId: 'account.points-redemption-v1',
  }));
  const redemptions = await Promise.allSettled(
    inputs.map((input) => redeemPoints(db, input)),
  );
  assert.equal(redemptions.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await db
      .prepare(
        "SELECT balance_points n FROM loyalty_accounts WHERE user_id='other'",
      )
      .first<{ n: number }>())!.n,
    0,
  );
  assert.equal(
    (await db
      .prepare("SELECT COUNT(*) n FROM wallet_entries WHERE user_id='other'")
      .first<{ n: number }>())!.n,
    1,
  );
  await db
    .prepare(
      "INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at) VALUES (2,1,10,100,1000,0,253402300799999,1000,10000,'super','ten-point-terms','SCHEMA ONLY','staff.loyalty-settings-v1',1)",
    )
    .run();
  await db
    .prepare('UPDATE loyalty_config SET current_revision=2,version=2')
    .run();
  const tens = await Promise.allSettled([
    claimDailyPoints(db, claim('ten-a', 2, 'other', NOW + 86400000)),
    claimDailyPoints(db, claim('ten-b', 2, 'other', NOW + 86400000)),
  ]);
  assert.equal(tens.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await db
      .prepare(
        "SELECT balance_points n FROM loyalty_accounts WHERE user_id='other'",
      )
      .first<{ n: number }>())!.n,
    10,
  );
  assert.equal(
    (await db
      .prepare(
        "SELECT SUM(awarded_points) n FROM loyalty_daily_claims WHERE user_id='other' AND local_date='2026-09-29'",
      )
      .first<{ n: number }>())!.n,
    10,
  );
}
export async function malformedClaimSnapshots(db: D1Database) {
  const day = '2026-09-30',
    timestamp = NOW + 2 * 86400000;
  const valid = {
    claimId: 'invalid-claim',
    localDate: day,
    awardedPoints: 10,
    balancePoints: 20,
  };
  const variants = [
    {},
    { ...valid, awardedPoints: null },
    { ...valid, awardedPoints: '10' },
    { ...valid, awardedPoints: 10.5 },
    { ...valid, claimId: 'INVALID-CLAIM' },
    { ...valid, balancePoints: 999 },
  ];
  const before = await financialSnapshot(db);
  for (const snapshot of variants)
    await assert.rejects(
      db
        .prepare(
          "INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at) VALUES ('invalid-claim','other','other','invalid-claim',?,2,?,10,?,'account.daily-reward-v1',?)",
        )
        .bind('a'.repeat(64), day, JSON.stringify(snapshot), timestamp)
        .run(),
    );
  await assert.rejects(
    db
      .prepare(
        "INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at) VALUES ('invalid-claim','other','customer','invalid-claim',?,2,?,10,?,'account.daily-reward-v1',?)",
      )
      .bind('a'.repeat(64), day, JSON.stringify(valid), timestamp)
      .run(),
  );
  assert.deepEqual(await financialSnapshot(db), before);
}
export async function seedLegacy(db: D1Database) {
  await seedIncentiveCustomer(db, 'legacy');
  await db
    .prepare(
      "INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('legacy-gift',?,5000,'legacy','legacy-issue',1,'legacy',1,'legacy-gift-request')",
    )
    .bind('b'.repeat(64))
    .run();
  await db
    .prepare(
      "INSERT INTO wallet_entries(id,user_id,gift_card_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('legacy-gift-credit','legacy','legacy-gift',NULL,5000,-5000,'gift_card',1)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,referral_discount_paisa,wallet_credit_paisa) VALUES ('legacy-order','LEGACY-ORDER','legacy','legacy@example.test','9811111111','placed','en-NP','fixture','{}',10000,500,9000,'cod','unpaid',1,1,500,1000)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('legacy-spend','legacy','legacy-order',-1000,1000,'order_spend',1)",
    )
    .run();
  await db
    .prepare("UPDATE orders SET status='cancelled' WHERE id='legacy-order'")
    .run();
}
export async function legacySnapshot(db: D1Database) {
  return {
    order: await db
      .prepare(
        "SELECT referral_discount_paisa,grand_total_paisa,status FROM orders WHERE id='legacy-order'",
      )
      .first(),
    gift: await db
      .prepare("SELECT * FROM gift_cards WHERE id='legacy-gift'")
      .first(),
    entries: (
      await db
        .prepare(
          "SELECT id,amount_paisa,platform_amount_paisa,kind FROM wallet_entries WHERE user_id='legacy' ORDER BY id",
        )
        .all()
    ).results,
    balance: await db
      .prepare(
        "SELECT balance_paisa FROM wallet_accounts WHERE user_id='legacy'",
      )
      .first(),
  };
}

async function oldReadViewClaim(
  db: D1Database,
  control: Connection,
  database: string,
  observer: Connection,
) {
  const cases = [
    {
      name: 'pause',
      change: () => control.query('UPDATE loyalty_config SET paused=1'),
      restore: () => control.query('UPDATE loyalty_config SET paused=0'),
    },
    {
      name: 'publication',
      change: () =>
        control.query('UPDATE loyalty_config SET version=version+1'),
      restore: () => control.query('SELECT 1'),
    },
  ];
  for (const entry of cases) {
    const version = (await db
      .prepare('SELECT version FROM loyalty_config')
      .first<{ version: number }>())!.version;
    const before = (await db
      .prepare(
        "SELECT COUNT(*) n FROM loyalty_daily_claims WHERE user_id='customer'",
      )
      .first<{ n: number }>())!.n;
    await control.beginTransaction();
    await control.query("SELECT id FROM users WHERE id='super' FOR UPDATE");
    const transaction = new Proxy(db, {
      get(target, key) {
        if (key === 'batch')
          return async (statements: D1PreparedStatement[]) =>
            target.batch([
              target.prepare('SELECT version FROM loyalty_config'), // Establish an old consistent read view on the actual batch connection.
              target.prepare(
                "UPDATE users SET updated_at=updated_at WHERE id='super'",
              ),
              ...statements,
            ]);
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const attempt = claimDailyPoints(
      transaction,
      claim('old-view-' + entry.name, version, 'customer', NOW + 2 * 86400000),
    ).then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );
    let waiting = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [locks] = await observer.query<RowDataPacket[]>(
        'SELECT l.lock_table AS lockTable,t.trx_query AS waitingQuery FROM information_schema.INNODB_LOCK_WAITS w JOIN information_schema.INNODB_LOCKS l ON l.lock_id=w.requested_lock_id JOIN information_schema.INNODB_TRX t ON t.trx_id=w.requesting_trx_id',
      );
      if (locks.length)
        console.log(JSON.stringify({ stage: 'observed fixture locks', locks }));
      waiting = locks.some(
        (row) =>
          String(row.lockTable).includes(database) &&
          String(row.lockTable).includes('users'),
      );
      if (waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!waiting) {
      const [pending] = await control.query<RowDataPacket[]>(
        "SELECT STATE FROM information_schema.PROCESSLIST WHERE DB=? AND COMMAND<>'Sleep'",
        [database],
      );
      console.log(
        JSON.stringify({ stage: 'old-view barrier diagnostic', pending }),
      );
      const [transactions] = await observer.query<RowDataPacket[]>(
        'SELECT trx_state AS state,trx_query AS query FROM information_schema.INNODB_TRX WHERE trx_mysql_thread_id IN (SELECT ID FROM information_schema.PROCESSLIST WHERE DB=?)',
        [database],
      );
      console.log(
        JSON.stringify({
          stage: 'old-view transaction diagnostic',
          transactions,
        }),
      );
      await control.rollback();
      const settled = await attempt;
      console.log(
        JSON.stringify({
          stage: 'old-view attempt diagnostic',
          ok: settled.ok,
          error: 'error' in settled ? String(settled.error) : undefined,
        }),
      );
      assert.fail(
        'Old read-view test did not observe the explicit user lock barrier',
      );
    }
    try {
      await entry.change();
      await control.commit();
    } catch (error) {
      await control.rollback();
      throw error;
    }
    const outcome = await attempt;
    try {
      assert.equal(
        outcome.ok,
        false,
        'Transaction with old read view must reject ' +
          entry.name +
          ' after preflight',
      );
      assert.equal(
        (await db
          .prepare(
            "SELECT COUNT(*) n FROM loyalty_daily_claims WHERE user_id='customer'",
          )
          .first<{ n: number }>())!.n,
        before,
      );
    } finally {
      await entry.restore();
    }
  }
}

export async function typedEmptyFields(db: D1Database) {
  for (const [fields, expected] of [
    [[], 1],
    [[{}], 0],
    [{}, 0],
    ['[]', 0],
    [null, 0],
    [undefined, 0],
  ] as const) {
    const result = await db
      .prepare(
        "SELECT COALESCE(json_type(v.config_json,'$.fields')='array' AND json_array_length(v.config_json,'$.fields')=0,0) valid FROM (SELECT ? config_json) v",
      )
      .bind(JSON.stringify({ fields }))
      .first<{ valid: number }>();
    assert.equal(result!.valid, expected);
  }
  assert.deepEqual(await db.prepare("SELECT 7 n,'plain TEXT' text").first(), {
    n: 7,
    text: 'plain TEXT',
  });
}
export async function seededPromo(
  db: D1Database,
  id: string,
  code: string,
  total = 10,
  perCustomer = 10,
  budget = 10000,
) {
  await db
    .prepare(
      'INSERT INTO promo_campaigns(id,code,created_at,updated_at) VALUES (?,?,1,1)',
    )
    .bind(id, code)
    .run();
  await db
    .prepare(
      "INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at) VALUES (?,1,'Café','fixed',1000,0,0,253402300799999,?,?,?,'super',?,'ISOLATED SCHEMA ONLY','fixture',1)",
    )
    .bind(id, total, perCustomer, budget, id + '-terms')
    .run();
  await db
    .prepare(
      "UPDATE promo_campaigns SET current_revision=1,status='published' WHERE id=?",
    )
    .bind(id)
    .run();
}
function promoOrder(
  db: D1Database,
  id: string,
  campaign: string,
  code: string,
  user = 'customer',
) {
  return db
    .prepare(
      "INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label) VALUES (?,?,?,?,'9811111111','placed','en-NP','fixture','{}',10000,500,9500,'cod','unpaid',1,1,1000,?,1,?,'Café')",
    )
    .bind(id, id, user, user + '@example.test', campaign, code);
}
export async function promoLimitRaces(db: D1Database) {
  for (const [kind, total, per, budget] of [
    ['use', 1, 1, 10000],
    ['customer', 10, 1, 10000],
    ['budget', 10, 10, 1000],
  ] as const) {
    const id = 'compat-race-' + kind,
      code = 'RACE_' + kind.toUpperCase();
    await seededPromo(db, id, code, total, per, budget);
    const quote = await quotePromo(db, {
      userId: 'customer',
      code: code.toLowerCase(),
      subtotalPaisa: 10000,
      now: NOW,
    });
    assert.equal(quote.discountPaisa, 1000);
    const attempts = [];
    for (const suffix of ['a', 'b']) {
      const order = id + '-' + suffix;
      const consumption = await preparePromoConsumption(db, {
        userId: 'customer',
        orderId: order,
        requestId: order,
        payloadDigest: 'c'.repeat(64),
        response: { orderNumber: order },
        quote,
        now: NOW,
      });
      attempts.push([
        promoOrder(db, order, id, code),
        incentiveItem(db, order + '-item', order, 1000),
        ...consumption,
      ]);
    }
    const outcomes = await Promise.allSettled(
      attempts.map((statements) => db.batch(statements)),
    );
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    assert.deepEqual(
      await db
        .prepare(
          'SELECT used_count,spent_paisa FROM promo_campaigns WHERE id=?',
        )
        .bind(id)
        .first(),
      { used_count: 1, spent_paisa: 1000 },
    );
    assert.equal(
      (await db
        .prepare('SELECT COUNT(*) n FROM promo_redemptions WHERE campaign_id=?')
        .bind(id)
        .first<{ n: number }>())!.n,
      1,
    );
    assert.equal(
      (await db
        .prepare('SELECT COUNT(*) n FROM orders WHERE promo_campaign_id=?')
        .bind(id)
        .first<{ n: number }>())!.n,
      1,
    );
    await assert.rejects(
      db
        .prepare(
          "UPDATE orders SET promo_label='Cafe' WHERE promo_campaign_id=?",
        )
        .bind(id)
        .run(),
    );
    assert.equal(
      (await db
        .prepare('SELECT promo_label FROM orders WHERE promo_campaign_id=?')
        .bind(id)
        .first<{ promo_label: string }>())!.promo_label,
      'Café',
    );
  }
}
async function oldReadViewPromo(
  db: D1Database,
  control: Connection,
  observer: Connection,
  database: string,
) {
  for (const kind of ['pause', 'publication']) {
    const id = 'compat-old-' + kind,
      code = 'OLD_' + kind.toUpperCase(),
      order = id + '-order';
    await seededPromo(db, id, code);
    const quote = await quotePromo(db, {
      userId: 'customer',
      code,
      subtotalPaisa: 10000,
      now: NOW,
    });
    const consumption = await preparePromoConsumption(db, {
      userId: 'customer',
      orderId: order,
      requestId: order,
      payloadDigest: 'd'.repeat(64),
      response: { orderNumber: order },
      quote,
      now: NOW,
    });
    await db.batch([
      promoOrder(db, order, id, code),
      incentiveItem(db, order + '-item', order, 1000),
    ]);
    await control.beginTransaction();
    await control.execute(
      'SELECT id FROM promo_campaigns WHERE id=? FOR UPDATE',
      [id],
    );
    // Pause is committed while the actual source trigger waits on the campaign lock.
    const pending = db
      .batch([
        db.prepare('SELECT status FROM promo_campaigns WHERE id=?').bind(id),
        consumption.at(-1)!, // Isolated source-trigger assertion; integrated repository guards are tested separately.
      ])
      .then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error }),
      );
    let waiting = false;
    try {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const [locks] = await observer.query<RowDataPacket[]>(
          'SELECT l.lock_table AS lockTable,t.trx_query AS waitingQuery FROM information_schema.INNODB_LOCK_WAITS w JOIN information_schema.INNODB_LOCKS l ON l.lock_id=w.requested_lock_id JOIN information_schema.INNODB_TRX t ON t.trx_id=w.requesting_trx_id',
        );
        waiting = locks.some(
          (row) =>
            String(row.lockTable).includes(database) &&
            String(row.lockTable).includes('promo_campaigns') &&
            String(row.waitingQuery).startsWith(
              'INSERT INTO promo_redemptions',
            ),
        );
        if (waiting) {
          console.log(
            JSON.stringify({
              stage: 'observed actual promo campaign lock',
              kind,
              table: database + '.promo_campaigns',
            }),
          );
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      assert.ok(
        waiting,
        'Actual source trigger must reach the explicit campaign lock barrier',
      );
      if (kind === 'pause')
        await control.execute(
          'UPDATE promo_campaigns SET paused=1 WHERE id=?',
          [id],
        );
      else {
        await control.execute(
          "INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at) VALUES (?,2,'Revised','fixed',1000,0,0,253402300799999,10,10,10000,'super',?,'SCHEMA ONLY','fixture',1)",
          [id, id + '-new-terms'],
        );
        await control.execute(
          'UPDATE promo_campaigns SET current_revision=2 WHERE id=?',
          [id],
        );
      }
      await control.commit();
    } catch (error) {
      await control.rollback();
      await pending;
      throw error;
    }
    const outcome = await pending;
    assert.equal(
      outcome.ok,
      false,
      'Locked promo authority must refresh the old read view after ' + kind,
    );
    assert.equal(
      (await db
        .prepare('SELECT COUNT(*) n FROM orders WHERE id=?')
        .bind(order)
        .first<{ n: number }>())!.n,
      1,
    );
    assert.equal(
      (await db
        .prepare('SELECT COUNT(*) n FROM promo_redemptions WHERE campaign_id=?')
        .bind(id)
        .first<{ n: number }>())!.n,
      0,
    );
    assert.deepEqual(
      await db
        .prepare(
          'SELECT used_count,spent_paisa FROM promo_campaigns WHERE id=?',
        )
        .bind(id)
        .first(),
      { used_count: 0, spent_paisa: 0 },
    );
  }
}

type Observation = {
  stage: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'INCONCLUSIVE';
  code?: string;
  message?: string;
};
async function main() {
  assert.equal(
    resolve(process.cwd()),
    resolve(
      'C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala',
    ),
  );
  assert.equal(
    process.argv.length,
    2,
    'No remote connection or fixture-reuse options',
  );
  const context = JSON.parse(
    execFileSync('docker', ['context', 'inspect'], { encoding: 'utf8' }),
  )[0];
  assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
  // Read connection credentials in memory only; never print/copy old catalog data or results.
  const privateState = JSON.parse(
    await readFile('.staging/form-catalog-mariadb-private.json', 'utf8'),
  );
  assert.equal(privateState.host, '127.0.0.1');
  assert.equal(privateState.port, 13316);
  assert.equal(privateState.name, 'hastabazaar-form-catalog-qa-0928');
  const container = JSON.parse(
    execFileSync('docker', ['inspect', privateState.name], {
      encoding: 'utf8',
    }),
  )[0];
  assert.equal(container.Id, privateState.id);
  assert.equal(container.State.Running, true);
  assert.equal(
    container.Config.Labels['hastabazaar.scope'],
    'form-catalog-task22-disposable',
  );
  assert.equal(container.Config.Image, 'mariadb:10.11');
  assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'], [
    { HostIp: '127.0.0.1', HostPort: '13316' },
  ]);
  assert.ok(container.HostConfig.Tmpfs['/var/lib/mysql']);
  const control = await mysql.createConnection({
    host: '127.0.0.1',
    port: 13316,
    user: privateState.user,
    password: privateState.password,
    multipleStatements: true,
  });
  const observer = await mysql.createConnection({
    host: '127.0.0.1',
    port: 13316,
    user: privateState.user,
    password: privateState.password,
  });
  const prefix = 'incentives_task12_' + Date.now(),
    databases: string[] = [];
  const observations: Observation[] = [];
  async function stage(
    name: string,
    action: () => Promise<unknown>,
    inherited = false,
  ) {
    try {
      await action();
      observations.push({ stage: name, status: 'PASS' });
    } catch (error) {
      const e = error as Error & { code?: string; cause?: { code?: string } };
      observations.push({
        stage: name,
        status: e.message.includes('lock barrier')
          ? 'INCONCLUSIVE'
          : inherited
            ? 'BLOCKED'
            : 'FAIL',
        code: e.cause?.code ?? e.code ?? e.name,
        message: e.message.slice(0, 700),
      });
    }
    console.log(JSON.stringify(observations.at(-1)));
  }
  const load = async (connection: Connection, sql: string) => {
    for (const statement of mariaStatements(sql))
      await connection.query(statement);
  };
  const file = async (name: string) =>
    readFile('deployment/babal/' + name, 'utf8');
  const create = async (suffix: string) => {
    const name = prefix + '_' + suffix;
    assert.match(name, /^incentives_task12_\d+_[a-z]+$/);
    await control.query(
      'CREATE DATABASE `' +
        name +
        '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    databases.push(name);
    await control.query('USE `' + name + '`');
    return name;
  };
  let engine: unknown;
  try {
    const [rows] = await control.query<RowDataPacket[]>(
      'SELECT VERSION() version,@@sql_mode sqlMode,@@tx_isolation isolation,@@character_set_connection charset,@@collation_connection collation',
    );
    engine = rows[0];
    await create('fullbase');
    await stage(
      'fresh full canonical generated bootstrap',
      async () => load(control, await file('mariadb-schema.sql')),
      true,
    );
    const fixture = await create('schema');
    // Separate canonical schema-only fixture. Explicitly not a repaired fullbase or admin/config acceptance.
    const base = await file('mariadb-schema.sql');
    const marker = '-- Per-assignment open-box and rider-finance snapshots.';
    assert.ok(base.includes(marker));
    const pre = base.slice(0, base.indexOf(marker));
    await load(control, pre);
    await load(control, await file('mariadb-referrals-wallet.sql'));
    await stage(
      'inherited canonical gift-card prerequisite',
      async () => load(control, await file('mariadb-gift-cards.sql')),
      true,
    );
    const giftOriginal =
      'ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS gift_card_id VARCHAR(191) NULL REFERENCES gift_cards(id);';
    const gift = await file('mariadb-gift-cards.sql');
    assert.equal(
      gift.split(giftOriginal).length,
      2,
      'Only the exact approved inherited fixture DDL may be adapted',
    );
    await stage(
      'isolated gift import with equivalent explicit FK name',
      async () =>
        load(
          control,
          gift.replace(
            giftOriginal,
            'ALTER TABLE wallet_entries ADD COLUMN IF NOT EXISTS gift_card_id VARCHAR(191) NULL, ADD FOREIGN KEY IF NOT EXISTS task12_wallet_gift_card_fk (gift_card_id) REFERENCES gift_cards(id);',
          ),
        ),
    );
    const [walletDdl] = await control.query<RowDataPacket[]>(
      'SHOW CREATE TABLE wallet_entries',
    );
    const walletCreate = String(walletDdl[0]['Create Table']);
    assert.match(
      walletCreate,
      /CONSTRAINT .wallet_entries_ibfk_1. FOREIGN KEY \(`user_id`\)/,
    );
    assert.match(
      walletCreate,
      /CONSTRAINT .wallet_entries_ibfk_2. FOREIGN KEY \(`order_id`\)/,
    );
    assert.match(
      walletCreate,
      /CONSTRAINT .task12_wallet_gift_card_fk. FOREIGN KEY \(`gift_card_id`\)/,
    );
    for (const name of [
      'mariadb-partial-cancellation.sql',
      'mariadb-marketplace-settings.sql',
      'mariadb-policy-commission-9-percent.sql',
      'mariadb-form-catalog.sql',
      'mariadb-staff-permissions.sql',
      'mariadb-verified-riders.sql',
    ])
      await load(control, await file(name));
    const newUser = fixture,
      password = randomUUID();
    await control.query('CREATE USER ?@? IDENTIFIED BY ?', [
      newUser,
      '%',
      password,
    ]);
    await control.query('GRANT ALL ON `' + fixture + '`.* TO ?@?', [
      newUser,
      '%',
    ]);
    Object.assign(process.env, {
      DB_HOST: '127.0.0.1',
      DB_PORT: '13316',
      DB_NAME: fixture,
      DB_USER: newUser,
      DB_PASSWORD: password,
    });
    const maintained = env.DB as unknown as D1Database;
    const db = new Proxy(maintained, {
      get(target, key) {
        if (key === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            try {
              return await target.batch(statements);
            } catch (error) {
              const e = error as Error & {
                code?: string;
                cause?: { code?: string };
              };
              console.log(
                JSON.stringify({
                  stage: 'actual adapter batch rejection',
                  code: e.cause?.code ?? e.code ?? e.name,
                  message: e.message.slice(0, 700),
                }),
              );
              throw error;
            }
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await seedLegacy(db);
    const legacyBefore = await legacySnapshot(db);
    await stage(
      'pre-feature canonical companion migrations and repeat import',
      async () => {
        for (const name of [
          'mariadb-promo-codes.sql',
          'mariadb-loyalty-points.sql',
        ])
          await load(control, await file(name));
        for (const name of [
          'mariadb-promo-codes.sql',
          'mariadb-loyalty-points.sql',
        ])
          await load(control, await file(name));
        assert.deepEqual(await legacySnapshot(db), legacyBefore);
        assert.equal(
          (await db
            .prepare('SELECT COUNT(*) n FROM loyalty_points_entries')
            .first<{ n: number }>())!.n,
          0,
        );
        assert.equal(
          (await db
            .prepare("SELECT paused FROM loyalty_config WHERE id='default'")
            .first<{ paused: number }>())!.paused,
          1,
        );
      },
    );
    for (const id of ['customer', 'other', 'super'])
      await seedIncentiveCustomer(db, id);
    await db
      .prepare(
        "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
      )
      .run();
    for (const form of [
      'account.daily-reward',
      'account.points-redemption',
      'staff.loyalty-settings',
    ])
      await publishForm(db, form);
    await stage(
      'actual catalog saveFormDraft configured provenance',
      async () =>
        saveFormDraft(db, {
          formId: 'account.profile',
          actorId: 'super',
          actorRole: 'super_admin',
          expectedPublishedVersion: 0,
          config: { formId: 'account.profile', fields: [] },
          reason: 'ISOLATED Task12 configured provenance',
          requestId: 'compat-catalog-once',
          now: 10,
        }),
      true,
    );
    await stage('new protected claim/redemption JSON array predicates', () =>
      jsonGuards(db, 'array'),
    );
    await stage(
      'protected array guard rejects non-array empty fields and retains scalar/text types',
      () => typedEmptyFields(db),
    );
    await stage('new privacy boolean predicate', () =>
      jsonGuards(db, 'boolean'),
    );
    await db
      .prepare(
        "INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at) VALUES (1,1,200,100,1000,0,253402300799999,1000,10000,'super','fixture-terms','ISOLATED SCHEMA FIXTURE, not admin acceptance','staff.loyalty-settings-v1',1)",
      )
      .run();
    await db
      .prepare(
        "UPDATE loyalty_config SET current_revision=1,paused=0 WHERE id='default'",
      )
      .run();
    await stage('each database conserves linked points redemption', () =>
      conservation(db),
    );
    await stage('injected wallet-credit failure rolls points back', () =>
      walletFailure(
        db,
        () =>
          control.query(
            "CREATE TRIGGER task12_wallet_fail BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF NEW.kind='loyalty_redemption' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='task12_injected_wallet_failure'; END IF; END",
          ),
        () => control.query('DROP TRIGGER task12_wallet_fail'),
      ),
    );
    await stage(
      'concurrent claims, overspend and ten-point daily uniqueness',
      () => concurrency(db),
    );
    await stage(
      'malformed integer JSON snapshots and wrong owner reject atomically',
      () => malformedClaimSnapshots(db),
    );
    await stage(
      'old consistent read view with observed lock contention rejects pause and publication',
      () => oldReadViewClaim(db, control, fixture, observer),
    );
    await stage(
      '100-character Nepali promo label and binary immutable equality',
      () => promoImmutable(db),
    );
    await stage(
      'actual promo quote/consumption last-use per-customer and final-budget races in schema fixture',
      () => promoLimitRaces(db),
    );
    await stage(
      'isolated promo source trigger campaign lock refreshes old read view after pause/publication',
      () => oldReadViewPromo(db, control, observer, fixture),
    );
    await stage(
      'inherited configured answer insertion preserves atomic parent rollback',
      async () => {
        const before = (await db
          .prepare('SELECT COUNT(*) n FROM audit_logs')
          .first<{ n: number }>())!.n;
        try {
          await db.batch([
            db.prepare(
              "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at) VALUES ('compat-answer-parent','super','fixture','loyalty_config','default','ISOLATED rollback evidence','compat-answer-parent',1)",
            ),
            buildFormAnswerInsert(db, {
              formId: 'staff.loyalty-settings',
              requestId: 'compat-answer-parent',
              versionId: 'staff.loyalty-settings-v1',
              subjectType: 'loyalty_revision',
              subjectId: '1',
              actorId: 'super',
              answers: {
                formId: 'staff.loyalty-settings',
                version: 1,
                answers: [],
              },
              now: NOW,
            }),
          ]);
        } finally {
          assert.equal(
            (await db
              .prepare('SELECT COUNT(*) n FROM audit_logs')
              .first<{ n: number }>())!.n,
            before,
          );
        }
      },
      true,
    );
    await stage(
      'reapply preserves all linked financial original/current promo and legacy history',
      async () => {
        const before = await financialSnapshot(db);
        const promoBefore = (
          await db.prepare('SELECT * FROM promo_campaigns ORDER BY id').all()
        ).results;
        const ordersBefore = (
          await db.prepare('SELECT * FROM orders ORDER BY id').all()
        ).results;
        for (const name of [
          'mariadb-promo-codes.sql',
          'mariadb-loyalty-points.sql',
        ])
          await load(control, await file(name));
        assert.deepEqual(await financialSnapshot(db), before);
        assert.deepEqual(
          (await db.prepare('SELECT * FROM promo_campaigns ORDER BY id').all())
            .results,
          promoBefore,
        );
        assert.deepEqual(
          (await db.prepare('SELECT * FROM orders ORDER BY id').all()).results,
          ordersBefore,
        );
        assert.deepEqual(await legacySnapshot(db), legacyBefore);
      },
    );
  } catch (error) {
    const e = error as Error & { code?: string };
    observations.push({
      stage: 'fixture/setup',
      status: 'FAIL',
      code: e.code ?? e.name,
      message: e.message.slice(0, 700),
    });
    console.log(JSON.stringify(observations.at(-1)));
  } finally {
    await observer.end();
    await control.end();
    await mkdir('.staging/artifacts/incentives-task12', { recursive: true });
    await writeFile(
      '.staging/artifacts/incentives-task12/mariadb-results-' +
        prefix +
        '.json',
      JSON.stringify(
        {
          fixtureOwner: 'task12 compatibility',
          databases,
          engine,
          observations,
          integratedAcceptance: 'BLOCKED',
          credentialsPrinted: false,
        },
        null,
        2,
      ),
    );
    // Pool is intentionally process-scoped; databases remain identified and untouched for review.
    process.exit(observations.every((o) => o.status === 'PASS') ? 0 : 1);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
