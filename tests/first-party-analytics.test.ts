import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';
import test from 'node:test';

import { recordRequestTrafficEvent } from '../lib/analytics/request';
import { parsePublicTrafficEvent } from '../lib/analytics/first-party';
import type { FirstPartyAnalyticsPolicy } from '../lib/configuration/types';
import {
  getCustomerAndTrafficAnalytics,
  recordTrafficEvent,
} from '../lib/db/repositories/analytics';

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
  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes) },
      results: [],
    };
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

const day = 86_400_000;
const enabledPolicy: FirstPartyAnalyticsPolicy = {
  enabled: true,
  retentionDays: 90,
  excludedEmailDomains: ['example.test'],
  excludedPathPrefixes: ['/admin', '/seller', '/api'],
};

void test('private identifiers never reach traffic persistence or aggregates with permissive configuration', async () => {
  const { sqlite, database } = await fixture();
  try {
    const policy = { ...enabledPolicy, excludedPathPrefixes: [] };
    for (const path of ['/orders/receipt-secret', '/account/addresses/private-id', '/documents/invoice-secret', '/admin/documents/private-id', '/seller/documents/private-id', '/api/private-id', '/%6frders/encoded-secret', '/shop/../orders/dot-secret']) {
      const result = await recordTrafficEvent(database, { tokenHash: 'a'.repeat(64), eventType: 'page_view', path, policy, now: 200 * day });
      assert.equal(result.recorded, false, path);
    }
    assert.equal(sqlite.prepare('SELECT count(*) n FROM traffic_events').get()?.n, 0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM traffic_sessions').get()?.n, 0);
    const aggregate = await getCustomerAndTrafficAnalytics(database, 200 * day);
    assert.equal(aggregate.traffic.events, 0); assert.deepEqual(aggregate.topPaths, []);
    assert.equal((await recordTrafficEvent(database, { tokenHash: 'a'.repeat(64), eventType: 'page_view', path: '/accounting', policy, now: 200 * day })).recorded, true);
  } finally { sqlite.close(); }
});

void test('analytics aggregates omit pre-existing literal private paths', async () => {
  const { sqlite, database } = await fixture();
  try {
    sqlite.prepare('INSERT INTO traffic_sessions VALUES (?,?,?,?,?)').run('legacy-session', 'a'.repeat(64), 200 * day, 200 * day, 201 * day);
    for (const [index, path] of ['/orders/legacy-receipt', '/account/legacy-id', '/seller/documents/legacy-id', '/%6frders/encoded-legacy-id', '/shop/../orders/dot-legacy-id', '//orders/duplicate-slash-id'].entries())
      sqlite.prepare('INSERT INTO traffic_events VALUES (?,?,?,?,?,?,?)').run(`legacy-${index}`, 'legacy-session', 'page_view', path, null, `legacy-key-${index}`, 200 * day);
    const report = await getCustomerAndTrafficAnalytics(database, 200 * day);
    assert.equal(report.traffic.events, 0);
    assert.equal(report.traffic.estimatedBrowserSessions, 0);
    assert.deepEqual(report.topPaths, []);
  } finally { sqlite.close(); }
});

void test('analytics aggregates omit pre-existing backslash private paths without hiding public metrics', async () => {
  const { sqlite, database } = await fixture();
  try {
    sqlite.prepare('INSERT INTO traffic_sessions VALUES (?,?,?,?,?)').run('legacy-backslash', 'b'.repeat(64), 200 * day, 200 * day, 201 * day);
    for (const [index, path] of ['/orders\\receipt-secret', '/account\\private-account', '/seller\\documents\\private-document', '/shop'].entries())
      sqlite.prepare('INSERT INTO traffic_events VALUES (?,?,?,?,?,?,?)').run(`backslash-${index}`, 'legacy-backslash', 'page_view', path, null, `backslash-key-${index}`, 200 * day);
    const report = await getCustomerAndTrafficAnalytics(database, 200 * day);
    assert.equal(report.traffic.events, 1);
    assert.equal(report.traffic.pageViews, 1);
    assert.equal(report.traffic.estimatedBrowserSessions, 1);
    assert.deepEqual(report.topPaths.map(row => ({ ...row })), [{ path: '/shop', views: 1, estimatedSessions: 1 }]);
  } finally { sqlite.close(); }
});
void test('multiply encoded analytics paths fail closed before persistence', async () => {
  const { sqlite, database } = await fixture();
  try {
    await assert.rejects(recordTrafficEvent(database, { tokenHash: 'a'.repeat(64), eventType: 'page_view',
      path: '/%256frders/secret', policy: { ...enabledPolicy, excludedPathPrefixes: [] }, now: 200 * day }), /encoding/i);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM traffic_events').get()?.n, 0);
  } finally { sqlite.close(); }
});

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      status TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE user_roles (
      user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL,
      PRIMARY KEY(user_id,role)
    );
    INSERT INTO users VALUES
      ('admin','admin@hastabazaar.local','Admin','active',1),
      ('customer','customer@public.invalid','Customer','active',${190 * day}),
      ('dual','dual@public.invalid','Dual role','active',${100 * day}),
      ('disabled','disabled@public.invalid','Disabled customer','disabled',${195 * day}),
      ('seller-only','seller@public.invalid','Seller only','active',${195 * day}),
      ('staff-only','staff@public.invalid','Staff only','active',${195 * day}),
      ('fictional','fixture@example.test','Fictional','active',${195 * day});
    INSERT INTO user_roles VALUES
      ('admin','super_admin'),('customer','customer'),('dual','customer'),('dual','seller'),
      ('disabled','customer'),('seller-only','seller'),('staff-only','admin'),('fictional','customer');
  `);
  sqlite.exec(
    await readFile(
      new URL('../drizzle/0044_business_configuration.sql', import.meta.url),
      'utf8',
    ),
  );
  sqlite.exec(
    (
      await readFile(
        new URL('../drizzle/0050_first_party_analytics.sql', import.meta.url),
        'utf8',
      )
    ).replaceAll('--> statement-breakpoint', ''),
  );
  sqlite
    .prepare(`INSERT INTO business_setting_versions(
    id,setting_key,version,value_json,status,revision,change_control,effective_from,
    effective_until,reason,created_by,created_at,published_by,published_at,last_request_id
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      'analytics-v1',
      'first_party_analytics_policy',
      1,
      JSON.stringify(enabledPolicy),
      'published',
      1,
      'simple',
      1,
      null,
      'Enable bounded first-party staging analytics.',
      'admin',
      1,
      'admin',
      1,
      'analytics-publish-1',
    );
  return {
    sqlite,
    database: new TestDatabase(sqlite) as unknown as D1Database,
  };
}

