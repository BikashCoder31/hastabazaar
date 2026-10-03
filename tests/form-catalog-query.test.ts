import assert from 'node:assert/strict';
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
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`
      CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);
      CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT,status TEXT,trading_name TEXT);
      CREATE TABLE seller_participation_profiles(seller_id TEXT,participation_route TEXT,application_stage TEXT,
        commercial_model TEXT,legal_seller_reference TEXT,invoice_issuer_reference TEXT,
        payout_beneficiary_reference TEXT,managed_agreement_version TEXT,managed_agreement_accepted_at INTEGER);
      CREATE TABLE seller_restrictions(seller_id TEXT,mode TEXT,suspended_until INTEGER);
      CREATE TABLE product_deletions(product_id TEXT);
      CREATE TABLE categories(id TEXT PRIMARY KEY,slug TEXT,is_active INTEGER,name_en TEXT);
      CREATE TABLE products(id TEXT PRIMARY KEY,slug TEXT,name_en TEXT,name_ne TEXT,description_en TEXT,
        description_ne TEXT,price_paisa INTEGER,compare_at_price_paisa INTEGER,inventory_quantity INTEGER,
        country_of_origin TEXT NOT NULL DEFAULT '',origin_evidence_status TEXT NOT NULL DEFAULT 'unverified',
        origin_evidence_reference TEXT,
        producer TEXT,materials TEXT,origin_story TEXT,dimensions TEXT,size TEXT,colour TEXT,variations TEXT,
        specifications TEXT,care_instructions TEXT,safety_information TEXT,return_conditions TEXT,
        return_eligible INTEGER,warranty TEXT,made_to_order INTEGER,preparation_days INTEGER,
        manufactured_at INTEGER,expires_at INTEGER,licence_reference TEXT,seller_id TEXT,category_id TEXT,status TEXT);
      CREATE TABLE product_media(id TEXT,product_id TEXT,sort_order INTEGER);
      INSERT INTO users VALUES ('owner','active');
      INSERT INTO seller_profiles VALUES ('seller','owner','approved','Maker');
      INSERT INTO categories VALUES ('category','gifts',1,'Gifts');
      INSERT INTO products(id,slug,name_en,price_paisa,seller_id,category_id,status) VALUES
        ('low','low','Low',25074,'seller','category','published'),
        ('equal','equal','Equal',25075,'seller','category','published'),
        ('high','high','High',31000,'seller','category','published');
    `);
    const db = { prepare(sql: string) { return new Statement(sqlite.prepare(sql)); } } as unknown as D1Database;
    assert.equal(await countPublishedProducts(db, {}), 3);
    assert.equal(await countPublishedProducts(db, { minimumPricePaisa: 25075 }), 2);
    assert.deepEqual((await listPublishedProducts(db,
      { minimumPricePaisa: 25075, sort: 'price-low' })).map((row) => row.id), ['equal', 'high']);
  } finally { sqlite.close(); }
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
      CREATE TABLE order_status_events(order_id TEXT,to_status TEXT,created_at INTEGER);
      CREATE TABLE first_cod_reviews(order_id TEXT PRIMARY KEY,customer_id TEXT,total_paisa INTEGER,status TEXT,
        created_at INTEGER,confirmed_by TEXT,confirmed_at INTEGER,reason TEXT,request_id TEXT);
      INSERT INTO orders VALUES ('private','HK-PRIVATE','placed','pending',1,NULL,1,'owner@example.test');
      INSERT INTO shipments VALUES ('private','SECRET-TRACKING',2,5);`);
    const db = { prepare(sql: string) { return new Statement(sqlite.prepare(sql)); } } as unknown as D1Database;
    assert.equal(await findOrderTracking(db, 'HK-PRIVATE', 'stranger@example.test'), null);
    assert.equal((await findOrderTracking(db, 'HK-PRIVATE', 'owner@example.test'))?.trackingCode,
      'SECRET-TRACKING');
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
