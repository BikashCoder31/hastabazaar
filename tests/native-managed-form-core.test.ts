import assert from 'node:assert/strict';
import test from 'node:test';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { getManagedTermsOffers, acceptManagedTerms } from '../lib/managed-commerce/accepted-terms';
import { releaseManagedEligibility } from '../lib/managed-commerce/payout-operations';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { resolveRuntimeEnvironment } from '../lib/staging/environment';
import { listFormAnswersForSubject } from '../lib/db/repositories/form-answers';

void test('actual owner terms acceptance has a native receipt and exact replay without a fictitious metadata foreign key', async () => {
  const f = await completeVersionFixture();
  try {
    const offer = (await getManagedTermsOffers(f.db, 'maker', f.now)).current;
    const checked = await validateSellerFormSubmission(f.db, 'seller.managed-terms-acceptance', 1, []);
    const input = { sellerId: 'maker', actorId: 'maker-user', offerId: offer.id, context: offer.context,
      language: 'en' as const, requestId: 'native-maker-terms', now: f.now, form: { versionId: checked.versionId, answers: checked.answers } };
    const saved = await acceptManagedTerms(f.db, input);
    assert.deepEqual(await acceptManagedTerms(f.db, input), saved);
    assert.equal(f.sqlite.prepare('SELECT agreement_form_version_id FROM managed_maker_application_details WHERE id=?').get(saved.detailId)?.agreement_form_version_id, null);
    const history = await listFormAnswersForSubject(f.db, 'seller', 'maker');
    assert.equal(history.some(row => row.formId === 'seller.managed-terms-acceptance' && row.requestId === input.requestId), true);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='seller.managed-terms-acceptance'").get()?.n, 0);
    await assert.rejects(acceptManagedTerms(f.db, { ...input, actorId: 'customer' }));
  } finally { f.dispose(); }
});

void test('native simulated eligibility review retains its truthful zero result and original replay without editorial metadata', async () => {
  const f = await completeVersionFixture();
  try {
    const formId = 'staff.managed-eligibility-release';
    const checked = await validateSellerFormSubmission(f.db, formId, 1, []);
    const input = { sellerId: 'maker', actorId: 'reviewer', requestId: 'native-eligibility-review', now: f.now,
      environment: resolveRuntimeEnvironment({ runtimeEnvironment: 'test', nodeEnvironment: 'test' }),
      reason: 'Review actual native simulated eligibility without inventing an earning.', form: { formId, versionId: checked.versionId, answers: checked.answers } };
    const saved = await releaseManagedEligibility(f.db, input);
    assert.equal(saved.released, 0);
    assert.equal(saved.simulation, true);
    assert.deepEqual(await releaseManagedEligibility(f.db, input), saved);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='managed_settlement.eligibility_released' AND request_id=?").get(input.requestId)?.n, 1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions WHERE form_id=?').get(formId)?.n, 0);
    await assert.rejects(releaseManagedEligibility(f.db, { ...input, actorId: 'maker-user' }));
  } finally { f.dispose(); }
});
