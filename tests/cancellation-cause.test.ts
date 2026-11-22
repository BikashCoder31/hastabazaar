import assert from 'node:assert/strict';
import test from 'node:test';
import { cancellationPreview, cancelSelectedParcels } from '../lib/cancellation/repository';
import { commerceOrderFixture } from './helpers/commerce-order-fixture';
import { installFixtureCustomerCodSchema } from './helpers/customer-cod-fixture';
import { saveFormDraft, publishFormDraft } from '../lib/db/repositories/form-catalog';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { transitionAdminFulfillment } from '../lib/db/repositories/fulfillment';
import { manualOrderFixture } from './helpers/manual-payment-fixture';
import { expireManualPaymentOrder } from '../lib/payments/manual-payment-lifecycle';
import { reportPreparationIssue } from '../lib/orders/response-cases';
import { operateParcel } from '../lib/operations/parcels';
import { readReportCancellations } from '../app/admin/analytics/business-report-data';
import { inferCancellationCause } from '../lib/cancellation/attribution';
import { readSellerStanding } from '../app/admin/sellers/[id]/seller-record-data';

function declareTestColumns(sqlite: Awaited<ReturnType<typeof manualOrderFixture>>['sqlite']) {
  assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
  sqlite.exec(`
    ALTER TABLE order_cancellation_events ADD COLUMN cause TEXT DEFAULT NULL;
    ALTER TABLE order_cancellation_reviews ADD COLUMN cause TEXT DEFAULT NULL;
  `);
}

const note = 'Fictional customer requested that the selected parcel be cancelled.';

void test('customer cancellation is attributed and excluded from the seller score', async () => {
  const f = await commerceOrderFixture();
  try {
    declareTestColumns(f.sqlite);
    const sellerIds = ['seller-a'];
    const preview = await cancellationPreview(f.database, f.access, sellerIds);
    const command = { sellerIds, note, fingerprint: preview.fingerprint, requestId: 'customer-cause', now: Date.now() };
    await cancelSelectedParcels(f.database, f.access, command);
    await cancelSelectedParcels(f.database, f.access, command);
    assert.equal(f.sqlite.prepare('SELECT cause FROM order_cancellation_events').get()?.cause, 'customer');
    assert.equal((await readSellerStanding(f.database, 'seller-a', { id: 'owner', role: 'super_admin' })).cancellations, 0);
    const report = await readReportCancellations(f.database, command.now, command.now);
    assert.deepEqual(report?.filter(row => row.count), [{ cause: 'customer', count: 1 }]);
    assert.equal((await readReportCancellations(f.database, 0, command.now - 1))?.some(row => row.count), false);
  } finally {
    await f.dispose();
  }
});

void test('staff must specify an unknown cause and an identical retry preserves cause and audit', async () => {
  const f = await commerceOrderFixture();
  try {
    declareTestColumns(f.sqlite);
    const access = { orderNumber: f.placed.orderNumber, actorId: 'owner' };
    const sellerIds = ['seller-a'];
    const preview = await cancellationPreview(f.database, access, sellerIds);
    const command = { sellerIds, note, fingerprint: preview.fingerprint, requestId: 'staff-cause', now: Date.now() };
    await assert.rejects(cancelSelectedParcels(f.database, access, command), /cancellation cause/i);
    const selected = { ...command, cause: 'seller' };
    await cancelSelectedParcels(f.database, access, selected);
    await cancelSelectedParcels(f.database, access, selected);
    await assert.rejects(cancelSelectedParcels(f.database, access, { ...selected, cause: 'courier' }), /reference already used/i);
    assert.equal(f.sqlite.prepare('SELECT cause FROM order_cancellation_events').get()?.cause, 'seller');
    const audit = f.sqlite.prepare("SELECT actor_id,reason,next_json FROM audit_logs WHERE request_id='staff-cause'").get();
    assert.equal(audit?.actor_id, 'owner');
    assert.equal(audit?.reason, note);
    assert.equal(JSON.parse(String(audit?.next_json)).cause, 'seller');
    assert.equal((await readSellerStanding(f.database, 'seller-a', { id: 'owner', role: 'super_admin' })).cancellations, 1);
  } finally {
    await f.dispose();
  }
});

