import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadQueryPresentationConfig } from '../lib/catalog/shop-query';
import type { PublishedFormConfig } from '../lib/forms/types';

const globals = globalThis as unknown as {
  React: typeof React;
  trackingRecoveryDb?: D1Database;
};
globals.React = React;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks: Record<string, string> = {
      'cloudflare:workers':
        'export const env={get DB(){return globalThis.trackingRecoveryDb}}',
      '@/components/layout/site-header':
        'export function SiteHeader(){return null}',
      '@/components/layout/site-footer':
        'export function SiteFooter(){return null}',
      'next/link':
        'export default function Link({href,children,...props}){return globalThis.React.createElement("a",{href,...props},children)}',
      '@/lib/http/rate-limit':
        'export async function consumePublicRequestRateLimit(){return {allowed:true}};export function rateLimitJson(){return Response.json({}, {status:429})}',
    };
    return mocks[specifier]
      ? {
          url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
          shortCircuit: true,
        }
      : nextResolve(specifier, context);
  },
});

class Statement {
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
const config: PublishedFormConfig = {
  formId: 'commerce.order-tracking',
  version: 1,
  publishedAt: 1,
  fields: [
    {
      id: 'orderNumber',
      key: 'orderNumber',
      label: 'Published order number',
      type: 'short_text',
      required: true,
      order: 0,
      status: 'active',
    },
    {
      id: 'email',
      key: 'email',
      label: 'Published checkout email',
      type: 'email',
      required: true,
      order: 1,
      status: 'active',
    },
  ],
};
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE form_config_versions(form_id TEXT,status TEXT,version INTEGER,config_json TEXT,published_at INTEGER)',
  );
  const db = {
    prepare(sql: string) {
      return new Statement(sqlite.prepare(sql));
    },
  } as unknown as D1Database;
  return { sqlite, db };
}

void test('tracking preloads only the validated publication; drafts do not replace approved text', async () => {
  const { sqlite, db } = fixture();
  globals.trackingRecoveryDb = db;
  try {
    const insert = sqlite.prepare(
      'INSERT INTO form_config_versions VALUES(?,?,?,?,?)',
    );
    insert.run(
      config.formId,
      'published',
      1,
      JSON.stringify({ formId: config.formId, fields: config.fields }),
      1,
    );
    insert.run(
      config.formId,
      'draft',
      2,
      JSON.stringify({
        formId: config.formId,
        fields: [{ ...config.fields[0], label: 'Unapproved label' }],
      }),
      2,
    );
    assert.deepEqual(
      await loadQueryPresentationConfig(
        db,
        config.formId as 'commerce.order-tracking',
      ),
      { config, unavailable: false },
    );
    const Page = (await import('../app/track/page')).default;
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ order: 'HK-FICTIONAL' }) }),
    );
    assert.match(html, /Published order number/);
    assert.match(html, /Published checkout email/);
    assert.match(html, /value="HK-FICTIONAL"/);
    assert.doesNotMatch(
      html,
      /Unapproved label|Reload tracking form|presentation is unavailable/,
    );
  } finally {
    sqlite.close();
    delete globals.trackingRecoveryDb;
  }
});

void test('missing optional tracking publication retains built-in fields without creating configuration', async () => {
  const { sqlite, db } = fixture();
  globals.trackingRecoveryDb = db;
  try {
    assert.deepEqual(
      await loadQueryPresentationConfig(db, 'commerce.order-tracking'),
      { config: null, unavailable: false },
    );
    const Page = (await import('../app/track/page')).default;
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    assert.match(html, /Order number/);
    assert.match(html, /Checkout email/);
    assert.doesNotMatch(html, /Reload tracking form|unavailable/);
    assert.equal(
      sqlite.prepare('SELECT count(*) AS n FROM form_config_versions').get()?.n,
      0,
    );
  } finally {
    sqlite.close();
    delete globals.trackingRecoveryDb;
  }
});

