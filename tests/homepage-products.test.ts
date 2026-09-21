import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';

import {
  listActiveHomepagePromotions,
  listHomepageLatestProducts,
  listHomepageProductControls,
  listHomepagePromotedProducts,
  listHomepageTopProducts,
  setHomepageProductVisibility,
} from '../lib/db/repositories/products';

class HomepageStatement {
  private values: SQLInputValue[] = [];

  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values as SQLInputValue[];
    return this;
  }

  async all<T>() {
    return {
      results: this.database.prepare(this.sql).all(...this.values) as T[],
      success: true,
      meta: {},
    };
  }

  async first<T>() {
    return (
      (this.database.prepare(this.sql).get(...this.values) as T | undefined) ??
      null
    );
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class HomepageDatabase {
  constructor(private readonly database: DatabaseSync) {}

  prepare(sql: string) {
    return new HomepageStatement(this.database, sql);
  }

  async batch(statements: readonly HomepageStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

function homepageFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      display_name TEXT NOT NULL
    );
    CREATE TABLE user_roles (user_id TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE seller_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      trading_name TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE seller_participation_profiles (
      seller_id TEXT PRIMARY KEY,
      participation_route TEXT,
      application_stage TEXT,
      commercial_model TEXT,
      legal_seller_reference TEXT,
      invoice_issuer_reference TEXT,
      payout_beneficiary_reference TEXT,
      managed_agreement_version TEXT,
      managed_agreement_accepted_at INTEGER
    );
    CREATE TABLE seller_restrictions (
      seller_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      suspended_until INTEGER,
      obligation_mode TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      private_reason TEXT NOT NULL,
      version INTEGER NOT NULL,
      applied_by TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      is_active INTEGER NOT NULL
    );
    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      sku TEXT NOT NULL,
      name_en TEXT NOT NULL,
      price_paisa INTEGER NOT NULL,
      compare_at_price_paisa INTEGER,
      inventory_quantity INTEGER NOT NULL,
      status TEXT NOT NULL,
      published_at INTEGER
    );
    CREATE TABLE product_media (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE product_deletions (product_id TEXT PRIMARY KEY);
    CREATE TABLE homepage_product_controls (
      product_id TEXT PRIMARY KEY,
      is_hidden INTEGER NOT NULL,
      reason TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_by TEXT NOT NULL,
      last_request_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      reason TEXT,
      previous_json TEXT,
      next_json TEXT,
      request_id TEXT,
      ip_hash TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE promotions (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      status TEXT NOT NULL,
      placement TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE promotion_products (
      promotion_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      delivered_at INTEGER
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      quantity INTEGER NOT NULL,
      fulfillment_status TEXT NOT NULL
    );
  `);
  const insert = (sql: string, ...values: SQLInputValue[]) =>
    sqlite.prepare(sql).run(...values);
  const now = 2_000_000_000_000;

  insert(`INSERT INTO users VALUES ('owner','active','Seller owner')`);
  insert(
    `INSERT INTO users VALUES ('disabled-owner','disabled','Disabled seller')`,
  );
  insert(`INSERT INTO users VALUES ('super','active','Super Admin')`);
  insert(`INSERT INTO users VALUES ('admin','active','Admin')`);
  insert(`INSERT INTO user_roles VALUES ('super','super_admin')`);
  insert(`INSERT INTO user_roles VALUES ('admin','admin')`);
  insert(
    `INSERT INTO seller_profiles VALUES ('seller','owner','Real Maker','approved')`,
  );
  insert(
    `INSERT INTO seller_profiles VALUES ('disabled-seller','disabled-owner','Hidden Maker','approved')`,
  );
  insert(`INSERT INTO categories VALUES ('category','Home decor',1)`);

  for (const row of [
    [
      'newest',
      'seller',
      'newest-product',
      'Newest product',
      125000,
      150000,
      8,
      now - 100,
    ],
    [
      'promoted',
      'seller',
      'promoted-product',
      'Promoted product',
      98000,
      null,
      4,
      now - 200,
    ],
    [
      'popular',
      'seller',
      'popular-product',
      'Popular product',
      149900,
      null,
      7,
      now - 1000,
    ],
    [
      'sold-out',
      'seller',
      'sold-out',
      'Sold out product',
      50000,
      null,
      0,
      now - 50,
    ],
    [
      'hidden',
      'disabled-seller',
      'hidden-product',
      'Hidden product',
      70000,
      null,
      9,
      now - 25,
    ],
  ] as const) {
    insert(
      `INSERT INTO products VALUES (?,?,'category',?,? || '-sku',?,?,?,?,'published',?)`,
      row[0],
      row[1],
      row[2],
      row[2],
      row[3],
      row[4],
      row[5],
      row[6],
      row[7],
    );
    insert(
      `INSERT INTO product_media VALUES (?,?,'image/jpeg',0)`,
      `media-${row[0]}`,
      row[0],
    );
  }

  insert(
    `INSERT INTO promotions VALUES ('offer','Craft week','active','homepage',?,?,?)`,
    now - 1000,
    now + 1000,
    now - 500,
  );
  insert(
    `INSERT INTO promotions VALUES ('offer-two','More craft','active','homepage',?,?,?)`,
    now - 1000,
    now + 1000,
    now - 400,
  );
  insert(
    `INSERT INTO promotions VALUES ('ended','Old offer','active','homepage',?,?,?)`,
    now - 3000,
    now - 2000,
    now - 3000,
  );
  insert(`INSERT INTO promotion_products VALUES ('offer','promoted',0)`);
  insert(`INSERT INTO promotion_products VALUES ('offer','sold-out',1)`);
  insert(`INSERT INTO promotion_products VALUES ('offer-two','promoted',0)`);
  insert(`INSERT INTO promotion_products VALUES ('ended','popular',0)`);

  insert(`INSERT INTO orders VALUES ('delivered','delivered',?)`, now - 500);
  insert(`INSERT INTO orders VALUES ('returned','returned',?)`, now - 400);
  insert(
    `INSERT INTO order_items VALUES ('delivered-item','delivered','popular',5,'delivered')`,
  );
  insert(
    `INSERT INTO order_items VALUES ('returned-item','returned','newest',99,'delivered')`,
  );

  return {
    database: new HomepageDatabase(sqlite) as unknown as D1Database,
    sqlite,
    now,
  };
}

void test('homepage collections use only real eligible listings and truthful ranking inputs', async () => {
  const fixture = homepageFixture();
  try {
    const [latest, promoted, top, offers] = await Promise.all([
      listHomepageLatestProducts(fixture.database),
      listHomepagePromotedProducts(fixture.database, fixture.now),
      listHomepageTopProducts(fixture.database, { now: fixture.now }),
      listActiveHomepagePromotions(fixture.database, fixture.now),
    ]);

    assert.deepEqual(
      latest.map((product) => product.slug),
      ['newest-product', 'promoted-product', 'popular-product'],
    );
    assert.deepEqual(
      promoted.map((product) => product.slug),
      ['promoted-product'],
      'duplicate promotion assignments must not duplicate a product',
    );
    assert.deepEqual(
      top.map((product) => product.slug),
      ['popular-product'],
      'returned and non-delivered purchases must not affect popularity',
    );
    assert.deepEqual(
      offers.map((offer) => [offer.nameEn, offer.productCount]),
      [
        ['More craft', 1],
        ['Craft week', 1],
      ],
    );
    assert.equal(latest[0].tradingName, 'Real Maker');
    assert.equal(latest[0].label, 'New');
    assert.equal(promoted[0].label, 'Offer');
    assert.equal(top[0].label, 'Popular');
  } finally {
    fixture.sqlite.close();
  }
});

void test('homepage source has no hard-coded product fallback and retains honest empty states', async () => {
  const [page, fallback, footer] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../lib/catalog/featured-products.ts', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../components/layout/site-footer.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.doesNotMatch(page, /featuredProducts/);
  assert.doesNotMatch(
    fallback,
    /Handmade Macrame Crossbody Bag|Handwoven Straw Tote/,
  );
  const renderedCopy = page.replace(/\s+/g, ' ');
  for (const approvedCopy of [
    'NEW TO HASTABAZAAR',
    'New arrivals.',
    'Fresh finds are on the way.',
    'New handmade pieces will appear here as soon as they’re ready to shop.',
    'Explore craft categories',
    'Shop all new arrivals',
  ]) {
    assert.ok(
      renderedCopy.includes(approvedCopy),
      `missing approved copy: ${approvedCopy}`,
    );
  }
  assert.doesNotMatch(
    page,
    /Just added by our sellers|approved seller product/i,
  );
  assert.match(page, /successfully delivered, non-cancelled purchases/);
  assert.match(page, /ProductSlider/);
  assert.match(footer, /support@hastabazaar\.com/);
});

void test('Super Admin can hide and restore individual homepage products without unpublishing', async () => {
  const fixture = homepageFixture();
  try {
    await assert.rejects(
      () =>
        setHomepageProductVisibility(fixture.database, {
          productId: 'newest',
          actorId: 'admin',
          hidden: true,
          expectedVersion: 0,
          reason: 'Admin must not have this authority.',
          requestId: 'admin-denied-request',
          now: fixture.now,
        }),
      /Super Admin/,
    );

    const hidden = await setHomepageProductVisibility(fixture.database, {
      productId: 'newest',
      actorId: 'super',
      hidden: true,
      expectedVersion: 0,
      reason: 'Temporarily remove this item from homepage merchandising.',
      requestId: 'hide-newest-request',
      now: fixture.now,
    });
    assert.deepEqual(hidden, { hidden: true, version: 1 });
    assert.equal(
      fixture.sqlite
        .prepare(`SELECT status FROM products WHERE id='newest'`)
        .get()?.status,
      'published',
      'homepage control must not unpublish the product',
    );

    const retry = await setHomepageProductVisibility(fixture.database, {
      productId: 'newest',
      actorId: 'super',
      hidden: true,
      expectedVersion: 0,
      reason: 'Temporarily remove this item from homepage merchandising.',
      requestId: 'hide-newest-request',
      now: fixture.now,
    });
    assert.deepEqual(retry, { hidden: true, version: 1 });
    await assert.rejects(
      () =>
        setHomepageProductVisibility(fixture.database, {
          productId: 'newest',
          actorId: 'super',
          hidden: false,
          expectedVersion: 0,
          reason:
            'A stale screen must not overwrite the latest homepage decision.',
          requestId: 'stale-show-request',
          now: fixture.now + 1,
        }),
      /changed.*Refresh/i,
    );

    for (const [productId, requestId] of [
      ['promoted', 'hide-promoted-request'],
      ['popular', 'hide-popular-request'],
    ] as const) {
      await setHomepageProductVisibility(fixture.database, {
        productId,
        actorId: 'super',
        hidden: true,
        expectedVersion: 0,
        reason: 'Exclude this published item from every homepage collection.',
        requestId,
        now: fixture.now + 2,
      });
    }

    const [latest, promoted, top, offers, controls] = await Promise.all([
      listHomepageLatestProducts(fixture.database),
      listHomepagePromotedProducts(fixture.database, fixture.now),
      listHomepageTopProducts(fixture.database, { now: fixture.now }),
      listActiveHomepagePromotions(fixture.database, fixture.now),
      listHomepageProductControls(fixture.database, { visibility: 'hidden' }),
    ]);
    assert.deepEqual(latest, []);
    assert.deepEqual(promoted, []);
    assert.deepEqual(top, []);
    assert.deepEqual(offers, []);
    assert.deepEqual(controls.items.map((product) => product.id).sort(), [
      'newest',
      'popular',
      'promoted',
    ]);

    const shown = await setHomepageProductVisibility(fixture.database, {
      productId: 'newest',
      actorId: 'super',
      hidden: false,
      expectedVersion: 1,
      reason: 'Restore this item to automatic homepage eligibility.',
      requestId: 'show-newest-request',
      now: fixture.now + 3,
    });
    assert.deepEqual(shown, { hidden: false, version: 2 });
    assert.deepEqual(
      (await listHomepageLatestProducts(fixture.database)).map(
        (product) => product.slug,
      ),
      ['newest-product'],
    );
    assert.equal(
      fixture.sqlite.prepare('SELECT COUNT(*) AS total FROM audit_logs').get()
        ?.total,
      4,
      'idempotent retry and rejected writes must not duplicate audit history',
    );
  } finally {
    fixture.sqlite.close();
  }
});

void test('homepage control has ordered SQLite and MariaDB migrations', async () => {
  const [sqliteMigration, manifestSource] = await Promise.all([
    readFile(
      new URL('../drizzle/0040_homepage_product_controls.sql', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../deployment/babal/release-manifest.json', import.meta.url),
      'utf8',
    ),
  ]);
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE products (id TEXT PRIMARY KEY);
    `);
    sqlite.exec(sqliteMigration);
    sqlite.exec(sqliteMigration);
    assert.deepEqual(
      sqlite
        .prepare(`PRAGMA table_info(homepage_product_controls)`)
        .all()
        .map((column) => column.name),
      [
        'product_id',
        'is_hidden',
        'reason',
        'version',
        'updated_by',
        'last_request_id',
        'created_at',
        'updated_at',
      ],
    );
  } finally {
    sqlite.close();
  }
  const manifest = JSON.parse(manifestSource) as {
    migrations: readonly { path: string; usage: string }[];
    requiredTables: Record<string, readonly string[]>;
  };
  assert.deepEqual(
    manifest.migrations.find(
      (migration) =>
        migration.path ===
        'deployment/babal/mariadb-homepage-product-controls.sql',
    ),
    {
      path: 'deployment/babal/mariadb-homepage-product-controls.sql',
      sha256:
        'eb7fc0085a51965b4ee89e6767e588faf5105be9470fe80e57a525c9637835ba',
      usage: 'additive-maintenance',
    },
  );
  assert.deepEqual(manifest.requiredTables.homepage_product_controls, [
    'created_at',
    'is_hidden',
    'last_request_id',
    'product_id',
    'reason',
    'updated_at',
    'updated_by',
    'version',
  ]);
});