void test('cancelling a customer-flagged COD hold records Customer with the native audit', async () => {
  const f = await commerceOrderFixture();
  try {
    declareTestColumns(f.sqlite);
    installFixtureCustomerCodSchema(f.sqlite);
    const now = Date.now();
    f.sqlite.prepare(`INSERT INTO first_cod_reviews(order_id,customer_id,total_paisa,status,created_at,hold_source)
      VALUES(?,'checkout-buyer',?,'pending',?,'customer_flag')`).run(f.orderId, f.placed.grandTotalPaisa, now);
    const formId = 'staff.order-fulfillment';
    const draft = await saveFormDraft(f.database, {
      formId, actorId: 'owner', actorRole: 'super_admin', expectedPublishedVersion: 0,
      config: { formId, fields: [] }, reason: note, requestId: 'cod-cause-draft', now,
    });
    const published = await publishFormDraft(f.database, {
      formId, draftId: draft.id, actorId: 'owner', actorRole: 'super_admin', expectedDraftRevision: draft.revision,
      expectedPublishedVersion: 0, reason: note, requestId: 'cod-cause-publish', now,
    });
    const requestId = 'cancel-cod-customer-cause';
    const form = await validateSellerFormSubmission(f.database, formId, published.version, [], requestId);
    const command = { orderId: f.orderId, actorId: 'owner', action: 'cancel' as const, codNotConfirmed: true,
      note, now, requestId, form: { requestId, versionId: form.versionId, answers: form.answers } };
    await transitionAdminFulfillment(f.database, command);
    await transitionAdminFulfillment(f.database, command);
    assert.equal(f.sqlite.prepare('SELECT cause FROM order_cancellation_events WHERE id=?').get(requestId)?.cause, 'customer');
    assert.equal(f.sqlite.prepare('SELECT actor_id FROM audit_logs WHERE request_id=?').get(requestId)?.actor_id, 'owner');
  } finally {
    await f.dispose();
  }
});

void test('paid cancellation review keeps the recorded cause when approved', async () => {
  const f = await commerceOrderFixture(false, 0, true);
  try {
    declareTestColumns(f.sqlite);
    const sellerIds = ['seller-a'];
    const original = await cancellationPreview(f.database, f.access, sellerIds);
    const pending = await cancelSelectedParcels(f.database, f.access, {
      sellerIds, note, fingerprint: original.fingerprint, requestId: 'customer-request', now: Date.now(),
    });
    assert.equal(pending.status, 'review_requested');
    assert.equal(f.sqlite.prepare('SELECT cause FROM order_cancellation_reviews').get()?.cause, 'customer');
    const staff = { orderNumber: f.placed.orderNumber, actorId: 'owner' };
    const latest = await cancellationPreview(f.database, staff, sellerIds);
    await cancelSelectedParcels(f.database, staff, {
      sellerIds, note, fingerprint: latest.fingerprint, requestId: 'review:customer-request', reviewId: 'customer-request', now: Date.now(),
    });
    assert.equal(f.sqlite.prepare('SELECT cause FROM order_cancellation_events').get()?.cause, 'customer');
  } finally {
    await f.dispose();
  }
});

void test('expiry is attributed to payment, including after a replay', async () => {
  const f = await manualOrderFixture();
  try {
    declareTestColumns(f.sqlite);
    const deadline = Number(f.sqlite.prepare('SELECT deadline_at FROM manual_payment_windows').get()!.deadline_at);
    f.sqlite.function('strftime', { varargs: true }, (...args) => String(args[0]) === '%s'
      ? String(Math.floor(deadline / 1000)) : (deadline % 60_000 / 1000).toFixed(3).padStart(6, '0'));
    assert.equal((await expireManualPaymentOrder(f.db, f.orderId)).state, 'expired');
    assert.equal((await expireManualPaymentOrder(f.db, f.orderId)).state, 'expired');
    assert.deepEqual(f.sqlite.prepare('SELECT cause FROM order_cancellation_events').all().map(row => row.cause), ['payment']);
  } finally {
    f.dispose();
  }
});

