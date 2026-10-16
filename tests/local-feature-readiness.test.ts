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
