import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import mysql, { type Pool } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import { CONTINUITY_END } from '../lib/db/repositories/commission-continuity-proof';

// Transport-only adapter contracts. No socket or native database is opened.
type Call = { sql: string; values: unknown[] };
let calls: Call[] = [];
let now = CONTINUITY_END - 1;
let expireOnWrite = false;
let staged = 0;
let committed = 0;
let onLock: ((sql: string) => Promise<void>) | undefined;
const names = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;
const oldEnvironment = names.map((name) => process.env[name]);
for (const name of names) process.env[name] = 'fictional-continuity-transport';
const createPool = mysql.createPool;
const connection = {
  async query(sql: string) {
    calls.push({ sql, values: [] });
    return [[], []];
  },
  async beginTransaction() {
    calls.push({ sql: 'BEGIN', values: [] });
    staged = 0;
  },
  async execute(sql: string, values: unknown[] = []) {
    calls.push({ sql, values });
    if (sql.includes('FOR UPDATE')) await onLock?.(sql);
    if (sql.includes('UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))'))
      return [[{ valid: now < Number(values[0]) ? 1 : 0 }], []];
    if (sql === 'INSERT INTO fictional_effects VALUES (1)') {
      staged++;
      if (expireOnWrite) now = CONTINUITY_END;
    }
    if (/^\s*(?:\/\*[\s\S]*?\*\/\s*)?SELECT\b/.test(sql))
      return [[{ id: 'fictional', role: 'seller' }], []];
    return [{ affectedRows: 1, insertId: 0, warningStatus: 0 }, []];
  },
  async commit() {
    calls.push({ sql: 'COMMIT', values: [] });
    committed += staged;
    staged = 0;
  },
  async rollback() {
    calls.push({ sql: 'ROLLBACK', values: [] });
    staged = 0;
  },
  release() {
    calls.push({ sql: 'RELEASE', values: [] });
  },
  destroy() {},
};
mysql.createPool = (() =>
  ({
    getConnection: async () => connection,
  }) as unknown as Pool) as typeof createPool;
after(() => {
  mysql.createPool = createPool;
  names.forEach((name, i) => {
    if (oldEnvironment[i] === undefined) delete process.env[name];
    else process.env[name] = oldEnvironment[i];
  });
});
function reset() {
  calls = [];
  now = CONTINUITY_END - 1;
  expireOnWrite = false;
  staged = 0;
  committed = 0;
  onLock = undefined;
}
function statements(cutoff = true) {
  return [
    env.DB.prepare(
      '/* commission-continuity-evidence-lock */ SELECT ? AS owner_id,? AS seller_id,? AS audit_id',
    ).bind('fictional-z', 'fictional-seller-z', 'fictional-audit-z'),
    env.DB.prepare(
      '/* commission-continuity-evidence-lock */ SELECT ? AS owner_id,? AS seller_id,? AS audit_id',
    ).bind('fictional-a', 'fictional-seller-a', 'fictional-audit-a'),
    env.DB.prepare(
      '/* commission-continuity-evidence-lock */ SELECT ? AS owner_id,? AS seller_id,? AS audit_id',
    ).bind('fictional-a', 'fictional-seller-a', 'fictional-audit-a'),
    env.DB.prepare(
      '/* commission-continuity-setting-lock */ SELECT ? AS setting_key',
    ).bind('independent_seller_commission_bps'),
    ...(cutoff
      ? [
          env.DB.prepare(
            '/* commission-continuity-cutoff */ SELECT ? AS cutoff',
          ).bind(CONTINUITY_END),
        ]
      : []),
    env.DB.prepare('INSERT INTO fictional_effects VALUES (1)'),
  ];
}