void test('legacy cancellation works unchanged and remains unattributed when columns are added later', async () => {
  const f = await commerceOrderFixture();
  try {
    assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    const staff = { orderNumber: f.placed.orderNumber, actorId: 'owner' };
    const sellerIds = ['seller-a'];
    const preview = await cancellationPreview(f.database, staff, sellerIds);
    const command = { sellerIds, note, fingerprint: preview.fingerprint, requestId: 'legacy-cause', now: Date.now() };
    await cancelSelectedParcels(f.database, staff, command);
    assert.equal((await readSellerStanding(f.database, 'seller-a', { id: 'owner', role: 'super_admin' })).cancellations, null);
    assert.equal(await readReportCancellations(f.database, 0, command.now), null);
    declareTestColumns(f.sqlite);
    await cancelSelectedParcels(f.database, staff, command);
    assert.equal(f.sqlite.prepare('SELECT cause FROM order_cancellation_events').get()?.cause, null);
    assert.deepEqual((await readReportCancellations(f.database, 0, command.now))?.filter(row => row.count), [{ cause: null, count: 1 }]);
    assert.equal((await readSellerStanding(f.database, 'seller-a', { id: 'owner', role: 'super_admin' })).cancellations, 0);
  } finally {
    await f.dispose();
  }
});


void test('an authentic seller response attributes only the exact affected seller scope', async () => {
  const f = await commerceOrderFixture(true);
  try {
    declareTestColumns(f.sqlite);
    const item = f.sqlite.prepare(`SELECT i.id,p.id AS portionId
      FROM order_items i JOIN order_response_portions p
        ON p.order_id=i.order_id AND p.seller_id=i.seller_id
      WHERE i.order_id=? AND i.seller_id='seller-a'`).get(f.orderId)!;
    await reportPreparationIssue(f.database, {
      actorId: 'user-a', requestId: 'authentic-seller-report', expectedRevision: null, now: Date.now(),
    }, { portionId: String(item.portionId), itemIds: [String(item.id)], kind: 'cannot_fulfill',
      proposedReadyAt: null, detail: 'The fictional seller cannot make the exact item ordered.' });
    assert.equal(await inferCancellationCause(f.database, f.orderId), undefined);
    assert.equal(await inferCancellationCause(f.database, f.orderId, ['seller-a']), 'seller');
    assert.equal(await inferCancellationCause(f.database, f.orderId, ['seller-b']), undefined);
    const job = f.sqlite.prepare("SELECT id FROM shipping_jobs WHERE order_id=? AND seller_id='seller-a'").get(f.orderId)!;
    const cancel = { actorId: 'owner', jobId: String(job.id), requestId: 'seller-cause', version: 0, action: 'cancel', now: Date.now(), note };
    await operateParcel(f.database, cancel);
    await operateParcel(f.database, cancel);
    await assert.rejects(operateParcel(f.database, { ...cancel, cause: 'courier' }), /already used/i);
    assert.equal(f.sqlite.prepare('SELECT cause FROM order_cancellation_events').get()?.cause, 'seller');
    assert.equal((await readSellerStanding(f.database, 'seller-a', { id: 'owner', role: 'super_admin' })).cancellations, 1);
    assert.equal((await readSellerStanding(f.database, 'seller-b', { id: 'owner', role: 'super_admin' })).cancellations, 0);
  } finally {
    await f.dispose();
  }
});

for (const [failureReason, cause] of Object.entries({
  refused: 'customer', not_reached: 'customer', courier_problem: 'courier', wrong_address: null, other: null,
})) {
  void test(`returned parcel attribution for ${failureReason} preserves the native physical and financial workflow`, async () => {
    const f = await commerceOrderFixture();
    try {
      declareTestColumns(f.sqlite);
      f.sqlite.exec('ALTER TABLE shipping_jobs ADD COLUMN delivery_failure_reason TEXT DEFAULT NULL');
      await f.operate('assign', { method: 'courier', courierName: 'Fictional Courier', trackingCode: 'LOCAL-FIXTURE' });
      f.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=?").run(f.orderId);
      await f.operate('dispatch');
      await f.operate('fail', { failureReason });
      await f.operate('return_to_origin');
      const receipt = await f.operate('receive_return');
      await operateParcel(f.database, receipt);
      const audit = f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE request_id=?").get(receipt.requestId + ':audit');
      assert.equal(JSON.parse(String(audit?.next_json ?? 'null'))?.cause ?? null, cause);
      assert.equal(await inferCancellationCause(f.database, f.orderId, ['seller-a']) ?? null, cause);
      assert.equal(f.sqlite.prepare('SELECT status FROM shipping_jobs WHERE id=?').get(receipt.jobId)?.status, 'returned');
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS total FROM order_cancellation_events').get()?.total, 0);
    } finally {
      await f.dispose();
    }
  });
}
