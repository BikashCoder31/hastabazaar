import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseReferralRewards } from '../lib/db/repositories/wallet';

function rewardDatabase(batch: () => Promise<void>) {
  return {
    dialect: 'mariadb',
    prepare(sql: string) {
      return { bind(...values: unknown[]) { return { sql, values }; } };
    },
    async batch(statements: { sql: string; values: unknown[] }[]) {
      assert.equal(statements.length, 3);
      assert.match(statements[0].sql, /INSERT OR IGNORE INTO wallet_entries/);
      assert.deepEqual(statements.slice(1).map(statement => statement.values[0]), ['in_app', 'email']);
      await batch();
    },
  } as unknown as D1Database;
}

void test('idempotent reward release recovers from a MariaDB deadlock and does not swallow other failures', async () => {
  let calls = 0;
  const db = rewardDatabase(async () => {
    if (++calls === 1) throw Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' });
  });
  await releaseReferralRewards(db, 'customer', 1);
  assert.equal(calls, 2);
  calls = 0;
  const unavailable = rewardDatabase(async () => {
    calls++;
    throw new Error('Unavailable');
  });
  await assert.rejects(
    releaseReferralRewards(unavailable, 'customer', 1),
    /Unavailable/,
  );
  assert.equal(calls, 1);
});

void test('persistent reward-release deadlocks stop after three attempts', async () => {
  let calls = 0;
  const db = rewardDatabase(async () => {
    calls++;
    throw Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' });
  });
  await assert.rejects(
    releaseReferralRewards(db, 'customer', 1),
    /Deadlock/,
  );
  assert.equal(calls, 3);
});
