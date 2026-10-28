import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { legalProcedureFixture } from './helpers/legal-procedure-fixture';

const context = { db: null as D1Database | null, subject: null as string | null };
(globalThis as typeof globalThis & { legalRouteContext: typeof context }).legalRouteContext = context;
registerHooks({ resolve(specifier, ctx, next) {
  const stubs: Record<string, string> = {
    'cloudflare:workers': 'export const env={get DB(){return globalThis.legalRouteContext.db}}',
    'next/headers': 'export async function headers(){const id=globalThis.legalRouteContext.subject;return new Headers({host:"localhost:3018",...(id?{cookie:"hastabazaar_session=fixture-"+id}:{})})}',
    'next/navigation': 'export function redirect(path){throw new Error("redirect:"+path)}',
  };
  return stubs[specifier] ? { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true } : next(specifier, ctx);
} });

const origin = 'http://localhost:3018', path = '/api/admin/legal-procedures';
const request = (body: unknown, headers: Record<string, string> = {}) => new Request(origin + path,
  { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
async function setup() {
  const f = await legalProcedureFixture(); context.db = f.db; context.subject = 'legal-super-subject';
  const route = await import('../app/api/admin/legal-procedures/route');
  const initial = await route.GET(new Request(origin + path));
  assert.equal(initial.status,200,'Fixture has a current authorized session');
  const { current } = await initial.json() as { current: { revision: number; sha256: string; sections: {id: string; body: string}[] } };
  const data = { expectedRevision: current.revision, expectedSha256: current.sha256, sections: current.sections,
    reason: 'Refresh the draft for review.', requestId: crypto.randomUUID() };
  return { ...f, route, data, close() { context.db = null; context.subject = null; f.dispose(); } };
}
void test('real current identity controls page, draft reads and saves without staff bootstrap writes', async () => {
  const f = await setup();
  try {
    const { requireLegalDraftPage } = await import('../lib/legal-procedures/access');
    const before = f.fingerprint();
    for (const [subject, status] of [[null, 401], ['legal-admin-subject', 403], ['legal-customer-subject', 403],
      ['legal-disabled-subject', 401], ['new-unregistered-subject', 401]] as const) {
      context.subject = subject;
      assert.equal((await f.route.GET(new Request(origin + path))).status, status);
      assert.equal((await f.route.POST(request(f.data))).status, status);
      await assert.rejects(() => requireLegalDraftPage(), /redirect:/);
    }
    context.subject = 'legal-super-subject';
    assert.equal((await requireLegalDraftPage()).actor.id, 'legal-super');
    assert.equal((await f.route.POST(request(f.data))).status, 200);
    assert.equal(f.fingerprint(), before, 'No account, permission, financial or agreement row may change');
    f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='legal-super'").run();
    assert.equal((await f.route.POST(request({ ...f.data, requestId: crypto.randomUUID() }))).status, 403);
  } finally { f.close(); }
});

void test('legal draft authorization does not touch old sessions or lazily link account identities', async () => {
  const f = await setup();
  try {
    f.sqlite.prepare('UPDATE user_sessions SET last_seen_at=1').run();
    const before = f.fingerprint();
    assert.equal((await f.route.GET(new Request(origin + path))).status, 401,'Expired Admin sessions are rejected without touching them');
    assert.equal(f.fingerprint(), before);
    f.sqlite.prepare("UPDATE users SET auth_subject=NULL WHERE id='legal-super'").run();
    const unlinked = f.fingerprint();
    assert.equal((await f.route.GET(new Request(origin + path))).status, 401);
    assert.equal(f.fingerprint(), unlinked);
  } finally { f.close(); }
});
void test('promotion after reading a customer session cannot bypass staff MFA on legal procedures',async()=>{
  const f=await setup();
  try{
    context.subject='legal-customer-subject';
    const prepare=f.db.prepare.bind(f.db);
    f.db.prepare=((sql:string)=>{
      const statement=prepare(sql);
      if(sql.includes('FROM user_sessions')){
        const first=statement.first.bind(statement);
        statement.first=async<T>(column?:string)=>{
          const value=column===undefined?await first<T>():await first<T>(column);
          f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES ('legal-customer','super_admin',1)").run();
          return value;
        };
      }
      return statement;
    }) as D1Database['prepare'];
    assert.equal((await f.route.GET(new Request(origin+path))).status,403);
    assert.ok(f.sqlite.prepare("SELECT 1 FROM user_roles WHERE user_id='legal-customer' AND role='super_admin'").get(),'The promotion race was exercised');
  }finally{f.close();}
});
void test('origin, size, malformed and unsupported publication inputs fail without an append', async () => {
  const f = await setup();
  try {
    const beforeCount = (f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get() as {n:number}).n;
    const deniedHeaders: Record<string, string>[] = [{ origin: 'https://evil.test' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' },
      { origin: '', 'x-forwarded-host': 'localhost:3018' },
      { origin: 'https://evil.test', 'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'https' }];
    for (const headers of deniedHeaders)
      assert.equal((await f.route.POST(request(f.data, headers))).status, 403);
    assert.equal((await f.route.POST(new Request(origin + path, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(f.data) }))).status, 403);
    assert.equal((await f.route.POST(request({ ...f.data, status: 'published' }))).status, 400);
    assert.equal((await f.route.POST(new Request(origin + path, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' }))).status, 400);
    const oversized = new Request(origin + path, { method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ ...f.data, reason: 'अ'.repeat(70_000) }) });
    assert.equal((await f.route.POST(oversized)).status, 413);
    assert.equal((await f.route.POST(request(f.data, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal((f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get() as {n:number}).n, beforeCount);
  } finally { f.close(); }
});
void test('save, exact retry, stale conflict and read-only historical retrieval use private responses', async () => {
  const f = await setup();
  try {
    const response = await f.route.POST(request(f.data)); assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    const saved = await response.json();
    assert.deepEqual(await (await f.route.POST(request(f.data))).json(), saved);
    assert.equal((await f.route.POST(request({ ...f.data, requestId: crypto.randomUUID() }))).status, 409);
    const history = await f.route.GET(new Request(origin + path + '?revision=1'));
    assert.equal(history.status, 200); assert.deepEqual((await history.json() as {version:unknown}).version, (saved as {saved:unknown}).saved);
    assert.equal((await f.route.GET(new Request(origin + path + '?revision=987'))).status, 404);
    for (const query of ['?revision=-1', '?revision=1&revision=2', '?publish=true', '?beforeRevision=0'])
      assert.equal((await f.route.GET(new Request(origin + path + query))).status, 400);
  } finally { f.close(); }
});

void test('a valid long Nepali draft fits the advertised character limit', async () => {
  const f = await setup();
  try {
    const data = { ...f.data, sections: f.data.sections.map(s => ({ ...s, body: 'अ'.repeat(4000) })) };
    assert.equal((await f.route.POST(request(data))).status, 200);
  } finally { f.close(); }
});
