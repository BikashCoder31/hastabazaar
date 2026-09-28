// Faithful hosted-auth schema prerequisite for marked disposable local QA only.
// This is not a production migration or a substitute for production schema setup.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertDisposableStagingContext, readAndVerifyStagingMarker, resolveDisposableStagingPaths } from './guards.mjs';
import { assertApprovedFormCatalogCheckout } from './form-catalog-qa-guards.mjs';
import { locateLocalD1Database } from './local-d1.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const recoveryRoot = join(project, '.staging', 'recovery');
const contracts = {
  user_credentials: {
    columns: [
      ['user_id', 'TEXT', 1, null, 1], ['password_hash', 'TEXT', 1, null, 0],
      ['password_salt', 'TEXT', 1, null, 0], ['password_version', 'INTEGER', 1, '1', 0],
      ['created_at', 'INTEGER', 1, null, 0], ['updated_at', 'INTEGER', 1, null, 0],
    ], indexes: {},
    sql: `CREATE TABLE user_credentials (
      user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,
      password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
      password_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
  },
  user_sessions: {
    columns: [
      ['token_hash', 'TEXT', 1, null, 1], ['user_id', 'TEXT', 1, null, 0],
      ['expires_at', 'INTEGER', 1, null, 0], ['created_at', 'INTEGER', 1, null, 0],
      ['last_seen_at', 'INTEGER', 1, null, 0],
    ], indexes: { idx_user_sessions_user: 'user_id', idx_user_sessions_expiry: 'expires_at' },
    sql: `CREATE TABLE user_sessions (
      token_hash TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL
    )`,
  },
};

export function assertHostedAuthReadinessContext(projectRoot, cwd, environment) {
  assertApprovedFormCatalogCheckout(projectRoot, cwd);
  assertDisposableStagingContext(environment);
  assert.notEqual(environment.NODE_ENV, 'production', 'Hosted auth readiness is local staging only.');
  resolveDisposableStagingPaths(projectRoot, environment);
  const origin = new URL(environment.APP_ORIGIN);
  assert.equal(origin.protocol, 'http:', 'Loopback HTTP is required.');
  assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Loopback host is required.');
  assert.equal(origin.pathname, '/', 'Origin must have no path.');
  assert.equal(origin.username + origin.password + origin.search + origin.hash, '', 'Origin must have no credentials, query or fragment.');
}

export function inspectHostedAuthSchema(db) {
  const parent = db.prepare('PRAGMA table_info(users)').all();
  assert.ok(parent.some((column) => column.name === 'id' && column.type.toUpperCase() === 'TEXT' && column.pk > 0),
    'Hosted authentication schema requires the existing users primary-key parent.');
  const missing = [];
  for (const [table, contract] of Object.entries(contracts)) {
    const object = db.prepare('SELECT type FROM sqlite_master WHERE name=?').get(table);
    if (!object) { missing.push(table); continue; }
    assert.equal(object.type, 'table', `${table} schema is incompatible.`);
    const columns = db.prepare(`PRAGMA table_info(${table})`).all()
      .map((column) => [column.name, column.type.toUpperCase(), column.notnull, column.dflt_value, column.pk]);
    assert.deepEqual(columns, contract.columns, `${table} schema is incompatible.`);
    const keys = db.prepare(`PRAGMA foreign_key_list(${table})`).all()
      .map((key) => [key.table, key.from, key.to, key.on_update, key.on_delete]);
    assert.deepEqual(keys, [['users', 'user_id', 'id', 'NO ACTION', 'CASCADE']], `${table} foreign-key schema is incompatible.`);
    for (const [name, column] of Object.entries(contract.indexes)) {
      const index = db.prepare('SELECT tbl_name FROM sqlite_master WHERE type=\'index\' AND name=?').get(name);
      assert.equal(index?.tbl_name, table, `${table} index schema is incompatible.`);
      assert.deepEqual(db.prepare(`PRAGMA index_info(${name})`).all().map((entry) => entry.name), [column],
        `${table} index schema is incompatible.`);
    }
  }
  return { ready: missing.length === 0, missing };
}

/** In-memory-testable primitive; the CLI guards the database before obtaining it. */
export async function prepareHostedAuthSchema(db, backupFile) {
  const initial = inspectHostedAuthSchema(db);
  if (initial.ready) return { ready: true, created: [], backup: null };
  const target = resolve(backupFile);
  assert.ok(target.startsWith(recoveryRoot + sep), 'Recovery backup must remain in this checkout staging recovery.');
  const actualParent = await realpath(dirname(target));
  assert.ok(resolve(actualParent).startsWith(recoveryRoot + sep) || resolve(actualParent) === recoveryRoot,
    'Recovery backup parent must not escape staging via symlink.');
  // Exclusive reservation prevents accidental replacement of any previous recovery file.
  const reserved = await open(target, 'wx', 0o600);
  await reserved.close();
  try { db.prepare('VACUUM INTO ?').run(target); }
  catch (error) { await unlink(target); throw error; }
  // VACUUM INTO captures a coherent snapshot, including committed WAL data,
  // and works with the supported Node22.13 SQLite API. The reserved file is empty.
  // The backup must finish before the first DDL statement or transaction begins.
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = inspectHostedAuthSchema(db);
    for (const table of current.missing) {
      db.exec(contracts[table].sql);
      for (const [name, column] of Object.entries(contracts[table].indexes))
        db.exec(`CREATE INDEX ${name} ON ${table}(${column})`);
    }
    assert.equal(inspectHostedAuthSchema(db).ready, true);
    db.exec('COMMIT');
    return { ready: true, created: current.missing, backup: target };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] ?? '--plan';
  assert.ok(['--plan', '--apply'].includes(mode), 'Use --plan or --apply.');
  const confirmation = '--confirm-local-hosted-auth-schema=HASTABAZAAR-LOCAL-STAGING';
  assert.ok(args.every((arg) => arg === mode || (mode === '--apply' && arg === confirmation)), 'Unexpected prerequisite argument.');
  if (mode === '--apply') assert.ok(args.includes(confirmation), 'Explicit local hosted-auth schema confirmation is required.');
  assertHostedAuthReadinessContext(project, process.cwd(), process.env);
  const paths = resolveDisposableStagingPaths(project, process.env);
  await readAndVerifyStagingMarker(paths);
  assert.equal(resolve(await realpath(paths.root)), paths.root, 'Staging root must not be a symlink.');
  const databasePath = await locateLocalD1Database(paths);
  assert.ok(resolve(await realpath(databasePath)).startsWith(paths.state + sep), 'Database must remain in this checkout local staging state.');
  const db = new DatabaseSync(databasePath, { readOnly: mode === '--plan' });
  try {
    const migrationNames = (await readdir(join(project, 'drizzle'))).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
    const tracked = db.prepare('SELECT name FROM _hastabazaar_local_migrations ORDER BY name').all().map((row) => row.name);
    assert.deepEqual(tracked, migrationNames, 'All current local migrations must already be tracked. This helper never applies migrations.');
    const before = inspectHostedAuthSchema(db);
    if (mode === '--plan' || before.ready) {
      console.log(JSON.stringify({ mode, ...before, mutations: 0, productionSchemaCertified: false }));
      return;
    }
    await mkdir(paths.recovery, { recursive: true });
    const result = await prepareHostedAuthSchema(db, join(paths.recovery, `before-hosted-auth-${randomUUID()}.sqlite`));
    console.log(JSON.stringify({ mode, ready: result.ready, created: result.created,
      backup: result.backup ? relative(project, result.backup) : null, authRowsCreated: 0, productionSchemaCertified: false }));
  } finally { db.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
