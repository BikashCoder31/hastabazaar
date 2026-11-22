import { fixtureWithOverrides } from './helpers/fixture-delegation';
import { fakeProviderMail } from './helpers/fake-provider-mail';
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { setFormCompatibility, allowsPreviousFormVersion } from '../lib/forms/compatibility';
import { validateFormDraft } from '../lib/forms/validation';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { buildFormAnswerInsert } from '../lib/db/repositories/form-answers';
import { listNotifications } from '../lib/db/repositories/operations';
import { deliverBusinessEmails as actualDeliverBusinessEmails } from '../lib/operations/business-notifications';

declare global {
  var compatibilityApiDb: D1Database;
  var compatibilityApiActor: { id: string; role: 'admin'|'super_admin' } | null;
}
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={get DB(){return globalThis.compatibilityApiDb}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){if(!globalThis.compatibilityApiActor)throw new StaffAuthorizationError("Sign in required",401);return globalThis.compatibilityApiActor}', shortCircuit: true };
  return next(specifier, context);
} });

async function fixture(required = false) {
  const f = await completeVersionFixture();
  f.sqlite.exec('DELETE FROM notification_messages');
  const formId = 'seller.product-submission';
  const before = validateFormDraft(formId, { formId, fields: [{ id: 'packing_note', key: 'packing_note', label: 'Packing note',
    type: 'short_text', required: false, status: 'active', order: 1 }] }).fields;
  const after = before.map(field => ({ ...field, label: 'Note about packing', required }));
  for (const [version, fields] of [[1, before], [2, after]] as const) {
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES(?,?,?,1,'published',?,'Fictional publication','reviewer',1,'reviewer',1,'reviewer',1,?)`)
      .run(`policy-${version}`, formId, version, JSON.stringify({ formId, fields }), `policy-publish-${version}`);
  }
  const input = { formId, fromVersion: 1, toVersion: 2, actorId: 'reviewer', requestId: 'review-wording', expectedRevision: 'policy-2',
    reason: 'Reviewed the two prompts: both ask only for packing instructions.', mode: 'review_equivalent' as const, now: f.now };
  return { ...f, before, after, input };
}

void test('only an eligible Super Admin can explicitly review equivalent wording with bounded expiry and exact retry', async () => {
  const f = await fixture();
  try {
    const check = { ...f.input, before: f.before, after: f.after };
    assert.equal(await allowsPreviousFormVersion(f.db, check), false);
    await assert.rejects(setFormCompatibility(f.db, { ...f.input, actorId: 'delegate' }), /permission/i);
    await Promise.all([setFormCompatibility(f.db, f.input), setFormCompatibility(f.db, f.input)]);
    await setFormCompatibility(f.db, { ...f.input, now: f.now + 1000 });
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.form.compatibility.changed' AND recipient_user_id='reviewer'").get()?.n, 2);
    assert.equal(await allowsPreviousFormVersion(f.db, check), true);
    assert.equal(await allowsPreviousFormVersion(f.db, { ...check, now: f.now + 86_400_000 }), false);
    assert.equal(await allowsPreviousFormVersion(f.db, { ...check, after: f.after.map(field => ({ ...field, required: true })) }), false);
    await assert.rejects(setFormCompatibility(f.db, { ...f.input, reason: 'Different meaning' }), /different command|conflict/i);
    await setFormCompatibility(f.db, { ...f.input, mode: 'require_current', requestId: 'revoke-wording', reason: 'The preceding wording must no longer be accepted.' });
    assert.equal(await allowsPreviousFormVersion(f.db, check), false);
    assert.equal(await allowsPreviousFormVersion(f.db, { ...check, after: f.before }), false, 'Explicit revocation also overrides automatic cosmetic equivalence');
    assert.equal((await listNotifications(f.db, 'reviewer', 100, 'staff')).filter(row => row.relatedType === 'form_configuration').length, 1);
    const delivery = await deliverBusinessEmails(f.db, { send: async () => {} }, 'https://example.test', { now: f.now + 1 });
    assert.equal(delivery.accepted, 1);
    assert.equal(delivery.cancelled, 1);
  } finally { f.dispose(); }
});

void test('wording review cannot waive structural requirements or commit after role revocation', async () => {
  const structural = await fixture(true);
  try {
    await assert.rejects(setFormCompatibility(structural.db, structural.input), /cannot be waived/);
    await assert.rejects(setFormCompatibility(structural.db, { ...structural.input, formId: 'staff.payout-1' }), /not eligible/);
    assert.equal(structural.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='form.compatibility.granted'").get()?.n, 0);
  } finally { structural.dispose(); }
  const revoked = await fixture();
  try {
    const db = fixtureWithOverrides(revoked.db, {async batch<T>(statements: D1PreparedStatement[]) {
      revoked.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer'");
      return revoked.db.batch<T>(statements);
    }}) as D1Database;
    await assert.rejects(setFormCompatibility(db, revoked.input), /conflict/i);
    assert.equal(revoked.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'form.compatibility.%'").get()?.n, 0);
    assert.equal(revoked.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()?.n, 0);
  } finally { revoked.dispose(); }
});

void test('actual compatibility endpoint authorizes reads and writes, rejects foreign origins and recovers exact requests', async () => {
  const f = await fixture();
  try {
    globalThis.compatibilityApiDb = f.db;
    globalThis.compatibilityApiActor = { id: 'delegate', role: 'admin' };
    const api = await import('../app/api/admin/forms/[formId]/compatibility/route');
    const context = { params: Promise.resolve({ formId: f.input.formId }) };
    const url = `http://localhost:3018/api/admin/forms/${f.input.formId}/compatibility`;
    const data = { expectedPublishedVersion: 2, versionId: 'policy-2', requestId: 'policy-api', reason: f.input.reason, mode: 'review_equivalent' };
    const request = (origin = 'http://localhost:3018', body = data) => new Request(url, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await api.GET(new Request(`${url}?version=2`), context)).status, 403);
    assert.equal((await api.POST(request(), context)).status, 403);
    globalThis.compatibilityApiActor = { id: 'reviewer', role: 'super_admin' };
    assert.equal((await api.POST(request('https://foreign.test'), context)).status, 403);
    const saved = await api.POST(request(), context);
    assert.equal(saved.status, 200, await saved.text());
    assert.equal((await api.POST(request(), context)).status, 200);
    assert.equal((await api.POST(request('http://localhost:3018', { ...data, reason: 'Different reason' }), context)).status, 409);
    const read = await api.GET(new Request(`${url}?version=2`), context);
    assert.equal(read.status, 200);
    assert.equal((await read.json() as {policy:{mode:string}}).policy.mode, 'review_equivalent');
    f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer'");
    assert.equal((await api.GET(new Request(`${url}?version=2`), context)).status, 403);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='form.compatibility.granted'").get()?.n, 1);
  } finally { globalThis.compatibilityApiActor = null; f.dispose(); }
});

