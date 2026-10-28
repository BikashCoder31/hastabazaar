import { after, test } from 'node:test';
import mysql, { type Pool } from 'mysql2/promise';
import { stagingNativeFixture } from './helpers/staging-native-fixture';
import { refundRemittanceScenario, cancellationSettlementScenario } from './helpers/financial-transition-scenarios';

const enabled = process.env.HATSKALA_STAGING_NATIVE === '1';
const pools: Pool[] = [];
const createPool = mysql.createPool;
let db: D1Database;
if (enabled) {
  // Prove the exact disposable container and database before loading the adapter.
  await stagingNativeFixture();
  mysql.createPool = ((...args: Parameters<typeof createPool>) => {
    const pool = createPool(...args); pools.push(pool); return pool;
  }) as typeof createPool;
  const { env } = await import('../lib/runtime/node-bindings');
  db = env.DB as unknown as D1Database;
}
after(async () => { mysql.createPool = createPool; for (const pool of pools) await pool.end(); });

for (const full of [false, true]) for (const beforeRemittance of [true, false]) {
  void test(`MariaDB ${full ? 'full' : 'partial'} refund ${beforeRemittance ? 'before' : 'after'} remittance preserves earnings without duplicate credits`,
    { skip: !enabled }, async () => refundRemittanceScenario(db, full, beforeRemittance));
}
for (const [collected, remitted] of [[false, false], [true, false], [true, true]]) {
  void test(`MariaDB partial cancellation reconciles collected=${collected}, remitted=${remitted}`,
    { skip: !enabled }, async () => cancellationSettlementScenario(db, collected, remitted));
}
void test('MariaDB wallet-funded cancellation captures remaining cash and restores cancelled wallet credit once',
  { skip: !enabled }, async () => cancellationSettlementScenario(db, true, true, true));
