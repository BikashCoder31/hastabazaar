import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { legalProcedureFixture } from './helpers/legal-procedure-fixture';
import { getLegalDraftWorkspace, saveLegalDraft } from '../lib/legal-procedures/repository';
import type { LegalControlWorkspace, LegalControlEvent } from '../lib/legal-procedures/lifecycle-model';

const context = { db: null as D1Database | null, subject: null as string | null };
(globalThis as typeof globalThis & { legalControlRouteContext: typeof context }).legalControlRouteContext = context;
registerHooks({ resolve(specifier, ctx, next) {
  const stubs: Record<string, string> = {
    'cloudflare:workers': 'export const env={get DB(){return globalThis.legalControlRouteContext.db}}',
    'next/headers': 'export async function headers(){const id=globalThis.legalControlRouteContext.subject;return new Headers({host:"localhost:3018",...(id?{cookie:"hastabazaar_session=fixture-"+id}:{})})}',
    'next/navigation': 'export function redirect(path){throw new Error("redirect:"+path)}',
  };
  return stubs[specifier] ? { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true } : next(specifier, ctx);
} });
const origin = 'http://localhost:3018';
const url = origin + '/api/admin/legal-procedures/control';
const post = (body: unknown, originValue = origin) => new Request(url, { method: 'POST',
  headers: { origin: originValue, 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function fixture() {
  const access = await import('../lib/legal-procedures/access');
  assert.equal(typeof access.requireLegalProcedureReaderApi, 'function', 'Staff need an active-only read path without management authority.');
  const f = await legalProcedureFixture(); context.db = f.db; context.subject = 'legal-super-subject';
  const control = await import('../app/api/admin/legal-procedures/control/route');
  const active = await import('../app/api/admin/legal-procedures/active/route');
  const { current } = await getLegalDraftWorkspace(f.db);
  const saved = await saveLegalDraft(f.db, f.actor, { expectedRevision: current.revision, expectedSha256: current.sha256,
    sections: current.sections, reason: 'Save the procedure to exercise real handlers.', requestId: crypto.randomUUID() }, Date.now() - 1000);
  return { ...f, control, active, saved, close() { context.db = null; context.subject = null; f.dispose(); } };
}
function action(state: { sequence: number; sha256: string }, document: { revision: number; sha256: string }, operation = 'approve', approvalSequence: number | null = null) {
  return { operation, expectedSequence: state.sequence, expectedSha256: state.sha256,
    revision: document.revision, documentSha256: document.sha256, approvalSequence, effectiveFrom: null,
    confirmed: true, reason: 'Approve and activate the reviewed internal procedure.', requestId: crypto.randomUUID() };
}
void test('real handlers reserve management for Super Admin and expose only active procedures to authorized staff', async () => {
  const f = await fixture();
  try {
    const before = f.fingerprint();
    for (const [subject, managerStatus, readerStatus] of [[null, 401, 401], ['legal-admin-subject', 403, 200],
      ['legal-customer-subject', 403, 403], ['legal-disabled-subject', 401, 401], ['legal-super-subject', 200, 200]] as const) {
      context.subject = subject;
      assert.equal((await f.control.GET(new Request(url))).status, managerStatus);
      assert.equal((await f.control.POST(post({}))).status, managerStatus === 200 ? 400 : managerStatus);
      const response = await f.active.GET(new Request(origin + '/api/admin/legal-procedures/active'));
      assert.equal(response.status, readerStatus);
      assert.match(response.headers.get('cache-control')!, /no-store/);
      if (readerStatus === 200) assert.deepEqual(await response.json(), { active: null });
    }
    assert.equal(f.fingerprint(), before, 'Authorization must not bootstrap users, change sessions or grant access.');
    context.subject = 'legal-super-subject';
    let state = await (await f.control.GET(new Request(url))).json() as LegalControlWorkspace;
    let response = await f.control.POST(post(action(state, f.saved)));
    assert.equal(response.status, 200); state = (await response.json() as { control: LegalControlWorkspace }).control;
    assert.equal(state.active, null);
    response = await f.control.POST(post(action(state, f.saved, 'activate', state.approval!.sequence)));
    assert.equal(response.status, 200);
    context.subject = 'legal-admin-subject';
    const reader = await f.active.GET(new Request(origin + '/api/admin/legal-procedures/active'));
    const data = await reader.json() as { active: LegalControlEvent };
    assert.equal(data.active.document.sha256, f.saved.sha256);
    assert.equal(Object.hasOwn(data, 'history'), false); assert.equal(Object.hasOwn(data, 'approval'), false);
    const download = await f.active.GET(new Request(origin + '/api/admin/legal-procedures/active?download=1'));
    assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition')!, /attachment/);
    assert.match(await download.text(), /Internal operating procedure/);
    assert.equal(f.fingerprint(), before);
  } finally { f.close(); }
});

void test('control handler rejects cross-site, malformed, oversized, forged and stale actions', async () => {
  const f = await fixture();
  try {
    const state = await (await f.control.GET(new Request(url))).json() as LegalControlWorkspace, data = action(state, f.saved);
    for (const originValue of ['', 'null', 'https://evil.test'])
      assert.equal((await f.control.POST(post(data, originValue))).status, 403);
    for (const bad of [{ ...data, actorId: 'forged' }, { ...data, confirmed: false }, { ...data, operation: 'publish_public_terms' }])
      assert.equal((await f.control.POST(post(bad))).status, 400);
    assert.equal((await f.control.POST(new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' }))).status, 400);
    assert.equal((await f.control.POST(post({ ...data, reason: 'अ'.repeat(80_000) }))).status, 413);
    assert.equal((await f.control.POST(post(data))).status, 200);
    assert.equal((await f.control.POST(post({ ...data, requestId: crypto.randomUUID() }))).status, 409);
    for (const query of ['?sequence=0', '?sequence=1&sequence=2', '?publish=1', '?beforeSequence=-1'])
      assert.equal((await f.control.GET(new Request(url + query))).status, 400);
    context.subject = 'legal-admin-subject';
    f.sqlite.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('legal-admin','[]',1,'legal-super',1)").run();
    assert.equal((await f.active.GET(new Request(origin + '/api/admin/legal-procedures/active'))).status, 403);
  } finally { f.close(); }
});