void test('invalid publication and failed reads show safe reload while retaining required lookup fields', async () => {
  const { sqlite, db } = fixture();
  globals.trackingRecoveryDb = db;
  try {
    sqlite.prepare('INSERT INTO form_config_versions VALUES(?,?,?,?,?)').run(
      config.formId,
      'published',
      1,
      JSON.stringify({
        formId: config.formId,
        fields: [{ ...config.fields[0], required: false }],
      }),
      1,
    );
    const Page = (await import('../app/track/page')).default;
    for (const failure of ['invalid', 'read']) {
      if (failure === 'read') sqlite.exec('DROP TABLE form_config_versions');
      assert.deepEqual(
        await loadQueryPresentationConfig(db, 'commerce.order-tracking'),
        { config: null, unavailable: true },
      );
      const html = renderToStaticMarkup(
        await Page({ searchParams: Promise.resolve({}) }),
      );
      assert.match(html, /You can still track your order/);
      assert.match(html, /Reload tracking form/);
      assert.match(
        html.match(/<input[^>]*name="orderNumber"[^>]*>/)?.[0] ?? '',
        /required=""/,
      );
      assert.match(
        html.match(/<input[^>]*name="email"[^>]*>/)?.[0] ?? '',
        /type="email".*required=""/,
      );
      assert.doesNotMatch(
        html,
        /Published order number|presentation is unavailable/,
      );
    }
  } finally {
    sqlite.close();
    delete globals.trackingRecoveryDb;
  }
});

void test('real tracking route finds a fictional order without exposing identity and keeps no-match 404', async () => {
  const { sqlite, db } = fixture();
  globals.trackingRecoveryDb = db;
  const priorOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://tracking-recovery.test';
  try {
    sqlite.exec(`CREATE TABLE orders(id TEXT,order_number TEXT,status TEXT,payment_status TEXT,
      placed_at INTEGER,delivered_at INTEGER,updated_at INTEGER,customer_email TEXT);
      CREATE TABLE shipments(order_id TEXT,tracking_code TEXT,estimated_min_days INTEGER,estimated_max_days INTEGER);
      CREATE TABLE order_status_events(order_id TEXT,to_status TEXT,created_at INTEGER);
      CREATE TABLE first_cod_reviews(order_id TEXT PRIMARY KEY,customer_id TEXT,total_paisa INTEGER,status TEXT,
        created_at INTEGER,confirmed_by TEXT,confirmed_at INTEGER,reason TEXT,request_id TEXT);
      INSERT INTO orders VALUES('fictional','HK-FICTIONAL','confirmed','pending',1,NULL,2,'qa@example.invalid');
      INSERT INTO shipments VALUES('fictional','FICTIONAL-DELIVERY',1,3);
      INSERT INTO order_status_events VALUES('fictional','confirmed',2);`);
    const { POST } = await import('../app/api/orders/track/route');
    const request = (
      email: string,
      origin = 'https://tracking-recovery.test',
    ) =>
      new Request('https://tracking-recovery.test/api/orders/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ orderNumber: 'hk-fictional', email }),
      });
    const known = await POST(request('QA@EXAMPLE.INVALID'));
    assert.equal(known.status, 200);
    const knownBody = (await known.json()) as {
      tracking: { orderNumber: string; trackingCode: string | null };
    };
    assert.equal(knownBody.tracking.orderNumber, 'HK-FICTIONAL');
    assert.equal(knownBody.tracking.trackingCode, 'FICTIONAL-DELIVERY');
    assert.doesNotMatch(
      JSON.stringify(knownBody),
      /qa@example|customer|address|"id"/i,
    );
    const absent = await POST(request('stranger@example.invalid'));
    assert.equal(absent.status, 404);
    assert.match(
      ((await absent.json()) as { error: string }).error,
      /couldn’t match those details/i,
    );
    const rejected = await POST(
      request('qa@example.invalid', 'https://untrusted.invalid'),
    );
    assert.equal(rejected.status, 403);
  } finally {
    if (priorOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = priorOrigin;
    sqlite.close();
    delete globals.trackingRecoveryDb;
  }
});
