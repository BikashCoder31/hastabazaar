import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  createIncentiveDb,
  seedIncentiveCustomer,
  incentiveOrder,
} from './helpers/incentive-db';

const digest = 'a'.repeat(64);
async function publish(
  db: D1Database,
  revision = 1,
  daily = 100,
  budget = 1000,
  lifetime = 10000,
) {
  await db
    .prepare(`INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at)
    VALUES (?,1,?,100,1000,0,253402300799999,?,?,'customer',?,'Fixture','fixture',1)`)
    .bind(revision, daily, budget, lifetime, `publish-${revision}`)
    .run();
  await db
    .prepare(
      "UPDATE loyalty_config SET current_revision=?,version=version+1,paused=0 WHERE id='default'",
    )
    .bind(revision)
    .run();
}
function claim(
  db: D1Database,
  id = 'claim',
  revision = 1,
  date = '2026-09-28',
  points = 100,
  balance = 100,
) {
  return db
    .prepare(`INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at)
    VALUES (?,'customer','customer',?,?,?, ?,?,?,'fixture',1790532900000)`)
    .bind(
      id,
      id,
      digest,
      revision,
      date,
      points,
      JSON.stringify({
        claimId: id,
        localDate: date,
        awardedPoints: points,
        balancePoints: balance,
      }),
    );
}
function redeem(
  db: D1Database,
  id = 'redeem',
  points = 100,
  credit = 1000,
  balance = 0,
  wallet = 1000,
  revision = 1,
) {
  return db
    .prepare(`INSERT INTO loyalty_redemptions(id,user_id,actor_id,request_id,payload_digest,revision,points,credit_paisa,response_json,form_version_id,created_at)
    VALUES (?,'customer','customer',?,?,?,?,?,?,'fixture',1790532900001)`)
    .bind(
      id,
      id,
      digest,
      revision,
      points,
      credit,
      JSON.stringify({
        redemptionId: id,
        points,
        creditPaisa: credit,
        balancePoints: balance,
        walletBalancePaisa: wallet,
      }),
    );
}
void test('wallet rejects fractional financial credits against the real native migration fixture', async () => {
  const f = await createIncentiveDb();
  try {
    await seedIncentiveCustomer(f.db);
    await incentiveOrder(f.db, 'order').run();
    await assert.rejects(
      f.db
        .prepare(`INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
      VALUES ('fraction','customer','order',1.5,-1.5,'referral_reward',1)`)
        .run(),
    );
  } finally {
    await f.dispose();
  }
});
void test('loyalty migration seeds disabled defaults and creates no financial activity', async () => {
  const f = await createIncentiveDb();
  try {
    assert.deepEqual(
      await f.db
        .prepare(
          'SELECT enabled,daily_points,points_per_block,credit_paisa_per_block,daily_budget_points,lifetime_budget_points FROM loyalty_revisions WHERE revision=0',
        )
        .first(),
      {
        enabled: 0,
        daily_points: 10,
        points_per_block: 100,
        credit_paisa_per_block: 1000,
        daily_budget_points: null,
        lifetime_budget_points: null,
      },
    );
    for (const table of [
      'loyalty_accounts',
      'loyalty_points_entries',
      'loyalty_daily_claims',
      'loyalty_redemptions',
      'loyalty_day_issuance',
    ])
      assert.equal(
        (
          await f.db
            .prepare(`SELECT COUNT(*) n FROM ${table}`)
            .first<{ n: number }>()
        )?.n,
        0,
      );
  } finally {
    await f.dispose();
  }
});
void test('duplicate loyalty source cannot credit wallet twice', async () => {
  const f = await createIncentiveDb();
  const db = f.db;
  try {
    await seedIncentiveCustomer(db);
    await db
      .prepare(
        "INSERT INTO loyalty_accounts(user_id,created_at) VALUES ('customer',1)",
      )
      .run();
    await publish(db);
    await assert.rejects(claim(db, 'wrong-day', 1, '2026-09-27').run());
    await assert.rejects(
      claim(db, 'wrong-balance', 1, '2026-09-28', 100, 99).run(),
    );
    await assert.rejects(
      claim(db, 'wrong-award', 1, '2026-09-28', 101, 101).run(),
    );
    await claim(db).run();
    await redeem(db).run();
    const balanceBeforeDuplicate = (await db
      .prepare(
        "SELECT balance_paisa FROM wallet_accounts WHERE user_id='customer'",
      )
      .first<{ balance_paisa: number }>())!.balance_paisa;
    await assert.rejects(
      db
        .prepare(
          `INSERT INTO wallet_entries(id,user_id,amount_paisa,platform_amount_paisa,kind,loyalty_redemption_id,created_at) VALUES ('loyalty:redeem','customer',1000,-1000,'loyalty_redemption','redeem',1790532900001)`,
        )
        .run(),
    );
    await assert.rejects(
      db
        .prepare(
          `INSERT OR REPLACE INTO wallet_entries(id,user_id,amount_paisa,platform_amount_paisa,kind,loyalty_redemption_id,created_at) VALUES ('loyalty:redeem','customer',1000,-1000,'loyalty_redemption','redeem',1790532900001)`,
        )
        .run(),
    );
    const walletEntryCount = (await db
      .prepare(
        "SELECT COUNT(*) n FROM wallet_entries WHERE loyalty_redemption_id='redeem'",
      )
      .first<{ n: number }>())!.n;
    const balanceAfterDuplicate = (await db
      .prepare(
        "SELECT balance_paisa FROM wallet_accounts WHERE user_id='customer'",
      )
      .first<{ balance_paisa: number }>())!.balance_paisa;
    assert.equal(walletEntryCount, 1);
    assert.equal(balanceAfterDuplicate, balanceBeforeDuplicate);
  } finally {
    await f.dispose();
  }
});
void test('native loyalty guards immutable history, finite budgets, global day uniqueness and locked rate', async (t) => {
  const f = await createIncentiveDb();
  const db = f.db;
  try {
    await seedIncentiveCustomer(db);
    await db
      .prepare(
        "INSERT INTO loyalty_accounts(user_id,created_at) VALUES ('customer',1)",
      )
      .run();
    await publish(db);
    await assert.rejects(claim(db, 'wrong-day', 1, '2026-09-27').run());
    await assert.rejects(
      claim(db, 'wrong-balance', 1, '2026-09-28', 100, 99).run(),
    );
    await assert.rejects(
      claim(db, 'wrong-award', 1, '2026-09-28', 101, 101).run(),
    );
    await claim(db).run();
    await t.test(
      'ledger and accounts cannot be edited, overdrafted or orphaned',
      async () => {
        for (const sql of [
          'UPDATE loyalty_points_entries SET points=1',
          'DELETE FROM loyalty_points_entries',
          'UPDATE loyalty_accounts SET balance_points=-1',
          'UPDATE loyalty_accounts SET balance_points=101',
          "INSERT INTO loyalty_points_entries(id,user_id,points,kind,claim_id,created_at) VALUES ('orphan','customer',1,'daily_claim','claim',1)",
        ])
          await assert.rejects(db.prepare(sql).run());
        assert.equal(
          (
            await db
              .prepare(
                "SELECT balance_points n FROM loyalty_accounts WHERE user_id='customer'",
              )
              .first<{ n: number }>()
          )?.n,
          100,
        );
      },
    );
    await t.test(
      'one user date remains unique across immutable revisions',
      async () => {
        await publish(db, 2);
        await assert.rejects(
          claim(db, 'second', 2, '2026-09-28', 100, 200).run(),
          /UNIQUE/,
        );
        assert.deepEqual(
          await db
            .prepare('SELECT issued_points,redeemed_points FROM loyalty_config')
            .first(),
          { issued_points: 100, redeemed_points: 0 },
        );
        assert.equal(
          (
            await db
              .prepare('SELECT issued_points n FROM loyalty_day_issuance')
              .first<{ n: number }>()
          )?.n,
          100,
        );
      },
    );
    await t.test(
      'rate cannot be changed after issuance, limits cannot undercut consumed totals',
      async () => {
        for (const field of [
          'points_per_block=200',
          'credit_paisa_per_block=500',
          'lifetime_budget_points=50',
          'daily_budget_points=50',
        ])
          await assert.rejects(
            db
              .prepare(
                `INSERT INTO loyalty_revisions SELECT 3,enabled,daily_points,${field === 'points_per_block=200' ? '200' : 'points_per_block'},${field === 'credit_paisa_per_block=500' ? '500' : 'credit_paisa_per_block'},starts_at,ends_at,${field === 'daily_budget_points=50' ? '50' : 'daily_budget_points'},${field === 'lifetime_budget_points=50' ? '50' : 'lifetime_budget_points'},created_by,'invalid','Fixture',form_version_id,created_at FROM loyalty_revisions WHERE revision=1`,
              )
              .run(),
          );
        await assert.rejects(
          db
            .prepare(
              'UPDATE loyalty_revisions SET daily_points=1 WHERE revision=1',
            )
            .run(),
        );
        await assert.rejects(
          db.prepare('DELETE FROM loyalty_revisions WHERE revision=1').run(),
        );
        await assert.rejects(
          db.prepare('UPDATE loyalty_config SET issued_points=0').run(),
        );
      },
    );
    await t.test(
      'paused and exhausted earning still allow redemption and invalid source credits reject',
      async () => {
        await publish(db, 3, 100, 100, 100);
        await db.prepare('UPDATE loyalty_config SET paused=1').run();
        await redeem(db, 'redeem', 100, 1000, 0, 1000, 3).run();
        await seedIncentiveCustomer(db, 'other');
        await incentiveOrder(db, 'order').run();
        for (const [user, amount, order, gift, source] of [
          ['customer', 1000, null, null, null],
          ['other', 1000, null, null, 'redeem'],
          ['customer', 999, null, null, 'redeem'],
          ['customer', 1000, 'order', null, 'redeem'],
          ['customer', -1000, null, null, 'redeem'],
        ])
          await assert.rejects(
            db
              .prepare(
                `INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,loyalty_redemption_id,created_at) VALUES (?,?,?,?,?,'loyalty_redemption',?,?,1)`,
              )
              .bind(
                `bad-${user}-${amount}-${order}`,
                user,
                order,
                amount,
                -Number(amount),
                gift,
                source,
              )
              .run(),
          );
        await assert.rejects(redeem(db, 'overdraft').run());
        assert.equal(
          (
            await db
              .prepare(
                "SELECT balance_points n FROM loyalty_accounts WHERE user_id='customer'",
              )
              .first<{ n: number }>()
          )?.n,
          0,
        );
        assert.equal(
          (
            await db
              .prepare('SELECT COUNT(*) n FROM loyalty_points_entries')
              .first<{ n: number }>()
          )?.n,
          2,
        );
      },
    );
  } finally {
    await f.dispose();
  }
});
void test('historical gift referral spend cancellation and refund wallet rows survive copy exactly', async () => {
  let before: unknown;
  let triggers: unknown;
  const f = await createIncentiveDb({
    beforeLoyalty: async (db) => {
      await seedIncentiveCustomer(db);
      await incentiveOrder(db, 'history', 0, 800).run();
      await db
        .prepare(
          `INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('gift',?,500,'customer','issue',1,'customer',1,'gift-redeem')`,
        )
        .bind('b'.repeat(64))
        .run();
      for (const [id, order, amount, kind, gift] of [
        ['gift-credit', null, 500, 'gift_card', 'gift'],
        ['referral', 'history', 2000, 'referral_reward', null],
        ['spend', 'history', -800, 'order_spend', null],
        ['cancel', 'history', 100, 'cancellation', null],
        ['refund', 'history', 200, 'refund', null],
      ])
        await db
          .prepare(
            "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES (?,'customer',?,?,?,?,?,1)",
          )
          .bind(id, order, amount, -Number(amount), kind, gift)
          .run();
      before = (
        await db
          .prepare(
            'SELECT id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at FROM wallet_entries ORDER BY id',
          )
          .all()
      ).results;
      triggers = (
        await db
          .prepare(
            "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN ('wallet_cancel_restore','wallet_refund_restore','wallet_refund_guard') ORDER BY name",
          )
          .all()
      ).results;
    },
  });
  try {
    assert.deepEqual(
      (
        await f.db
          .prepare(
            'SELECT id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at FROM wallet_entries ORDER BY id',
          )
          .all()
      ).results,
      before,
    );
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT balance_paisa n FROM wallet_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      2000,
    );
    assert.deepEqual(
      (
        await f.db
          .prepare(
            "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN ('wallet_cancel_restore','wallet_refund_restore','wallet_refund_guard') ORDER BY name",
          )
          .all()
      ).results,
      triggers,
    );
    await f.db
      .prepare(
        "UPDATE orders SET status='cancelled',updated_at=2 WHERE id='history'",
      )
      .run();
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT amount_paisa n FROM wallet_entries WHERE id='cancel:history'",
          )
          .first<{ n: number }>()
      )?.n,
      500,
    );
    await assert.rejects(f.db.prepare('DELETE FROM wallet_entries').run());
    await assert.rejects(
      f.db.prepare('UPDATE wallet_entries SET amount_paisa=1').run(),
    );
    assert.ok(
      await f.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_wallet_entries_user'",
        )
        .first(),
    );
  } finally {
    await f.dispose();
  }
});
void test('MariaDB loyalty companion preserves character lengths exact proofs and generator ordering', async () => {
  const sql = await readFile(
    new URL('../deployment/babal/mariadb-loyalty-points.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /CHAR_LENGTH\(request_id\)/);
  assert.match(sql, /BINARY/);
  assert.doesNotMatch(sql, /typeof\(|NEW\.BINARY|\|\|/);
  assert.match(sql, /chk_wallet_gift_source/);
  assert.match(sql, /idx_wallet_entries_loyalty/);
  assert.match(sql, /chk_wallet_kind CHECK\(BINARY kind IN/);
  const generated = await readFile(
    new URL('../deployment/babal/mariadb-schema.sql', import.meta.url),
    'utf8',
  );
  assert.ok(
    generated.indexOf('CREATE TABLE IF NOT EXISTS wallet_accounts') <
      generated.indexOf('CREATE TABLE IF NOT EXISTS loyalty_config'),
  );
  assert.ok(generated.includes(sql.trim()));
});
void test('injected wallet-credit failure rolls back source debit balances and counters', async () => {
  const f = await createIncentiveDb();
  const db = f.db;
  try {
    await seedIncentiveCustomer(db);
    await db
      .prepare(
        "INSERT INTO loyalty_accounts(user_id,created_at) VALUES ('customer',1)",
      )
      .run();
    await publish(db);
    await assert.rejects(claim(db, 'wrong-day', 1, '2026-09-27').run());
    await assert.rejects(
      claim(db, 'wrong-balance', 1, '2026-09-28', 100, 99).run(),
    );
    await assert.rejects(
      claim(db, 'wrong-award', 1, '2026-09-28', 101, 101).run(),
    );
    await claim(db).run();
    const before = await db
      .prepare(
        'SELECT issued_points,redeemed_points,credited_paisa FROM loyalty_config',
      )
      .first();
    await db
      .prepare(
        "CREATE TRIGGER fixture_wallet_failure BEFORE INSERT ON wallet_entries WHEN NEW.kind='loyalty_redemption' BEGIN SELECT RAISE(ABORT,'injected_wallet_credit_failure'); END;",
      )
      .run();
    await assert.rejects(redeem(db).run(), /injected_wallet_credit_failure/);
    assert.deepEqual(
      await db
        .prepare(
          'SELECT issued_points,redeemed_points,credited_paisa FROM loyalty_config',
        )
        .first(),
      before,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT balance_points n FROM loyalty_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      100,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT balance_paisa n FROM wallet_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      0,
    );
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) n FROM loyalty_redemptions')
          .first<{ n: number }>()
      )?.n,
      0,
    );
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) n FROM loyalty_points_entries')
          .first<{ n: number }>()
      )?.n,
      1,
    );
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) n FROM wallet_entries')
          .first<{ n: number }>()
      )?.n,
      0,
    );
    await db.prepare('DROP TRIGGER fixture_wallet_failure').run();
    for (const [points, credit, balance, wallet] of [
      [99, 990, 1, 990],
      [100, 999, 0, 999],
      [100, 1000, 1, 1000],
      [100, 1000, 0, 999],
    ])
      await assert.rejects(
        redeem(db, 'invalid', points, credit, balance, wallet).run(),
      );
    await redeem(db).run();
    for (const table of [
      'loyalty_daily_claims',
      'loyalty_redemptions',
      'loyalty_points_entries',
    ]) {
      await assert.rejects(
        db
          .prepare(
            `INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} LIMIT 1`,
          )
          .run(),
      );
    }
    assert.equal(
      (
        await db
          .prepare(
            "SELECT balance_points n FROM loyalty_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      0,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT balance_paisa n FROM wallet_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      1000,
    );
    for (const table of ['loyalty_redemptions', 'loyalty_daily_claims']) {
      await assert.rejects(
        db
          .prepare(`UPDATE ${table} SET payload_digest=?`)
          .bind('b'.repeat(64))
          .run(),
      );
      await assert.rejects(
        db.prepare(`UPDATE ${table} SET response_json='{}'`).run(),
      );
      await assert.rejects(db.prepare(`DELETE FROM ${table}`).run());
    }
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) n FROM loyalty_redemptions')
          .first<{ n: number }>()
      )?.n,
      1,
    );
  } finally {
    await f.dispose();
  }
});
void test('singleton cannot be replaced to reset lifetime issuance and locked rate', async () => {
  const f = await createIncentiveDb();
  const db = f.db;
  try {
    await seedIncentiveCustomer(db);
    await db
      .prepare(
        "INSERT INTO loyalty_accounts(user_id,created_at) VALUES ('customer',1)",
      )
      .run();
    await publish(db);
    await claim(db).run();
    await assert.rejects(
      db
        .prepare("INSERT OR REPLACE INTO loyalty_config(id) VALUES ('default')")
        .run(),
    );
    assert.deepEqual(
      await db
        .prepare(
          'SELECT issued_points,locked_points_per_block,locked_credit_paisa_per_block FROM loyalty_config',
        )
        .first(),
      {
        issued_points: 100,
        locked_points_per_block: 100,
        locked_credit_paisa_per_block: 1000,
      },
    );
  } finally {
    await f.dispose();
  }
});
void test('immutable revision cannot be replaced before the first issuance', async () => {
  const f = await createIncentiveDb();
  const db = f.db;
  try {
    await seedIncentiveCustomer(db);
    await publish(db);
    await assert.rejects(
      db
        .prepare(
          `INSERT OR REPLACE INTO loyalty_revisions SELECT revision,enabled,101,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at FROM loyalty_revisions WHERE revision=1`,
        )
        .run(),
    );
    assert.equal(
      (
        await db
          .prepare(
            'SELECT daily_points n FROM loyalty_revisions WHERE revision=1',
          )
          .first<{ n: number }>()
      )?.n,
      100,
    );
  } finally {
    await f.dispose();
  }
});
void test('all canonical migration chunks also load as semicolon-terminated whole SQL files', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys=ON;');
    for (const name of (await readdir(new URL('../drizzle/', import.meta.url)))
      .filter((n) => /^\d{4}_.+\.sql$/.test(n))
      .sort()) {
      const sql = await readFile(
        new URL(`../drizzle/${name}`, import.meta.url),
        'utf8',
      );
      sqlite.exec(sql);
    }
    assert.equal(
      (
        sqlite.prepare('SELECT COUNT(*) n FROM loyalty_config').get() as {
          n: number;
        }
      ).n,
      1,
    );
    assert.equal(
      (
        sqlite
          .prepare('SELECT COUNT(*) n FROM loyalty_points_entries')
          .get() as { n: number }
      ).n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
void test('enabled loyalty terms require finite bounded integers and complete dates and budgets', async () => {
  const f = await createIncentiveDb();
  const db = f.db;
  try {
    await seedIncentiveCustomer(db);
    const terms = (
      daily: number,
      budget: number | null,
      lifetime: number | null,
      start: number,
      end: number,
    ) =>
      db
        .prepare(
          `INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at) VALUES (1,1,?,100,1000,?,?,?,?,'customer','finite','Fixture','fixture',1)`,
        )
        .bind(daily, start, end, budget, lifetime);
    for (const args of [
      [10, null, 100, 0, 100],
      [10, 100, null, 0, 100],
      [10, 0, 100, 0, 100],
      [1.5, 100, 100, 0, 100],
      [9007199254740992, 9007199254740992, 9007199254740992, 0, 100],
      [10, 100, 100, -1, 100],
      [10, 100, 100, 100, 100],
    ])
      await assert.rejects(
        terms(
          ...(args as [number, number | null, number | null, number, number]),
        ).run(),
      );
    await terms(10, 10, 10, 0, 253402300799999).run();
    await db
      .prepare('UPDATE loyalty_config SET current_revision=1,paused=0')
      .run();
    await db
      .prepare(
        "INSERT INTO loyalty_accounts(user_id,created_at) VALUES ('customer',1)",
      )
      .run();
    await claim(db, 'ten', 1, '2026-09-28', 10, 10).run();
    await seedIncentiveCustomer(db, 'other');
    await db
      .prepare(
        "INSERT INTO loyalty_accounts(user_id,created_at) VALUES ('other',1)",
      )
      .run();
    await assert.rejects(
      db
        .prepare(
          `INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at) VALUES ('exhausted','other','other','exhausted',?,1,'2026-09-28',10,'{"claimId":"exhausted","localDate":"2026-09-28","awardedPoints":10,"balancePoints":10}','fixture',1790532900000)`,
        )
        .bind(digest)
        .run(),
    );
    assert.equal(
      (
        await db
          .prepare('SELECT issued_points n FROM loyalty_config')
          .first<{ n: number }>()
      )?.n,
      10,
    );
    assert.equal(
      (
        await db
          .prepare('SELECT issued_points n FROM loyalty_day_issuance')
          .first<{ n: number }>()
      )?.n,
      10,
    );
  } finally {
    await f.dispose();
  }
});
void test('alternate gift-card source replacement preserves pre-loyalty wallet history and balance', async () => {
  let originalGift: unknown;
  const f = await createIncentiveDb({
    beforeLoyalty: async (db) => {
      await seedIncentiveCustomer(db);
      await db
        .prepare(
          `INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('retained-gift',?,500,'customer','retained-issue',1,'customer',1,'retained-redeem')`,
        )
        .bind('c'.repeat(64))
        .run();
      await db
        .prepare(
          `INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES ('retained-credit','customer',NULL,500,-500,'gift_card','retained-gift',1)`,
        )
        .run();
      originalGift = await db
        .prepare("SELECT * FROM gift_cards WHERE id='retained-gift'")
        .first();
      assert.equal(
        (
          await db
            .prepare(
              "SELECT balance_paisa n FROM wallet_accounts WHERE user_id='customer'",
            )
            .first<{ n: number }>()
        )?.n,
        500,
      );
    },
  });
  const db = f.db;
  try {
    const originalWallet = await db
      .prepare("SELECT * FROM wallet_entries WHERE id='retained-credit'")
      .first();
    assert.equal(
      (
        await db
          .prepare(
            "SELECT balance_paisa n FROM wallet_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      500,
    );
    await assert.rejects(
      db
        .prepare(
          `INSERT OR REPLACE INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,gift_card_id,created_at) VALUES ('alternate-credit','customer',NULL,500,-500,'gift_card','retained-gift',1)`,
        )
        .run(),
    );
    assert.deepEqual(
      await db
        .prepare("SELECT * FROM wallet_entries WHERE id='retained-credit'")
        .first(),
      originalWallet,
    );
    assert.deepEqual(
      await db
        .prepare("SELECT * FROM gift_cards WHERE id='retained-gift'")
        .first(),
      originalGift,
    );
    assert.equal(
      await db
        .prepare("SELECT id FROM wallet_entries WHERE id='alternate-credit'")
        .first(),
      null,
    );
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) n FROM wallet_entries')
          .first<{ n: number }>()
      )?.n,
      1,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT balance_paisa n FROM wallet_accounts WHERE user_id='customer'",
          )
          .first<{ n: number }>()
      )?.n,
      500,
    );
  } finally {
    await f.dispose();
  }
});
void test('alternate revision replacement cannot reuse author request or orphan current and draft links', async () => {
  const f = await createIncentiveDb();
  const db = f.db;
  try {
    await seedIncentiveCustomer(db);
    await publish(db);
    await db.prepare('UPDATE loyalty_config SET draft_revision=1').run();
    const revision = await db
      .prepare('SELECT * FROM loyalty_revisions WHERE revision=1')
      .first();
    const config = await db.prepare('SELECT * FROM loyalty_config').first();
    await assert.rejects(
      db
        .prepare(
          `INSERT OR REPLACE INTO loyalty_revisions SELECT 2,enabled,101,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at FROM loyalty_revisions WHERE revision=1`,
        )
        .run(),
    );
    assert.deepEqual(
      await db
        .prepare('SELECT * FROM loyalty_revisions WHERE revision=1')
        .first(),
      revision,
    );
    assert.deepEqual(
      await db.prepare('SELECT * FROM loyalty_config').first(),
      config,
    );
    assert.equal(
      await db
        .prepare('SELECT revision FROM loyalty_revisions WHERE revision=2')
        .first(),
      null,
    );
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) n FROM loyalty_revisions WHERE revision IN ((SELECT current_revision FROM loyalty_config),(SELECT draft_revision FROM loyalty_config))',
          )
          .first<{ n: number }>()
      )?.n,
      1,
    );
  } finally {
    await f.dispose();
  }
});
