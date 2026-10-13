import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { after, test } from 'node:test';
import mysql, { type Pool } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import {
  FEATURE_MANAGED_BASELINE_FORM_IDS, initializeFeatureManagedForms,
  initializePublicIdentityForms, PUBLIC_IDENTITY_FORM_IDS,
} from '../lib/db/repositories/form-catalog';

// Exercise the actual adapter's transaction/locking code without opening a socket.
// Only the mysql transport is replaced; the SQL runs against a disposable SQLite
// fixture whose binary comparisons have the same semantics as MariaDB BINARY.
type Call = { sql: string; values: SQLInputValue[] };
let active: ReturnType<typeof fixture>;
const databaseName = 'release_1790839000000_fresh';
const oldEnvironment = Object.fromEntries(['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].map((key) => [key, process.env[key]]));
Object.assign(process.env, { DB_HOST: 'unused.invalid', DB_NAME: databaseName, DB_USER: 'transport-only', DB_PASSWORD: 'not-a-credential' });
const createPool = mysql.createPool;
const transport = {
  async execute(sql: string, values: SQLInputValue[] = []) {
    active.calls.push({ sql, values });
    if (/SELECT GET_LOCK/.test(sql)) return [[{ acquired: 1 }], []];
    if (/SELECT RELEASE_LOCK/.test(sql)) return [[{ released: 1 }], []];
    const statement = active.sqlite.prepare(sql.replace(/\bBINARY\s+/g, '').replace(/\s+FOR UPDATE$/g, ''));
    if (/^\s*(?:\/\*[\s\S]*?\*\/\s*)?SELECT\b/.test(sql)) return [statement.all(...values), []];
    const result = statement.run(...values);
    return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid), warningStatus: 0 }, []];
  },
  async query(sql: string) { active.calls.push({ sql, values: [] }); },
  async beginTransaction() {
    const before = active.beforeTransaction; active.beforeTransaction = null; before?.();
    active.sqlite.exec('BEGIN');
  },
  async commit() { active.sqlite.exec('COMMIT'); },
  async rollback() { active.sqlite.exec('ROLLBACK'); },
  release() {},
  destroy() {},
};
mysql.createPool = (() => ({ ...transport, async getConnection() { return transport; } }) as unknown as Pool) as typeof createPool;
after(() => {
  mysql.createPool = createPool;
  for (const [key, value] of Object.entries(oldEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  sqlite.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES('reviewer','reviewer','reviewer@example.test','Existing reviewer','en-NP','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1);`);
  const result = { sqlite, calls: [] as Call[], beforeTransaction: null as (() => void) | null };
  active = result;
  return result;
}
const input = { actorId: 'reviewer', actorRole: 'super_admin' as const,
  reason: 'SIMULATED adapter contract verification', requestId: 'adapter-baseline', now: 1000 };
function locks(calls: readonly Call[], aborted = false) {
  const lockCalls = calls.filter((call) => /SELECT GET_LOCK/.test(call.sql));
  const expected = [...FEATURE_MANAGED_BASELINE_FORM_IDS].sort().map((formId) =>
    'form:' + createHash('sha256').update(databaseName + '\0' + formId).digest('hex').slice(0, 59));
  assert.deepEqual(lockCalls.map((call) => call.values[0]), expected, 'Lock each real form, never its request ID');
  const guards = calls.filter((call) => call.sql.startsWith('/* form-catalog-guard */'));
  assert.ok(guards.length >= (aborted ? 1 : 24));
  for (const guard of guards) {
    assert.equal(guard.values[0], input.actorId, 'Every catalog guard locks its authorized actor');
    assert.ok(FEATURE_MANAGED_BASELINE_FORM_IDS.some((formId) => formId === guard.values[1]), 'Every catalog guard locks its real form');
  }
  for (const predicate of [/SELECT id FROM users.*FOR UPDATE/, /SELECT role FROM user_roles.*FOR UPDATE/]) {
    const actorLocks = calls.filter((call) => predicate.test(call.sql));
    if (aborted) assert.ok(actorLocks.length >= guards.length);
    else assert.equal(actorLocks.length, guards.length);
    assert.ok(actorLocks.every((call) => call.values.length === 1 && call.values[0] === input.actorId));
  }
  assert.equal(calls.filter((call) => /SELECT RELEASE_LOCK/.test(call.sql)).length, expected.length);
}
function seedDraft(sqlite: DatabaseSync) {
  const formId = 'identity.register';
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
    created_by,created_at,updated_by,updated_at,last_request_id) VALUES('concurrent-draft',?,2,1,'draft',?,'Retain draft','reviewer',1,'reviewer',1,'concurrent-draft')`)
    .run(formId, JSON.stringify({ formId, fields: [] }));
}

void test('actual MariaDB adapter locks real forms and the authorized actor for fresh bootstrap', async () => {
  const { sqlite, calls } = fixture();
  try {
    assert.equal((await initializeFeatureManagedForms(env.DB, input)).created.length, 24);
    locks(calls);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='form_catalog.initialized'").get()?.n, 24);
  } finally { sqlite.close(); }
});

void test('actual MariaDB adapter preserves existing publications and draft history during partial bootstrap and no-op replay', async () => {
  const { sqlite, calls } = fixture();
  try {
    await initializePublicIdentityForms(env.DB, input);
    seedDraft(sqlite);
    const history = sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id,version').all();
    const audit = sqlite.prepare('SELECT * FROM audit_logs ORDER BY request_id').all();
    calls.length = 0;
    const result = await initializeFeatureManagedForms(env.DB, { ...input, requestId: 'adapter-feature-baseline' });
    assert.equal(result.created.length, 18);
    assert.equal(result.preserved.length, 6);
    locks(calls);
    for (const row of history) assert.deepEqual(sqlite.prepare('SELECT * FROM form_config_versions WHERE id=?').get(row.id), row);
    for (const row of audit) assert.deepEqual(sqlite.prepare('SELECT * FROM audit_logs WHERE id=?').get(row.id), row);
    const complete = sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id,version').all();
    calls.length = 0;
    assert.equal((await initializeFeatureManagedForms(env.DB, { ...input, requestId: 'adapter-feature-baseline' })).created.length, 0);
    assert.deepEqual(sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id,version').all(), complete);
    assert.equal(calls.some((call) => /GET_LOCK|FOR UPDATE/.test(call.sql)), false, 'No-op replay starts no write transaction');
  } finally { sqlite.close(); }
});

void test('actual MariaDB adapter rejects a preserved-history race and releases all real form locks', async () => {
  const state = fixture();
  try {
    await initializePublicIdentityForms(env.DB, input);
    state.calls.length = 0;
    state.beforeTransaction = () => seedDraft(state.sqlite);
    await assert.rejects(initializeFeatureManagedForms(env.DB, { ...input, requestId: 'adapter-raced-baseline' }), /changed|permitted/);
    locks(state.calls, true);
    assert.equal(state.sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, PUBLIC_IDENTITY_FORM_IDS.length + 1);
    assert.equal(state.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='form_catalog.initialized'").get()?.n, 6);
  } finally { state.sqlite.close(); }
});

void test('actual MariaDB adapter holds commission actor, roles, profile and setting rows before executing acceptance writes',async()=>{
  const {sqlite,calls}=fixture();try{
    await env.DB.batch([
      env.DB.prepare('/* seller-commission-lock */ SELECT id FROM seller_profiles WHERE user_id=? AND id=?').bind('reviewer','fictional-profile'),
      env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,created_at) VALUES ('locking-proof','reviewer','verification','user','reviewer','SIMULATED adapter check',1)"),
    ]);
    const write=calls.findIndex(c=>/INSERT INTO audit_logs/.test(c.sql));
    for(const predicate of [/SELECT id FROM users.*FOR UPDATE/,/SELECT role FROM user_roles.*FOR UPDATE/,/SELECT id FROM seller_profiles.*FOR UPDATE/,/SELECT id FROM business_setting_versions.*FOR UPDATE/]){
      const index=calls.findIndex(c=>predicate.test(c.sql));assert.ok(index>=0&&index<write,predicate.toString());
    }
    assert.ok(calls.some(c=>c.sql.includes('WHERE user_id=? AND id=? FOR UPDATE')&&c.values[0]==='reviewer'&&c.values[1]==='fictional-profile'));
  }finally{sqlite.close();}
});
