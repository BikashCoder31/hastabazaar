import mysql from 'mysql2/promise';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { env as runtime } from '../lib/runtime/node-bindings';
import {
  issueGiftCard,
  redeemGiftCard,
  MAX_GIFT_PAISA,
} from '../lib/db/repositories/gift-cards';
const output =
  'outputs/approved-four-2026-09-13T05-17-00-125Z/native-gift-cards.json';
const root = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13316,
  user: 'root',
  multipleStatements: true,
});
const name = 'gift_cards_' + Date.now(),
  password = crypto.randomUUID(),
  checks: string[] = [];
const pass = (label: string) => {
  checks.push(label);
  console.log('PASS ' + label);
};
async function migrate(path: string) {
  let delimiter = ';',
    buffer = '';
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    if (line.startsWith('DELIMITER ')) {
      delimiter = line.slice(10).trim();
      continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length);
      buffer = '';
      if (statement.trim()) {
        try {
          await root.query(statement);
        } catch (error) {
          console.error(
            'Migration failure in ' +
              path +
              ': ' +
              String(
                (error as { sqlMessage?: string }).sqlMessage ?? 'DDL failed',
              ),
          );
          throw error;
        }
      }
    }
  }
  if (buffer.trim()) await root.query(buffer);
}
try {
  await root.query('CREATE DATABASE ' + name);
  await root.query('USE ' + name);
  await root.query('CREATE USER ?@? IDENTIFIED BY ?', [
    name,
    '127.0.0.1',
    password,
  ]);
  await root.query('GRANT ALL ON ' + name + '.* TO ?@?', [name, '127.0.0.1']);
  const manifest = JSON.parse(
    await readFile('deployment/babal/release-manifest.json', 'utf8'),
  );
  for (const migration of manifest.migrations.filter(
    (m: { path: string }) => !m.path.endsWith('/mariadb-gift-cards.sql'),
  ))
    await migrate(migration.path);
  Object.assign(process.env, {
    DB_HOST: '127.0.0.1',
    DB_PORT: '13316',
    DB_NAME: name,
    DB_USER: name,
    DB_PASSWORD: password,
  });
  const db = runtime.DB as unknown as D1Database;
  for (const [id, role] of [
    ['sa', 'super_admin'],
    ['admin', 'admin'],
    ['buyer', 'customer'],
    ['other', 'customer'],
  ]) {
    await root.execute(
      "INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,?,'en-NP','active',1,1)",
      [id, id, id + '@example.test', id],
    );
    await root.execute(
      'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)',
      [id, role],
    );
  }

  await root.query(
    "INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES ('legacy','legacy','legacy@example.test','Legacy','en-NP','active',1,1)",
  );
  await root.query(
    "INSERT INTO orders(id,order_number,receipt_token_hash,customer_email,customer_phone,status,locale,currency,policy_version,return_policy_snapshot_json,shipping_address_json,item_subtotal_paisa,seller_discount_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,tax_total_paisa,grand_total_paisa,payment_mode,payment_status,placed_at,created_at,updated_at) VALUES ('legacy-order','LEGACY-GIFT-TEST','synthetic-only','legacy@example.test','9811111111','delivered','en-NP','NPR','phase-1.0','{}','{}',10000,0,15000,0,0,25000,'cod','paid',1,1,1)",
  );
  await root.query(
    "INSERT INTO wallet_accounts VALUES ('legacy','LEGACYREFERRAL01',0,1)",
  );
  await root.query(
    "INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('legacy-entry','legacy','legacy-order',5000,-5000,'referral_reward',1)",
  );
  const oldEntry = (
    await root.query("SELECT * FROM wallet_entries WHERE id='legacy-entry'")
  )[0];
  await migrate('deployment/babal/mariadb-gift-cards.sql');
  const preserved = (
    await root.query(
      "SELECT id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at FROM wallet_entries WHERE id='legacy-entry'",
    )
  )[0];
  assert.deepEqual(preserved, oldEntry);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT balance_paisa AS n FROM wallet_accounts WHERE user_id='legacy'",
        )
        .first<{ n: number }>()
    )?.n,
    5000,
  );
  pass(
    'initial gift extension preserves pre-existing referral ledger and balance without reposting credit',
  );
  await assert.rejects(() =>
    issueGiftCard(db, {
      actorId: 'admin',
      amountPaisa: 100,
      requestId: 'admin-issue',
      now: 1,
    }),
  );
  const card = await issueGiftCard(db, {
    actorId: 'sa',
    amountPaisa: 12345,
    requestId: 'native-issue',
    now: 1,
  });
  assert.ok(card.code);
  assert.equal(
    (
      await issueGiftCard(db, {
        actorId: 'sa',
        amountPaisa: 12345,
        requestId: 'native-issue',
        now: 1,
      })
    ).code,
    null,
  );
  const raced = await Promise.allSettled(
    ['buyer', 'other'].map((userId) =>
      redeemGiftCard(db, {
        userId,
        code: card.code!,
        requestId: 'native-redeem-' + userId,
        now: 2,
      }),
    ),
  );
  assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1);
  const entry = await db
    .prepare(
      'SELECT user_id AS userId,amount_paisa AS amount,platform_amount_paisa AS platform FROM wallet_entries WHERE gift_card_id=?',
    )
    .bind(card.id)
    .first<{ userId: string; amount: number; platform: number }>();
  assert.ok(entry);
  assert.equal(entry.amount, 12345);
  assert.equal(entry.platform, -12345);
  assert.equal(
    (
      await db
        .prepare(
          'SELECT balance_paisa AS amount FROM wallet_accounts WHERE user_id=?',
        )
        .bind(entry.userId)
        .first<{ amount: number }>()
    )?.amount,
    12345,
  );
  pass(
    'native current SA issuance, hidden replay secret, concurrent one-winner redemption and exact single balance credit',
  );
  const before = (await root.query('SELECT * FROM wallet_entries'))[0];
  await migrate('deployment/babal/mariadb-gift-cards.sql');
  await migrate('deployment/babal/mariadb-gift-cards.sql');
  assert.deepEqual(
    (await root.query('SELECT * FROM wallet_entries'))[0],
    before,
  );
  await assert.rejects(() =>
    root.query('UPDATE wallet_entries SET amount_paisa=99'),
  );
  await assert.rejects(() => root.query('DELETE FROM wallet_entries'));
  await assert.rejects(() =>
    root.query('UPDATE gift_cards SET amount_paisa=99'),
  );
  await assert.rejects(() => root.query('DELETE FROM gift_cards'));
  pass(
    'repeat migration preserves wallet entries and retains wallet/gift immutability',
  );
  const stored =
    JSON.stringify((await root.query('SELECT * FROM audit_logs'))[0]) +
    JSON.stringify(
      (await root.query('SELECT * FROM notification_messages'))[0],
    ) +
    JSON.stringify((await root.query('SELECT * FROM gift_cards'))[0]);
  assert.ok(!stored.includes(card.code!));
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM notification_messages WHERE channel<>'in_app'",
        )
        .first<{ n: number }>()
    )?.n,
    0,
  );
  pass(
    'no plaintext secret in database records, audits or notifications; no email queue',
  );
  const high = await issueGiftCard(db, {
    actorId: 'sa',
    amountPaisa: MAX_GIFT_PAISA,
    requestId: 'native-max',
    now: 3,
  });
  await assert.rejects(() =>
    redeemGiftCard(db, {
      userId: entry.userId,
      code: high.code!,
      requestId: 'native-overflow',
      now: 4,
    }),
  );
  assert.equal(
    (
      await db
        .prepare('SELECT redeemed_by AS userId FROM gift_cards WHERE id=?')
        .bind(high.id)
        .first<{ userId: string | null }>()
    )?.userId,
    null,
  );
  const loser = entry.userId === 'buyer' ? 'other' : 'buyer';
  await redeemGiftCard(db, {
    userId: loser,
    code: high.code!,
    requestId: 'native-max-redeem',
    now: 5,
  });
  assert.equal(
    (
      await db
        .prepare(
          'SELECT balance_paisa AS amount FROM wallet_accounts WHERE user_id=?',
        )
        .bind(loser)
        .first<{ amount: number }>()
    )?.amount,
    MAX_GIFT_PAISA,
  );
  pass(
    'native safe-maximum amount succeeds exactly; overflow does not consume card',
  );
  await writeFile(
    output,
    JSON.stringify(
      { localOnly: true, noTransportInvoked: true, checks, passed: true },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    output,
    JSON.stringify(
      {
        localOnly: true,
        checks,
        passed: false,
        errorName: error instanceof Error ? error.name : 'Unknown',
        code: (error as { code?: string })?.code ?? null,
      },
      null,
      2,
    ),
  );
  console.error('Native gift verification failed; sanitized report saved.');
  process.exitCode = 1;
} finally {
  if (/^gift_cards_\d+$/.test(name)) {
    await root.query('DROP DATABASE IF EXISTS ' + name);
    await root.query('DROP USER IF EXISTS ?@?', [name, '127.0.0.1']);
  }
  await root.end();
  setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
}
