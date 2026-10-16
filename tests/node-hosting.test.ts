import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { TLSSocket } from 'node:tls';

import { passwordRecord, verifyPassword } from '../lib/auth/hosted-session';
import { countPublishedProducts, listPublishedProducts } from '../lib/db/repositories/products';
import { getProductMaterialSuggestions } from '../lib/products/material-settings';
import * as nodeBindings from '../lib/runtime/node-bindings';

const { env, translateSqliteSql } = nodeBindings;

void test('Node staff bindings read cPanel configuration at runtime and reflect its removal', () => {
  const keys = [
    'HASTABAZAAR_SUPER_ADMIN_EMAIL', 'HASTABAZAAR_ADMIN_EMAIL',
    'HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL', 'HASTABAZAAR_STAGING_ADMIN_EMAIL',
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) {
      delete process.env[key];
      assert.equal(env[key], undefined);
      process.env[key] = 'owner@example.test';
      assert.equal(env[key], 'owner@example.test');
      process.env[key] = 'updated@example.test';
      assert.equal(env[key], 'updated@example.test');
      delete process.env[key];
      assert.equal(env[key], undefined);
    }
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});

void test('Node email and Google bindings read cPanel configuration at runtime', () => {
  const keys = [
    'APP_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM',
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    process.env.APP_ORIGIN = 'https://hastabazaar.com';
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.SMTP_HOST = 'mail.hastabazaar.com';
    process.env.SMTP_USER = 'no-reply@hastabazaar.com';
    process.env.SMTP_PASSWORD = 'test-only-password';
    process.env.EMAIL_FROM = 'HastaBazaar <no-reply@hastabazaar.com>';
    assert.equal(env.APP_ORIGIN, 'https://hastabazaar.com');
    assert.equal(env.GOOGLE_CLIENT_ID, 'client-id');
    assert.equal(env.GOOGLE_CLIENT_SECRET, 'client-secret');
    assert.equal(env.EMAIL_DELIVERY_CONFIGURED, 'true');
    delete process.env.SMTP_PASSWORD;
    assert.equal(env.EMAIL_DELIVERY_CONFIGURED, 'false');
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});

void test('SMTP connection buffers a greeting sent immediately after TLS connects', async () => {
  type SmtpReaderLike = { read(): Promise<string> };
  type OpenSmtpSession = (socket: TLSSocket) => Promise<SmtpReaderLike>;
  const openSmtpSession = (
    nodeBindings as typeof nodeBindings & { openSmtpSession?: OpenSmtpSession }
  ).openSmtpSession;
  assert.equal(
    typeof openSmtpSession,
    'function',
    'node bindings must expose the SMTP session opener',
  );

  class ImmediateGreetingSocket extends EventEmitter {
    setEncoding() {
      return this;
    }
  }

  const socket = new ImmediateGreetingSocket();
  const opening = openSmtpSession(socket as unknown as TLSSocket);
  queueMicrotask(() => {
    socket.emit('secureConnect');
    socket.emit('data', '220 mail.hastabazaar.com ready\r\n');
  });

  const reader = await opening;
  const response = await Promise.race([
    reader.read(),
    new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 50)),
  ]);
  assert.equal(response, '220 mail.hastabazaar.com ready');
});

