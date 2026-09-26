import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';

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
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
      subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT, request_id TEXT,
      ip_hash TEXT, created_at INTEGER);
    INSERT INTO users VALUES ('sa','sa-subject','active'),('admin','admin-subject','active'),
      ('customer','customer-subject','active'),('disabled','disabled-subject','disabled');
    INSERT INTO user_roles VALUES ('sa','super_admin'),('admin','admin'),('customer','customer'),('disabled','super_admin');`);
  const migration = await readFile(new URL('../drizzle/0056_form_catalog.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  globalThis.formCatalogRouteDb = new Database(sqlite) as unknown as D1Database;
  globalThis.formCatalogRouteActor = null;
  return sqlite;
}

const formId = 'account.profile';
const params = { params: Promise.resolve({ formId }) };
const config = { formId, fields: [] };
function request(path: string, body?: unknown, origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const actor = (id: string, role: 'customer' | 'admin' | 'super_admin') => { globalThis.formCatalogRouteActor = { id, role }; };
const count = (sqlite: DatabaseSync, table: string) => Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);

void test('guest, Customer, Admin, and disabled claimed Super Admin cannot manage the catalog', async () => {
  const sqlite = await fixture();
  try {
    const index = await import('../app/api/admin/forms/route');
    const draft = await import('../app/api/admin/forms/[formId]/draft/route');
    for (const [id, role, status] of [[null, null, 401], ['customer', 'customer', 403], ['admin', 'admin', 403], ['disabled', 'super_admin', 403]] as const) {
      globalThis.formCatalogRouteActor = id ? { id, role: role! } : null;
      assert.equal((await index.GET()).status, status);
      assert.equal((await draft.POST(request('/api/admin/forms/account.profile/draft', { config, expectedPublishedVersion: 0, reason: 'Try', requestId: `deny-${id}` }), params)).status, status);
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
    const draftResponse = await draftRoute.POST(request('/api/admin/forms/account.profile/draft', { config, expectedPublishedVersion: 0, reason: 'Create baseline', requestId: 'route-d1' }), params);
    assert.equal(draftResponse.status, 201);
    const draft = (await draftResponse.json() as { draft: { id: string; revision: number } }).draft;
    assert.equal(draft.revision, 1);
    const publishResponse = await publishRoute.POST(request('/api/admin/forms/account.profile/publish', { draftId: draft.id, expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Approve baseline', requestId: 'route-p1' }), params);
    assert.equal(publishResponse.status, 200);
    const published = (await publishResponse.json() as { published: { version: number } }).published;
    assert.equal(published.version, 1);
    assert.equal((await index.GET()).status, 200);
    const detail = await item.GET(request('/api/admin/forms/account.profile'), params);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json() as { versions: unknown[] }).versions.length, 1);
    const restoredResponse = await restoreRoute.POST(request('/api/admin/forms/account.profile/restore', { sourceVersion: 1, expectedPublishedVersion: 1, reason: 'Reissue baseline', requestId: 'route-r2' }), params);
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
    const initial = await draftRoute.POST(request('/api/admin/forms/account.profile/draft', { config, expectedPublishedVersion: 0, reason: 'Initial', requestId: 'validation-d1' }), params);
    const draftId = (await initial.json() as { draft: { id: string } }).draft.id;
    assert.equal((await publishRoute.POST(request('/api/admin/forms/account.profile/publish', { draftId, expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Publish', requestId: 'validation-p1' }), params)).status, 200);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/account.profile/draft', { config, expectedPublishedVersion: 0, reason: 'Stale', requestId: 'validation-stale' }), params)).status, 409);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/account.profile/draft', { config, expectedPublishedVersion: 1, reason: 'Missing ID' }), params)).status, 400);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/account.profile/draft', { config, expectedPublishedVersion: 1, requestId: 'validation-no-reason' }), params)).status, 400);
    const malformed = new Request('http://localhost:3000/api/admin/forms/account.profile/draft', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: '{oops' });
    assert.equal((await draftRoute.POST(malformed, params)).status, 400);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/account.profile/draft', { config, expectedPublishedVersion: 1, reason: 'Large', requestId: 'validation-large', padding: 'x'.repeat(80_000) }), params)).status, 413);
    assert.equal((await draftRoute.POST(request('/api/admin/forms/account.profile/draft', { config, expectedPublishedVersion: 1, reason: 'Cross site', requestId: 'validation-cross' }, 'https://evil.example'), params)).status, 403);
    assert.equal(count(sqlite, 'form_config_versions'), 1);
    assert.equal(count(sqlite, 'audit_logs'), 2);
  } finally { sqlite.close(); }
});

void test('public config read reveals no protected IDs and published-only data has no-store', async () => {
  const sqlite = await fixture();
  try {
    actor('sa', 'super_admin');
    const draftRoute = await import('../app/api/admin/forms/[formId]/draft/route');
    const publishRoute = await import('../app/api/admin/forms/[formId]/publish/route');
    const publicRoute = await import('../app/api/forms/[formId]/route');
    const draft = await draftRoute.POST(request('/api/admin/forms/account.profile/draft', { config, expectedPublishedVersion: 0, reason: 'Private draft', requestId: 'private-d1' }), params);
    assert.equal((await publicRoute.GET(request('/api/forms/account.profile'), params)).status, 404);
    const draftId = (await draft.json() as { draft: { id: string } }).draft.id;
    await publishRoute.POST(request('/api/admin/forms/account.profile/publish', { draftId, expectedDraftRevision: 1, expectedPublishedVersion: 0, reason: 'Private publish', requestId: 'private-p1' }), params);
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