void test('traffic collection is allowlisted, deduplicated, path-limited and privacy-minimal', async () => {
  const { sqlite, database } = await fixture();
  try {
    const now = 200 * day;
    const tokenA = 'a'.repeat(64);
    const tokenB = 'b'.repeat(64);
    const first = await recordTrafficEvent(database, {
      tokenHash: tokenA,
      eventType: 'page_view',
      path: '/shop',
      policy: enabledPolicy,
      now,
    });
    const duplicate = await recordTrafficEvent(database, {
      tokenHash: tokenA,
      eventType: 'page_view',
      path: '/shop',
      policy: enabledPolicy,
      now: now + 1_000,
    });
    await recordTrafficEvent(database, {
      tokenHash: tokenA,
      eventType: 'product_view',
      path: '/products/clay-cup',
      entityKey: 'clay-cup',
      policy: enabledPolicy,
      now: now + 2_000,
    });
    await recordTrafficEvent(database, {
      tokenHash: tokenB,
      eventType: 'checkout_started',
      path: '/checkout',
      policy: enabledPolicy,
      now: now + 3_000,
    });
    assert.equal(first.recorded, true);
    assert.equal(duplicate.recorded, true);
    assert.equal(
      (
        sqlite
          .prepare('SELECT COUNT(*) AS count FROM traffic_events')
          .get() as { count: number }
      ).count,
      3,
    );
    assert.equal(
      (
        sqlite
          .prepare('SELECT COUNT(*) AS count FROM traffic_sessions')
          .get() as { count: number }
      ).count,
      2,
    );
    await assert.rejects(
      recordTrafficEvent(database, {
        tokenHash: tokenA,
        eventType: 'page_view',
        path: '/shop?email=private@example.com',
        policy: enabledPolicy,
        now,
      }),
      /query-free/,
    );
    const excluded = await recordTrafficEvent(database, {
      tokenHash: tokenA,
      eventType: 'page_view',
      path: '/admin/orders',
      policy: enabledPolicy,
      now,
    });
    assert.equal(excluded.recorded, false);

    const columns = sqlite
      .prepare('PRAGMA table_info(traffic_events)')
      .all()
      .map((row) => String(row.name));
    for (const forbidden of [
      'ip',
      'user_agent',
      'account_id',
      'order_id',
      'checkout_json',
    ]) {
      assert.equal(columns.includes(forbidden), false);
    }
  } finally {
    sqlite.close();
  }
});