void test('reviewed wording validates current answers and revocation at commit rolls back the whole action', async (t) => {
  const f = await fixture();
  t.mock.timers.enable({ apis: ['Date'], now: f.now });
  try {
    await setFormCompatibility(f.db, f.input);
    const checked = await validateSellerFormSubmission(f.db, f.input.formId, 1, [{ fieldId: 'packing_note', value: 'Keep upright' }]);
    assert.equal(checked.answers.presentedVersion, 1);
    assert.equal(checked.answers.answers[0].label, 'Note about packing');
    await buildFormAnswerInsert(f.db, { formId: f.input.formId, requestId: 'completed-policy', versionId: checked.versionId,
      subjectType: 'product', subjectId: 'fictional-product', actorId: 'maker-user', answers: checked.answers, now: f.now }).run();
    const statement = buildFormAnswerInsert(f.db, { formId: f.input.formId, requestId: 'policy-intake', versionId: checked.versionId,
      subjectType: 'product', subjectId: 'fictional-product', actorId: 'maker-user', answers: checked.answers, now: f.now });
    await setFormCompatibility(f.db, { ...f.input, mode: 'require_current', requestId: 'revoke-before-commit', reason: 'Require the current question before this action.' });
    await assert.rejects(f.db.batch([f.db.prepare("UPDATE users SET display_name='Must roll back' WHERE id='maker-user'"), statement]));
    assert.notEqual(f.sqlite.prepare("SELECT display_name FROM users WHERE id='maker-user'").get()?.display_name, 'Must roll back');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE request_id='policy-intake'").get()?.n, 0);
    await assert.rejects(validateSellerFormSubmission(f.db, f.input.formId, 1, [{ fieldId: 'packing_note', value: 'Keep upright' }]), /changed|review/i);
    const recovered = await validateSellerFormSubmission(f.db, f.input.formId, 1, [{ fieldId: 'packing_note', value: 'Keep upright' }], 'completed-policy');
    assert.deepEqual(recovered, checked, 'A completed request retains its original validated snapshot after revocation');
  } finally { f.dispose(); }
});

// This test suite models an explicitly accepting fake provider.
const deliverBusinessEmails: typeof actualDeliverBusinessEmails = (db,mail,origin,options) => actualDeliverBusinessEmails(db,fakeProviderMail(mail),origin,options);
