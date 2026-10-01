import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseReferralRewards } from '../lib/db/repositories/wallet';

void test('idempotent reward release recovers from a MariaDB deadlock and does not swallow other failures', async () => {
  let calls = 0;
  const statement = {
    bind() {
      return this;
    },
    async run() {
      calls++;
      if (calls === 1)
        throw Object.assign(new Error('Deadlock'), {
          code: 'ER_LOCK_DEADLOCK',
        });
      return { success: true };
    },
  };
  const db = {
    prepare() {
      return statement;
    },
  } as unknown as D1Database;
  await releaseReferralRewards(db, 'customer', 1);
  assert.equal(calls, 2);
  calls = 0;
  statement.run = async () => {
    calls++;
    throw new Error('Unavailable');
  };
  await assert.rejects(
    releaseReferralRewards(db, 'customer', 1),
    /Unavailable/,
  );
  assert.equal(calls, 1);
});

void test('persistent reward-release deadlocks stop after three attempts', async () => {
  let calls = 0;
  const statement = {
    bind() {
      return this;
    },
    async run() {
      calls++;
      throw Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' });
    },
  };
  await assert.rejects(
    releaseReferralRewards(
      {
        prepare() {
          return statement;
        },
      } as unknown as D1Database,
      'customer',
      1,
    ),
    /Deadlock/,
  );
  assert.equal(calls, 3);
});
