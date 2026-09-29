import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { FORM_REGISTRY } from '../lib/forms/registry';

type Actor = { id: string; role: 'customer' | 'admin' | 'super_admin' } | null;
declare global {
  // Route imports use these test-local boundary doubles for framework auth and D1 bindings.
  // The catalog repository, validation, origin checks, and bounded reader stay real.
  var formCatalogRouteActor: Actor;
  var formCatalogRouteDb: D1Database;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {get DB(){return globalThis.formCatalogRouteDb}}', shortCircuit: true };
    if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,export class StaffAuthorizationError extends Error { constructor(message,status){super(message);this.status=status} }; export async function requireStaffApi(){const a=globalThis.formCatalogRouteActor;if(!a)throw new StaffAuthorizationError('Authentication is required.',401);if(a.role!=='super_admin')throw new StaffAuthorizationError('Staff access is not permitted.',403);return a}`, shortCircuit: true };
    if (specifier === '@/app/auth') return { url: 'data:text/javascript,export async function getAuthenticatedUser(){const a=globalThis.formCatalogRouteActor;return a?{userId:a.id+"-subject"}:null}', shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

class Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values) as T | undefined) ?? null; }
  async all<T>() { return { results: this.statement.all(...this.values) as T[] }; }
  async run() { const result = this.statement.run(...this.values); return { success: true, meta: { changes: Number(result.changes) }, results: [] }; }
}
class Database {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) { return new Statement(this.sqlite.prepare(sql)); }
  async batch(statements: readonly Statement[]) {
    this.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE users(id TEXT PRIMARY KEY, auth_subject TEXT, status TEXT NOT NULL);
    CREATE TABLE user_roles(user_id TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE staff_permission_profiles(user_id TEXT PRIMARY KEY,permissions_json TEXT NOT NULL,
      version INTEGER NOT NULL,updated_by TEXT,updated_at INTEGER);
    CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE seller_participation_profiles(seller_id TEXT PRIMARY KEY,application_stage TEXT NOT NULL);
    CREATE TABLE rider_profiles(user_id TEXT PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
      subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT, request_id TEXT,
      ip_hash TEXT, created_at INTEGER);
    INSERT INTO users VALUES ('sa','sa-subject','active'),('admin','admin-subject','active'),
      ('customer','customer-subject','active'),('disabled','disabled-subject','disabled'),
      ('pending','pending-subject','active'),('seller','seller-subject','active'),('rider','rider-subject','active');
    INSERT INTO user_roles VALUES ('sa','super_admin'),('admin','admin'),('customer','customer'),
      ('disabled','super_admin'),('pending','customer'),('seller','customer'),('seller','seller'),
      ('rider','customer');`);
  const migration = await readFile(new URL('../drizzle/0056_form_catalog.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  globalThis.formCatalogRouteDb = new Database(sqlite) as unknown as D1Database;
  globalThis.formCatalogRouteActor = null;
  return sqlite;
}

const formId = 'public.contact';
const params = { params: Promise.resolve({ formId }) };
const config = { formId, fields: [] };
function request(path: string, body?: unknown, origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const actor = (id: string, role: 'customer' | 'admin' | 'super_admin') => { globalThis.formCatalogRouteActor = { id, role }; };
const count = (sqlite: DatabaseSync, table: string) => Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
function seedPublishedForm(sqlite: DatabaseSync, id: string, config: unknown = { formId: id, fields: [] }) {
  sqlite.prepare(`INSERT INTO form_config_versions
    (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
     updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES (?, ?, 1, 1, 'published', ?, 'Seed', 'sa', 1, 'sa', 1, 'sa', 1, ?)`)
    .run(`published-${id}`, id, JSON.stringify(config), `seed-${id}`);
}

void test('guest, Customer, Admin, and disabled claimed Super Admin cannot manage the catalog', async () => {
  const sqlite = await fixture();
  try {
    const index = await import('../app/api/admin/forms/route');
    const draft = await import('../app/api/admin/forms/[formId]/draft/route');
    for (const [id, role, status] of [[null, null, 401], ['customer', 'customer', 403], ['admin', 'admin', 403], ['disabled', 'super_admin', 403]] as const) {
      globalThis.formCatalogRouteActor = id ? { id, role: role! } : null;
      assert.equal((await index.GET()).status, status);
      assert.equal((await draft.POST(request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 0, reason: 'Try', requestId: `deny-${id}` }), params)).status, status);
    }
    assert.equal(count(sqlite, 'form_config_versions'), 0);
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});

void test('active Super Admin drafts, publishes, lists, reads, and restores with audit preserved', async () => {
  const sqlite = await fixture();
  try {
    actor('sa', 'super_admin');
    const index = await import('../app/api/admin/forms/route');
    const item = await import('../app/api/admin/forms/[formId]/route');
    const draftRoute = await import('../app/api/admin/forms/[formId]/draft/route');
    const publishRoute = await import('../app/api/admin/forms/[formId]/publish/route');
    const restoreRoute = await import('../app/api/admin/forms/[formId]/restore/route');
    const draftResponse = await draftRoute.POST(request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 0, reason: 'Create baseline', requestId: 'route-d1' }), params);
    assert.equal(draftResponse.status, 201);
    const draft = (await draftResponse.json() as { draft: { id: string; revision: number } }).draft;
    assert.equal(draft.revision, 1);
    const publishResponse = await publishRoute.POST(request('/api/admin/forms/public.contact/publish', { draftId: draft.id, expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Approve baseline', requestId: 'route-p1' }), params);
    assert.equal(publishResponse.status, 200);
    const published = (await publishResponse.json() as { published: { version: number } }).published;
    assert.equal(published.version, 1);
    assert.equal((await index.GET()).status, 200);
    const detail = await item.GET(request('/api/admin/forms/public.contact'), params);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json() as { versions: unknown[] }).versions.length, 1);
    const restoredResponse = await restoreRoute.POST(request('/api/admin/forms/public.contact/restore', { sourceVersion: 1, expectedPublishedVersion: 1, reason: 'Reissue baseline', requestId: 'route-r2' }), params);
    assert.equal(restoredResponse.status, 200);
    assert.equal((await restoredResponse.json() as { published: { version: number } }).published.version, 2);
    const audit = sqlite.prepare('SELECT actor_id,action,reason,request_id FROM audit_logs ORDER BY created_at,id').all() as { actor_id: string; action: string; reason: string; request_id: string }[];
    assert.equal(audit.length, 3);
    assert.deepEqual(new Set(audit.map((row) => row.action)), new Set(['form_catalog.draft_created', 'form_catalog.published', 'form_catalog.restored']));
    assert.deepEqual(new Set(audit.map((row) => row.reason)), new Set(['Create baseline', 'Approve baseline', 'Reissue baseline']));
    assert.ok(audit.every((row) => row.actor_id === 'sa'));
  } finally { sqlite.close(); }
});

