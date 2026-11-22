import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { completeVersionFixture } from './helpers/complete-version-fixture';

declare global { var nativeCatalogDatabase: D1Database; var nativeCatalogActor: string | null; }
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.nativeCatalogDatabase}}', shortCircuit: true };
  if (specifier === '@/app/auth') return { url: 'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.nativeCatalogActor?{userId:globalThis.nativeCatalogActor,email:"reviewer@local.hastabazaar.test"}:null};export async function requireAuthenticatedUser(){return getAuthenticatedUser()}', shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function redirect(){throw new Error("Unexpected page redirect")}', shortCircuit: true };
  return nextResolve(specifier, context);
} });

void test('native task extensions require explicit retained mode and original published field identities through actual catalog APIs', async () => {
  const f = await completeVersionFixture();
  try {
    globalThis.nativeCatalogDatabase = f.db; globalThis.nativeCatalogActor = 'reviewer';
    const formId = 'staff.payout-request-action';
    const field = { id: 'legacy_context', key: 'legacy_context', label: 'Original review context', type: 'short_text', required: true, status: 'active', order: 1 };
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES('native-extension-origin',?,1,1,'published',?,'Historical fixture','reviewer',1,'reviewer',1,'reviewer',1,'native-extension-origin')`).run(formId, JSON.stringify({ formId, fields: [field] }));
    const draft = await import('../app/api/admin/forms/[formId]/draft/route');
    const publish = await import('../app/api/admin/forms/[formId]/publish/route');
    const context = { params: Promise.resolve({ formId }) };
    function request(action: string, body: unknown, retained = true) { return new Request(`http://localhost:3018/api/admin/forms/${formId}/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3018', ...(retained ? { 'X-Hastabazaar-Form-Mode': 'retained-extension' } : {}) }, body: JSON.stringify(body),
    }); }
    const input = { requestId: 'retained-native-save', reason: 'Retain original task context with clearer wording', expectedPublishedVersion: 1,
      retainedReview: { purpose: 'Independent staff need the original review context when reading the native payout request.', ownerId: 'reviewer' },
      config: { formId, fields: [{ ...field, label: 'Clearer review context' }] } };
    assert.equal((await draft.POST(request('draft', input, false), context)).status, 403, 'The generic editor cannot customize a native task.');
    assert.equal((await draft.POST(request('draft', { ...input, requestId: 'undocumented-native-question', retainedReview: undefined }), context)).status, 400,
      'An existing question needs an explicit purpose and real responsible maintainer before review.');
    assert.equal((await draft.POST(request('draft', { ...input, requestId: 'invented-question-maintainer', retainedReview: { ...input.retainedReview, ownerId: 'customer' } }), context)).status, 400);
    const saved = await draft.POST(request('draft', input), context);
    assert.equal(saved.status, 201, await saved.clone().text());
    const result = await saved.json() as { draft: { id: string; revision: number } };
    const arbitrary = await draft.POST(request('draft', { ...input, requestId: 'invented-native-question',
      draftId: result.draft.id, expectedDraftRevision: result.draft.revision,
      config: { formId, fields: [...input.config.fields, { ...field, id: 'invented', key: 'invented' }] } }), context);
    assert.equal(arbitrary.status, 400, 'Explicit mode never authorizes a new arbitrary question.');
    assert.equal(f.sqlite.prepare('SELECT revision FROM form_config_versions WHERE id=?').get(result.draft.id)?.revision, result.draft.revision);
    const published = await publish.POST(request('publish', { requestId: 'retained-native-publish', reason: 'Publish retained context wording only',
      retainedReview: input.retainedReview,
      expectedPublishedVersion: 1, draftId: result.draft.id, expectedDraftRevision: result.draft.revision }), context);
    assert.equal(published.status, 200, await published.clone().text());
    assert.equal(f.sqlite.prepare("SELECT config_json FROM form_config_versions WHERE id='native-extension-origin'").get()?.config_json, JSON.stringify({ formId, fields: [field] }));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id=? AND status='published'").get(formId)?.n, 2);
    globalThis.nativeCatalogActor = 'delegate';
    assert.equal((await draft.POST(request('draft', { ...input, requestId: 'delegated-extension-attempt' }), context)).status, 403, 'Native current staff roles remain authoritative.');
  } finally { globalThis.nativeCatalogActor = null; f.dispose(); }
});
