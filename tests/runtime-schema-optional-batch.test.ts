import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { inspectCurrentRuntimeSchema } from '../lib/operations/runtime-schema-readiness.mjs';

function historicalSchema() {
  const sqlite = new DatabaseSync(':memory:');
  const directory = new URL('../drizzle/', import.meta.url);
  for (const name of readdirSync(directory).filter(name => /^\d{4}_.+\.sql$/.test(name) && name < '0164_').sort()) {
    sqlite.exec(readFileSync(new URL(name, directory), 'utf8'));
  }
  return sqlite;
}

void test('the preview schema check accepts the complete pre-feature database and still requires historical guards', () => {
  const sqlite = historicalSchema();
  try {
    assert.equal(inspectCurrentRuntimeSchema(sqlite).ready, true);
    sqlite.exec('DROP TRIGGER first_cod_orders_update');
    assert.deepEqual(inspectCurrentRuntimeSchema(sqlite).missing, ['trigger:first_cod_orders_update']);
  } finally { sqlite.close(); }
});

void test('the preview schema check validates complete optional features and reports incomplete storage', () => {
  const sqlite = historicalSchema();
  try {
    // Model the installed storage independently on this disposable fixture.
    sqlite.exec(`ALTER TABLE shipping_jobs ADD COLUMN delivery_failure_reason TEXT DEFAULT NULL
      CHECK(delivery_failure_reason IN ('refused','not_reached','wrong_address','courier_problem','other'));
      ALTER TABLE products ADD COLUMN packed_weight_grams INTEGER DEFAULT NULL
      CHECK(packed_weight_grams IS NULL OR (typeof(packed_weight_grams)='integer' AND packed_weight_grams BETWEEN 50 AND 30000));`);
    assert.deepEqual(inspectCurrentRuntimeSchema(sqlite).missing, ['table:seller_parcel_weights']);
    sqlite.exec(`CREATE TABLE seller_parcel_weights(
      order_id TEXT NOT NULL REFERENCES orders(id), seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
      weight_grams INTEGER NOT NULL CHECK(typeof(weight_grams)='integer' AND weight_grams BETWEEN 50 AND 30000),
      item_count INTEGER NOT NULL CHECK(typeof(item_count)='integer' AND item_count>0),
      recorded_by TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 150),
      recorded_at INTEGER NOT NULL, PRIMARY KEY(order_id,seller_id));
      CREATE TABLE seller_staff_notes(
        id TEXT PRIMARY KEY NOT NULL, seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
        author_user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),
        created_at INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)));
      CREATE INDEX seller_staff_notes_timeline ON seller_staff_notes(seller_id,created_at,id);`);
    for (const table of ['order_cancellation_events', 'order_cancellation_reviews']) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN cause TEXT DEFAULT NULL
        CHECK(cause IN ('seller','customer','courier','hastabazaar','payment'))`);
    }
    const result = inspectCurrentRuntimeSchema(sqlite);
    assert.equal(result.ready, true, JSON.stringify(result));
    sqlite.exec('DROP INDEX seller_staff_notes_timeline; CREATE INDEX seller_staff_notes_timeline ON seller_staff_notes (seller_id)');
    assert.deepEqual(inspectCurrentRuntimeSchema(sqlite).changed, ['index:seller_staff_notes_timeline']);
  } finally { sqlite.close(); }
});

void test('the optional COD table replacement requires its strengthened immutability guard', () => {
  const sqlite = historicalSchema();
  try {
    const objects = sqlite.prepare(`SELECT name, sql FROM sqlite_master
      WHERE tbl_name='first_cod_reviews' AND type IN ('index','trigger') AND sql IS NOT NULL`).all() as Array<{ name: string; sql: string }>;
    sqlite.exec(`PRAGMA legacy_alter_table=ON;
      ALTER TABLE first_cod_reviews RENAME TO original_cod;
      CREATE TABLE first_cod_reviews (
        order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),
        customer_id TEXT NOT NULL REFERENCES users(id),
        total_paisa INTEGER NOT NULL CHECK(typeof(total_paisa)='integer' AND total_paisa BETWEEN 0 AND 9007199254740991),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed')),
        created_at INTEGER NOT NULL, confirmed_by TEXT REFERENCES users(id),
        confirmed_at INTEGER, reason TEXT, request_id TEXT UNIQUE,
        hold_source TEXT NOT NULL DEFAULT 'first_order' CHECK(hold_source IN ('first_order','customer_flag')),
        CHECK(hold_source='customer_flag' OR total_paisa>=500000),
        CHECK((status='pending' AND confirmed_by IS NULL AND confirmed_at IS NULL AND reason IS NULL AND request_id IS NULL)
          OR (status='confirmed' AND confirmed_by IS NOT NULL AND confirmed_at>=created_at
            AND length(trim(reason)) BETWEEN 8 AND 500 AND length(request_id) BETWEEN 1 AND 100)));
      DROP TABLE original_cod;
      PRAGMA legacy_alter_table=OFF;
      ALTER TABLE users ADD COLUMN cod_confirmation_required INTEGER NOT NULL DEFAULT 0 CHECK(cod_confirmation_required IN (0,1));`);
    for (const { sql } of objects) sqlite.exec(sql);
    assert.deepEqual(inspectCurrentRuntimeSchema(sqlite).changed, ['trigger:first_cod_review_immutable']);
    const previousGuard = objects.find(row => row.name === 'first_cod_review_immutable');
    assert.ok(previousGuard);
    sqlite.exec('DROP TRIGGER first_cod_review_immutable');
    sqlite.exec(previousGuard.sql.replace(' BEGIN', ' OR NEW.hold_source<>OLD.hold_source BEGIN'));
    const result = inspectCurrentRuntimeSchema(sqlite);
    assert.equal(result.ready, true, JSON.stringify(result));
  } finally { sqlite.close(); }
});