void test('stale versions conflict; malformed and oversized mutations do not write or audit', async () => {
  const sqlite = await fixture();
  try {
    actor('sa', 'super_admin');
    const draftRoute = await import('../app/api/admin/forms/[formId]/draft/route');
    const publishRoute = await import('../app/api/admin/forms/[formId]/publish/route');
    const initial = await draftRoute.POST(request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 0, reason: 'Initial', requestId: 'validation-d1' }), params);
    const draftId = (await initial.json() as { draft: { id: string } }).draft.id;
    assert.equal((await publishRoute.POST(request('/api/admin/forms/public.contact/publish', { draftId, expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Publish', requestId: 'validation-p1' }), params)).status, 200);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 0, reason: 'Stale', requestId: 'validation-stale' }), params)).status, 409);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 1, reason: 'Missing ID' }), params)).status, 400);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 1, requestId: 'validation-no-reason' }), params)).status, 400);
    const malformed = new Request('http://localhost:3000/api/admin/forms/public.contact/draft', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: '{oops' });
    assert.equal((await draftRoute.POST(malformed, params)).status, 400);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 1, reason: 'Large', requestId: 'validation-large', padding: 'x'.repeat(80_000) }), params)).status, 413);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 1, reason: 'Cross site', requestId: 'validation-cross' }, 'https://evil.example'), params)).status, 403);
    assert.equal(count(sqlite, 'form_config_versions'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 2);
  } finally { sqlite.close(); }
});

