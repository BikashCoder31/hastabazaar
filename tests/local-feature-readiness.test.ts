import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { inspectLocalFeatureSchema } from '../scripts/start-local.mjs';

void test('local feature readiness rejects the older schema and never upgrades it automatically', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => /^\d{4}_.+\.sql$/.test(n)).sort();
    for (const name of migrations.filter(n => n < '0069')) db.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
    const before = db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();
    const older = inspectLocalFeatureSchema(db);
    assert.equal(older.ready, false);
    assert.ok(older.missing.includes('commission_control'));
    assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all(), before);
    for (const name of migrations.filter(n => n >= '0069')) db.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
    assert.equal(inspectLocalFeatureSchema(db).ready, true);
    db.exec('DROP TRIGGER loyalty_weekly_claim_guard');
    assert.ok(inspectLocalFeatureSchema(db).missing.includes('loyalty_weekly_claim_guard'));
    db.exec("DELETE FROM commission_control WHERE id='default'");
    assert.ok(inspectLocalFeatureSchema(db).missing.includes('commission_control.default'));
  } finally { db.close(); }
});

void test('local launcher rejects conditional or extra-statement fee guards without changing any metadata', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => /^\d{4}_.+\.sql$/.test(n)).sort()) db.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
    for (const suffix of ['no_update', 'no_delete']) {
      const event = suffix === 'no_update' ? 'UPDATE' : 'DELETE';
      const name = `order_item_marketplace_fees_${suffix}`;
      const original = String(db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(name)!.sql);
      for (const body of [
        `WHEN 0 BEGIN SELECT RAISE(ABORT,'marketplace_fee_snapshot_immutable'); END`,
        `BEGIN SELECT 1; SELECT RAISE(ABORT,'marketplace_fee_snapshot_immutable'); END`,
      ]) {
        db.exec(`DROP TRIGGER ${name}; CREATE TRIGGER ${name} BEFORE ${event} ON order_item_marketplace_fees ${body}`);
        const before = db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all();
        assert.ok(inspectLocalFeatureSchema(db).missing.includes(`${name}.version`), body);
        assert.deepEqual(db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all(), before);
      }
      db.exec(`DROP TRIGGER ${name}; ${original}`);
    }
  } finally { db.close(); }
});

void test('local launcher fails closed for missing fee storage, invalid control, columns and ineffective guards without repairing data', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => /^\d{4}_.+\.sql$/.test(n)).sort();
    for (const name of migrations.filter(n => n < '0073')) db.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
    const before = db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all();
    const absent = inspectLocalFeatureSchema(db);
    assert.equal(absent.ready, false);
    for (const name of ['marketplace_fee_waiver_control', 'marketplace_fee_waiver_campaigns', 'marketplace_fee_waiver_revisions', 'marketplace_fee_waiver_requests', 'order_item_marketplace_fees']) assert.ok(absent.missing.includes(name), name);
    assert.deepEqual(db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all(), before);
    for (const name of migrations.filter(n => n >= '0073')) db.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
    assert.equal(inspectLocalFeatureSchema(db).ready, true);
    db.exec("DELETE FROM marketplace_fee_waiver_control; INSERT INTO marketplace_fee_waiver_control VALUES('default',7)");
    assert.equal(inspectLocalFeatureSchema(db).ready, true);
    db.exec('DELETE FROM marketplace_fee_waiver_control');
    assert.ok(inspectLocalFeatureSchema(db).missing.includes('marketplace_fee_waiver_control.default'));
    db.exec("INSERT INTO marketplace_fee_waiver_control VALUES('default',0); DROP TRIGGER order_item_marketplace_fees_no_update; CREATE TRIGGER order_item_marketplace_fees_no_update BEFORE UPDATE ON order_item_marketplace_fees BEGIN SELECT 1; END;");
    assert.ok(inspectLocalFeatureSchema(db).missing.includes('order_item_marketplace_fees_no_update.version'));
    db.exec('ALTER TABLE order_item_marketplace_fees DROP COLUMN standard_bps');
    assert.ok(inspectLocalFeatureSchema(db).missing.includes('order_item_marketplace_fees.standard_bps'));
  } finally { db.close(); }
});