void test('hosted staging SMTP rejects recipients outside its exact QA allowlist before connecting', async () => {
  const values: Record<string, string> = {
    APP_ORIGIN: 'https://staging.hastabazaar.com', SMTP_HOST: 'localhost', SMTP_PORT: '0',
    SMTP_USER: 'qa-staging@example.test', SMTP_PASSWORD: 'test-only-password',
    EMAIL_FROM: 'qa-staging@example.test',
    SMTP_RECIPIENT_ALLOWLIST: '["qa-staging+buyer@example.test"]',
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const message = { subject: 'QA', text: 'QA', html: '<p>QA</p>' };
  try {
    Object.assign(process.env, values);
    await assert.rejects(env.EMAIL.send({ ...message, to: 'customer@example.test' }), /recipient is not permitted/i);
    for (const recipient of ['Buyer <qa-staging+buyer@example.test>',
      'qa-staging+buyer@example.test,customer@example.test', 'qa-staging+buyer@example.test\r\nBcc: customer@example.test']) {
      await assert.rejects(env.EMAIL.send({ ...message, to: recipient }), /recipient is not permitted/i);
    }
    await assert.rejects(env.EMAIL.send({ ...message, to: 'QA-STAGING+BUYER@example.test' }), /SMTP_PORT must be a valid TCP port/);
    delete process.env.SMTP_RECIPIENT_ALLOWLIST;
    await assert.rejects(env.EMAIL.send({ ...message, to: 'qa-staging+buyer@example.test' }), /recipient allowlist is invalid/i);
    for (const invalid of ['*', '[]', '["*@example.test"]', '["qa-staging+buyer@example.test",null]']) {
      process.env.SMTP_RECIPIENT_ALLOWLIST = invalid;
      await assert.rejects(env.EMAIL.send({ ...message, to: 'qa-staging+buyer@example.test' }), /recipient allowlist is invalid/i);
    }
    process.env.APP_ORIGIN = 'https://hastabazaar.com';
    process.env.SMTP_RECIPIENT_ALLOWLIST = values.SMTP_RECIPIENT_ALLOWLIST;
    await assert.rejects(env.EMAIL.send({ ...message, to: 'customer@example.test' }), /recipient is not permitted/i);
    delete process.env.SMTP_RECIPIENT_ALLOWLIST;
    await assert.rejects(env.EMAIL.send({ ...message, to: 'customer@example.test' }), /SMTP_PORT must be a valid TCP port/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

void test('MariaDB adapter translates the SQLite-only SQL used by the marketplace', () => {
  const translated = translateSqliteSql(
    `INSERT OR IGNORE INTO products (id) VALUES (?);
     SELECT strftime('%Y-%m', orders.delivered_at / 1000, 'unixepoch') AS month
     FROM orders ORDER BY products.name_en COLLATE NOCASE`,
  );
  assert.match(translated, /INSERT IGNORE INTO products/);
  assert.match(translated, /DATE_FORMAT\(FROM_UNIXTIME/);
  assert.doesNotMatch(translated, /COLLATE NOCASE|strftime|INSERT OR IGNORE/);
  assert.equal(
    translateSqliteSql(`SELECT 1 WHERE 'craft' LIKE ? ESCAPE '\\\\'`),
    `SELECT 1 WHERE 'craft' LIKE ?`,
  );
});

void test('MariaDB adapter removes the single-backslash LIKE escape emitted by SQLite queries', () => {
  assert.equal(
    translateSqliteSql(String.raw`SELECT 1 WHERE 'craft' LIKE ? ESCAPE '\'`),
    "SELECT 1 WHERE 'craft' LIKE ?",
  );
  assert.equal(
    translateSqliteSql("SELECT 1 WHERE 'craft' LIKE ? ESCAPE '!'"),
    "SELECT 1 WHERE 'craft' LIKE ? ESCAPE '!'",
  );
});

void test('MariaDB customer replies append the existing detail instead of numeric coercion', () => {
  for (const table of ['complaints', 'return_requests']) {
    assert.equal(
      translateSqliteSql(`UPDATE ${table} SET detail = detail || ? WHERE id = ?`),
      `UPDATE ${table} SET detail = CONCAT(detail, ?) WHERE id = ?`,
    );
  }
});

void test('MariaDB adapter preserves the database clock in integer milliseconds', () => {
  for (const sql of [
    "SELECT unixepoch('now') * 1000 AS now",
    "SELECT UNIXEPOCH( 'now' ) * 1000 AS now",
  ]) {
    assert.equal(translateSqliteSql(sql), 'SELECT UNIX_TIMESTAMP() * 1000 AS now');
  }
});

void test('MariaDB clock translation does not reinterpret other SQLite date expressions', () => {
  for (const sql of [
    "SELECT unixepoch('2026-10-02') AS timestamp",
    "SELECT unixepoch('now', 'subsec') AS timestamp",
    "SELECT unixepoch(?) AS timestamp",
    "SELECT datetime('now') AS timestamp",
  ]) {
    assert.equal(translateSqliteSql(sql), sql);
  }
});

void test('MariaDB product materials use the database clock for the effective setting window', async () => {
  const queries: { sql: string; bindings: unknown[] }[] = [];
  const database = {
    prepare(sql: string) {
      const query = { sql: translateSqliteSql(sql), bindings: [] as unknown[] };
      queries.push(query);
      return {
        first: async () => {
          assert.equal(query.sql, 'SELECT UNIX_TIMESTAMP() * 1000 AS now');
          return { now: 1_790_985_600_000 };
        },
        bind(...bindings: unknown[]) {
          query.bindings = bindings;
          return {
            first: async () => ({
              id: 'qa-material-setting', settingKey: 'product_material_suggestions',
              version: 2, valueJson: '["Cotton","Bamboo"]', status: 'published',
              revision: 1, changeControl: 'controlled', effectiveFrom: 1_790_985_599_000,
              effectiveUntil: null, reason: 'Fictional material setting',
              createdBy: 'qa-admin', createdAt: 1_790_985_598_000,
              submittedBy: 'qa-admin', submittedAt: 1_790_985_598_000,
              approvedBy: 'qa-super-admin', approvedAt: 1_790_985_599_000,
              publishedBy: 'qa-super-admin', publishedAt: 1_790_985_599_000,
              decisionNote: null, supersedesId: null, lastRequestId: 'qa-material-setting',
            }),
          };
        },
      };
    },
  } as unknown as D1Database;

  assert.deepEqual(await getProductMaterialSuggestions(database), ['Cotton', 'Bamboo']);
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].bindings, []);
  assert.match(queries[1].sql, /status = 'published'/);
  assert.match(queries[1].sql, /effective_from <= \?/);
  assert.match(queries[1].sql, /effective_until IS NULL OR effective_until > \?/);
  assert.deepEqual(queries[1].bindings, [
    'product_material_suggestions', 1_790_985_600_000, 1_790_985_600_000,
  ]);
});

for (const operation of ['count', 'list'] as const) {
  void test(`MariaDB ${operation} catalogue search preserves literal wildcard bindings`, async () => {
    let emittedSql = '';
    let emittedBindings: unknown[] = [];
    const database = {
      prepare(sql: string) {
        emittedSql = translateSqliteSql(sql);
        return {
          bind(...bindings: unknown[]) {
            emittedBindings = bindings;
            return {
              first: async () => ({ count: 0 }),
              all: async () => ({ results: [], success: true, meta: {} }),
            };
          },
        };
      },
    } as unknown as D1Database;
    const filters = { query: String.raw`50%_\craft`, categorySlugs: ['qa-samples-fictional'] };
    if (operation === 'count') await countPublishedProducts(database, filters);
    else await listPublishedProducts(database, { ...filters, sort: 'price-low', limit: 12, page: 2 });

    assert.doesNotMatch(emittedSql, /\bESCAPE\b/i);
    assert.equal(emittedSql.match(/LIKE \?/g)?.length, 7);
    assert.deepEqual(emittedBindings, [
      String.raw`%50\%\_\\craft%`, String.raw`%50\%\_\\craft%`,
      String.raw`%50\%\_\\craft%`, String.raw`%50\%\_\\craft%`,
      String.raw`%50\%\_\\craft%`, String.raw`%50\%\_\\craft%`,
      String.raw`%50\%\_\\craft%`, 'qa-samples-fictional',
      ...(operation === 'list' ? [12, 12] : []),
    ]);
  });
}

class FailingSmtpSocket extends EventEmitter {
  destroyed = false;
  setEncoding() { return this; }
  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;
      this.emit('close');
    }
    return this;
  }
}

async function promiseOutcome(promise: Promise<unknown>) {
  let state = 'pending';
  let error: unknown;
  void promise.then(() => { state = 'resolved'; }, (cause) => {
    state = 'rejected';
    error = cause;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  return { state, error };
}

for (const event of ['timeout', 'end', 'close'] as const) {
  void test(`SMTP opening rejects ${event} before TLS connects and closes the socket`, async () => {
    const socket = new FailingSmtpSocket();
    const opening = nodeBindings.openSmtpSession(socket as unknown as TLSSocket);
    socket.emit(event);
    const outcome = await promiseOutcome(opening);
    assert.equal(outcome.state, 'rejected');
    assert.ok(outcome.error instanceof Error);
    assert.equal(socket.destroyed, true);
    assert.equal(socket.listenerCount('secureConnect'), 0);
  });
}

for (const event of ['timeout', 'end', 'close'] as const) {
  void test(`SMTP response read rejects ${event} and later reads retain the terminal failure`, async () => {
    const socket = new FailingSmtpSocket();
    const opening = nodeBindings.openSmtpSession(socket as unknown as TLSSocket);
    socket.emit('secureConnect');
    const reader = await opening;
    const reading = reader.read();
    socket.emit(event);
    const outcome = await promiseOutcome(reading);
    assert.equal(outcome.state, 'rejected');
    assert.ok(outcome.error instanceof Error);
    const later = await promiseOutcome(reader.read());
    assert.equal(later.state, 'rejected');
    assert.equal(later.error, outcome.error);
    assert.equal(socket.destroyed, true);
  });
}

void test('SMTP error between response reads cannot leave a future read pending', async () => {
  const socket = new FailingSmtpSocket();
  const opening = nodeBindings.openSmtpSession(socket as unknown as TLSSocket);
  socket.emit('secureConnect');
  const reader = await opening;
  const failure = new Error('Synthetic SMTP disconnect');
  socket.emit('error', failure);
  const outcome = await promiseOutcome(reader.read());
  assert.equal(outcome.state, 'rejected');
  assert.equal(outcome.error, failure);
  assert.equal(socket.destroyed, true);
});

void test('hosted passwords are salted and verified without storing plaintext', async () => {
  const first = await passwordRecord('a strong marketplace password');
  const second = await passwordRecord('a strong marketplace password');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(
    await verifyPassword(
      'a strong marketplace password',
      first.hash,
      first.salt,
    ),
    true,
  );
  assert.equal(
    await verifyPassword('the wrong password', first.hash, first.salt),
    false,
  );
});

void test('generated MariaDB schema includes marketplace and hosted-auth safeguards', async () => {
  const schema = await readFile(
    new URL('../deployment/babal/mariadb-schema.sql', import.meta.url),
    'utf8',
  );
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `products`/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `user_credentials`/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `user_sessions`/);
  assert.match(schema, /idx_staff_invitations_pending_email_unique/);
  assert.doesNotMatch(
    schema,
    /CONSTRAINT `refunds_high_value_maker_checker` CHECK/,
  );
  assert.match(schema, /SET FOREIGN_KEY_CHECKS = 1/);
});
