import { fixtureWithOverrides } from './helpers/fixture-delegation';
import assert from 'node:assert/strict';
import test from 'node:test';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { validateSellerFormSubmission, configuredMultipartAnswers, formRequestReplay } from '../lib/forms/submission';
import { resolvePublishedForm } from '../lib/forms/runtime';
import { validateFormDraft } from '../lib/forms/validation';
import { buildFormAnswerInsert, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import { setProductInventory } from '../lib/db/repositories/products';
import { catalogNeedsAttention, formCatalogPresentation } from '../lib/forms/catalog-presentation';
import { FORM_REGISTRY } from '../lib/forms/registry';

void test('registration editorial adapter matches the current optional-intake route and reads existing nonempty definitions', () => {
  const formId = 'seller.application';
  assert.doesNotThrow(() => validateFormDraft(formId, { formId, fields: [{ id: 'packing_note', key: 'packing_note',
    label: 'Additional note', type: 'short_text', required: false, status: 'active', order: 1 }] }));
  assert.equal(FORM_REGISTRY[formId].route, '/api/seller-registrations');
});

void test('Form Management separates unpublished edits from unavailable forms and recognizes supported core intake', () => {
  const form = FORM_REGISTRY['seller.product-submission'];
  const row = { form, presentation: formCatalogPresentation(form), publishedVersion: 1, draftVersion: 2 };
  assert.equal(catalogNeedsAttention(row), false, 'A working publication with draft edits is not an outage');
  assert.equal(catalogNeedsAttention({ ...row, publishedVersion: 0, draftVersion: 0 }), false, 'Supported core intake does not require publication');
  assert.equal(catalogNeedsAttention({ ...row, availability: 'unavailable' }), true);
  assert.equal(catalogNeedsAttention({ ...row, form: FORM_REGISTRY['staff.payout-1'], publishedVersion: 0, draftVersion: 0 }), false, 'The approved native task has no editorial dependency');
  assert.equal(catalogNeedsAttention({ ...row, form: FORM_REGISTRY['staff.commission-schedule'], publishedVersion: 0, draftVersion: 0 }), true, 'An excluded policy editor keeps its existing contract');
});

void test('stock adjustment without optional catalogue keeps quantity, ownership and exact replay checks', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('core-category','core-category','Fixture category',1,1,1,1);
      INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
      VALUES('core-product','maker','core-category','core-product','CORE-FIX','Fictional product','Fixture description',10000,10,'Maker','NP','Clay',1,'draft',1,1);`);
    const checked = await validateSellerFormSubmission(f.db, 'seller.inventory', 1, []);
    const request = { productId: 'core-product', sellerId: 'maker', actorId: 'maker-user', quantity: 7, reason: 'Fictional stock count', now: f.now,
      form: { requestId: 'core-stock', versionId: checked.versionId, answers: checked.answers } };
    await assert.rejects(setProductInventory(f.db, { ...request, sellerId: 'registered' }), /not found/i);
    await setProductInventory(f.db, request); await setProductInventory(f.db, request);
    await assert.rejects(setProductInventory(f.db, { ...request, quantity: 8 }), /different content/);
    assert.equal(f.sqlite.prepare("SELECT inventory_quantity n FROM products WHERE id='core-product'").get()?.n, 7);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM inventory_adjustments WHERE product_id='core-product'").get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='seller.inventory'").get()?.n, 0);
  } finally { f.dispose(); }
});

void test('missing optional metadata supports core intake with durable history and exact replay, without creating catalogue rows', async () => {
  const f = await completeVersionFixture();
  try {
    const before = f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions').get()?.n;
    for (const formId of ['seller.product-submission', 'seller.profile', 'seller.maker-profile']) {
      const config = await resolvePublishedForm(f.db, formId);
      assert.deepEqual(config.fields, []);
      const checked = await validateSellerFormSubmission(f.db, formId, config.version, []);
      const subjectType = formId === 'seller.product-submission' ? 'product' : 'seller';
      const auditSubjectType = formId === 'seller.product-submission' ? 'product' : 'seller_profile';
      const requestId = formId.replaceAll('.', '-');
      await f.db.batch([
        buildFormAnswerInsert(f.db, { formId, requestId, versionId: checked.versionId, subjectType, subjectId: 'core-subject', actorId: 'maker-user', answers: checked.answers, now: f.now }),
        f.db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,next_json,created_at) VALUES(?,'maker-user','core.test',?,'core-subject',?,'{"catalogDigest":"same"}',?)`).bind(`domain-${requestId}`, auditSubjectType, requestId, f.now),
      ]);
      const replay = { formId, requestId, actorId: 'maker-user', action: 'core.test', digest: 'same' };
      assert.equal(await formRequestReplay(f.db, replay), 'core-subject');
      await assert.rejects(formRequestReplay(f.db, { ...replay, actorId: 'foreign-user' }), /different content/);
      await assert.rejects(formRequestReplay(f.db, { ...replay, digest: 'different' }), /different content/);
      const history = await listFormAnswersForSubject(f.db, subjectType, 'core-subject');
      assert.ok(history.some(answer => answer.formId === formId && answer.versionId === checked.versionId));
      await assert.rejects(validateSellerFormSubmission(f.db, formId, 1, [{ fieldId: 'invented_extra', value: 'must not discard' }]), /unknown|configured|field/i);
    }
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions').get()?.n, before);
  } finally { f.dispose(); }
});

