import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {readyRegisteredSeller} from './helpers/ready-registered-seller';
import {createIncentiveDb} from './helpers/incentive-db';
import { readFile } from 'node:fs/promises';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import test from 'node:test';
import { companyDetails } from '../lib/content/company-details';

import {
  listActiveHomepagePromotions,
  listHomepageLatestProducts,
  listHomepageProductControls,
  listHomepagePromotedProducts,
  listHomepageTopProducts,
  listPublishedProducts,
  setHomepageProductVisibility,
} from '../lib/db/repositories/products';

async function homepageFixture() {
  const now=Date.now(),base=await completeVersionFixture(now-60_000),sqlite=base.sqlite;
  sqlite.exec("DELETE FROM seller_restrictions WHERE seller_id='registered';UPDATE seller_profiles SET trading_name='Real Maker' WHERE id='registered'");
  await readyRegisteredSeller(base,true);
  const insert = (sql: string, ...values: SQLInputValue[]) =>
    sqlite.prepare(sql).run(...values);

  insert(
    `INSERT INTO users(id,email,status,display_name,created_at,updated_at) VALUES ('disabled-owner','disabled-owner@local.hastabazaar.test','disabled','Disabled seller',1,1)`,
  );
  insert(`INSERT INTO users(id,email,status,display_name,created_at,updated_at) VALUES ('super','super@local.hastabazaar.test','active','Super Admin',1,1)`);
  insert(`INSERT INTO users(id,email,status,display_name,created_at,updated_at) VALUES ('admin','admin@local.hastabazaar.test','active','Admin',1,1)`);
  insert(`INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)`);
  insert(`INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('admin','admin',1)`);
  insert(
    `INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES ('disabled-seller','disabled-owner','Fictional Hidden','Hidden Maker','Fixture','FIX-HIDDEN','PAN','FIX-HIDDEN-PAN','Fictional Owner','9800000000','disabled-owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional location','approved',1,1)`,
  );
  insert(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('category','home-decor','Home decor',1,0,1,1)`);

  for (const row of [
    [
      'newest',
      'registered',
      'newest-product',
      'Newest product',
      125000,
      150000,
      8,
      now - 100,
    ],
    [
      'promoted',
      'registered',
      'promoted-product',
      'Promoted product',
      98000,
      null,
      4,
      now - 200,
    ],
    [
      'popular',
      'registered',
      'popular-product',
      'Popular product',
      149900,
      null,
      7,
      now - 1000,
    ],
    [
      'sold-out',
      'registered',
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
      `INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,price_paisa,compare_at_price_paisa,inventory_quantity,status,published_at,description_en,producer,materials,created_at,updated_at) VALUES (?,?,'category',?,? || '-sku',?,?,?,?,'published',?,'Fictional approved historical product','Fictional maker','Fictional material',1,1)`,
      row[0],
      row[1],
      row[2],
      row[2],
      row[3],
      row[4],
      row[5],
      row[6]+(row[0]==='newest'?99:row[0]==='popular'?5:0),
      row[7],
    );
    insert(
      `INSERT INTO product_media(id,product_id,mime_type,sort_order,object_key,original_name,size_bytes,alt_en,created_at) VALUES (?,?,'image/jpeg',0,?,'fixture.jpg',100,'Fictional product',1)`,
      `media-${row[0]}`,
      row[0],
      `private/homepage-${row[0]}.jpg`,
    );
  }

  insert(
    `INSERT INTO promotions(id,name_en,status,placement,starts_at,ends_at,created_at,name_ne,created_by,note,created_request_id,updated_at) VALUES ('offer','Craft week','active','homepage',?,?,?,'काल्पनिक','super','Explicit isolated historical placement','offer',1)`,
    now - 1000,
    now + 1000,
    now - 500,
  );
  insert(
    `INSERT INTO promotions(id,name_en,status,placement,starts_at,ends_at,created_at,name_ne,created_by,note,created_request_id,updated_at) VALUES ('offer-two','More craft','active','homepage',?,?,?,'काल्पनिक','super','Explicit isolated historical placement','offer-two',1)`,
    now - 1000,
    now + 1000,
    now - 400,
  );
  insert(
    `INSERT INTO promotions(id,name_en,status,placement,starts_at,ends_at,created_at,name_ne,created_by,note,created_request_id,updated_at) VALUES ('ended','Old offer','active','homepage',?,?,?,'काल्पनिक','super','Explicit isolated historical placement','ended',1)`,
    now - 3000,
    now - 2000,
    now - 3000,
  );
  insert(`INSERT INTO promotion_products(promotion_id,product_id,sort_order) VALUES ('offer','promoted',0)`);
  insert(`INSERT INTO promotion_products(promotion_id,product_id,sort_order) VALUES ('offer','sold-out',1)`);
  insert(`INSERT INTO promotion_products(promotion_id,product_id,sort_order) VALUES ('offer-two','promoted',0)`);
  insert(`INSERT INTO promotion_products(promotion_id,product_id,sort_order) VALUES ('ended','popular',0)`);

  insert(`INSERT INTO orders(id,status,created_at,order_number,customer_email,customer_phone,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,updated_at) VALUES ('delivered','delivered',?,'FIX-HOME-delivered','customer@local.hastabazaar.test','9800000000','en-NP','fictional-historical','{}',749500,0,749500,'cod','paid',1)`, now - 500);
  insert(`INSERT INTO orders(id,status,created_at,order_number,customer_email,customer_phone,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,updated_at) VALUES ('returned','returned',?,'FIX-HOME-returned','customer@local.hastabazaar.test','9800000000','en-NP','fictional-historical','{}',12375000,0,12375000,'cod','paid',1)`, now - 400);
  insert("UPDATE orders SET delivered_at=created_at WHERE id IN ('delivered','returned')");
  insert(
    `INSERT INTO order_items(id,order_id,product_id,quantity,fulfillment_status,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,commission_bps,commission_paisa,line_total_paisa,created_at) VALUES ('delivered-item','delivered','popular',5,'delivered','registered','Real Maker','Fictional historical product','FICTIONAL-popular',149900,900,67455,749500,1)`,
  );
  insert(
    `INSERT INTO order_items(id,order_id,product_id,quantity,fulfillment_status,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,commission_bps,commission_paisa,line_total_paisa,created_at) VALUES ('returned-item','returned','newest',99,'delivered','registered','Real Maker','Fictional historical product','FICTIONAL-newest',125000,900,1113750,12375000,1)`,
  );

  return {
    database: base.db,
    sqlite,
    now,
  };
}

void test('homepage collections use only real eligible listings and truthful ranking inputs', async () => {
  const fixture = await homepageFixture();
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
    assert.equal(latest[0].tradingName, 'Fictional Shop', 'The approved public name is authoritative over a private legacy name.');
    assert.equal(latest[0].label, 'New');
    assert.equal(promoted[0].label, 'Offer');
    assert.equal(top[0].label, 'Popular');
  } finally {
    fixture.sqlite.close();
  }
});

void test('homepage and shop queries stay within native D1 expression limits', async () => {
  const fixture = await createIncentiveDb();
  try {
    assert.deepEqual(await listHomepagePromotedProducts(fixture.db), []);
    assert.deepEqual(await listActiveHomepagePromotions(fixture.db), []);
    assert.deepEqual(await listHomepageLatestProducts(fixture.db), []);
    assert.deepEqual(await listHomepageTopProducts(fixture.db), []);
    assert.deepEqual(await listPublishedProducts(fixture.db, { sort: 'price-low' }), []);
  } finally {
    await fixture.dispose();
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
    'New products will appear here as soon as they’re ready to shop.',
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
  assert.match(page, /ProductSlider/);
  assert.equal(companyDetails.supportEmail, 'support@hastabazaar.com');
  assert.match(footer, /href=\{`mailto:\$\{companyDetails\.supportEmail\}`\}/);
  assert.match(footer, /\{companyDetails\.supportEmail\}/);
});

void test('new arrivals uses a wide capped desktop shell without changing the mobile card layout', async () => {
  const [page, slider, styles] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../components/catalog/product-slider.tsx', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /id="latest-products"[\s\S]*?homepage-product-shell/);
  assert.match(styles, /\.homepage-product-shell\s*\{[\s\S]*?max-width:\s*105rem/);
  assert.match(slider, /homepage-product-scroller/);
  assert.match(slider, /2xl:basis-\[calc\(20%-1\.2rem\)\]/);
  assert.match(slider, /basis-\[78%\]/);
  assert.match(styles, /\.homepage-product-scroller\s*\{[\s\S]*?scrollbar-width:\s*none/);
  assert.match(styles, /\.homepage-product-scroller::-webkit-scrollbar/);
});

void test('Super Admin can hide and restore individual homepage products without unpublishing', async () => {
  const fixture = await homepageFixture();
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
      fixture.sqlite.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action IN ('homepage.product.hidden','homepage.product.shown')").get()
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
