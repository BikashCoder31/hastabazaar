import assert from 'node:assert/strict';
import test from 'node:test';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { isFormCatalogEditable } from '../lib/forms/catalog-presentation';
import { coreFormContract } from '../lib/forms/core-contracts';
import { resolvePublishedForm } from '../lib/forms/runtime';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { buildFormAnswerInsert, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import { processPayoutRequest } from '../lib/db/repositories/payouts';
import { completeVersionFixture } from './helpers/complete-version-fixture';

void test('ordinary Form Management exposes exactly the seven approved wording/question editors', () => {
  assert.deepEqual(Object.values(FORM_REGISTRY).filter(isFormCatalogEditable).map(form => form.id).sort(), [
    'seller.application', 'seller.maker-profile', 'seller.profile', 'seller.product-submission',
    'public.contact', 'public.feedback', 'public.footer-feedback',
  ].sort());
  assert.ok(FORM_REGISTRY['rider.application'], 'Inactive rider history remains registered.');
  assert.equal(isFormCatalogEditable(FORM_REGISTRY['rider.application']), false);
});

void test('actual native payout request rejection works without editorial publication and replays its original receipt', async () => {
  const f = await completeVersionFixture();
  try {
    const formId = 'staff.payout-request-action';
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions WHERE form_id=?').get(formId)?.n, 0);
    const config = await resolvePublishedForm(f.db, formId);
    const checked = await validateSellerFormSubmission(f.db, formId, config.version, []);
    const requestId = `native-${'r'.repeat(180)}`;
    const command = { id: 'legacy-payout', actorId: 'reviewer', actorRole: 'super_admin' as const,
      action: 'reject' as const, note: 'Fictional independent request review', requestId, now: f.now,
      form: { requestId, versionId: checked.versionId, answers: checked.answers } };
    await processPayoutRequest(f.db, command);
    await processPayoutRequest(f.db, command);
    assert.equal(f.sqlite.prepare("SELECT status FROM payout_requests WHERE id='legacy-payout'").get()?.status, 'rejected');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='payout.request.rejected'").get()?.n, 1);
    const history = await listFormAnswersForSubject(f.db, 'payout_request', 'legacy-payout');
    assert.equal(history.length, 1);
    assert.equal(history[0].versionId, checked.versionId);
    assert.ok(history[0].id.length <= 191, 'A core receipt fits the actual MariaDB audit primary key.');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions WHERE form_id=?').get(formId)?.n, 0);
    await assert.rejects(processPayoutRequest(f.db, { ...command, note: 'Different review content' }));
  } finally { f.dispose(); }
});

void test('only the four existing guest commerce tasks accept an anonymous native core receipt', async () => {
  const f = await completeVersionFixture();
  try {
    for (const formId of ['commerce.checkout', 'commerce.return-request', 'commerce.complaint', 'commerce.order-cancellation']) {
      assert.ok(coreFormContract(formId));
      const checked = await validateSellerFormSubmission(f.db, formId, 1, []);
      await buildFormAnswerInsert(f.db, { formId, requestId: `guest-${formId.replaceAll('.', '-')}`,
        versionId: checked.versionId, subjectType: 'order', subjectId: 'fictional-existing-order', actorId: null,
        answers: checked.answers, now: f.now }).run();
    }
    const staff = await validateSellerFormSubmission(f.db, 'staff.payout-request-action', 1, []);
    assert.throws(() => buildFormAnswerInsert(f.db, { formId: 'staff.payout-request-action', requestId: 'anonymous-staff',
      versionId: staff.versionId, subjectType: 'payout_request', subjectId: 'legacy-payout', actorId: null,
      answers: staff.answers, now: f.now }));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='form.core_answers' AND actor_id IS NULL").get()?.n, 4);
  } finally { f.dispose(); }
});

void test('an existing required native extension remains enforced and publication still fences an outstanding core transaction', async () => {
  const f = await completeVersionFixture();
  try {
    const formId = 'staff.payout-request-action';
    const core = await validateSellerFormSubmission(f.db, formId, 1, []);
    const outstanding = buildFormAnswerInsert(f.db, { formId, requestId: 'native-publication-race', versionId: core.versionId,
      subjectType: 'payout_request', subjectId: 'legacy-payout', actorId: 'reviewer', answers: core.answers, now: f.now });
    const config = { formId, fields: [{ id: 'legacy_context', key: 'legacy_context', label: 'Original review context',
      type: 'short_text', required: true, status: 'active', order: 1 }] };
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES('native-historical-config',?,1,1,'published',?,'Retained historical fixture','reviewer',1,'reviewer',1,'reviewer',1,'native-historical-publish')`).run(formId, JSON.stringify(config));
    await assert.rejects(validateSellerFormSubmission(f.db, formId, 1, []), /required/i);
    const checked = await validateSellerFormSubmission(f.db, formId, 1, [{ fieldId: 'legacy_context', value: 'Original extension answer' }]);
    assert.equal(checked.versionId, 'native-historical-config');
    await assert.rejects(f.db.batch([
      f.db.prepare("UPDATE payout_requests SET processing_note='MUST ROLL BACK' WHERE id='legacy-payout'"), outstanding,
    ]));
    assert.notEqual(f.sqlite.prepare("SELECT processing_note FROM payout_requests WHERE id='legacy-payout'").get()?.processing_note, 'MUST ROLL BACK');
    assert.equal(f.sqlite.prepare("SELECT config_json FROM form_config_versions WHERE id='native-historical-config'").get()?.config_json, JSON.stringify(config));
  } finally { f.dispose(); }
});

void test('a first publication with numeric version one cannot replace the observed native contract between validation reads', async () => {
  const f = await completeVersionFixture();
  const original = f.db.prepare.bind(f.db);
  let raced = false;
  try {
    f.db.prepare = ((sql: string) => {
      if (!raced && /SELECT id FROM form_config_versions WHERE form_id=\? AND version=\?/.test(sql)) {
        raced = true;
        f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
          VALUES('native-first-publication-race','staff.payout-request-action',1,1,'published',?,'Concurrent fixture publication','reviewer',1,'reviewer',1,'reviewer',1,'native-first-publication-race')`)
          .run(JSON.stringify({ formId: 'staff.payout-request-action', fields: [] }));
      }
      return original(sql);
    }) as D1Database['prepare'];
    await assert.rejects(async () => {
      const checked = await validateSellerFormSubmission(f.db, 'staff.payout-request-action', 1, []);
      await processPayoutRequest(f.db, { id: 'legacy-payout', actorId: 'reviewer', actorRole: 'super_admin', action: 'reject',
        note: 'Review must retain the observed definition', requestId: 'native-first-version-race', now: f.now,
        form: { requestId: 'native-first-version-race', versionId: checked.versionId, answers: checked.answers } });
    });
    assert.equal(raced, true, 'The first publication actually landed between the two reads.');
    assert.equal(f.sqlite.prepare("SELECT status FROM payout_requests WHERE id='legacy-payout'").get()?.status, 'submitted');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='native-first-version-race'").get()?.n, 0);
  } finally { f.db.prepare = original; f.dispose(); }
});
