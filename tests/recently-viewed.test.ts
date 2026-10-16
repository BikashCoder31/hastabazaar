import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { addProductEvidenceSchema } from './helpers/product-evidence-schema';

import type { RecentlyViewedPolicy } from '../lib/configuration/types';
import {
  clearRecentlyViewed,
  listRecentlyViewedProducts,
  recordRecentlyViewedProduct,
} from '../lib/db/repositories/recently-viewed';
import {
  normalizeGuestHistory,
  recordGuestProductView,
} from '../lib/recently-viewed/history';

class PreparedStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

class TestDatabase {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new PreparedStatement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly PreparedStatement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

const day = 86_400_000;
const policy: RecentlyViewedPolicy = { maxItems: 12, retentionDays: 90 };

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE categories (id TEXT PRIMARY KEY, name_en TEXT NOT NULL, is_active INTEGER NOT NULL);
    CREATE TABLE seller_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, trading_name TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE seller_participation_profiles (seller_id TEXT PRIMARY KEY, participation_route TEXT, application_stage TEXT, commercial_model TEXT, legal_seller_reference TEXT, invoice_issuer_reference TEXT, payout_beneficiary_reference TEXT, managed_agreement_version TEXT, managed_agreement_accepted_at INTEGER);
    CREATE TABLE seller_restrictions (seller_id TEXT, mode TEXT, suspended_until INTEGER);
    CREATE TABLE products (id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, category_id TEXT NOT NULL, slug TEXT NOT NULL, name_en TEXT NOT NULL, price_paisa INTEGER NOT NULL, compare_at_price_paisa INTEGER, inventory_quantity INTEGER NOT NULL, status TEXT NOT NULL);
    CREATE TABLE product_media (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, mime_type TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE product_deletions (product_id TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('owner','active'),('u1','active'),('u2','active');
    INSERT INTO categories VALUES ('cat','Pottery',1);
    INSERT INTO seller_profiles VALUES ('seller','owner','Clay Studio','approved');
    INSERT INTO seller_participation_profiles VALUES ('seller','registered_seller','active',NULL,NULL,NULL,NULL,NULL,NULL);
    INSERT INTO products VALUES
      ('p1','seller','cat','cup','Cup',100000,120000,4,'published'),
      ('p2','seller','cat','bowl','Bowl',80000,NULL,0,'published'),
      ('p3','seller','cat','draft','Draft',50000,NULL,3,'draft');
    INSERT INTO product_media VALUES ('m1','p1','image/jpeg',0),('m2','p2','image/jpeg',0),('m3','p3','image/jpeg',0);
  `);
  sqlite.exec((await readFile(new URL('../drizzle/0053_recently_viewed.sql', import.meta.url), 'utf8')).replaceAll('--> statement-breakpoint', ''));
  addProductEvidenceSchema(sqlite);
  return { sqlite, database: new TestDatabase(sqlite) as unknown as D1Database };
}

void test('guest history is recent-first, deduplicated, individually expired and bounded', () => {
  const now = 100 * day;
  let history = recordGuestProductView([], 'p1', now - 2 * day, policy);
  history = recordGuestProductView(history, 'p2', now - day, policy);
  history = recordGuestProductView(history, 'p1', now, policy);
  history.push({ productId: 'expired', lastViewedAt: now - 91 * day });
  assert.deepEqual(normalizeGuestHistory(history, now, policy), [
    { productId: 'p1', lastViewedAt: now },
    { productId: 'p2', lastViewedAt: now - day },
  ]);
});

void test('account history is owner-isolated, uses current catalogue truth and can be cleared', async () => {
  const { sqlite, database } = await fixture();
  try {
    const now = 200 * day;
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p1', now, policy });
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p2', now: now + 1, policy });
    await recordRecentlyViewedProduct(database, { userId: 'u2', productId: 'p1', now: now + 2, policy });
    sqlite.prepare("UPDATE products SET price_paisa=95000, inventory_quantity=0 WHERE id='p1'").run();
    const first = await listRecentlyViewedProducts(database, { userId: 'u1', now: now + 3, policy });
    assert.deepEqual(first.map((item) => [item.slug, item.pricePaisa, item.available]), [
      ['bowl', 80000, false],
      ['cup', 95000, false],
    ]);
    assert.equal((await listRecentlyViewedProducts(database, { userId: 'u2', now: now + 3, policy })).length, 1);
    await clearRecentlyViewed(database, 'u1');
    assert.equal((await listRecentlyViewedProducts(database, { userId: 'u1', now: now + 4, policy })).length, 0);
    assert.equal((await listRecentlyViewedProducts(database, { userId: 'u2', now: now + 4, policy })).length, 1);
  } finally { sqlite.close(); }
});

void test('expired, unpublished and deleted account entries never appear', async () => {
  const { sqlite, database } = await fixture();
  try {
    const now = 200 * day;
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p1', now: now - 91 * day, policy });
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p3', now, policy });
    sqlite.prepare("INSERT INTO product_deletions VALUES ('p1')").run();
    assert.deepEqual(await listRecentlyViewedProducts(database, { userId: 'u1', now, policy }), []);
  } finally { sqlite.close(); }
});

void test('a smaller configured limit applies prospectively without rewriting view timestamps', async () => {
  const { sqlite, database } = await fixture();
  try {
    const now = 200 * day;
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p1', now, policy });
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p2', now: now + 1, policy });
    await recordRecentlyViewedProduct(database, {
      userId: 'u1', productId: 'p1', now: now + 2,
      policy: { maxItems: 1, retentionDays: 90 },
    });
    const stored = (sqlite.prepare('SELECT product_id AS productId,last_viewed_at AS lastViewedAt FROM recently_viewed_products WHERE user_id=?').all('u1') as Array<{ productId: string; lastViewedAt: number }>).map((row) => ({ ...row }));
    assert.deepEqual(stored, [{ productId: 'p1', lastViewedAt: now + 2 }]);
  } finally { sqlite.close(); }
});
