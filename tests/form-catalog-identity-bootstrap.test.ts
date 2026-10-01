import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { initializePublicIdentityForms as initialize } from '../lib/db/repositories/form-catalog';
import { FormRuntimeError, resolvePublishedForm } from '../lib/forms/runtime';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { isFormCatalogEditable } from '../lib/forms/catalog-presentation';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return {
    url: 'data:text/javascript,export const env={get DB(){return globalThis.identityBootstrapDb}}', shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });
declare global { var identityBootstrapDb: D1Database; }

const identityForms = ['identity.register', 'identity.login-password', 'identity.email-code-request',
  'identity.email-code-verify', 'identity.password-reset-request', 'identity.password-reset-complete'];
const input = { actorId: 'reviewer', actorRole: 'super_admin' as const,
  reason: 'SIMULATED protected public identity baseline', requestId: 'identity-baseline', now: 1000 };

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { return { success: true, results: [], meta: { changes: Number(this.statement.run(...this.values).changes) } }; }
}

class Database {
  beforeBatch: (() => void) | null = null;
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    const before = this.beforeBatch;
    this.beforeBatch = null;
    before?.();
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  }
  sqlite.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES ('reviewer','reviewer','reviewer@example.test','Existing reviewer','en-NP','active',1,1),
      ('customer','customer','customer@example.test','Existing customer','en-NP','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1),('customer','customer',1);`);
  const database = new Database(sqlite);
  return { sqlite, database, db: database as unknown as D1Database };
}

function storedRows(sqlite: DatabaseSync) {
  return {
    forms: sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id,version').all(),
    audit: sqlite.prepare('SELECT * FROM audit_logs ORDER BY request_id').all(),
    users: sqlite.prepare('SELECT * FROM users ORDER BY id').all(),
    roles: sqlite.prepare('SELECT * FROM user_roles ORDER BY user_id,role').all(),
  };
}

