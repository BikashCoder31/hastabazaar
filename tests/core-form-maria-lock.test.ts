import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import mysql, { type Pool } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import { buildFormAnswerInsert } from '../lib/db/repositories/form-answers';

void test('actual Maria adapter serializes native core receipts by form identity, including anonymous commerce, and rejects zero affected rows', async () => {
  const names = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;
  const prior = new Map(names.map(name => [name, process.env[name]]));
  const createPool = mysql.createPool;
  const events: { sql: string; values: unknown[] }[] = [];
  let changes = 1, commits = 0, releases = 0;
  const connection = {
    async query(sql: string) { events.push({ sql, values: [] }); return [[], []]; },
    async beginTransaction() { events.push({ sql: 'BEGIN', values: [] }); },
    async execute(sql: string, values: unknown[] = []) {
      events.push({ sql, values });
      if (sql.includes('GET_LOCK(')) return [[{ acquired: 1 }], []];
      if (sql.includes('RELEASE_LOCK(')) return [[{ released: 1 }], []];
      return [{ affectedRows: changes, insertId: 0 }, []];
    },
    async commit() { commits++; }, async rollback() {}, release() { releases++; },
  };
  try {
    Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '1', DB_NAME: 'native_form_protocol_fixture', DB_USER: 'fictional', DB_PASSWORD: 'fictional' });
    mysql.createPool = (() => ({ async getConnection() { return connection; } }) as unknown as Pool) as typeof mysql.createPool;
    assert.notEqual(mysql.createPool, createPool, 'No actual connection or network function may be used.');
    const formId = 'commerce.checkout';
    const receipt = (requestId: string) => buildFormAnswerInsert(env.DB, { formId, requestId,
      versionId: 'core:commerce.checkout:1', actorId: null, subjectType: 'order', subjectId: 'fictional-protocol-order',
      answers: { formId, version: 1, answers: [] }, now: 1 });
    await env.DB.batch([receipt('native-protocol-positive')]);
    const key = 'form:' + createHash('sha256').update('native_form_protocol_fixture\0' + formId).digest('hex').slice(0, 59);
    const lock = events.findIndex(event => event.sql.includes('GET_LOCK('));
    const write = events.findIndex(event => event.sql.includes('INSERT INTO audit_logs'));
    assert.ok(lock >= 0 && lock < write, 'The native core receipt must enter the actual publication lock before executing.');
    assert.equal(events[lock].values[0], key, 'The lock belongs to the form, never the nullable actor.');
    assert.equal(commits, 1); assert.equal(releases, 1);
    changes = 0;
    await assert.rejects(env.DB.batch([receipt('native-protocol-zero')]), /answer|receipt|insert|accepted/i);
    assert.equal(commits, 1, 'A zero-row receipt cannot be reported as a committed submission.');
    assert.equal(releases, 2);
  } finally {
    mysql.createPool = createPool;
    for (const [name, value] of prior) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
