import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { assertHostedAuthReadinessContext, inspectHostedAuthSchema } from '../scripts/staging/hosted-auth-readiness.mjs';
import { hostedAuthProjectFixture } from './helpers/hosted-auth-project-fixture';
import { createHostedSessionForUser, getHostedIdentity, passwordRecord, verifyPassword } from '../lib/auth/hosted-session';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const environment = { HASTABAZAAR_RUNTIME_ENV: 'local_staging', NODE_ENV: 'development',
  APP_ORIGIN: 'http://localhost:4173', HASTABAZAAR_MAIL_MODE: 'capture',
  HASTABAZAAR_PAYMENT_MODE: 'simulated', HASTABAZAAR_RECIPIENT_DOMAIN: 'local.hastabazaar.test' };
const isolatedProject = await hostedAuthProjectFixture();
const { recovery, prepareHostedAuthSchema } = isolatedProject;
after(() => isolatedProject.dispose());
void test('recovery files belong to the helper temporary project independently of CLI context', () => {
  const helperRepository = resolve(fileURLToPath(new URL('../../', isolatedProject.moduleUrl)));
  assert.notEqual(helperRepository, project);
  assert.equal(recovery, join(helperRepository, '.staging', 'recovery'));
});
function fixture(path = ':memory:') {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY NOT NULL,auth_subject TEXT,email TEXT,display_name TEXT,status TEXT,updated_at INTEGER);
    CREATE TABLE account_email_verifications(user_id TEXT,email TEXT);
    INSERT INTO users VALUES('fictional','password:fictional','fictional@local.hastabazaar.test','SIMULATED identity','active',1);`);
  return db;
}
async function withBackup(run: (path: string) => Promise<void>) {
  mkdirSync(recovery, { recursive: true });
  const path = join(recovery, `${randomUUID()}.sqlite`);
  try { await run(path); }
  finally { rmSync(path, { force: true }); }
}

void test('hosted auth prerequisite rejects every nonlocal context before a database can be opened', () => {
  assert.doesNotThrow(() => assertHostedAuthReadinessContext(project, project, environment));
  for (const changes of [{ HASTABAZAAR_RUNTIME_ENV: 'production' }, { NODE_ENV: 'production' },
    { APP_ORIGIN: 'https://hastabazaar.com' }, { APP_ORIGIN: 'http://localhost:4173/private' },
    { APP_ORIGIN: 'http://username:password@localhost:4173' },
    { HASTABAZAAR_MAIL_MODE: 'smtp' }, { HASTABAZAAR_PAYMENT_MODE: 'live' },
    { HASTABAZAAR_RECIPIENT_DOMAIN: 'example.com' }, { DB_HOST: 'external.example' },
    { SMTP_HOST: 'external.example' }, { CLOUDFLARE_API_TOKEN: 'forbidden' },
    { HASTABAZAAR_STAGING_ROOT: '../outside' }])
    assert.throws(() => assertHostedAuthReadinessContext(project, project, { ...environment, ...changes }));
  for (const other of [join(recovery, 'rejected-checkout'), join(project, 'copied-project')])
    assert.throws(() => assertHostedAuthReadinessContext(other, other, environment), /approved isolated checkout/);
});

void test('readiness imports against the supported Node22.13 SQLite export surface without newer backup API', async () => {
  const bundled = await build({ entryPoints: [fileURLToPath(new URL('../scripts/staging/hosted-auth-readiness.mjs', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'node22-13-sqlite-surface', setup(build) {
      build.onResolve({ filter: /^node:sqlite$/ }, () => ({ path: 'sqlite', namespace: 'node22-13' }));
      build.onLoad({ filter: /^sqlite$/, namespace: 'node22-13' }, () => ({ contents: 'export class DatabaseSync {}', loader: 'js' }));
    } }] });
  assert.equal(bundled.outputFiles.length, 1, 'The prerequisite must not import an export absent from an allowed runtime');
});

void test('coherent pre-DDL recovery includes committed WAL data without copying the main file', async () => {
  await withBackup(async (path) => {
    const source = path + '.source.sqlite';
    const db = fixture(source);
    try {
      db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('wal-fictional', 'password:wal-fictional',
        'wal-fictional@local.hastabazaar.test', 'SIMULATED committed WAL identity', 'active', 2);
      assert.ok(existsSync(source + '-wal'));
      assert.ok(readFileSync(source + '-wal').byteLength > 0, 'Committed rows must still be in the WAL before recovery');
      await prepareHostedAuthSchema(db, path);
      const saved = new DatabaseSync(path, { readOnly: true });
      try {
        assert.equal(saved.prepare("SELECT display_name FROM users WHERE id='wal-fictional'").get()?.display_name,
          'SIMULATED committed WAL identity');
        assert.equal(saved.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('user_credentials','user_sessions')").get()?.n, 0);
      } finally { saved.close(); }
    } finally {
      db.close();
      for (const file of [source, source + '-wal', source + '-shm']) rmSync(file, { force: true });
    }
  });
});

void test('read-only schema inspection reports missing hosted tables without creating rows or tables', () => {
  const db = fixture();
  try {
    assert.deepEqual(inspectHostedAuthSchema(db), { ready: false, missing: ['user_credentials', 'user_sessions', 'email_login_challenges'] });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'user_%'").get()?.n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 1);
  } finally { db.close(); }
});

void test('missing auth tables mirror canonical generator columns defaults primary keys foreign keys and indexes', async () => {
  const db = fixture();
  await withBackup(async (path) => {
    try {
      const result = await prepareHostedAuthSchema(db, path);
      assert.deepEqual(result.created, ['user_credentials', 'user_sessions', 'email_login_challenges']);
      assert.equal(inspectHostedAuthSchema(db).ready, true);
      const source = readFileSync(new URL('../scripts/generate-mariadb-schema.mjs', import.meta.url), 'utf8');
      for (const table of ['user_credentials', 'user_sessions']) {
        const start = source.indexOf(`'CREATE TABLE IF NOT EXISTS \`${table}\` ('`);
        assert.ok(start > 0);
        const ddl = source.slice(start, source.indexOf("') ENGINE=InnoDB", start));
        const primary = ddl.match(/PRIMARY KEY \(`([^`]+)`\)/)?.[1];
        const expected = [...ddl.matchAll(/`([^`]+)` (VARCHAR\(\d+\)|BIGINT) NOT NULL(?: DEFAULT (\d+))?/g)]
          .map((match) => ({ name: match[1], type: match[2].startsWith('VARCHAR') ? 'TEXT' : 'INTEGER',
            notnull: 1, dflt_value: match[3] ?? null, pk: match[1] === primary ? 1 : 0 }));
        assert.deepEqual(db.prepare(`PRAGMA table_info(${table})`).all().map(({ name, type, notnull, dflt_value, pk }) =>
          ({ name, type, notnull, dflt_value, pk })), expected);
        const foreignKey = db.prepare(`PRAGMA foreign_key_list(${table})`).get();
        assert.deepEqual(foreignKey && { table: foreignKey.table, from: foreignKey.from, to: foreignKey.to,
          on_update: foreignKey.on_update, on_delete: foreignKey.on_delete },
        { table: 'users', from: 'user_id', to: 'id', on_update: 'NO ACTION', on_delete: 'CASCADE' });
        assert.ok(source.includes(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${table}_user_id_users_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION;`));
        for (const match of ddl.matchAll(/KEY `([^`]+)` \(`([^`]+)`\)/g))
          assert.deepEqual(db.prepare(`PRAGMA index_info(${match[1]})`).all().map((row) => row.name), [match[2]]);
        assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0, 'Schema readiness must never seed auth rows');
      }
      const saved = new DatabaseSync(path, { readOnly: true });
      try {
        assert.equal(saved.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 1);
        assert.equal(saved.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('user_credentials','user_sessions')").get()?.n, 0,
          'The coherent recovery snapshot precedes all schema additions');
      } finally { saved.close(); }
    } finally { db.close(); }
  });
});