void test('continuity adapter holds deterministically ordered mutable evidence locks before guards and through the final clock check', async () => {
  reset();
  await env.DB.batch(statements());
  const write = calls.findIndex(
    (c) => c.sql === 'INSERT INTO fictional_effects VALUES (1)',
  );
  const locks = calls.filter((c) => c.sql.includes('FOR UPDATE'));
  for (const table of [
    'commission_control',
    'users',
    'user_roles',
    'seller_profiles',
    'seller_participation_profiles',
    'audit_logs',
    'business_setting_versions',
  ])
    assert.ok(
      locks.some((c) => c.sql.includes(`FROM ${table} `)),
      table,
    );
  for (const table of [
    'users',
    'user_roles',
    'seller_profiles',
    'seller_participation_profiles',
    'audit_logs',
  ]) {
    const ids = locks
      .filter((c) => c.sql.includes(`FROM ${table} `))
      .map((c) => String(c.values[0]));
    assert.equal(ids.length, 2, table);
    assert.deepEqual(ids, [...ids].sort(), table);
  }
  assert.ok(calls.findLastIndex((c) => c.sql.includes('FOR UPDATE')) < write);
  const clocks = calls
    .map((c, i) =>
      c.sql.includes('UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))') ? i : -1,
    )
    .filter((i) => i >= 0);
  assert.equal(clocks.length, 2);
  assert.ok(clocks[0] < write && clocks[1] > write);
  assert.equal(calls[clocks[1] + 1].sql, 'COMMIT');
  assert.equal(committed, 1);
});
void test('a pre-cutoff placement blocked on native evidence locks is refused after release at the cutoff', async () => {
  reset();
  let entered!: () => void;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  onLock = async (sql) => {
    if (sql.includes('FROM users ')) {
      onLock = undefined;
      entered();
      await gate;
    }
  };
  const pending = env.DB.batch(statements());
  // A missing lock must fail explicitly rather than hanging this transport test.
  await Promise.race([
    blocked,
    pending.then(() => {
      throw new Error('Evidence locks were not acquired');
    }),
  ]);
  now = CONTINUITY_END;
  release();
  await assert.rejects(pending, /operation_transaction_guards.*valid/);
  assert.equal(committed, 0);
  assert.equal(
    calls.some((c) => c.sql === 'INSERT INTO fictional_effects VALUES (1)'),
    false,
  );
  assert.equal(
    calls.some((c) => c.sql === 'COMMIT'),
    false,
  );
  assert.ok(calls.some((c) => c.sql === 'ROLLBACK'));
});
void test('expiry during a later native statement rolls back writes at the precommit clock check', async () => {
  reset();
  expireOnWrite = true;
  await assert.rejects(
    env.DB.batch(statements()),
    /operation_transaction_guards.*valid/,
  );
  assert.equal(committed, 0);
  assert.equal(staged, 0);
  assert.ok(calls.some((c) => c.sql === 'ROLLBACK'));
  assert.equal(
    calls.some((c) => c.sql === 'COMMIT'),
    false,
  );
});
void test('evidence-only replay locks retain their guards without extending or rechecking the original creation window', async () => {
  reset();
  now = CONTINUITY_END;
  await env.DB.batch(statements(false));
  assert.ok(
    calls.some(
      (c) => c.sql.includes('FROM audit_logs ') && c.sql.includes('FOR UPDATE'),
    ),
  );
  assert.equal(
    calls.some((c) => c.sql.includes('UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))')),
    false,
  );
  assert.equal(committed, 1);
});
void test('ordinary native batches retain their existing transaction behavior', async () => {
  reset();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO fictional_effects VALUES (1)'),
  ]);
  assert.equal(
    calls.some(
      (c) =>
        c.sql.includes('FOR UPDATE') ||
        c.sql.includes('UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))'),
    ),
    false,
  );
  assert.equal(committed, 1);
  assert.deepEqual(
    calls.slice(0, 2).map((c) => c.sql),
    ['SET TRANSACTION ISOLATION LEVEL READ COMMITTED', 'BEGIN'],
  );
});
void test('an additional stricter cutoff is enforced alongside the unchanged production cutoff', async () => {
  reset();
  now = CONTINUITY_END - 500;
  await assert.rejects(
    env.DB.batch([
      ...statements(),
      env.DB.prepare(
        '/* commission-continuity-cutoff */ SELECT ? AS cutoff',
      ).bind(CONTINUITY_END - 1000),
    ]),
    /operation_transaction_guards.*valid/,
  );
  assert.equal(committed, 0);
  assert.equal(
    calls.some((c) => c.sql === 'INSERT INTO fictional_effects VALUES (1)'),
    false,
  );
  assert.ok(
    calls.some(
      (c) =>
        c.sql.includes('UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))') &&
        c.values[0] === CONTINUITY_END - 1000,
    ),
  );
});
