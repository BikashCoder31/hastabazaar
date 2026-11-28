import assert from 'node:assert/strict';
import test from 'node:test';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { readOrderRefundMariaMigrations } from '../lib/operations/order-refund-maria-migrations.mjs';
import {
  pricingSchemaFindings,
  pricingSchemaInventory,
  pricingSchemaReportSql,
  pricingSchemaSql,
} from '../lib/operations/pricing-schema-readiness.mjs';
import { sqlStatements } from '../scripts/testing/verify-current-native.mjs';
import { stagingNativeFixture } from './helpers/staging-native-fixture';

interface Finding extends RowDataPacket {
  kind: string;
  objectName: string;
  matched: number;
}

void test('MariaDB pricing readiness checks all definitions with a bounded trigger scan', {
  skip: process.env.HATSKALA_STAGING_NATIVE !== '1',
}, async t => {
  const fixture = await stagingNativeFixture();
  const db = await mysql.createConnection({ ...fixture, charset: 'utf8mb4' });
  t.after(() => db.end());
  const [[state]] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS users FROM users');
  assert.equal(Number(state.users), 0, 'An empty disposable fixture is required');
  const { assets } = await readOrderRefundMariaMigrations(process.cwd());
  for (const migration of assets.values()) {
    for (const sql of sqlStatements(migration.toString('utf8'))) await db.query(sql);
  }

  const inventory = pricingSchemaInventory(assets);
  const sql = pricingSchemaSql(inventory);
  const read = async () => (await db.execute<Finding[]>(sql))[0];
  const expectMissing = async (missing: string[]) => {
    const rows = await read();
    assert.equal(rows.length, 69);
    const result = pricingSchemaFindings(rows);
    assert.equal(result.ready, missing.length === 0);
    assert.deepEqual(result.missing.sort(), missing.sort());
  };

  const initial = await read();
  const counts = new Map<string, number>();
  for (const row of initial) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(counts), { table: 11, trigger: 45, view: 1, 'trigger-set': 11, session: 1 });
  const timings = [];
  for (let sample = 0; sample < 3; sample++) {
    const started = performance.now();
    await expectMissing([]);
    timings.push(Math.round(performance.now() - started));
  }
  t.diagnostic(`MariaDB pricing readiness (69 findings) in ms: ${timings.join(', ')}`);

  // Several unexpected triggers on one table must produce one set finding.
  // An unrelated table and its trigger are outside the pricing inventory.
  await db.query('CREATE TRIGGER qa_unexpected_insert AFTER INSERT ON order_item_pricing_snapshots FOR EACH ROW SET @qa_pricing = 1');
  await db.query('CREATE TRIGGER qa_unexpected_update AFTER UPDATE ON order_item_pricing_snapshots FOR EACH ROW SET @qa_pricing = 1');
  await db.query('CREATE TRIGGER qa_unexpected_allocation AFTER INSERT ON order_delivery_shipment_allocations FOR EACH ROW SET @qa_pricing = 1');
  await db.query('CREATE TRIGGER qa_unrelated_trigger AFTER INSERT ON categories FOR EACH ROW SET @qa_pricing = 1');
  const setFindings = [
    'pricing-schema:trigger-set:order_delivery_shipment_allocations',
    'pricing-schema:trigger-set:order_item_pricing_snapshots',
  ];
  await expectMissing(setFindings);
  const [report] = await db.execute<RowDataPacket[]>(pricingSchemaReportSql(inventory));
  assert.deepEqual(report.filter(row => row.objectName).map(row => `${row.kind}:${row.objectName}`).sort(),
    ['trigger-set:order_delivery_shipment_allocations', 'trigger-set:order_item_pricing_snapshots']);
  assert.equal(Number(report.find(row => row.kind === 'trigger-set' && row.objectName === '')?.missingOrDifferentCount), 2);

  const trigger = 'order_item_pricing_snapshot_no_delete';
  await db.query(`CREATE OR REPLACE TRIGGER ${trigger} BEFORE DELETE ON order_item_pricing_snapshots
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='changed'`);
  const triggerFinding = `pricing-schema:trigger:${trigger}`;
  await expectMissing([...setFindings, triggerFinding]);
  await db.query(`DROP TRIGGER ${trigger}`);
  await expectMissing([...setFindings, triggerFinding]);

  const [plan] = await db.query<RowDataPacket[]>(`EXPLAIN ${sql}`);
  const triggerScans = plan.filter(row => /^triggers$/i.test(row.table ?? '')).length;
  assert.ok(triggerScans >= 1 && triggerScans <= 2,
    `Expected at most two MariaDB TRIGGERS scans, found ${triggerScans}`);
});
