import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepareHostedAuthSchema } from '../scripts/staging/hosted-auth-readiness.mjs';
import { inspectReadiness } from '../lib/operations/readiness';

void test('readiness uses SQLite metadata for a D1 binding without a MariaDB dialect tag', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users(id TEXT PRIMARY KEY)');
  const queries: string[] = [];
  const database = {
    prepare(sql: string) {
      queries.push(sql);
      return { async all() { return { results: sqlite.prepare(sql).all() }; } };
    },
  } as unknown as D1Database;
  try {
    const result = await inspectReadiness(database);
    assert.equal(result.ready, false);
    assert.ok(result.missing.includes('table:orders'));
    assert.ok(result.missing.includes('column:users.email'));
    assert.equal(result.missing.includes('database-unavailable'), false);
    assert.ok(queries.some((sql) => sql.startsWith('PRAGMA table_info(')));
    assert.equal(queries.some((sql) => sql.includes('information_schema')), false);
  } finally { sqlite.close(); }
});

void test('readiness keeps information_schema checks for a tagged MariaDB adapter', async () => {
  const queries: string[] = [];
  const database = {
    dialect: 'mariadb',
    prepare(sql: string) {
      queries.push(sql);
      return { async all() { return { results: [] }; } };
    },
  } as unknown as D1Database;
  const result = await inspectReadiness(database);
  assert.equal(result.ready, false);
  assert.ok(result.missing.includes('table:orders'));
  assert.equal(result.missing.includes('database-unavailable'), false);
  assert.ok(queries.some((sql) => sql.includes('information_schema.COLUMNS')));
  assert.ok(queries.some((sql) => sql.includes('information_schema.CHECK_CONSTRAINTS')));
  assert.equal(queries.some((sql) => sql.startsWith('PRAGMA ')), false);
});

void test('fully migrated SQLite with local auth prerequisites is ready without the MariaDB release tracker', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const directory = fileURLToPath(new URL('../drizzle/', import.meta.url));
  const recovery = fileURLToPath(new URL('../.staging/recovery/', import.meta.url));
  mkdirSync(recovery, { recursive: true });
  const backup = recovery + `readiness-${crypto.randomUUID()}.sqlite`;
  try {
    for (const name of (await readdir(directory)).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort())
      sqlite.exec(await readFile(directory + name, 'utf8'));
    await prepareHostedAuthSchema(sqlite, backup);
    const db = { prepare(sql: string) { return { async all() {
      return { results: sqlite.prepare(sql).all() };
    } }; } } as unknown as D1Database;
    assert.deepEqual(await inspectReadiness(db), { ready: true, missing: [] });
    sqlite.exec('DROP TRIGGER order_items_require_available_inventory');
    const missing = await inspectReadiness(db);
    assert.equal(missing.ready, false);
    assert.ok(missing.missing.includes('trigger:order_items_require_available_inventory'));
  } finally { sqlite.close(); rmSync(backup, { force: true }); }
});
