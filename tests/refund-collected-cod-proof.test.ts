import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerReturnRequest, reviewReturnAsAdmin } from '../lib/db/repositories/returns';
import { listParcels, operateParcel } from '../lib/operations/parcels';
import { refundSourceGuards } from '../lib/payments/refund-execution';
import { getRefundObligation, openRefundObligation, RefundObligationError } from '../lib/payments/refund-obligations';
import { commerceOrderFixture } from './helpers/commerce-order-fixture';

type Fixture = Awaited<ReturnType<typeof commerceOrderFixture>>;

async function deliver(fixture: Fixture, sellerId: string) {
  const parcel = (await listParcels(fixture.database, fixture.orderId)).find(item => item.sellerId === sellerId);
  assert.ok(parcel);
  fixture.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=? AND seller_id=?")
    .run(fixture.orderId, sellerId);
  for (const [index, action] of ['assign', 'dispatch', 'deliver'].entries()) {
    await operateParcel(fixture.database, {
      jobId: parcel.id, actorId: 'owner', action, version: parcel.version + index,
      requestId: `cod-return-${sellerId}-${action}`, now: Date.now(),
      note: 'Record the original fictional shipment for an isolated refund.',
      ...(action === 'assign' ? { method: 'courier', courierName: 'Fictional courier', trackingCode: `COD-${sellerId}` } : {}),
    });
  }
  return { ...parcel, version: parcel.version + 3 };
}

async function postCollection(fixture: Fixture, parcel: Awaited<ReturnType<typeof deliver>>,
  reference = `FICTIONAL-ORIGINAL-COD-${parcel.sellerId}`) {
  await operateParcel(fixture.database, {
    jobId: parcel.id, actorId: 'owner', action: 'collect', version: parcel.version,
    requestId: `cod-return-collection-${parcel.sellerId}`, now: Date.now(),
    amountPaisa: parcel.codDuePaisa, reference,
    note: 'Independently record cash actually collected by the assigned courier.',
  });
}

void test('COD return funding requires matched posted cash from the original seller before remittance', async () => {
  const fixture = await commerceOrderFixture(true);
  try {
    assert.ok(fixture.sqlite.prepare('PRAGMA database_list').all().every(database => database.file === ''));
    const original = await deliver(fixture, 'seller-a');
    const other = await deliver(fixture, 'seller-b');
    await postCollection(fixture, other);

    const line = fixture.sqlite.prepare("SELECT id,line_total_paisa FROM order_items WHERE order_id=? AND seller_id='seller-a'")
      .get(fixture.orderId);
    assert.ok(line);
    const request = await createCustomerReturnRequest(fixture.database, {
      orderNumber: fixture.placed.orderNumber, customerId: 'checkout-buyer', receiptTokenHash: null,
      orderItemId: String(line.id), quantity: 1, reason: 'defective', requestedResolution: 'refund',
      detail: 'Report an independently verified defect on the original delivered item.',
      locale: 'en-NP', idempotencyKey: 'cod-proof-return', evidence: [], now: Date.now(),
    });
    await reviewReturnAsAdmin(fixture.database, {
      returnRequestId: request.id, actorId: 'owner', actorRole: 'super_admin', action: 'approve',
      responsibility: 'platform', outcome: 'refund', itemRefundPaisa: Number(line.line_total_paisa),
      note: 'Approve the original defective item refund for later verified payment.',
      publicMessageEn: 'The original refund is approved and awaiting funding.',
      publicMessageNe: 'फिर्ता रकम स्वीकृत भयो। भुक्तानी बाँकी छ।',
      requestId: 'approve-cod-proof-return', now: Date.now(),
    });
    const refund = fixture.sqlite.prepare('SELECT id FROM refunds WHERE return_request_id=?').get(request.id);
    assert.ok(refund);
    const { id } = await openRefundObligation(fixture.database, {
      actorId: 'owner', requestId: 'original-cod-obligation', expectedRevision: null, now: Date.now(),
    }, { kind: 'return_refund', sourceId: String(refund.id), reason: 'Open only the original approved refund obligation.' });
    const obligation = await getRefundObligation(fixture.database, id);
    assert.ok(obligation && obligation.cashPaisa > 0);
    const guard = () => refundSourceGuards(fixture.database, obligation);

    await assert.rejects(guard, RefundObligationError);

    // An incomplete saved data set can retain the counter without its supporting ledger row.
    const setCounter = fixture.sqlite.prepare('UPDATE shipping_parcels SET collected_paisa=? WHERE shipping_job_id=?');
    setCounter.run(original.codDuePaisa, original.id);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS entries FROM parcel_cash_records WHERE shipping_job_id=?')
      .get(original.id)?.entries, 0);
    await assert.rejects(guard, RefundObligationError);

    setCounter.run(0, original.id);
    await assert.rejects(postCollection(fixture, original, '🙂🙂'), /evidence reference of 4–120 characters/);
    await postCollection(fixture, original, '🙂🙂🙂🙂');
    assert.equal(fixture.sqlite.prepare('SELECT remitted_paisa FROM shipping_parcels WHERE shipping_job_id=?')
      .get(original.id)?.remitted_paisa, 0);
    await fixture.database.batch(await guard());

    const checked = await guard();
    setCounter.run(original.codDuePaisa - 1, original.id);
    await assert.rejects(fixture.database.batch(checked), /operation_transaction_guards|constraint/i);
  } finally {
    await fixture.dispose();
  }
});
