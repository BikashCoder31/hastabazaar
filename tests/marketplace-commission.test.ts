import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';

import {
  getCommissionSetting,
  sellerAcceptedCommissionVersion,
  setMarketplaceCommission,
} from '../lib/db/repositories/marketplace-settings';
import {
  allocatePlatformDiscountPaisa,
  calculateCommissionBasePaisa,
  calculateCumulativeCommissionReversalPaisa,
  calculateSellerCommissionPaisa,
  isCommissionEarned,
} from '../lib/marketplace/policy';

class PreparedStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

class TestDatabase {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new PreparedStatement(this.sqlite.prepare(sql));
  }
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

void test('commission lookup uses the centralized versioned Business Settings source', async () => {
  const source = await readFile('lib/db/repositories/marketplace-settings.ts', 'utf8');
  assert.match(source, /getEffectiveBusinessSetting\(database,'independent_seller_commission_bps'/);
  assert.doesNotMatch(source, /FROM marketplace_settings/);
});

void test('9% commission fixtures use exact half-up minor-unit arithmetic', () => {
  assert.equal(calculateSellerCommissionPaisa(100_000, 900), 9_000);
  assert.equal(
    calculateSellerCommissionPaisa(
      calculateCommissionBasePaisa({
        productValuePaisa: 100_000,
        sellerFundedDiscountPaisa: 10_000,
      }), 900,
    ),
    8_100,
  );
  assert.equal(
    calculateSellerCommissionPaisa(
      calculateCommissionBasePaisa({
        productValuePaisa: 100_000,
        platformFundedDiscountPaisa: 10_000,
      }), 900,
    ),
    9_000,
  );
  assert.equal(
    calculateSellerCommissionPaisa(
      calculateCommissionBasePaisa({
        productValuePaisa: 100_000,
        sellerFundedDiscountPaisa: 10_000,
        platformFundedDiscountPaisa: 5_000,
        taxPaisa: 8_000,
        deliveryPaisa: 15_000,
      }), 900,
    ),
    8_100,
  );
  assert.equal(
    calculateSellerCommissionPaisa(
      calculateCommissionBasePaisa({
        productValuePaisa: 100_000,
        taxPaisa: 8_000,
        deliveryPaisa: 15_000,
      }), 900,
    ),
    9_000,
  );
  assert.equal(calculateSellerCommissionPaisa(101, 900), 9);
  assert.equal(calculateSellerCommissionPaisa(50, 900), 5);
  assert.equal(calculateSellerCommissionPaisa(0, 900), 0);
  assert.throws(() => calculateSellerCommissionPaisa(-1, 900), RangeError);
  assert.throws(
    () =>
      calculateCommissionBasePaisa({
        productValuePaisa: 100,
        sellerFundedDiscountPaisa: 101,
      }),
    RangeError,
  );
});

void test('commission becomes earned only for completed, paid sales', () => {
  assert.equal(isCommissionEarned({ orderCompleted: true, paymentReceived: true }), true);
  assert.equal(isCommissionEarned({ orderCompleted: false, paymentReceived: true }), false);
  assert.equal(isCommissionEarned({ orderCompleted: true, paymentReceived: false }), false);
  assert.equal(
    isCommissionEarned({ orderCompleted: true, paymentReceived: true, cancelled: true }),
    false,
  );
});

void test('cumulative reversal preserves historical fees and eliminates split-refund drift', () => {
  assert.equal(
    calculateCumulativeCommissionReversalPaisa({
      originalBasePaisa: 100_000,
      originalCommissionPaisa: 9_000,
      cumulativeRefundedBasePaisa: 25_000,
      alreadyReversedCommissionPaisa: 0,
    }),
    2_250,
  );
  assert.equal(
    calculateCumulativeCommissionReversalPaisa({
      originalBasePaisa: 50,
      originalCommissionPaisa: 5,
      cumulativeRefundedBasePaisa: 25,
      alreadyReversedCommissionPaisa: 0,
    }),
    3,
  );
  assert.equal(
    calculateCumulativeCommissionReversalPaisa({
      originalBasePaisa: 50,
      originalCommissionPaisa: 5,
      cumulativeRefundedBasePaisa: 50,
      alreadyReversedCommissionPaisa: 3,
    }),
    2,
  );
  assert.equal(
    calculateCumulativeCommissionReversalPaisa({
      originalBasePaisa: 100_000,
      originalCommissionPaisa: 12_000,
      cumulativeRefundedBasePaisa: 25_000,
      alreadyReversedCommissionPaisa: 0,
    }),
    3_000,
  );
  assert.equal(
    calculateCumulativeCommissionReversalPaisa({
      originalBasePaisa: 0,
      originalCommissionPaisa: 0,
      cumulativeRefundedBasePaisa: 0,
      alreadyReversedCommissionPaisa: 0,
    }),
    0,
  );
});

void test('platform discounts allocate deterministically across mixed sellers without reducing commission base', () => {
  const lines = [
    { key: 'seller-b:item-2', productValuePaisa: 100 },
    { key: 'seller-a:item-1', productValuePaisa: 100 },
    { key: 'seller-a:item-3', productValuePaisa: 100 },
  ];
  const first = allocatePlatformDiscountPaisa(lines, 100);
  const second = allocatePlatformDiscountPaisa([...lines].reverse(), 100);
  assert.deepEqual([...first], [...second]);
  assert.equal([...first.values()].reduce((sum, value) => sum + value, 0), 100);
  assert.equal(calculateSellerCommissionPaisa(300, 900), 27);
});

void test('versioned commission preserves historical snapshots and requires acceptance of a new version', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT, status TEXT DEFAULT 'active');
      CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT,status TEXT,seller_agreement_version TEXT);
      CREATE TABLE commission_continuity_sellers(seller_id TEXT,setting_id TEXT);
      CREATE TABLE business_setting_versions (id TEXT PRIMARY KEY,setting_key TEXT,version INTEGER,value_json TEXT,status TEXT,revision INTEGER,change_control TEXT,effective_from INTEGER,effective_until INTEGER,reason TEXT,created_by TEXT,created_at INTEGER,submitted_by TEXT,submitted_at INTEGER,approved_by TEXT,approved_at INTEGER,published_by TEXT,published_at INTEGER,decision_note TEXT,supersedes_id TEXT,last_request_id TEXT);
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
        subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT,
        request_id TEXT, ip_hash TEXT, created_at INTEGER
      );
      CREATE TABLE order_items (
        id TEXT PRIMARY KEY, unit_price_paisa INTEGER NOT NULL,
        commission_bps INTEGER NOT NULL, commission_paisa INTEGER NOT NULL
      );
      CREATE TABLE seller_agreement_acceptance_history (
        id TEXT PRIMARY KEY, seller_id TEXT, agreement_version TEXT,
        language_presented TEXT, commission_setting_version_id TEXT,
        commission_bps INTEGER, acceptance_request_id TEXT,
        accepted_by TEXT, accepted_at INTEGER, simulation_label TEXT
      );
      INSERT INTO users(id,display_name) VALUES ('admin-1', 'Super Admin'),('seller-user-1','Fictional seller');
      INSERT INTO business_setting_versions VALUES ('commission-v1','independent_seller_commission_bps',1,'900','published',3,'controlled',1,NULL,'Approved test rate','admin-1',1,'admin-1',1,'admin-1',1,'admin-1',1,'Approved',NULL,'commission-v1-request');
      INSERT INTO order_items VALUES ('historical-item', 150000, 1200, 18000);
    `);
    const database = new TestDatabase(sqlite) as unknown as D1Database;
    assert.equal((await getCommissionSetting(database)).basisPoints, 900);
    sqlite.prepare("INSERT INTO seller_profiles VALUES('seller-1','seller-user-1','approved',?)").run(SELLER_AGREEMENT_VERSION);
    const setting=await getCommissionSetting(database);
    assert.equal(await sellerAcceptedCommissionVersion(database, 'seller-1', setting), false);
    sqlite.prepare(`INSERT INTO seller_agreement_acceptance_history VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run(
      'acceptance-1', 'seller-1', SELLER_AGREEMENT_VERSION, 'ne',
      'commission-v1', 900, 'acceptance-request-1', 'seller-user-1', 2,
    );
    assert.equal(await sellerAcceptedCommissionVersion(database, 'seller-1', setting), true);
    await assert.rejects(
      setMarketplaceCommission(database, {
        basisPoints: 900,
        actorId: 'admin-1',
        requestId: 'commission-test-2',
        reason: 'Unsupported policy rate.',
        now: 1_800_000_000_001,
      }),
      /controlled Business Settings/i,
    );
    const historical = sqlite
      .prepare('SELECT commission_bps, commission_paisa FROM order_items WHERE id = ?')
      .get('historical-item') as { commission_bps: number; commission_paisa: number };
    assert.equal(historical.commission_bps, 1_200);
    assert.equal(historical.commission_paisa, 18_000);
  } finally {
    sqlite.close();
  }
});