void test('public config read reveals no protected IDs and published-only data has no-store', async () => {
  const sqlite = await fixture();
  try {
    const profileId = 'account.profile';
    const params = { params: Promise.resolve({ formId: profileId }) };
    actor('sa', 'super_admin');
    const publicRoute = await import('../app/api/forms/[formId]/route');
    assert.equal((await publicRoute.GET(request('/api/forms/account.profile'), params)).status, 404);
    seedPublishedForm(sqlite, profileId);
    globalThis.formCatalogRouteActor = null;
    const denied = await publicRoute.GET(request('/api/forms/account.profile'), params);
    const unknown = await publicRoute.GET(request('/api/forms/nonexistent'), { params: Promise.resolve({ formId: 'nonexistent' }) });
    assert.equal(denied.status, 404);
    assert.equal(unknown.status, 404);
    const unknownBody = await unknown.text();
    assert.equal(await denied.text(), unknownBody);
    actor('customer', 'customer');
    const allowed = await publicRoute.GET(request('/api/forms/account.profile'), params);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    assert.equal((await allowed.json() as { config: { version: number } }).config.version, 1);
    const staffForm = 'staff.staff-permission-1';
    sqlite.prepare(`INSERT INTO form_config_versions
      (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
       updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('private-published',?,1,1,'published',?,'Seed private','sa',1,'sa',1,'sa',1,'private-seed')`)
      .run(staffForm, JSON.stringify({ formId: staffForm, fields: [] }));
    const protectedParams = { params: Promise.resolve({ formId: staffForm }) };
    assert.equal((await publicRoute.GET(request('/api/forms/staff.staff-permission-1'), protectedParams)).status, 404);
    actor('admin', 'admin');
    assert.equal((await publicRoute.GET(request('/api/forms/staff.staff-permission-1'), protectedParams)).status, 404);
    globalThis.formCatalogRouteActor = null;
    const protectedId = await publicRoute.GET(request('/api/forms/staff.staff-permission-1'), protectedParams);
    assert.equal(protectedId.status, 404);
    assert.equal(await protectedId.text(), unknownBody);
    actor('sa', 'super_admin');
    assert.equal((await publicRoute.GET(request('/api/forms/staff.staff-permission-1'), protectedParams)).status, 200);
  } finally { sqlite.close(); }
});

