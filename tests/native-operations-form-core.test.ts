import assert from 'node:assert/strict';
import test from 'node:test';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { createDataRightsRequest, operateDataRightsRequest, performGovernanceAction, validatePrivacyRequestForm } from '../lib/db/repositories/operations';
import { createExceptionWork } from '../lib/operations/exception-work';

void test('actual staff privacy decision replays its native core receipt without changing the original customer request', async () => {
  const f = await completeVersionFixture();
  try {
    const customer = await validatePrivacyRequestForm(f.db, 1, []);
    const id = await createDataRightsRequest(f.db, { customerId: 'customer', requestType: 'access', detail: 'The original fictional customer requests its own account information.',
      requestId: 'native-operations-privacy-request', now: f.now, form: customer });
    const checked = await validateSellerFormSubmission(f.db, 'staff.privacy-action', 1, []), requestId = 'native-operations-privacy-assign';
    const input = { id, actorId: 'reviewer', actorRole: 'super_admin' as const, action: 'assign' as const,
      note: 'Independent current staff accepts the original privacy follow-up.', requestId, now: f.now,
      form: { requestId, versionId: checked.versionId, answers: checked.answers } };
    await operateDataRightsRequest(f.db, input); await operateDataRightsRequest(f.db, input);
    assert.equal(f.sqlite.prepare('SELECT customer_id FROM data_rights_requests WHERE id=?').get(id)?.customer_id, 'customer');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='staff.privacy-action'").get()?.n, 0);
    await assert.rejects(operateDataRightsRequest(f.db, { ...input, actorId: 'customer' }));
  } finally { f.dispose(); }
});

void test('actual native rule creation keeps its original actor/source/digest through core replay', async () => {
  const f = await completeVersionFixture();
  try {
    const formId = 'staff.governance-rule-create', checked = await validateSellerFormSubmission(f.db, formId, 1, []), requestId = 'native-operations-rule';
    const input = { actorId: 'reviewer', actorRole: 'super_admin' as const, action: 'rule.create', requestId, now: f.now,
      data: { code: 'NATIVE_CORE_RULE', titleEn: 'Fictional native review rule', descriptionEn: 'A fictional native rule created only inside the isolated test database.', severity: 'restricted' },
      form: { formId: 'staff.governance-rule-create' as const, requestId, versionId: checked.versionId, answers: checked.answers } };
    await performGovernanceAction(f.db, input); await performGovernanceAction(f.db, input);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM prohibited_product_rules WHERE code='NATIVE_CORE_RULE'").get()?.n, 1);
    await assert.rejects(performGovernanceAction(f.db, { ...input, data: { ...input.data, titleEn: 'Changed original rule intent' } }));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions WHERE form_id=?').get(formId)?.n, 0);
  } finally { f.dispose(); }
});

void test('native exception follow-up of an explicit historical failed parcel keeps one original work item and core receipt', async () => {
  const f = await completeVersionFixture();
  try {
    f.sqlite.prepare(`INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at)
      VALUES('native-historical-failed-parcel','legacy-order','registered','outbound','delivery_failed','reviewer','native-historical-failed-parcel',1,1)`).run();
    const checked = await validateSellerFormSubmission(f.db, 'staff.exception-work', 1, []), requestId = 'native-operations-exception';
    const input = { actorId: 'reviewer', jobId: 'native-historical-failed-parcel', kind: 'failed_delivery', ownerId: 'reviewer',
      nextAction: 'Review the original failed parcel with the original customer.', note: 'The retained fictional failed parcel needs its original operational follow-up.',
      requestId, now: f.now, form: { requestId, versionId: checked.versionId, answers: checked.answers } };
    const id = await createExceptionWork(f.db, input);
    assert.equal(await createExceptionWork(f.db, input), id);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM exception_work_items WHERE shipping_job_id=?').get(input.jobId)?.n, 1);
    await assert.rejects(createExceptionWork(f.db, { ...input, nextAction: 'Different original exception intent must not replay.' }));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='staff.exception-work'").get()?.n, 0);
  } finally { f.dispose(); }
});
