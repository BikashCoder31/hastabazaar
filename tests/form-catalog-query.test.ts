import assert from 'node:assert/strict';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { resolve } from 'node:path';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { countPublishedProducts, listPublishedProducts } from '../lib/db/repositories/products';
import { loadShopQueryConfig, parseShopQueryCriteria } from '../lib/catalog/shop-query';
import type { PublishedFormConfig } from '../lib/forms/types';
import { collectFormSites } from './helpers/form-policy';
import { findOrderTracking } from '../lib/db/repositories/order-tracking';
import { isLocalTestRequest } from '../lib/auth/local-test-access';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/link') return { url: 'data:text/javascript,export default function Link(props){return props.children}', shortCircuit: true };
  return nextResolve(specifier, context);
} });

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
}

const priceConfig: PublishedFormConfig = {
  formId: 'catalog.filters', version: 2, publishedAt: 1,
  fields: [{ id: 'minimum_price_npr', key: 'minimum_price_npr', type: 'number', label: 'Minimum price',
    required: false, order: 0, status: 'active', min: 0, max: 1_000_000_000 }],
};

void test('the eight query and system source sites expose their stable form IDs', async () => {
  const sites = await collectFormSites(resolve(import.meta.dirname, '..'));
  const expected = {
    'components/layout/site-header.tsx': 'catalog.header-search',
    'components/catalog/catalog-filters.tsx': 'catalog.filters',
    'components/commerce/order-tracker.tsx': 'commerce.order-tracking',
    'app/seller/products/page.tsx': 'seller.product-filter',
    'app/admin/homepage/page.tsx': 'staff.homepage-filter',
    'app/admin/activity/page.tsx': 'staff.activity-filter',
    'components/admin/recorded-progress.tsx': 'staff.recorded-progress-filter',
    'app/local-testing/page.tsx': 'system.local-testing-role',
  };
  for (const [path, id] of Object.entries(expected)) {
    const matches = sites.filter((site) => site.path === path);
    assert.equal(matches.length, 1, path);
    assert.equal(matches[0].formId, id, path);
  }
});

void test('published shop price criterion converts exact NPR decimals to paisa', () => {
  assert.deepEqual(parseShopQueryCriteria(priceConfig, { 'custom.minimum_price_npr': '250.75' }),
    { minimumPricePaisa: 25075, minimumPriceNpr: '250.75' });
  assert.deepEqual(parseShopQueryCriteria(priceConfig, { 'custom.minimum_price_npr': '0' }),
    { minimumPricePaisa: 0, minimumPriceNpr: '0' });
});