void test('local hosted readiness includes usable email login challenges with owner cascade and composite lookup index', async () => {
  const db = fixture();
  await withBackup(async (path) => {
    try {
      await prepareHostedAuthSchema(db, path);
      db.prepare('INSERT INTO email_login_challenges VALUES(?,?,?,0,10,1,NULL)').run('challenge', 'code', 'fictional');
      assert.deepEqual(db.prepare('PRAGMA index_info(idx_email_login_challenges_user_created)').all().map(row => row.name),
        ['user_id', 'created_at']);
      db.prepare("DELETE FROM users WHERE id='fictional'").run();
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_login_challenges').get()?.n, 0);
    } finally { db.close(); }
  });
});

void test('schema readiness is idempotent and preserves real credentials and current sessions', async () => {
  const db = fixture();
  await withBackup(async (path) => {
    try {
      await prepareHostedAuthSchema(db, path);
      db.prepare('INSERT INTO user_credentials VALUES(?,?,?,1,1,1)').run('fictional', 'fixture-hash', 'fixture-salt');
      db.prepare('INSERT INTO user_sessions VALUES(?,?,2,1,1)').run('fixture-token-hash', 'fictional');
      const credentials = db.prepare('SELECT * FROM user_credentials').all();
      const sessions = db.prepare('SELECT * FROM user_sessions').all();
      assert.deepEqual((await prepareHostedAuthSchema(db, `${path}.unused`)).created, []);
      assert.equal(existsSync(`${path}.unused`), false, 'A ready schema needs no new recovery file');
      assert.deepEqual(db.prepare('SELECT * FROM user_credentials').all(), credentials);
      assert.deepEqual(db.prepare('SELECT * FROM user_sessions').all(), sessions);
    } finally { db.close(); }
  });
});

