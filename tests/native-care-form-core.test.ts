import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveredLiveFinancialFixture } from './helpers/live-financial-lifecycle-fixture';
import { createCustomerReturnRequest, reviewReturnAsAdmin } from '../lib/db/repositories/returns';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { listStaffFormHistory } from '../lib/forms/staff-history';

void test('actual delivered-order return and independent staff review retain native receipts and exact replays without editorial publication', async () => {
  const f = await deliveredLiveFinancialFixture();
  try {
    const customer = await validateSellerFormSubmission(f.db, 'commerce.return-request', 1, []);
    const request = { orderNumber: f.order.orderNumber, customerId: f.buyerId, receiptTokenHash: null,
      orderItemId: f.orderItemId, quantity: 1, reason: 'defective' as const, requestedResolution: 'refund' as const,
      detail: 'The original delivered product has an independently documented fictional defect.', locale: 'en-NP' as const,
      idempotencyKey: 'native-core-actual-return', evidence: [], now: Date.now(),
      form: { versionId: customer.versionId, answers: customer.answers } };
    const saved = await createCustomerReturnRequest(f.db, request);
    assert.equal((await createCustomerReturnRequest(f.db, request)).id, saved.id);
    const staff = await validateSellerFormSubmission(f.db, 'staff.return-case-action', 1, []);
    const review = { returnRequestId: saved.id, actorId: 'reviewer', actorRole: 'super_admin' as const,
      action: 'request_changes' as const, note: 'Independent staff asks for original defect photographs.',
      publicMessageEn: 'Please provide a clear photograph of the original defect.', publicMessageNe: 'Please provide a clear photograph of the original defect.',
      requestId: 'native-core-return-review', now: Date.now(), form: { versionId: staff.versionId, answers: staff.answers } };
    await reviewReturnAsAdmin(f.db, review);
    await reviewReturnAsAdmin(f.db, review);
    const history = await listStaffFormHistory(f.db, { id: 'reviewer', role: 'super_admin' }, 'return-case-action', { subjectId: saved.id });
    assert.equal(history.items.length, 1, 'The real native submission remains in its authorized original staff history.');
    assert.equal((await listStaffFormHistory(f.db, { id: f.buyerId, role: 'customer' }, 'return-case-action', { subjectId: saved.id })).items.length, 0);
    assert.equal(f.sqlite.prepare('SELECT status FROM return_requests WHERE id=?').get(saved.id)?.status, 'needs_customer_changes');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='form.core_answers' AND subject_id=?").get(saved.id)?.n, 2);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id IN('commerce.return-request','staff.return-case-action')").get()?.n, 0);
    await assert.rejects(reviewReturnAsAdmin(f.db, { ...review, actorId: f.buyerId }));
  } finally { f.dispose(); }
});

void test('one independent eligible SA can authorize the actual original refund with native core questions and no paid-outcome fiction', async () => {
  const f = await deliveredLiveFinancialFixture();
  try {
    const saved = await createCustomerReturnRequest(f.db, { orderNumber: f.order.orderNumber, customerId: f.buyerId, receiptTokenHash: null,
      orderItemId: f.orderItemId, quantity: 1, reason: 'defective', requestedResolution: 'refund',
      detail: 'The actual fictional delivered product has its original documented defect.', locale: 'en-NP',
      idempotencyKey: 'native-core-refund-approval-return', evidence: [], now: Date.now() });
    const checked = await validateSellerFormSubmission(f.db, 'staff.return-case-action', 1, []);
    const command = { returnRequestId: saved.id, actorId: 'reviewer', actorRole: 'super_admin' as const,
      action: 'approve' as const, responsibility: 'seller' as const, outcome: 'refund' as const, itemRefundPaisa: 80000,
      note: 'Authorize the actual original remedy independently without claiming any completed bank payment.',
      publicMessageEn: 'The original refund is approved; Finance will arrange its payment.', publicMessageNe: 'The original refund is approved.',
      requestId: 'native-core-original-refund-authorization', now: Date.now(), form: { versionId: checked.versionId, answers: checked.answers } };
    await reviewReturnAsAdmin(f.db, command);
    await reviewReturnAsAdmin(f.db, command);
    const refund = f.sqlite.prepare('SELECT status,amount_paisa FROM refunds WHERE return_request_id=?').get(saved.id);
    const originalDelivery = f.sqlite.prepare('SELECT delivery_charge_paisa FROM orders WHERE order_number=?').get(f.order.orderNumber)?.delivery_charge_paisa;
    assert.equal(refund?.status, 'approved'); assert.equal(refund?.amount_paisa, 80000 + Number(originalDelivery));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id=?").get(command.requestId)?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='staff.return-case-action'").get()?.n, 0);
  } finally { f.dispose(); }
});
