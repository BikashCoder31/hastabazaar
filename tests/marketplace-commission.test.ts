import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';

import {
  getCommissionSetting,
  getMarketplaceCommissionBps,
  sellerCommissionSettingKey,
  setMarketplaceCommission,
} from '../lib/db/repositories/marketplace-settings';
import {
  CURRENT_SELLER_COMMISSION_BPS,
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

void test('commission lookup qualifies the MariaDB reserved key column', async () => {
  let preparedSql = '';
  const database = {
    prepare(sql: string) {
      preparedSql = sql;
      return {
        bind() {
          return this;
        },
        async first() {
          return { value: '900' };
        },
      };
    },
  } as unknown as D1Database;

  assert.equal(await getMarketplaceCommissionBps(database), 900);
  assert.match(preparedSql, /WHERE marketplace_settings\.key = \?/);
  assert.doesNotMatch(preparedSql, /WHERE key = \?/);
});

void test('9% commission fixtures use exact half-up minor-unit arithmetic', () => {
  assert.equal(CURRENT_SELLER_COMMISSION_BPS, 900);
  assert.equal(calculateSellerCommissionPaisa(100_000), 9_000);
  assert.equal(
    calculateSellerCommissionPaisa(
      calculateCommissionBasePaisa({
        productValuePaisa: 100_000,
        sellerFundedDiscountPaisa: 10_000,
      }),
    ),
    8_100,
  );
  assert.equal(
    calculateSellerCommissionPaisa(
      calculateCommissionBasePaisa({
        productValuePaisa: 100_000,
        platformFundedDiscountPaisa: 10_000,
      }),
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
      }),
    ),
    8_100,
  );
  assert.equal(
    calculateSellerCommissionPaisa(
      calculateCommissionBasePaisa({
        productValuePaisa: 100_000,
        taxPaisa: 8_000,
        deliveryPaisa: 15_000,
      }),
    ),
    9_000,
  );
  assert.equal(calculateSellerCommissionPaisa(101), 9);
  assert.equal(calculateSellerCommissionPaisa(50), 5);
  assert.equal(calculateSellerCommissionPaisa(0), 0);
  assert.throws(() => calculateSellerCommissionPaisa(-1), RangeError);
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
  assert.equal(calculateSellerCommissionPaisa(300), 27);
});

void test('versioned 9% setting ignores a stale 12% key and preserves historical snapshots', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT);
      CREATE TABLE marketplace_settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at INTEGER NOT NULL
      );
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
        subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT,
        request_id TEXT, ip_hash TEXT, created_at INTEGER
      );
      CREATE TABLE order_items (
        id TEXT PRIMARY KEY, unit_price_paisa INTEGER NOT NULL,
        commission_bps INTEGER NOT NULL, commission_paisa INTEGER NOT NULL
      );
      INSERT INTO users VALUES ('admin-1', 'Super Admin');
      INSERT INTO marketplace_settings VALUES ('seller_commission_bps', '1200', NULL, 1);
      INSERT INTO order_items VALUES ('historical-item', 150000, 1200, 18000);
    `);
    const database = new TestDatabase(sqlite) as unknown as D1Database;
    assert.equal((await getCommissionSetting(database)).basisPoints, 900);
    sqlite
      .prepare('INSERT INTO marketplace_settings VALUES (?, ?, NULL, 0)')
      .run(sellerCommissionSettingKey, '900');
    await setMarketplaceCommission(database, {
      basisPoints: 900,
      actorId: 'admin-1',
      requestId: 'commission-test-1',
      reason: 'Activate the current policy-bound rate.',
      now: 1_800_000_000_000,
    });
    await assert.rejects(
      setMarketplaceCommission(database, {
        basisPoints: 750,
        actorId: 'admin-1',
        requestId: 'commission-test-2',
        reason: 'Unsupported policy rate.',
        now: 1_800_000_000_001,
      }),
      RangeError,
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