function seedVersion(sqlite: DatabaseSync, formId: string, version: number, status: 'published' | 'draft') {
  const fields = [{ id: 'context_note', key: 'context_note', type: 'short_text', label: 'Existing context',
    required: true, order: 0, status: 'active' }];
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
    created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?,?,?,?,?,?,'Existing authorized configuration','reviewer',10,'reviewer',11,?,?,?)`)
    .run(`${formId}-${version}`, formId, version, 3, status, JSON.stringify({ formId, fields }),
      status === 'published' ? 'reviewer' : null, status === 'published' ? 11 : null, `existing-${formId}-${version}`);
}

void test('fresh protected public auth forms become available through an audited authorized baseline', async () => {
  const { sqlite, db } = fixture();
  try {
    for (const formId of identityForms) {
      assert.equal(isFormCatalogEditable(FORM_REGISTRY[formId]), false);
      await assert.rejects(resolvePublishedForm(db, formId), (error: unknown) =>
        error instanceof FormRuntimeError && error.code === 'config_unavailable');
    }
    const users = storedRows(sqlite).users;
    const roles = storedRows(sqlite).roles;
    await initialize(db, input);
    for (const formId of identityForms) {
      const config = await resolvePublishedForm(db, formId);
      assert.deepEqual(config, { formId, fields: [], version: 1, publishedAt: 1000 });
      const submission = await validateSellerFormSubmission(db, formId, 1, []);
      assert.deepEqual(submission.answers, { formId, version: 1, answers: [] });
      await assert.rejects(validateSellerFormSubmission(db, formId, 2, []), (error: unknown) =>
        error instanceof FormRuntimeError && error.code === 'stale_version');
      assert.equal(isFormCatalogEditable(FORM_REGISTRY[formId]), false);
    }
    assert.deepEqual(storedRows(sqlite).users, users, 'Bootstrap must never create or change user accounts');
    assert.deepEqual(storedRows(sqlite).roles, roles, 'Bootstrap must never grant authority');
    const rows = sqlite.prepare(`SELECT form_id,version,revision,status,created_by,published_by,last_request_id
      FROM form_config_versions ORDER BY form_id`).all();
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.version === 1 && row.revision === 1 && row.status === 'published'
      && row.created_by === 'reviewer' && row.published_by === 'reviewer'));
    const audits = sqlite.prepare("SELECT actor_id,action,subject_type,subject_id,reason,next_json,request_id FROM audit_logs WHERE action LIKE 'form_catalog.%'").all();
    assert.equal(audits.length, 6);
    assert.ok(audits.every((row) => row.actor_id === 'reviewer' && row.action === 'form_catalog.initialized'
      && row.subject_type === 'form_config' && row.reason === input.reason));
    for (const row of rows) {
      const audit = audits.find((item) => item.subject_id === row.form_id);
      assert.equal(audit?.request_id, row.last_request_id);
      const evidence = JSON.parse(String(audit?.next_json));
      assert.equal(evidence.version, 1);
      assert.equal(evidence.status, 'published');
      assert.equal(evidence.config.formId, row.form_id);
      assert.deepEqual(evidence.config.fields, []);
    }
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { sqlite.close(); }
});

void test('replaying identity initialization preserves exact publications and audit provenance', async () => {
  const { sqlite, database, db } = fixture();
  try {
    assert.ok(initialize);
    await initialize(db, input);
    const before = storedRows(sqlite);
    database.beforeBatch = () => { throw new Error('No-op replay must not issue a write batch'); };
    await initialize(db, { ...input, now: 2000 });
    assert.deepEqual(storedRows(sqlite), before);
    await assert.rejects(initialize(db, { ...input, reason: 'Different operation' }), /request|conflict|permitted/i);
    await assert.rejects(initialize(db, { ...input, actorId: 'customer' }), /request|conflict|permitted/i);
    assert.deepEqual(storedRows(sqlite), before);
  } finally { sqlite.close(); }
});

void test('identity initialization preserves every existing publication and draft', async () => {
  const { sqlite, db } = fixture();
  try {
    assert.ok(initialize);
    seedVersion(sqlite, 'identity.register', 4, 'published');
    seedVersion(sqlite, 'identity.register', 5, 'draft');
    const existing = sqlite.prepare("SELECT * FROM form_config_versions WHERE form_id='identity.register' ORDER BY version").all();
    await initialize(db, input);
    assert.deepEqual(sqlite.prepare("SELECT * FROM form_config_versions WHERE form_id='identity.register' ORDER BY version").all(), existing);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 7);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'form_catalog.%'").get()?.n, 5);
    const config = await resolvePublishedForm(db, 'identity.register');
    assert.equal(config.version, 4);
    assert.equal(config.fields[0].required, true);
    await assert.rejects(validateSellerFormSubmission(db, 'identity.register', 4, []), /required/i);
    await initialize(db, { ...input, requestId: 'another-baseline', now: 2000 });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'form_catalog.%'").get()?.n, 5);
  } finally { sqlite.close(); }
});

void test('draft-only identity history blocks the entire initializer without consuming replay identity', async () => {
  const { sqlite, db } = fixture();
  try {
    assert.ok(initialize);
    seedVersion(sqlite, 'identity.password-reset-complete', 1, 'draft');
    const before = storedRows(sqlite);
    await assert.rejects(initialize(db, input), /draft|history|conflict|permitted/i);
    assert.deepEqual(storedRows(sqlite), before);
  } finally { sqlite.close(); }
});

void test('publication race aborts every baseline and audit write in the atomic batch', async () => {
  const { sqlite, database, db } = fixture();
  try {
    assert.ok(initialize);
    database.beforeBatch = () => seedVersion(sqlite, 'identity.password-reset-complete', 1, 'draft');
    await assert.rejects(initialize(db, input), /conflict|permitted|changed/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'form_catalog.%'").get()?.n, 0);
  } finally { sqlite.close(); }
});

for (const change of ['new draft', 'new publication', 'existing draft edit', 'existing draft config edit'] as const) {
  void test(`preserved identity history race aborts initialization: ${change}`, async () => {
    const { sqlite, database, db } = fixture();
    try {
      seedVersion(sqlite, 'identity.register', 1, 'published');
      if (change.startsWith('existing draft')) seedVersion(sqlite, 'identity.register', 2, 'draft');
      let concurrentHistory: unknown;
      database.beforeBatch = () => {
        if (change === 'existing draft config edit') {
          const row = sqlite.prepare("SELECT config_json FROM form_config_versions WHERE form_id='identity.register' AND status='draft'").get();
          const config = JSON.parse(String(row?.config_json));
          config.fields[0].label = 'Concurrent configuration edit';
          sqlite.prepare("UPDATE form_config_versions SET config_json=? WHERE form_id='identity.register' AND status='draft'")
            .run(JSON.stringify(config));
        } else if (change === 'existing draft edit') {
          sqlite.exec(`UPDATE form_config_versions SET revision=revision+1,reason='Concurrent draft edit',
            updated_at=2000,last_request_id='concurrent-register-edit' WHERE form_id='identity.register' AND status='draft'`);
        } else {
          seedVersion(sqlite, 'identity.register', 2, change === 'new draft' ? 'draft' : 'published');
        }
        concurrentHistory = sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id,version').all();
      };
      await assert.rejects(initialize(db, input), /conflict|permitted|changed/i);
      assert.deepEqual(sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id,version').all(), concurrentHistory);
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'form_catalog.%'").get()?.n, 0);
    } finally { sqlite.close(); }
  });
}

void test('removed Super Admin authority blocks initialization before any publication or audit', async () => {
  const { sqlite, db } = fixture();
  try {
    assert.ok(initialize);
    sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer'");
    const before = storedRows(sqlite);
    await assert.rejects(initialize(db, input), /conflict|permitted/i);
    assert.deepEqual(storedRows(sqlite), before);
  } finally { sqlite.close(); }
});

void test('authority removed after preflight aborts the publication batch', async () => {
  const { sqlite, database, db } = fixture();
  try {
    database.beforeBatch = () => sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer'");
    await assert.rejects(initialize(db, input), /conflict|permitted|changed/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE 'form_catalog.%'").get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('initialization recovers ordinary registration and password login without granting contact proof', async () => {
  const { sqlite, db } = fixture();
  globalThis.identityBootstrapDb = db;
  sqlite.exec(`CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY,password_hash TEXT,password_salt TEXT,
      password_version INTEGER,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,created_at INTEGER,last_seen_at INTEGER);`);
  try {
    const register = (await import('../app/api/auth/register/route')).POST;
    const login = (await import('../app/api/auth/login/route')).POST;
    const origin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
    const password = 'Fictional bootstrap password';
    const request = (path: string, fields: Record<string, string>) => new Request(origin + path, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    });
    const fields = { email: 'fresh-user@local.hastabazaar.test', display_name: 'SIMULATED fresh user',
      password, confirm_password: password, formVersion: '1', requestId: 'fresh-registration' };
    const unavailable = await register(request('/api/auth/register', fields));
    assert.equal(unavailable.status, 503);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE email='fresh-user@local.hastabazaar.test'").get()?.n, 0);
    await initialize(db, input);
    const registered = await register(request('/api/auth/register', fields));
    assert.equal(registered.status, 303);
    assert.match(registered.headers.get('set-cookie') ?? '', /^hastabazaar_session=/);
    const signedIn = await login(request('/api/auth/login', { email: fields.email, password,
      formVersion: '1', requestId: 'fresh-password-login' }));
    assert.equal(signedIn.status, 303);
    const cookie = signedIn.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie);
    const { getHostedIdentity } = await import('../lib/auth/hosted-session');
    const identity = await getHostedIdentity(db, new Headers({ cookie }));
    assert.equal(identity?.email, fields.email);
    assert.equal(identity?.mailboxVerified, false);
    const user = sqlite.prepare('SELECT id FROM users WHERE email=?').get(fields.email);
    assert.ok(user);
    assert.deepEqual(sqlite.prepare('SELECT role FROM user_roles WHERE user_id=?').all(user.id).map((row) => row.role), ['customer']);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM account_email_verifications WHERE user_id=?').get(user.id)?.n, 0);
    const answers = sqlite.prepare(`SELECT form_id,actor_id,subject_id,answers_json FROM form_answer_sets
      WHERE form_id IN ('identity.register','identity.login-password') ORDER BY form_id`).all();
    assert.equal(answers.length, 2);
    assert.ok(answers.every((answer) => answer.actor_id === user.id && answer.subject_id === user.id));
    assert.ok(answers.every((answer) => JSON.parse(String(answer.answers_json)).answers.length === 0));
    assert.equal((await login(request('/api/auth/login', { email: fields.email, password,
      formVersion: '1', requestId: 'fresh-password-login' }))).status, 409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 2);
  } finally { sqlite.close(); }
});
