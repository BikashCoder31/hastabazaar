import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';
import test from 'node:test';
import { getSuperAdminMarketplaceSummary } from '../lib/db/repositories/admin-marketplace-summary';

const day = 86_400_000;
const now = 200 * day;
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
  async all<T>() {
    return { results: this.statement.all(...this.values) as T[] };
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL,display_name TEXT,status TEXT,created_at INTEGER,auth_subject TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT,PRIMARY KEY(user_id,role));
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT UNIQUE REFERENCES users(id),trading_name TEXT,status TEXT,created_at INTEGER NOT NULL);
    CREATE TABLE seller_participation_profiles(seller_id TEXT PRIMARY KEY,participation_route TEXT);
    CREATE TABLE orders(id TEXT PRIMARY KEY,customer_id TEXT REFERENCES users(id),customer_email TEXT NOT NULL,status TEXT,payment_status TEXT,delivered_at INTEGER);
    CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT REFERENCES orders(id),seller_id TEXT REFERENCES seller_profiles(id),fulfillment_status TEXT,line_total_paisa INTEGER,quantity INTEGER);
    CREATE TABLE return_requests(id TEXT PRIMARY KEY,order_item_id TEXT);
    CREATE TABLE refunds(id TEXT PRIMARY KEY,return_request_id TEXT,amount_paisa INTEGER,status TEXT);
    CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT,seller_id TEXT,direction TEXT,status TEXT,UNIQUE(order_id,seller_id,direction));
    CREATE TABLE shipping_parcels(shipping_job_id TEXT PRIMARY KEY,delivered_at INTEGER);
    CREATE TABLE order_item_status_events(id TEXT PRIMARY KEY,order_item_id TEXT,to_status TEXT,created_at INTEGER);
  `);
  sqlite.exec(
    await readFile(
      new URL('../drizzle/0044_business_configuration.sql', import.meta.url),
      'utf8',
    ),
  );
  const database = {
    prepare(sql: string) {
      return new PreparedStatement(sqlite.prepare(sql));
    },
  } as unknown as D1Database;
  const user = (
    id: string,
    status = 'active',
    createdAt = now,
    email = `${id}@public.invalid`,
  ) =>
    sqlite
      .prepare('INSERT INTO users VALUES (?,?,?,?,?,NULL)')
      .run(id, email, id, status, createdAt);
  const seller = (
    id: string,
    owner: string,
    status = 'approved',
    createdAt = now,
  ) =>
    sqlite
      .prepare('INSERT INTO seller_profiles VALUES (?,?,?,?,?)')
      .run(id, owner, `Shop ${id}`, status, createdAt);
  const order = (
    id: string,
    buyer: string | null,
    status = 'confirmed',
    payment = 'paid',
    email = buyer
      ? String(
          sqlite.prepare('SELECT email FROM users WHERE id=?').get(buyer)
            ?.email,
        )
      : 'guest@public.invalid',
  ) =>
    sqlite
      .prepare(
        'INSERT INTO orders(id,customer_id,customer_email,status,payment_status) VALUES (?,?,?,?,?)',
      )
      .run(id, buyer, email, status, payment);
  const item = (
    id: string,
    orderId: string,
    sellerId: string,
    amount: number,
    quantity = 1,
    status = 'delivered',
  ) =>
    sqlite
      .prepare('INSERT INTO order_items VALUES (?,?,?,?,?,?)')
      .run(id, orderId, sellerId, status, amount, quantity);
  return { sqlite, database, user, seller, order, item };
}

void test('empty marketplace returns zero totals without writing any data', async () => {
  const { sqlite, database } = await fixture();
  try {
    sqlite.exec('PRAGMA query_only=ON');
    const summary = await getSuperAdminMarketplaceSummary(
      database,
      'super_admin',
      now,
    );
    assert.deepEqual(
      {
        ...summary,
        users: { ...summary?.users },
        sellers: { ...summary?.sellers },
      },
      {
        users: { total: 0 },
        sellers: { total: 0, approved: 0, pendingReview: 0 },
        topSellers: [],
      },
    );
  } finally {
    sqlite.close();
  }
});

void test('counts accounts once across roles, excludes deleted/test accounts, and bounds recent registrations', async () => {
  const f = await fixture();
  try {
    f.user('buyer');
    f.user('dual', 'active', 170 * day);
    f.user('blocked', 'disabled', 199 * day);
    f.user('staff', 'active', 100 * day);
    f.user('application', 'active', 195 * day);
    f.user('other', 'active', 100 * day);
    f.user('future', 'active', 201 * day);
    f.user('deleted', 'deleted');
    f.user('local', 'active', now, 'local@local.hastabazaar.test');
    f.user('fictional', 'active', now, 'fictional@EXAMPLE.TEST');
    f.sqlite.exec(
      `INSERT INTO user_roles VALUES ('dual','customer'),('dual','seller'),('staff','super_admin'),('buyer','customer');`,
    );
    f.seller('s-dual', 'dual');
    f.seller('s-application', 'application', 'draft');
    f.seller('s-blocked', 'blocked', 'submitted');
    f.seller('s-staff', 'staff', 'under_review');
    f.seller('s-other', 'other', 'suspended');
    f.seller('s-deleted', 'deleted');
    f.seller('s-local', 'local');
    f.seller('s-fictional', 'fictional');
    f.sqlite.exec(
      "INSERT INTO seller_participation_profiles VALUES ('s-dual','registered_seller'),('s-other','managed_maker'); PRAGMA query_only=ON",
    );
    const summary = await getSuperAdminMarketplaceSummary(
      f.database,
      'super_admin',
      now,
    );
    assert.deepEqual({ ...summary?.users }, { total: 7 });
    assert.deepEqual(
      { ...summary?.sellers },
      { total: 5, approved: 1, pendingReview: 2 },
    );
  } finally {
    f.sqlite.close();
  }
});

void test('ranks each delivered seller line once, including unpaid delivery, before refunds', async () => {
  const f = await fixture();
  try {
    for (const id of ['buyer', 'a', 'b', 'zero']) f.user(id);
    f.user('local', 'active', now, 'fixture@local.hastabazaar.test');
    f.user('deleted', 'deleted');
    for (const id of ['a', 'b', 'zero', 'local', 'deleted'])
      f.seller(`s-${id}`, id);
    f.order('shared', 'buyer');
    f.order('cod', 'buyer', 'confirmed', 'pending');
    f.order('other', 'buyer', 'delivered', 'refunded');
    f.order('test-buyer', 'local');
    f.item('a1', 'shared', 's-a', 70000, 2);
    f.item('a2', 'shared', 's-a', 30000);
    f.item('b1', 'shared', 's-b', 60000);
    f.item('a3', 'cod', 's-a', 20000, 2);
    f.item('b2', 'other', 's-b', 50000);
    f.item('packing', 'shared', 's-a', 900000, 1, 'packing');
    f.item('cancelled', 'shared', 's-a', 900000, 1, 'cancelled');
    f.item('test-sale', 'shared', 's-local', 900000);
    f.item('test-buyer-sale', 'test-buyer', 's-a', 900000);
    f.item('deleted-sale', 'shared', 's-deleted', 900000);
    f.item('free', 'shared', 's-zero', 0);
    f.sqlite.exec(`INSERT INTO return_requests VALUES ('r1','a1'),('r2','a1');
      INSERT INTO refunds VALUES ('f1','r1',10000,'paid'),('f2','r2',10000,'pending'); PRAGMA query_only=ON;`);
    const summary = await getSuperAdminMarketplaceSummary(
      f.database,
      'super_admin',
      now,
    );
    assert.deepEqual(
      summary?.topSellers.map((row) => ({ ...row })),
      [
        {
          sellerId: 's-a',
          sellerName: 'Shop s-a',
          salesPaisa: 120000,
          orderCount: 2,
          unitsDelivered: 5,
        },
        {
          sellerId: 's-b',
          sellerName: 'Shop s-b',
          salesPaisa: 110000,
          orderCount: 2,
          unitsDelivered: 2,
        },
      ],
    );
  } finally {
    f.sqlite.close();
  }
});

void test('top sellers are limited to five with stable ordering for ties', async () => {
  const f = await fixture();
  try {
    f.user('buyer');
    f.order('order', 'buyer');
    for (const id of ['g', 'f', 'e', 'd', 'c', 'b', 'a']) {
      f.user(id);
      f.seller(id, id);
      f.item(`item-${id}`, 'order', id, 10000);
    }
    f.sqlite.exec('PRAGMA query_only=ON');
    const summary = await getSuperAdminMarketplaceSummary(
      f.database,
      'super_admin',
      now,
    );
    assert.deepEqual(
      summary?.topSellers.map((row) => row.sellerId),
      ['a', 'b', 'c', 'd', 'e'],
    );
  } finally {
    f.sqlite.close();
  }
});

void test('guest and unlinked historical deliveries count while test checkout emails do not', async () => {
  const f = await fixture();
  try {
    f.user('owner');
    f.user('buyer');
    f.seller('shop', 'owner');
    f.order('guest', null);
    f.item('guest-item', 'guest', 'shop', 25000, 2);
    f.order('unlinked', 'buyer');
    f.item('unlinked-item', 'unlinked', 'shop', 15000);
    f.order('test-guest', null, 'delivered', 'paid', 'fixture@EXAMPLE.TEST');
    f.item('test-guest-item', 'test-guest', 'shop', 900000);
    f.order(
      'test-snapshot',
      'buyer',
      'delivered',
      'paid',
      'fixture@local.hastabazaar.test',
    );
    f.item('test-snapshot-item', 'test-snapshot', 'shop', 900000);
    f.sqlite.exec(
      "UPDATE orders SET customer_id=NULL WHERE id='unlinked'; PRAGMA query_only=ON",
    );
    const summary = await getSuperAdminMarketplaceSummary(
      f.database,
      'super_admin',
      now,
    );
    assert.deepEqual(
      summary?.topSellers.map((row) => ({ ...row })),
      [
        {
          sellerId: 'shop',
          sellerName: 'Shop shop',
          salesPaisa: 40000,
          orderCount: 2,
          unitsDelivered: 3,
        },
      ],
    );
  } finally {
    f.sqlite.close();
  }
});

void test('uses effective test-domain policy even when traffic collection is disabled', async () => {
  const f = await fixture();
  try {
    f.user('owner');
    f.user('test', 'active', now, 'fixture@demo.invalid');
    f.seller('test-shop', 'test');
    f.sqlite
      .prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES ('policy','first_party_analytics_policy',1,?,'published','simple',1,'Exclude test accounts','owner',1,'policy-1')`)
      .run(
        JSON.stringify({
          enabled: false,
          retentionDays: 90,
          excludedEmailDomains: ['demo.invalid'],
          excludedPathPrefixes: [],
        }),
      );
    f.sqlite.exec('PRAGMA query_only=ON');
    const summary = await getSuperAdminMarketplaceSummary(
      f.database,
      'super_admin',
      now,
    );
    assert.equal(summary?.users.total, 1);
    assert.equal(summary?.sellers.total, 0);
  } finally {
    f.sqlite.close();
  }
});

