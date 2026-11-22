import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  issueGiftCard,
  redeemGiftCard,
  parseGiftAmount,
  MAX_GIFT_PAISA,
} from '../lib/db/repositories/gift-cards';
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const f of readdirSync('drizzle')
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort()) {
    sqlite.exec(readFileSync('drizzle/' + f, 'utf8'));
  }
  for (const [id, role] of [
    ['sa', 'super_admin'],
    ['admin', 'admin'],
    ['buyer', 'customer'],
    ['other', 'customer'],
  ]) {
    sqlite
      .prepare(
        "INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,?,'en-NP','active',1,1)",
      )
      .run(id, id, id + '@example.test', id);
    sqlite
      .prepare(
        'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)',
      )
      .run(id, role);
  }
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const st = sqlite.prepare(sql);
      return {
        bind(...v: SQLInputValue[]) {
          values = v;
          return this;
        },
        async first() {
          return st.get(...values) ?? null;
        },
        async all() {
          return { results: st.all(...values) };
        },
        async run() {
          return { meta: { changes: Number(st.run(...values).changes) } };
        },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try {
        const r = [];
        for (const s of statements) r.push(await s.run());
        sqlite.exec('COMMIT');
        return r;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { sqlite, db };
}
void test('gift amount parsing is exact, positive, fractional-paisa rejecting, and safe-range only', () => {
  assert.equal(parseGiftAmount('0.01'), 1);
  assert.equal(parseGiftAmount('90071992547409.91'), MAX_GIFT_PAISA);
  for (const x of ['0', '-1', '1.001', '1e4', '90071992547409.92', 'Infinity'])
    assert.throws(() => parseGiftAmount(x));
});
void test('SA issuance stores only a hash, retries hide code, redemption posts one immutable balanced wallet entry', async () => {
  const { sqlite, db } = fixture();
  try {
    await assert.rejects(() =>
      issueGiftCard(db, {
        actorId: 'admin',
        amountPaisa: 12345,
        requestId: 'issue-admin',
        now: 1,
      }),
    );
    const issued = await issueGiftCard(db, {
      actorId: 'sa',
      amountPaisa: 12345,
      requestId: 'issue-test',
      now: 1,
    });
    assert.ok(issued.code);
    assert.match(issued.code, /^HG-[A-F0-9]{48}$/);
    const stored = JSON.stringify(
      sqlite.prepare('SELECT * FROM gift_cards').all(),
    );
    assert.ok(!stored.includes(issued.code));
    assert.equal(
      (
        await issueGiftCard(db, {
          actorId: 'sa',
          amountPaisa: 12345,
          requestId: 'issue-test',
          now: 1,
        })
      ).code,
      null,
    );
    await redeemGiftCard(db, {
      userId: 'buyer',
      code: issued.code,
      requestId: 'redeem-test',
      now: 2,
    });
    assert.equal(
      (
        await redeemGiftCard(db, {
          userId: 'buyer',
          code: issued.code,
          requestId: 'redeem-test',
          now: 2,
        })
      ).duplicate,
      true,
    );
    await assert.rejects(() =>
      redeemGiftCard(db, {
        userId: 'other',
        code: issued.code!,
        requestId: 'steal-test',
        now: 3,
      }),
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT balance_paisa AS n FROM wallet_accounts WHERE user_id='buyer'",
        )
        .get()?.n,
      12345,
    );
    const row = sqlite.prepare('SELECT * FROM wallet_entries').get();
    assert.equal(row?.order_id, null);
    assert.equal(row?.gift_card_id, issued.id);
    assert.equal(row?.platform_amount_paisa, -12345);
    assert.throws(() =>
      sqlite.exec('UPDATE wallet_entries SET amount_paisa=5'),
    );
    assert.throws(() => sqlite.exec('DELETE FROM wallet_entries'));
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE channel<>'in_app'",
        )
        .get()?.n,
      3,
    );
    assert.ok(
      !JSON.stringify(
        sqlite.prepare('SELECT * FROM audit_logs').all(),
      ).includes(issued.code),
    );
  } finally {
    sqlite.close();
  }
});
void test('inactive customer and wallet overflow fail without consuming the gift card or altering balance', async () => {
  const { sqlite, db } = fixture();
  try {
    const card = await issueGiftCard(db, {
      actorId: 'sa',
      amountPaisa: 1,
      requestId: 'issue-limit',
      now: 1,
    });
    sqlite.exec("UPDATE users SET status='disabled' WHERE id='buyer'");
    await assert.rejects(() =>
      redeemGiftCard(db, {
        userId: 'buyer',
        code: card.code!,
        requestId: 'redeem-limit',
        now: 2,
      }),
    );
    sqlite.exec(
      "UPDATE users SET status='active' WHERE id='buyer';INSERT INTO wallet_accounts VALUES ('buyer','BUYERREFERRAL001',9007199254740991,1)",
    );
    await assert.rejects(() =>
      redeemGiftCard(db, {
        userId: 'buyer',
        code: card.code!,
        requestId: 'redeem-limit',
        now: 2,
      }),
    );
    assert.equal(
      sqlite.prepare('SELECT redeemed_by FROM gift_cards').get()?.redeemed_by,
      null,
    );
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM wallet_entries').get()?.n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
void test('transactional SA revocation and redemption winner guards roll back downstream writes', async () => {
  const { sqlite, db } = fixture();
  try {
    const racing = {
      prepare: db.prepare.bind(db),
      batch: async (s: D1PreparedStatement[]) => {
        sqlite.exec("UPDATE users SET status='disabled' WHERE id='sa'");
        return db.batch(s);
      },
    } as D1Database;
    await assert.rejects(() =>
      issueGiftCard(racing, {
        actorId: 'sa',
        amountPaisa: 100,
        requestId: 'race-issue',
        now: 1,
      }),
    );
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM gift_cards').get()?.n,
      0,
    );
    sqlite.exec("UPDATE users SET status='active' WHERE id='sa'");
    const card = await issueGiftCard(db, {
      actorId: 'sa',
      amountPaisa: 100,
      requestId: 'issue-race',
      now: 1,
    });
    const redemptionRace = {
      prepare: db.prepare.bind(db),
      batch: async (s: D1PreparedStatement[]) => {
        sqlite
          .prepare(
            'UPDATE gift_cards SET redeemed_by=?,redeemed_at=2,redemption_request_id=? WHERE id=?',
          )
          .run('other', 'race-winner', card.id);
        return db.batch(s);
      },
    } as D1Database;
    await assert.rejects(() =>
      redeemGiftCard(redemptionRace, {
        userId: 'buyer',
        code: card.code!,
        requestId: 'race-loser',
        now: 2,
      }),
    );
    assert.equal(
      sqlite.prepare('SELECT COUNT(*) AS n FROM wallet_entries').get()?.n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
import {formatPaisaExact} from '../lib/marketplace/money-display';
import {adminNavigation} from '../lib/admin/navigation';
import {notificationDestination} from '../lib/operations/notification-links';
void test('gift links remain role scoped and maximum safe money displays its exact last paisa',()=>{
 assert.equal(formatPaisaExact(Number.MAX_SAFE_INTEGER),'NPR 90,071,992,547,409.91');
 assert.equal(formatPaisaExact(-1),'-NPR 0.01');
 assert.ok(adminNavigation('super_admin').some(n=>n.href==='/admin/gift-cards'));
 assert.ok(!adminNavigation('admin').some(n=>n.href==='/admin/gift-cards'));
 assert.equal(notificationDestination('customer','customer','gift_card','safe-id'),'/account/wallet?giftId=safe-id#gift-record-safe-id');
 assert.equal(notificationDestination('staff','staff','gift_card_issued','safe-id'),'/admin/gift-cards?giftId=safe-id#gift-record-safe-id');
});
