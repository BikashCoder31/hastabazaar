import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createIncentiveDb, seedIncentiveCustomer, seedIncentiveInventory } from './helpers/incentive-db';

const migration = readFileSync(new URL('../drizzle/0155_product_orderable_price_history.sql', import.meta.url), 'utf8');
const tables = ['product_price_reference_reviews', 'product_discount_cycles', 'product_discount_advisories', 'product_discount_advisory_items'];
async function snapshot(db: D1Database) {
  return Promise.all(tables.map(async table => (await db.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all<Record<string, unknown>>()).results));
}
async function schema(db: D1Database) {
  return (await db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all()).results;
}
async function assertForeignKeys(db: D1Database) {
  assert.equal((await db.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>())!.foreign_keys, 1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
}

// Exercises the actual source through native D1, including its stricter handling
// of trailing comments, the populated incoming-FK chain, and transaction rollback.
void test('native 0155 preserves populated review dependencies and rolls back failed copies with foreign keys enabled', async () => {
  let before: Awaited<ReturnType<typeof snapshot>> = [];
  const fixture = await createIncentiveDb({ beforeOrderablePriceHistory: async db => {
    await seedIncentiveCustomer(db);
    await seedIncentiveInventory(db);
    await db.batch([
      db.prepare("INSERT INTO product_offer_versions VALUES('version','product','{}','customer',1)"),
      db.prepare("INSERT INTO product_offer_identities VALUES('offer','product','NATIVE-MIGRATION-SKU','{}','family','piece',1,1)"),
      db.prepare("INSERT INTO product_price_reference_reviews VALUES('proof','product','seller','offer','version',3,'{\"unit\":1}',700,800,'approved','external_offer','retained private evidence',10,20,'Original reviewer basis','customer',30)"),
      db.prepare("INSERT INTO product_discount_cycles VALUES('cycle','product','offer','version','proof',700,800,'7.00','8.00',31,31,44,'sent','pending',4)"),
      db.prepare("INSERT INTO product_discount_advisories VALUES('advisory','product',23,32,33)"),
      db.prepare("INSERT INTO product_discount_advisory_items VALUES('advisory','cycle')"),
    ]);
    before = await snapshot(db);
    const beforeSchema = await schema(db);
    await assertForeignKeys(db);
    const statements = migration.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean);
    const copyIndex = statements.findIndex(statement => statement.startsWith('INSERT INTO product_price_reference_reviews_next'));
    assert.ok(copyIndex > 0);
    statements.splice(copyIndex, 0, "CREATE TRIGGER injected_copy_failure BEFORE INSERT ON product_price_reference_reviews_next BEGIN SELECT RAISE(ABORT,'injected_copy_failure'); END;");
    await assert.rejects(db.batch(statements.map(statement => db.prepare(statement))), /injected_copy_failure/);
    assert.deepEqual(await snapshot(db), before, 'failed native batch restores every retained row');
    assert.deepEqual(await schema(db), beforeSchema, 'failed native batch restores complete schema');
    await assertForeignKeys(db);
  } });
  try {
    const after = await snapshot(fixture.db);
    assert.equal(after[0][0].history_basis, null);
    delete after[0][0].history_basis;
    assert.deepEqual(after, before);
    await assertForeignKeys(fixture.db);
    assert.equal((await fixture.db.prepare('SELECT COUNT(*) n FROM product_orderable_price_observations').first<{ n: number }>())!.n, 0);
    await assert.rejects(fixture.db.prepare("UPDATE product_price_reference_reviews SET reason='replacement' WHERE id='proof'").run(), /immutable/);
    await assert.rejects(fixture.db.prepare("DELETE FROM product_price_reference_reviews WHERE id='proof'").run(), /retained/);
    await assert.rejects(fixture.db.prepare("UPDATE product_discount_cycles SET reference_id='missing'").run(), /FOREIGN KEY/);
    await assert.rejects(fixture.db.prepare("UPDATE product_discount_advisory_items SET cycle_id='missing'").run(), /FOREIGN KEY/);
    assert.ok(await fixture.db.prepare("SELECT name FROM sqlite_master WHERE name='product_discount_pending'").first());
  } finally { await fixture.dispose(); }
});
