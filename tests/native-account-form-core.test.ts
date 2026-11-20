import assert from 'node:assert/strict';
import test from 'node:test';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { deliveredLiveFinancialFixture } from './helpers/live-financial-lifecycle-fixture';
import { createDataRightsRequest, privacyRequestStatus, validatePrivacyRequestForm } from '../lib/db/repositories/operations';
import { createProductReview, productReviewRequestStatus, validateReviewFormSubmission, listCustomerReviewAnswerHistory } from '../lib/db/repositories/customers';
import { listFormAnswersForSubject } from '../lib/db/repositories/form-answers';

void test('native privacy request commits and recovers its original private receipt without an editorial publication', async () => {
  const f = await completeVersionFixture();
  try {
    const form = await validatePrivacyRequestForm(f.db, 1, []);
    const input = { customerId: 'customer', requestType: 'access', detail: 'The current customer requests its own account information.',
      requestId: 'native-core-privacy', now: f.now, form };
    const id = await createDataRightsRequest(f.db, input);
    assert.equal(await createDataRightsRequest(f.db, input), id);
    const outcome = await privacyRequestStatus(f.db, { ...input, formVersion: 1, customAnswers: [] });
    assert.deepEqual(outcome, { status: 'same', id });
    const history = await listFormAnswersForSubject(f.db, 'data_rights_request', id);
    assert.equal(history.length, 1);
    assert.equal(history[0].versionId, 'core:account.privacy-request:1');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='account.privacy-request'").get()?.n, 0);
    f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='customer'").run();
    await assert.rejects(createDataRightsRequest(f.db, { ...input, requestId: 'native-core-privacy-after-disable' }));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM data_rights_requests WHERE created_request_id='native-core-privacy-after-disable'").get()?.n, 0);
  } finally { f.dispose(); }
});

void test('a genuine delivered purchase supports native review, exact replay and original answer history without a form publication', async () => {
  const f = await deliveredLiveFinancialFixture();
  try {
    const form = await validateReviewFormSubmission(f.db, 1, []);
    const input = { userId: f.buyerId, productId: f.productId, orderItemId: f.orderItemId, rating: 4,
      title: 'Native verified purchase', body: 'The original buyer reviews its actual fictional delivered purchase.',
      requestId: 'native-core-delivered-review', now: Date.now(), requestDigest: 'a'.repeat(64), form };
    const id = await createProductReview(f.db, input);
    assert.equal(await createProductReview(f.db, input), id);
    assert.deepEqual(await productReviewRequestStatus(f.db, { ...input, formVersion: 1, customAnswers: [] }), { status: 'same', id });
    const history = await listFormAnswersForSubject(f.db, 'product_review', id);
    assert.equal(history.length, 1);
    assert.equal(history[0].versionId, 'core:account.review:1');
    const ownHistory = await listCustomerReviewAnswerHistory(f.db, f.buyerId);
    assert.equal(ownHistory.entries.some(entry => entry.answer.id === history[0].id), true);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='account.review'").get()?.n, 0);
    f.sqlite.prepare("DELETE FROM user_roles WHERE user_id=? AND role='customer'").run(f.buyerId);
    await assert.rejects(createProductReview(f.db, { ...input, requestId: 'native-core-review-after-role-loss' }));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='native-core-review-after-role-loss'").get()?.n, 0);
  } finally { f.dispose(); }
});