void test('shop without a published filter config keeps built-in browsing available but rejects custom criteria', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE form_config_versions(form_id TEXT,status TEXT,version INTEGER,
      config_json TEXT,published_at INTEGER);`);
    const db = { prepare(sql: string) { return new Statement(sqlite.prepare(sql)); } } as unknown as D1Database;
    const config = await loadShopQueryConfig(db);
    assert.deepEqual(config.fields, []);
    assert.throws(() => parseShopQueryCriteria(config,
      { 'custom.minimum_price_npr': '10' }), /unsupported.*criterion/i);
    sqlite.exec(`DROP TABLE form_config_versions;`);
    await assert.rejects(() => loadShopQueryConfig(db));
  } finally { sqlite.close(); }
});

void test('shop price criterion rejects invalid bounds, duplicates and unsupported custom keys', () => {
  for (const value of ['-1', '1.001', '1e3', '1000000000.01', 'NaN', 'Infinity']) {
    assert.throws(() => parseShopQueryCriteria(priceConfig, { 'custom.minimum_price_npr': value }),
      /minimum price/i, value);
  }
  assert.throws(() => parseShopQueryCriteria(priceConfig,
    { 'custom.minimum_price_npr': ['1', '2'] }), /minimum price/i);
  assert.throws(() => parseShopQueryCriteria(priceConfig,
    { 'custom.colour': 'red' }), /unsupported.*criterion/i);
  assert.throws(() => parseShopQueryCriteria({ ...priceConfig, fields: [] },
    { 'custom.minimum_price_npr': '250' }), /unsupported.*criterion/i);
  assert.deepEqual(parseShopQueryCriteria(priceConfig, { 'custom.minimum_price_npr': '' }), {});
  assert.throws(() => parseShopQueryCriteria({ ...priceConfig, fields: [...priceConfig.fields,
    { id: 'colour', key: 'colour', type: 'short_text', label: 'Colour', required: false, order: 1, status: 'active' }] },
    {}), /unsupported.*criterion/i);
});

void test('minimum price changes both published product results and count', async () => {
  const { sqlite, db, dispose } = await incentiveReportDatabase();
  try {
    // Retained legacy public rows have no workspace offer mapping. Browsing their
    // recorded prices must not imply current commercial readiness or order access.
    assert.ok(sqlite.prepare('PRAGMA database_list').all().every((row) => row.file === ''));
    sqlite.exec(`
      INSERT INTO users(id,email,display_name,status,created_at,updated_at)
        VALUES ('owner','owner@local.hastabazaar.test','Fictional owner','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('owner','seller',1);
      INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
        registration_number,tax_mode,tax_registration_number,representative_name,support_phone,
        support_email,province,district,municipality,locality,status,created_at,updated_at)
        VALUES ('seller','owner','Fictional Maker','Maker','Local','FIX-CATALOG','PAN','FIX-PAN',
          'Fictional owner','9800000000','owner@local.hastabazaar.test','Bagmati','Kathmandu',
          'Kathmandu','Fictional workshop','approved',1,1);
      INSERT INTO categories(id,slug,is_active,name_en,created_at,updated_at)
        VALUES ('category','gifts',1,'Gifts',1,1);
    `);
    for (const [id, name, price] of [['low', 'Low', 25074], ['equal', 'Equal', 25075], ['high', 'High', 31000]] as const) {
      sqlite.prepare(`INSERT INTO products(id,slug,sku,name_en,description_en,price_paisa,
        seller_id,category_id,producer,materials,inventory_quantity,status,published_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'seller','category','Fictional maker','Clay',1,'published',1,1,1)`)
        .run(id, id, 'FIX-CATALOG-' + id, name, 'One fictional legacy gift.', price);
    }
    assert.equal(await countPublishedProducts(db, {}), 3);
    assert.equal(await countPublishedProducts(db, { minimumPricePaisa: 25075 }), 2);
    const rows = await listPublishedProducts(db, { minimumPricePaisa: 25075, sort: 'price-low' });
    assert.deepEqual(rows.map((row) => row.id), ['equal', 'high']);
    assert.deepEqual(rows.map((row) => row.pricePaisa), [25075, 31000]);
    assert.ok(rows.every((row) => row.purchasable === false && row.offerSet === null));
    assert.deepEqual((await listPublishedProducts(db,
      { minimumPricePaisa: 25075, sort: 'price-low', limit: 1, page: 2 })).map((row) => row.id), ['high']);
    assert.equal(await countPublishedProducts(db, { minimumPricePaisa: 31001 }), 0);
    sqlite.exec("UPDATE users SET status='suspended' WHERE id='owner'");
    assert.equal(await countPublishedProducts(db, { minimumPricePaisa: 25075 }), 0);
    assert.deepEqual(await listPublishedProducts(db, { minimumPricePaisa: 25075, sort: 'price-low' }), []);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { dispose(); }
});

void test('shop form renders the configured price threshold and preserves its GET value', async () => {
  const { CatalogueFilters } = await import('../components/catalog/catalog-filters');
  const html = renderToStaticMarkup(createElement(CatalogueFilters, {
    query: '', categories: [], occasions: [], selectedCategories: [], selectedOccasions: [],
    sort: 'newest', config: priceConfig, minimumPriceNpr: '250.75',
  }));
  assert.match(html, /data-form-id="catalog\.filters"/);
  assert.match(html, /name="custom\.minimum_price_npr"/);
  assert.match(html, /value="250\.75"/);
  assert.match(html, />Minimum price</);
});

void test('tracking lookup denies an order when the checkout email does not match', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE orders(id TEXT,order_number TEXT,status TEXT,payment_status TEXT,
      placed_at INTEGER,delivered_at INTEGER,updated_at INTEGER,customer_email TEXT);
      CREATE TABLE shipments(order_id TEXT,tracking_code TEXT,estimated_min_days INTEGER,estimated_max_days INTEGER);
      CREATE TABLE delivery_assignments(order_id TEXT,method TEXT,rider_user_id TEXT);
      CREATE TABLE shipping_jobs(id TEXT,order_id TEXT);
      CREATE TABLE shipping_parcels(shipping_job_id TEXT,method TEXT,rider_user_id TEXT);
      CREATE TABLE order_status_events(order_id TEXT,to_status TEXT,created_at INTEGER);
      CREATE TABLE first_cod_reviews(order_id TEXT PRIMARY KEY,customer_id TEXT,total_paisa INTEGER,status TEXT,
        created_at INTEGER,confirmed_by TEXT,confirmed_at INTEGER,reason TEXT,request_id TEXT);
      INSERT INTO orders VALUES ('private','HK-PRIVATE','placed','pending',1,NULL,1,'owner@example.test');
      INSERT INTO shipments VALUES ('private','SECRET-TRACKING',2,5);`);
    const db = { prepare(sql: string) { return new Statement(sqlite.prepare(sql)); } } as unknown as D1Database;
    assert.equal(await findOrderTracking(db, 'HK-PRIVATE', 'stranger@example.test'), null);
    assert.equal((await findOrderTracking(db, 'HK-PRIVATE', 'owner@example.test'))?.trackingCode,
      'SECRET-TRACKING');
    sqlite.exec("INSERT INTO delivery_assignments VALUES ('private','own_rider','private-rider')");
    assert.equal((await findOrderTracking(db, 'HK-PRIVATE', 'owner@example.test'))?.trackingCode, null);
    assert.equal(await findOrderTracking(db, 'HK-PRIVATE', 'stranger@example.test'), null);
  } finally { sqlite.close(); }
});

void test('local role switching is unavailable in production even on localhost', () => {
  const previous = process.env.NODE_ENV;
  try {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    assert.equal(isLocalTestRequest(new Headers({ host: 'localhost:3000' })), false);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', previous);
  }
});