void test('non-Super Admin roles cannot read even the settings or summary queries', async () => {
  const database = {
    prepare() {
      assert.fail('Unauthorized database read');
    },
  } as unknown as D1Database;
  for (const role of ['admin', 'customer', 'seller', ''])
    assert.equal(
      await getSuperAdminMarketplaceSummary(database, role as 'admin', now),
      null,
    );
});

void test('invalid observation times are rejected before database reads', async () => {
  const database = {
    prepare() {
      assert.fail('Invalid timestamp reached database');
    },
  } as unknown as D1Database;
  for (const value of [-1, NaN, Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(
      () => getSuperAdminMarketplaceSummary(database, 'super_admin', value),
      /timestamp/i,
    );
});

const observedAt = Date.parse('2026-10-15T06:00:00Z');
const todayStart = Date.parse('2026-10-14T18:15:00Z');
const sevenStart = Date.parse('2026-10-08T18:15:00Z');
const thirtyStart = Date.parse('2026-09-15T18:15:00Z');

void test('all four periods filter signup cohorts by Nepal calendar days and current seller status', async () => {
  const f = await fixture();
  try {
    const dates = [
      thirtyStart - 1,
      thirtyStart,
      sevenStart - 1,
      sevenStart,
      todayStart - 1,
      todayStart,
      observedAt,
      observedAt + 1,
    ];
    for (const [index, date] of dates.entries()) {
      f.user(`person-${index}`, 'active', date);
      f.seller(
        `shop-${index}`,
        `person-${index}`,
        index % 2 ? 'submitted' : 'approved',
        date,
      );
    }
    // An older account can join as a seller today; use profile creation for seller counts.
    f.user('old-account', 'active', thirtyStart - 1);
    f.seller('new-seller', 'old-account', 'under_review', todayStart);
    f.sqlite.exec('PRAGMA query_only=ON');
    for (const [period, users, sellers, approved, pending] of [
      ['today', 2, 3, 1, 2],
      ['7d', 4, 5, 2, 3],
      ['30d', 6, 7, 3, 4],
      ['all', 9, 9, 4, 5],
    ] as const) {
      const summary = await getSuperAdminMarketplaceSummary(
        f.database,
        'super_admin',
        observedAt,
        period,
      );
      assert.equal(summary?.users.total, users, `${period}: users`);
      assert.deepEqual(
        { ...summary?.sellers },
        { total: sellers, approved, pendingReview: pending },
        period,
      );
    }
  } finally {
    f.sqlite.close();
  }
});

void test('all four seller rankings use actual delivery dates, retaining unknown dates only for All time', async () => {
  const f = await fixture();
  try {
    f.user('owner');
    f.seller('shop', 'owner');
    for (const [index, date] of [
      thirtyStart - 1,
      thirtyStart,
      sevenStart - 1,
      sevenStart,
      todayStart - 1,
      todayStart,
      observedAt,
      observedAt + 1,
      null,
    ].entries()) {
      f.order(`order-${index}`, null);
      f.item(`line-${index}`, `order-${index}`, 'shop', 100);
      f.sqlite
        .prepare('UPDATE orders SET delivered_at=? WHERE id=?')
        .run(date, `order-${index}`);
    }
    f.sqlite.exec('PRAGMA query_only=ON');
    for (const [period, amount, orders] of [
      ['today', 200, 2],
      ['7d', 400, 4],
      ['30d', 600, 6],
      ['all', 900, 9],
    ] as const) {
      const summary = await getSuperAdminMarketplaceSummary(
        f.database,
        'super_admin',
        observedAt,
        period,
      );
      assert.deepEqual(
        summary?.topSellers.map((row) => ({ ...row })),
        [
          {
            sellerId: 'shop',
            sellerName: 'Shop shop',
            salesPaisa: amount,
            orderCount: orders,
            unitsDelivered: orders,
          },
        ],
        period,
      );
    }
  } finally {
    f.sqlite.close();
  }
});

void test('seller parcels take precedence over event and order dates without multiplying shared-order sales', async () => {
  const f = await fixture();
  try {
    for (const name of ['a', 'b', 'c', 'd']) {
      f.user(name);
      f.seller(name, name);
    }
    f.order('shared', null);
    f.sqlite.prepare('UPDATE orders SET delivered_at=?').run(todayStart);
    f.item('a-line', 'shared', 'a', 90000, 3);
    f.item('b-line', 'shared', 'b', 12000, 2);
    f.item('c-line', 'shared', 'c', 8000);
    f.item('d-line', 'shared', 'd', 6000);
    f.sqlite.exec(
      `INSERT INTO shipping_jobs VALUES ('a-out','shared','a','outbound','claim_open'),('b-out','shared','b','outbound','delivered'),('a-return','shared','a','return','delivered');`,
    );
    const parcel = f.sqlite.prepare(
      'INSERT INTO shipping_parcels VALUES (?,?)',
    );
    parcel.run('a-out', todayStart - 1);
    parcel.run('b-out', todayStart);
    parcel.run('a-return', todayStart);
    const event = f.sqlite.prepare(
      'INSERT INTO order_item_status_events VALUES (?,?,?,?)',
    );
    event.run('a-event', 'a-line', 'delivered', todayStart);
    event.run('b-event', 'b-line', 'delivered', todayStart - 1);
    event.run('c-event-old', 'c-line', 'delivered', todayStart - 2);
    event.run('c-event', 'c-line', 'delivered', todayStart + 1);
    event.run('d-event', 'd-line', 'dispatched', todayStart - 1);
    f.sqlite.exec('PRAGMA query_only=ON');
    const summary = await getSuperAdminMarketplaceSummary(
      f.database,
      'super_admin',
      observedAt,
      'today',
    );
    assert.deepEqual(
      summary?.topSellers.map((row) => ({ ...row })),
      [
        {
          sellerId: 'b',
          sellerName: 'Shop b',
          salesPaisa: 12000,
          orderCount: 1,
          unitsDelivered: 2,
        },
        {
        sellerId: 'c',
        sellerName: 'Shop c',
        salesPaisa: 8000,
        orderCount: 1,
        unitsDelivered: 1,
      },
      {
          sellerId: 'd',
          sellerName: 'Shop d',
          salesPaisa: 6000,
          orderCount: 1,
          unitsDelivered: 1,
        },
      ],
    );
  } finally {
    f.sqlite.close();
  }
});

void test('date filtering happens before choosing the top five sellers', async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 7; index++) {
      const id = String(index);
      f.user(id);
      f.seller(id, id);
      f.order(id, null);
      f.item(id, id, id, index === 6 ? 100 : 100000);
      f.sqlite
        .prepare('UPDATE orders SET delivered_at=? WHERE id=?')
        .run(index === 6 ? todayStart : todayStart - 1, id);
    }
    f.sqlite.exec('PRAGMA query_only=ON');
    const summary = await getSuperAdminMarketplaceSummary(
      f.database,
      'super_admin',
      observedAt,
      'today',
    );
    assert.deepEqual(
      summary?.topSellers.map((row) => row.sellerId),
      ['6'],
    );
  } finally {
    f.sqlite.close();
  }
});