void test('publishing customization before a core commit aborts its entire parent transaction', async () => {
  const f = await completeVersionFixture();
  try {
    const formId = 'seller.product-submission';
    const checked = await validateSellerFormSubmission(f.db, formId, 1, []);
    const statement = buildFormAnswerInsert(f.db, { formId, requestId: 'core-race', versionId: checked.versionId, subjectType: 'product', subjectId: 'core-subject', actorId: 'maker-user', answers: checked.answers, now: f.now });
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES('race-config',?,1,1,'published',?,'Fixture publication','reviewer',1,'reviewer',1,'reviewer',1,'race-publish')`).run(formId, JSON.stringify({ formId, fields: [] }));
    await assert.rejects(f.db.batch([
      f.db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,created_at) VALUES('core-race-effect','maker-user','test.effect','product','core-subject',1)"), statement,
    ]));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE id='core-race-effect'").get()?.n, 0);
  } finally { f.dispose(); }
});

void test('core submission evidence cannot be rewritten or deleted but supports actor anonymization', async () => {
  const f = await completeVersionFixture();
  try {
    const checked = await validateSellerFormSubmission(f.db, 'seller.profile', 1, []);
    await buildFormAnswerInsert(f.db, { formId: 'seller.profile', requestId: 'retained-core', versionId: checked.versionId,
      subjectType: 'seller_profile', subjectId: 'maker', actorId: 'maker-user', answers: checked.answers, now: f.now }).run();
    assert.throws(() => f.sqlite.exec("UPDATE audit_logs SET next_json='{}' WHERE action='form.core_answers'"), /core_form_receipt_immutable/);
    assert.throws(() => f.sqlite.exec("UPDATE audit_logs SET action='changed' WHERE action='form.core_answers'"), /core_form_receipt_immutable/);
    assert.throws(() => f.sqlite.exec("DELETE FROM audit_logs WHERE action='form.core_answers'"), /core_form_receipt_retained/);
    f.sqlite.exec("UPDATE audit_logs SET actor_id=NULL WHERE action='form.core_answers'");
    const history = await listFormAnswersForSubject(f.db, 'seller_profile', 'maker');
    assert.equal(history.length, 1);
    assert.equal(history[0].actorId, null);
    assert.equal(history[0].answers.formId, 'seller.profile');
  } finally { f.dispose(); }
});

async function configuredFixture() {
  const f = await completeVersionFixture();
  const formId = 'seller.product-submission';
  const config = validateFormDraft(formId, { formId, fields: [{ id: 'packing_note', key: 'packing_note', type: 'short_text', label: 'Packing note', required: false, order: 0, status: 'active' }] });
  function publish(version: number, fields = config.fields) {
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES(?,?,?,1,'published',?,'Fictional cosmetic update','reviewer',1,'reviewer',1,'reviewer',1,?)`)
      .run(`compat-${version}`, formId, version, JSON.stringify({ formId, fields }), `compat-publish-${version}`);
  }
  publish(1);
  return { ...f, config, formId, publish };
}

