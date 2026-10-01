import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { TLSSocket } from 'node:tls';

import { passwordRecord, verifyPassword } from '../lib/auth/hosted-session';
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