void test('incompatible existing auth schema and absent parent fail closed without partial creation', async () => {
  for (const sql of [
    'CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY,password_hash TEXT)',
    'CREATE VIEW user_sessions AS SELECT id AS token_hash FROM users',
    'DROP TABLE users',
  ]) {
    const db = fixture();
    await withBackup(async (path) => {
      try {
        db.exec(sql);
        const before = db.prepare('SELECT name,type,sql FROM sqlite_master ORDER BY name').all();
        await assert.rejects(() => prepareHostedAuthSchema(db, path), /schema|parent|incompatible/i);
        assert.deepEqual(db.prepare('SELECT name,type,sql FROM sqlite_master ORDER BY name').all(), before);
      } finally { db.close(); }
    });
  }
});

void test('a real SQL failure rolls back both new tables and never overwrites a recovery file', async () => {
  const db = fixture();
  await withBackup(async (path) => {
    try {
      db.exec('CREATE TABLE sentinel(id TEXT); CREATE INDEX idx_user_sessions_user ON sentinel(id);');
      await assert.rejects(() => prepareHostedAuthSchema(db, path), /index|schema/i);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('user_credentials','user_sessions')").get()?.n, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='sentinel'").get()?.n, 1);
      await assert.rejects(() => prepareHostedAuthSchema(db, path), /exist/i);
    } finally { db.close(); }
  });
});

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async run() { const result = this.statement.run(...this.values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; }
}
function adapter(sqlite: DatabaseSync) {
  return { prepare(sql: string) { return new Statement(sqlite.prepare(sql)); }, async batch(statements: Statement[]) {
    sqlite.exec('BEGIN');
    try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
}

void test('prepared tables support unchanged real password/session validation and foreign-key cleanup', async () => {
  const sqlite = fixture();
  await withBackup(async (path) => {
    try {
      await prepareHostedAuthSchema(sqlite, path);
      sqlite.exec(`CREATE TABLE user_roles(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL);
        INSERT INTO user_roles VALUES('fictional','customer');`);
      const password = `SIMULATED-${randomUUID()}`;
      const record = await passwordRecord(password);
      assert.equal(await verifyPassword(password, record.hash, record.salt), true);
      assert.equal(await verifyPassword('different fictional password', record.hash, record.salt), false);
      sqlite.prepare('INSERT INTO user_credentials VALUES(?,?,?,1,1,1)').run('fictional', record.hash, record.salt);
      const db = adapter(sqlite);
      const token = await createHostedSessionForUser(db, 'fictional', 10, { passwordHash: record.hash });
      const headers = new Headers({ cookie: `hastabazaar_session=${token}` });
      assert.equal((await getHostedIdentity(db, headers, 11))?.userId, 'password:fictional');
      assert.equal(await getHostedIdentity(db, new Headers({ cookie: 'hastabazaar_session=wrong-token' }), 11), null);
      assert.equal(await getHostedIdentity(db, headers, 10 + 31 * 24 * 60 * 60_000), null);
      await assert.rejects(() => createHostedSessionForUser(db, 'fictional', 12, { passwordHash: 'wrong-hash' }));
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n, 1);
      sqlite.prepare("UPDATE users SET status='suspended' WHERE id='fictional'").run();
      assert.equal(await getHostedIdentity(db, headers, 13), null);
      sqlite.prepare("DELETE FROM users WHERE id='fictional'").run();
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_sessions').get()?.n, 0);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_credentials').get()?.n, 0);
    } finally { sqlite.close(); }
  });
});