void test('public event parsing prevents arbitrary identifiers and binds product events to their path', () => {
  assert.deepEqual(
    parsePublicTrafficEvent({
      eventType: 'product_view',
      path: '/products/clay-cup',
      entityKey: 'clay-cup',
    }),
    {
      eventType: 'product_view',
      path: '/products/clay-cup',
      entityKey: 'clay-cup',
    },
  );
  assert.throws(
    () =>
      parsePublicTrafficEvent({
        eventType: 'page_view',
        path: '/shop',
        entityKey: 'customer123',
      }),
    /allowlisted public event/i,
  );
  assert.throws(
    () =>
      parsePublicTrafficEvent({
        eventType: 'product_view',
        path: '/products/clay-cup',
        entityKey: 'another-product',
      }),
    /match its product path/i,
  );
  assert.throws(
    () =>
      parsePublicTrafficEvent({
        eventType: 'checkout_started',
        path: '/checkout/someone',
        entityKey: null,
      }),
    /checkout path/i,
  );
});

void test('customer registration totals come from account roles and de-duplicate dual-role users', async () => {
  const { sqlite, database } = await fixture();
  try {
    const report = await getCustomerAndTrafficAnalytics(database, 200 * day);
    assert.deepEqual(report.customers, {
      registeredAccounts: 3,
      activeAccounts: 2,
      restrictedAccounts: 1,
      registeredLast30Days: 2,
    });
    assert.deepEqual(report.directory.map((entry) => entry.id).sort(), [
      'customer',
      'disabled',
      'dual',
    ]);
    assert.equal(report.traffic.events, 0);
    assert.equal(report.traffic.estimatedBrowserSessions, 0);
  } finally {
    sqlite.close();
  }
});

void test('browser request collection honors DNT, bot filtering, disabled defaults and opaque HTTP-only cookies', async () => {
  const { sqlite, database } = await fixture();
  try {
    const dnt = await recordRequestTrafficEvent(
      database,
      new Request('http://localhost/shop', {
        headers: { dnt: '1', 'user-agent': 'Mozilla/5.0' },
      }),
      { eventType: 'page_view', path: '/shop', now: 200 * day },
    );
    assert.deepEqual(dnt, { recorded: false });
    const bot = await recordRequestTrafficEvent(
      database,
      new Request('http://localhost/shop', {
        headers: { 'user-agent': 'ExampleBot/1.0' },
      }),
      { eventType: 'page_view', path: '/shop', now: 200 * day },
    );
    assert.deepEqual(bot, { recorded: false });
    const browser = await recordRequestTrafficEvent(
      database,
      new Request('http://localhost/shop', {
        headers: { 'user-agent': 'Mozilla/5.0' },
      }),
      { eventType: 'page_view', path: '/shop', now: 200 * day },
    );
    assert.equal(browser.recorded, true);
    assert.match(
      browser.cookie ?? '',
      /^hastabazaar_traffic=.*HttpOnly; SameSite=Lax; Max-Age=7776000$/,
    );
    assert.equal(
      (
        sqlite
          .prepare('SELECT COUNT(*) AS count FROM traffic_events')
          .get() as { count: number }
      ).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

void test('retention cleanup removes expired events without retaining an empty expired session', async () => {
  const { sqlite, database } = await fixture();
  try {
    const now = 200 * day;
    sqlite
      .prepare('INSERT INTO traffic_sessions VALUES (?,?,?,?,?)')
      .run('old', 'c'.repeat(64), 1, 1, 2);
    sqlite
      .prepare('INSERT INTO traffic_events VALUES (?,?,?,?,?,?,?)')
      .run('old-event', 'old', 'page_view', '/old', null, 'old-key', 1);
    await recordTrafficEvent(database, {
      tokenHash: 'd'.repeat(64),
      eventType: 'page_view',
      path: '/new',
      policy: enabledPolicy,
      now,
    });
    assert.equal(
      (
        sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM traffic_events WHERE id='old-event'",
          )
          .get() as { count: number }
      ).count,
      0,
    );
    assert.equal(
      (
        sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM traffic_sessions WHERE id='old'",
          )
          .get() as { count: number }
      ).count,
      0,
    );
  } finally {
    sqlite.close();
  }
});

void test('admin presentation labels browser metrics as estimates instead of people', async () => {
  const source = await readFile(
    new URL('../app/admin/analytics/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /Estimated browser sessions/);
  assert.match(source, /not a verified unique person/);
  assert.doesNotMatch(source, /unique visitors/i);
});