void test('ordinary Admin cannot read Super Admin staff forms but retains permitted catalog form access', async () => {
  const sqlite = await fixture();
  try {
    const publicRoute = await import('../app/api/forms/[formId]/route');
    for (const formId of ['staff.activity-filter', 'staff.homepage-filter', 'staff.catalog']) {
      sqlite.prepare(`INSERT INTO form_config_versions
        (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
         updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES (?, ?, 1, 1, 'published', ?, 'Seed', 'sa', 1, 'sa', 1, 'sa', 1, ?)`)
        .run(`published-${formId}`, formId, JSON.stringify({ formId, fields: [] }), `seed-${formId}`);
    }
    actor('admin', 'admin');
    for (const formId of ['staff.activity-filter', 'staff.homepage-filter']) {
      const response = await publicRoute.GET(request(`/api/forms/${formId}`), { params: Promise.resolve({ formId }) });
      assert.equal(response.status, 404, formId);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const catalog = await publicRoute.GET(request('/api/forms/staff.catalog'), { params: Promise.resolve({ formId: 'staff.catalog' }) });
    assert.equal(catalog.status, 200);
    sqlite.prepare(`INSERT INTO staff_permission_profiles VALUES ('admin','[]',1,'sa',2)`).run();
    assert.equal((await publicRoute.GET(request('/api/forms/staff.catalog'), { params: Promise.resolve({ formId: 'staff.catalog' }) })).status, 404);
    actor('sa', 'super_admin');
    for (const formId of ['staff.activity-filter', 'staff.homepage-filter']) {
      assert.equal((await publicRoute.GET(request(`/api/forms/${formId}`), { params: Promise.resolve({ formId }) })).status, 200, formId);
    }
  } finally { sqlite.close(); }
});

void test('corrupt stored admin detail config is a service failure, not a bad client request', async () => {
  const sqlite = await fixture();
  try {
    actor('sa', 'super_admin');
    // The current schema rejects malformed JSON. Simulate a corrupt/legacy store
    // response at the D1 boundary to exercise the route's failure classification.
    const realDb = globalThis.formCatalogRouteDb;
    globalThis.formCatalogRouteDb = {
      prepare(sql: string) {
        if (sql.includes('config_json AS configJson')) return {
          bind() { return this; },
          async all() { return { results: [{ configJson: '{broken' }] }; },
        };
        return realDb.prepare(sql);
      },
    } as D1Database;
    const item = await import('../app/api/admin/forms/[formId]/route');
    const response = await item.GET(request('/api/admin/forms/public.contact'), params);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { sqlite.close(); }
});

void test('protected form IDs match unknown IDs during missing binding or authorization read failure', async () => {
  const sqlite = await fixture();
  try {
    const publicRoute = await import('../app/api/forms/[formId]/route');
    const protectedId = 'staff.activity-filter';
    const protectedParams = { params: Promise.resolve({ formId: protectedId }) };
    const unknownParams = { params: Promise.resolve({ formId: 'unknown.form' }) };
    for (const brokenDb of [undefined, { prepare() { throw new Error('DB read failed'); } }]) {
      globalThis.formCatalogRouteDb = brokenDb as unknown as D1Database;
      actor('admin', 'admin');
      const denied = await publicRoute.GET(request(`/api/forms/${protectedId}`), protectedParams);
      const unknown = await publicRoute.GET(request('/api/forms/unknown.form'), unknownParams);
      assert.equal(denied.status, 404);
      assert.equal(unknown.status, 404);
      assert.equal(await denied.text(), await unknown.text());
      assert.equal(denied.headers.get('cache-control'), 'no-store');
      assert.equal(unknown.headers.get('cache-control'), 'no-store');
    }
  } finally { sqlite.close(); }
});

void test('every staff form keeps its page or receiver permission, including return review and mixed rider actions', async () => {
  const sqlite = await fixture();
  try {
    const adminForms = [
      'staff.catalog', 'staff.exception-work', 'staff.governance-rule-create',
      'staff.governance-promotion-create', 'staff.managed-supply-decision',
      'staff.managed-payment-preparation', 'staff.managed-transition-decision',
      'staff.parcel-control', 'staff.payout-1', 'staff.payout-request-action',
      'staff.privacy-action', 'staff.product-classification', 'staff.recorded-progress-filter',
      'staff.rider-control-1', 'staff.delivery-assignment', 'shipping.console-action-staff',
      'staff.return-case-action', 'staff.complaint-case-action', 'staff.cancellation-review',
      'staff.seller-review-action', 'staff.order-fulfillment', 'staff.review-moderation',
      'staff.product-review',
    ];
    const superAdminForms = [
      'staff.activity-filter', 'staff.homepage-filter', 'staff.delivery-rate',
      'staff.governance-incident-create', 'staff.governance-incident-update',
      'staff.governance-backup-verify', 'staff.invoice-adjustment',
      'staff.managed-maker-activation', 'staff.managed-adjustment', 'staff.payout-2',
      'staff.referral-settings', 'staff.rider-control-2', 'commerce.gift-card-issue',
      'staff.homepage-visibility', 'staff.seller-governance',
    ];
    const registered = Object.values(FORM_REGISTRY).filter((form) => form.audience === 'staff').map((form) => form.id).sort();
    assert.deepEqual([...adminForms, ...superAdminForms].sort(), registered);
    for (const formId of registered) seedPublishedForm(sqlite, formId);
    const publicRoute = await import('../app/api/forms/[formId]/route');
    actor('admin', 'admin');
    for (const formId of adminForms) {
      assert.equal((await publicRoute.GET(request(`/api/forms/${formId}`), { params: Promise.resolve({ formId }) })).status, 200, formId);
    }
    for (const formId of superAdminForms) {
      assert.equal((await publicRoute.GET(request(`/api/forms/${formId}`), { params: Promise.resolve({ formId }) })).status, 404, formId);
    }
    actor('sa', 'super_admin');
    for (const formId of superAdminForms) {
      assert.equal((await publicRoute.GET(request(`/api/forms/${formId}`), { params: Promise.resolve({ formId }) })).status, 200, formId);
    }
  } finally { sqlite.close(); }
});

void test('application configs follow guest, customer, and pending participant flows without opening operations', async () => {
  const sqlite = await fixture();
  try {
    for (const formId of ['seller.application', 'seller.maker-profile', 'seller.product-submission',
      'seller.product-filter', 'rider.application', 'rider.report', 'rider.code-verify']) seedPublishedForm(sqlite, formId);
    sqlite.exec(`INSERT INTO seller_profiles VALUES ('pending-seller','pending','submitted');
      INSERT INTO seller_participation_profiles VALUES ('pending-seller','submitted');
      INSERT INTO rider_profiles VALUES ('rider','approved');`);
    const publicRoute = await import('../app/api/forms/[formId]/route');
    const status = async (formId: string) => (await publicRoute.GET(request(`/api/forms/${formId}`), { params: Promise.resolve({ formId }) })).status;
    globalThis.formCatalogRouteActor = null;
    assert.equal(await status('seller.application'), 200);
    assert.equal(await status('rider.application'), 404);
    actor('customer', 'customer');
    assert.equal(await status('rider.application'), 200);
    assert.equal(await status('seller.maker-profile'), 404);
    assert.equal(await status('seller.product-submission'), 404);
    assert.equal(await status('rider.report'), 404);
    actor('pending', 'customer');
    assert.equal(await status('seller.maker-profile'), 200);
    assert.equal(await status('seller.product-submission'), 200);
    assert.equal(await status('seller.product-filter'), 404);
    assert.equal(await status('rider.report'), 404);
    actor('rider', 'customer');
    assert.equal(await status('rider.report'), 200);
    assert.equal(await status('rider.code-verify'), 200);
    assert.equal(await status('rider.application'), 404);
  } finally { sqlite.close(); }
});

void test('persisted syntax errors in all catalog mutations are service failures and never audit', async () => {
  const sqlite = await fixture();
  try {
    actor('sa', 'super_admin');
    const realDb = globalThis.formCatalogRouteDb;
    globalThis.formCatalogRouteDb = {
      prepare(sql: string) {
        if (sql.includes('form_config_versions')) throw new SyntaxError('Stored config JSON is corrupt');
        return realDb.prepare(sql);
      },
    } as D1Database;
    const draftRoute = await import('../app/api/admin/forms/[formId]/draft/route');
    const publishRoute = await import('../app/api/admin/forms/[formId]/publish/route');
    const restoreRoute = await import('../app/api/admin/forms/[formId]/restore/route');
    const actions = [
      draftRoute.POST(request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 0, reason: 'Draft', requestId: 'corrupt-d' }), params),
      publishRoute.POST(request('/api/admin/forms/public.contact/publish', { draftId: 'old-draft', expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Publish', requestId: 'corrupt-p' }), params),
      restoreRoute.POST(request('/api/admin/forms/public.contact/restore', { sourceVersion: 1, expectedPublishedVersion: 0, reason: 'Restore', requestId: 'corrupt-r' }), params),
    ];
    for (const response of await Promise.all(actions)) assert.equal(response.status, 503);
    assert.equal(count(sqlite, 'form_config_versions'), 0);
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});

void test('admin detail rejects parseable but invalid stored configuration as unavailable', async () => {
  const sqlite = await fixture();
  try {
    actor('sa', 'super_admin');
    seedPublishedForm(sqlite, formId, { formId, fields: 'not-an-array' });
    const item = await import('../app/api/admin/forms/[formId]/route');
    const response = await item.GET(request('/api/admin/forms/public.contact'), params);
    assert.equal(response.status, 503);
  } finally { sqlite.close(); }
});

void test('parseable invalid stored config blocks draft and restore with 503 and no audit', async () => {
  for (const action of ['draft', 'restore'] as const) {
    const sqlite = await fixture();
    try {
      actor('sa', 'super_admin');
      seedPublishedForm(sqlite, formId, { formId: 'wrong.form', fields: [] });
      const response = action === 'draft'
        ? await (await import('../app/api/admin/forms/[formId]/draft/route')).POST(
          request('/api/admin/forms/public.contact/draft', { config, expectedPublishedVersion: 1,
            reason: 'Draft with corrupt history', requestId: 'bad-history-draft' }), params)
        : await (await import('../app/api/admin/forms/[formId]/restore/route')).POST(
          request('/api/admin/forms/public.contact/restore', { sourceVersion: 1, expectedPublishedVersion: 1,
            reason: 'Restore corrupt source', requestId: 'bad-source-restore' }), params);
      assert.equal(response.status, 503, action);
      assert.equal(count(sqlite, 'form_config_versions'), 1);
      assert.equal(count(sqlite, 'audit_logs'), 0);
    } finally { sqlite.close(); }
  }
});

void test('parseable invalid stored draft blocks publish with 503 and no audit', async () => {
  const sqlite = await fixture();
  try {
    actor('sa', 'super_admin');
    sqlite.prepare(`INSERT INTO form_config_versions
      (id,form_id,version,revision,status,config_json,reason,created_by,created_at,
       updated_by,updated_at,last_request_id)
      VALUES ('invalid-draft',?,1,1,'draft',?,'Seed','sa',1,'sa',1,'seed-invalid-draft')`)
      .run(formId, JSON.stringify({ formId: 'wrong.form', fields: [] }));
    const route = await import('../app/api/admin/forms/[formId]/publish/route');
    const response = await route.POST(request('/api/admin/forms/public.contact/publish', {
      draftId: 'invalid-draft', expectedDraftRevision: 1, expectedPublishedVersion: 0,
      reason: 'Publish corrupt draft', requestId: 'invalid-draft-publish',
    }), params);
    assert.equal(response.status, 503);
    assert.equal(sqlite.prepare('SELECT status FROM form_config_versions WHERE id = ?').get('invalid-draft')?.status, 'draft');
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});

void test('well-formed draft conflicting with historical field identity remains a 409 client conflict', async () => {
  const { catalogError } = await import('../app/api/admin/forms/route');
  const { FormCatalogConflictError } = await import('../lib/db/repositories/form-catalog');
  const response = catalogError(new FormCatalogConflictError(
    'Historical fields must retain their identity and type; archive them to stop collection.'));
  assert.equal(response.status, 409);
});

const universalFormIds = [
  'identity.register', 'identity.login-password', 'identity.email-code-request',
  'identity.email-code-verify', 'identity.password-reset-request', 'identity.password-reset-complete',
  'account.profile', 'account.address', 'account.daily-reward', 'account.points-redemption',
  'catalog.header-search', 'catalog.filters', 'commerce.order-tracking', 'seller.product-filter',
  'staff.homepage-filter', 'staff.activity-filter', 'staff.recorded-progress-filter',
  'commerce.add-to-cart', 'commerce.promo-quote', 'commerce.gift-card-redeem',
  'system.local-testing-role', 'staff.staff-invitation', 'staff.staff-permission-1',
  'staff.staff-permission-2', 'rider.code-verify', 'staff.homepage-hero-manager',
  'staff.homepage-occasion-manager', 'staff.homepage-visibility', 'staff.business-settings-manager',
  'staff.delivery-rate', 'staff.promo-code', 'staff.loyalty-settings', 'staff.referral-settings',
] as const;

void test('catalog simplification lists business forms with friendly names and excludes universal controls', async () => {
  const sqlite = await fixture();
  try {
    actor('sa', 'super_admin');
    seedPublishedForm(sqlite, 'seller.application');
    seedPublishedForm(sqlite, 'account.profile');
    const index = await import('../app/api/admin/forms/route');
    const response = await index.GET();
    assert.equal(response.status, 200);
    const { forms } = await response.json() as { forms: { definition: { id: string }; presentation: { label: string; category: string }; publishedVersion: number }[] };
    const byId = new Map(forms.map((entry) => [entry.definition.id, entry]));
    for (const id of universalFormIds) assert.equal(byId.has(id), false, id);
    for (const id of ['commerce.checkout', 'public.contact', 'public.feedback', 'public.footer-feedback',
      'commerce.return-request', 'commerce.order-cancellation', 'commerce.complaint',
      'seller.application', 'seller.maker-profile', 'seller.profile', 'seller.product-submission',
      'rider.application', 'rider.report', 'seller.managed-supply-proposal', 'seller.payout-request',
      'staff.catalog', 'staff.product-classification', 'staff.rider-control-1', 'staff.rider-control-2',
      'commerce.gift-card-issue', 'staff.governance-rule-create']) assert.ok(byId.has(id), id);
    assert.equal(byId.get('seller.application')?.presentation.label, 'Seller application');
    assert.equal(byId.get('seller.application')?.presentation.category, 'Applications & business profiles');
    assert.equal(byId.get('seller.application')?.publishedVersion, 1);
    assert.equal(count(sqlite, 'form_config_versions'), 2);
  } finally { sqlite.close(); }
});

void test('catalog simplification prevents draft publish and restore for universal forms while preserving history and runtime reads', async () => {
  const sqlite = await fixture();
  try {
    actor('sa', 'super_admin');
    seedPublishedForm(sqlite, 'account.profile');
    const draftRoute = await import('../app/api/admin/forms/[formId]/draft/route');
    const publishRoute = await import('../app/api/admin/forms/[formId]/publish/route');
    const restoreRoute = await import('../app/api/admin/forms/[formId]/restore/route');
    for (const id of universalFormIds) {
      const context = { params: Promise.resolve({ formId: id }) };
      const common = { expectedPublishedVersion: id === 'account.profile' ? 1 : 0,
        reason: 'Try modifying universal feature', requestId: `blocked-${id}` };
      for (const [action, route, body] of [
        ['draft', draftRoute, { ...common, config: { formId: id, fields: [] } }],
        ['publish', publishRoute, { ...common, draftId: 'old-draft', expectedDraftRevision: 1 }],
        ['restore', restoreRoute, { ...common, sourceVersion: 1 }],
      ] as const) {
        const response = await route.POST(request(`/api/admin/forms/${id}/${action}`, body), context);
        assert.equal(response.status, 403, `${id}/${action}`);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
    }
    const item = await import('../app/api/admin/forms/[formId]/route');
    const profileParams = { params: Promise.resolve({ formId: 'account.profile' }) };
    const detail = await item.GET(request('/api/admin/forms/account.profile'), profileParams);
    assert.equal(detail.status, 200);
    const history = await detail.json() as { versions: { version: number }[]; editable: boolean };
    assert.equal(history.versions[0].version, 1);
    assert.equal(history.editable, false);
    actor('customer', 'customer');
    const runtime = await import('../app/api/forms/[formId]/route');
    const response = await runtime.GET(request('/api/forms/account.profile'), profileParams);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { config: { version: number } }).config.version, 1);
    assert.equal(count(sqlite, 'form_config_versions'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 0);
  } finally { sqlite.close(); }
});
