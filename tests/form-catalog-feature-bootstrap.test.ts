import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { initializeFeatureManagedForms as initialize, initializeFormBaselines } from '../lib/db/repositories/form-catalog';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { isFormCatalogEditable } from '../lib/forms/catalog-presentation';
import { resolvePublishedForm } from '../lib/forms/runtime';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.featureBootstrapDb}}', shortCircuit: true };
  if (specifier === '@/app/auth') return { url: 'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.featureBootstrapIdentity};export async function requireAuthenticatedUser(){if(!globalThis.featureBootstrapIdentity)throw Error("Unauthenticated");return globalThis.featureBootstrapIdentity}', shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function redirect(){throw Error("Unexpected redirect")}', shortCircuit: true };
  return nextResolve(specifier, context);
} });
declare global {
  var featureBootstrapDb: D1Database;
  var featureBootstrapIdentity: { userId: string; email: string; displayName: string; fullName: string } | null;
}
class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { return { success: true, results: [], meta: { changes: Number(this.statement.run(...this.values).changes) } }; }
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  sqlite.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES('reviewer','reviewer','reviewer@example.test','Reviewer','en-NP','active',1,1),
      ('customer','customer','customer@example.test','Customer','en-NP','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1),('customer','customer',1);`);
  const database = {
    beforeBatch: null as (() => void) | null,
    prepare(sql: string) { return new Statement(sqlite.prepare(sql)); },
    async batch(statements: readonly Statement[]) {
      const before = this.beforeBatch; this.beforeBatch = null; before?.();
      sqlite.exec('BEGIN');
      try {
        const results = []; for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT'); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const db = database as unknown as D1Database;
  globalThis.featureBootstrapDb = db;
  globalThis.featureBootstrapIdentity = { userId: 'customer', email: 'customer@example.test', displayName: 'Customer', fullName: 'Customer' };
  return { sqlite, db, database };
}
const input = { actorId: 'reviewer', actorRole: 'super_admin' as const, reason: 'SIMULATED required feature-managed baselines', requestId: 'feature-baseline', now: 1000 };
const required = ['identity.register', 'identity.login-password', 'identity.email-code-request', 'identity.email-code-verify',
  'identity.password-reset-request', 'identity.password-reset-complete', 'account.profile', 'account.address',
  'account.daily-reward', 'account.points-redemption', 'commerce.promo-quote', 'commerce.gift-card-redeem',
  'staff.staff-invitation', 'staff.staff-permission-1', 'staff.staff-permission-2', 'rider.code-verify',
  'staff.homepage-hero-manager', 'staff.homepage-occasion-manager', 'staff.homepage-visibility',
  'staff.business-settings-manager', 'staff.delivery-rate', 'staff.promo-code', 'staff.loyalty-settings', 'staff.referral-settings'];
function seedDraft(sqlite: DatabaseSync, formId: string) {
  sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
    created_by,created_at,updated_by,updated_at,last_request_id) VALUES(?,?,1,1,'draft',?,'Retain existing draft','reviewer',1,'reviewer',1,?)`)
    .run(`${formId}-draft`, formId, JSON.stringify({ formId, fields: [] }), `draft-${formId}`);
}

void test('feature readiness recovers missing profile config GET and real PATCH without altering audience authority', async () => {
  const { sqlite, db } = fixture();
  try {
    const forms = await import('../app/api/forms/[formId]/route');
    const profile = await import('../app/api/account/profile/route');
    const origin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
    const get = (formId: string) => forms.GET(new Request(origin + '/api/forms/' + formId), { params: Promise.resolve({ formId }) });
    assert.equal((await get('account.profile')).status, 404);
    await initialize(db, input);
    const config = await get('account.profile');
    assert.equal(config.status, 200);
    const published = await config.json() as { config: { version: number } };
    assert.equal(published.config.version, 1);
    const body = { displayName: 'SIMULATED updated customer', phone: '+9779800000011', locale: 'en-NP',
      idempotencyKey: 'feature-profile-change', formVersion: 1, customAnswers: [] };
    const request = () => new Request(origin + '/api/account/profile', { method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const changed = await profile.PATCH(request());
    assert.equal(changed.status, 200, await changed.text());
    assert.equal(sqlite.prepare("SELECT display_name FROM users WHERE id='customer'").get()?.display_name, body.displayName);
    assert.equal((await profile.PATCH(request())).status, 200);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id='account.profile'").get()?.n, 1);
    for (const id of ['staff.staff-permission-1', 'staff.staff-invitation', 'rider.code-verify'])
      assert.equal((await get(id)).status, 404, `A customer must not discover ${id}`);
    const staff = await import('../app/api/admin/staff-permissions/route');
    assert.equal((await staff.POST(new Request(origin + '/api/admin/staff-permissions', { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }))).status, 403);
    globalThis.featureBootstrapIdentity = null;
    assert.equal((await get('account.profile')).status, 404);
    assert.equal((await profile.PATCH(request())).status, 401);
    const rider = await import('../app/api/rider/verify-code/route');
    globalThis.featureBootstrapIdentity = { userId: 'customer', email: 'customer@example.test', displayName: 'Customer', fullName: 'Customer' };
    assert.equal((await rider.POST(new Request(origin + '/api/rider/verify-code', { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }))).status, 403);
    assert.deepEqual(sqlite.prepare("SELECT role FROM user_roles WHERE user_id='customer'").all().map((row) => row.role), ['customer']);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM account_email_verifications').get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('feature baseline set covers exactly hidden nonquery config consumers and retains versioned audits', async () => {
  const { sqlite, db, database } = fixture();
  try {
    await initialize(db, input);
    assert.deepEqual(sqlite.prepare('SELECT form_id FROM form_config_versions ORDER BY form_id').all().map((row) => row.form_id), [...required].sort());
    for (const id of required) {
      const definition = FORM_REGISTRY[id];
      assert.equal(isFormCatalogEditable(definition), false, id);
      assert.notEqual(definition.mode, 'query', id);
      assert.equal(IMPLEMENTED_FORM_ADAPTERS[definition.adapterId].formId, id);
      assert.equal((await resolvePublishedForm(db, id)).version, 1);
    }
    for (const id of ['identity.logout', 'system.local-testing-role', 'commerce.add-to-cart', 'commerce.order-tracking'])
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions WHERE form_id=?').get(id)?.n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='form_catalog.initialized'").get()?.n, 24);
    const history = sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id').all();
    database.beforeBatch = () => { throw Error('No-op initialization must not create a write batch'); };
    await initialize(db, { ...input, now: 2000 });
    assert.deepEqual(sqlite.prepare('SELECT * FROM form_config_versions ORDER BY form_id').all(), history);
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { sqlite.close(); }
});

void test('a feature-managed draft blocks all auth and feature baseline writes atomically', async () => {
  const { sqlite, db } = fixture();
  try {
    seedDraft(sqlite, 'account.profile');
    const before = sqlite.prepare('SELECT * FROM form_config_versions').all();
    await assert.rejects(initialize(db, input), /draft|history|permitted|conflict/i);
    assert.deepEqual(sqlite.prepare('SELECT * FROM form_config_versions').all(), before);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='form_catalog.initialized'").get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('a feature-managed form appearing after preflight rolls back the entire24-form batch', async () => {
  const { sqlite, db, database } = fixture();
  try {
    database.beforeBatch = () => seedDraft(sqlite, 'staff.referral-settings');
    await assert.rejects(initialize(db, input), /permitted|conflict|changed/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='form_catalog.initialized'").get()?.n, 0);
  } finally { sqlite.close(); }
});

void test('generic baseline initialization rejects query, no-config, unknown and duplicate definitions', async () => {
  const { sqlite, db } = fixture();
  try {
    for (const formIds of [[], ['commerce.add-to-cart'], ['commerce.order-tracking'], ['system.local-testing-role'],
      ['identity.logout'], ['unknown.form'], ['account.profile', 'account.profile']]) {
      await assert.rejects(initializeFormBaselines(db, { ...input, formIds }), /required feature-managed/);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config_versions').get()?.n, 0);
    }
  } finally { sqlite.close(); }
});
