import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';

import { collectFormAnswersForPrivacy } from '../lib/forms/privacy';

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
}

class Database {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
}

void test('privacy export follows product seller profile ownership for submission and inventory snapshots', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`
      CREATE TABLE seller_profiles(id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TABLE products(id TEXT PRIMARY KEY, seller_id TEXT NOT NULL);
      CREATE TABLE addresses(id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TABLE address_answer_owner_tombstones(address_id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TABLE product_reviews(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, product_id TEXT);
      CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY, seller_id TEXT NOT NULL);
      CREATE TABLE shipping_job_events(id TEXT PRIMARY KEY, shipping_job_id TEXT NOT NULL);
      CREATE TABLE payout_requests(id TEXT PRIMARY KEY, seller_id TEXT NOT NULL);
      CREATE TABLE review_replies(id TEXT PRIMARY KEY, review_id TEXT NOT NULL, seller_id TEXT NOT NULL);
      CREATE TABLE managed_supply_records(id TEXT PRIMARY KEY, seller_id TEXT NOT NULL);
      CREATE TABLE seller_route_transition_applications(id TEXT PRIMARY KEY, seller_id TEXT NOT NULL);
      CREATE TABLE rider_profiles(user_id TEXT PRIMARY KEY);
      CREATE TABLE data_rights_requests(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL);
      CREATE TABLE form_config_versions(id TEXT PRIMARY KEY, form_id TEXT NOT NULL,
        version INTEGER NOT NULL, status TEXT NOT NULL, config_json TEXT NOT NULL);
      CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY, form_id TEXT NOT NULL,
        request_id TEXT NOT NULL, config_version_id TEXT NOT NULL, subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL, actor_id TEXT, answers_json TEXT NOT NULL, created_at INTEGER NOT NULL);
      INSERT INTO seller_profiles VALUES ('owned-shop','owner'),('foreign-shop','other-owner');
      INSERT INTO products VALUES ('owned-product','owned-shop'),('foreign-product','foreign-shop');
    `);
    for (const formId of ['seller.product-submission', 'seller.inventory']) {
      sqlite.prepare(`INSERT INTO form_config_versions VALUES (?, ?, 1, 'published', ?)`)
        .run(`${formId}-v1`, formId, JSON.stringify({ formId, fields: [
          { id: 'workshop_note', key: 'workshop_note', label: 'Workshop note', type: 'short_text',
            required: false, order: 0, status: 'active' },
        ] }));
    }
    const insert = sqlite.prepare(`INSERT INTO form_answer_sets
      (id,form_id,request_id,config_version_id,subject_type,subject_id,actor_id,answers_json,created_at)
      VALUES (?,?,?,?, 'product',?,?,?,?)`);
    for (const [id, formId, productId, note, createdAt] of [
      ['owned-submission', 'seller.product-submission', 'owned-product', 'Original handmade listing', 1],
      ['owned-inventory', 'seller.inventory', 'owned-product', 'Original stock count note', 2],
      ['foreign-submission', 'seller.product-submission', 'foreign-product', 'Private foreign listing', 3],
      ['foreign-inventory', 'seller.inventory', 'foreign-product', 'Private foreign stock note', 4],
    ] as const) {
      insert.run(id, formId, `request-${id}`, `${formId}-v1`, productId, 'other-owner',
        JSON.stringify({ formId, version: 1, answers: [
          { fieldId: 'workshop_note', label: 'Workshop note', type: 'short_text', value: note },
        ] }), createdAt);
    }
    const db = new Database(sqlite) as unknown as D1Database;
    const owned = await collectFormAnswersForPrivacy(db, 'owner');
    assert.deepEqual(owned.map((row) => row.id), ['owned-submission', 'owned-inventory']);
    assert.deepEqual(owned.map((row) => row.answers.answers[0]?.value),
      ['Original handmade listing', 'Original stock count note']);
    assert.ok(owned.every((row) => row.historicalFieldIds.length === 0));
    assert.deepEqual((await collectFormAnswersForPrivacy(db, 'other-owner')).map((row) => row.id),
      ['foreign-submission', 'foreign-inventory']);
  } finally { sqlite.close(); }
});