void test('cosmetic publication during product entry retains answers and commits against the current definition', async () => {
  const f = await configuredFixture();
  try {
    f.publish(2, f.config.fields.map(field => ({ ...field, label: 'Packing  note' })));
    const current = await resolvePublishedForm(f.db, f.formId);
    const multipart = new FormData(); multipart.set('formVersion', '1'); multipart.set('requestId', 'compat-new'); multipart.set('custom.packing_note', 'Keep upright');
    const submission = configuredMultipartAnswers(multipart, current);
    const checked = await validateSellerFormSubmission(f.db, f.formId, submission.version, submission.customAnswers);
    assert.equal(checked.versionId, 'compat-2');
    assert.equal(checked.answers.answers[0].value, 'Keep upright');
    assert.equal(checked.answers.presentedVersion, 1);
    await f.db.batch([buildFormAnswerInsert(f.db, { formId: f.formId, requestId: 'compat-new', versionId: checked.versionId,
      subjectType: 'product', subjectId: 'fictional-product', actorId: 'maker-user', answers: checked.answers, now: f.now })]);
    assert.equal(f.sqlite.prepare("SELECT config_version_id FROM form_answer_sets WHERE request_id='compat-new'").get()?.config_version_id, 'compat-2');
    const history = await listFormAnswersForSubject(f.db, 'product', 'fictional-product');
    assert.equal(history[0].answers.presentedVersion, 1);
    f.publish(3, f.config.fields.map(field => ({ ...field, required: true })));
    const retry = await validateSellerFormSubmission(f.db, f.formId, 1, submission.customAnswers, 'compat-new');
    assert.deepEqual(retry.answers, checked.answers);
    assert.equal(retry.versionId, checked.versionId);
  } finally { f.dispose(); }
});

void test('semantic or unknown form versions retain stale protection and do not lose submitted extra answers', async () => {
  const f = await configuredFixture();
  try {
    f.publish(2, f.config.fields.map(field => ({ ...field, required: true })));
    await assert.rejects(validateSellerFormSubmission(f.db, f.formId, 1, [{ fieldId: 'packing_note', value: 'Keep upright' }]), /changed|review/i);
    await assert.rejects(validateSellerFormSubmission(f.db, f.formId, 999, []), /changed|review/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets').get()?.n, 0);
  } finally { f.dispose(); }
});

void test('changing label meaning is never automatically treated as a cosmetic publication', async () => {
  const f = await configuredFixture();
  try {
    f.publish(2, f.config.fields.map(field => ({ ...field, label: 'Safety instructions' })));
    await assert.rejects(validateSellerFormSubmission(f.db, f.formId, 1, [{ fieldId: 'packing_note', value: 'Keep upright' }]), /changed|review/i);
  } finally { f.dispose(); }
});

void test('invalid existing financial configuration still fails closed without inserting replacement configuration', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES('invalid-existing-financial','staff.payout-1',1,1,'published',?,'Historical invalid fixture','reviewer',1,'reviewer',1,'reviewer',1,'invalid-existing-financial')`)
      .run(JSON.stringify({formId:'staff.payout-1',fields:'invalid'}));
    const before = f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions').get()?.n;
    await assert.rejects(resolvePublishedForm(f.db, 'staff.payout-1'), /configuration invalid/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions').get()?.n, before);
  } finally { f.dispose(); }
});

void test('temporary optional metadata failure uses only a recently server-verified current definition', async (t) => {
  const f = await configuredFixture();
  t.mock.timers.enable({ apis: ['Date'], now: f.now });
  let unavailable = false;
  const db = fixtureWithOverrides(f.db, {prepare(sql: string) {
    if (unavailable && sql.startsWith('SELECT version, config_json, published_at')) throw new Error('Fictional metadata read outage');
    return f.db.prepare(sql);
  }}) as D1Database;
  try {
    const verified = await resolvePublishedForm(db, f.formId);
    unavailable = true;
    assert.deepEqual(await resolvePublishedForm(db, f.formId), verified);
    t.mock.timers.tick(60_001);
    await assert.rejects(resolvePublishedForm(db, f.formId), /read failed|unavailable/i, 'Expired server definitions cannot recover an outage');
    unavailable = false;
    await resolvePublishedForm(db, f.formId);
    unavailable = true;
    f.publish(2, f.config.fields.map(field => ({ ...field, required: true })));
    await assert.rejects(resolvePublishedForm(db, f.formId), /read failed|unavailable/i, 'A cached previous publication cannot replace current rules');
    await assert.rejects(resolvePublishedForm({ prepare() { throw new Error('Full database outage'); } } as unknown as D1Database, f.formId), /read failed|unavailable/i);
  } finally { f.dispose(); }
});
