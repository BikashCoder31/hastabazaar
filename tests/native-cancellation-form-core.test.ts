import assert from 'node:assert/strict';
import test from 'node:test';
import { manualOrderFixture } from './helpers/manual-payment-fixture';
import { cancellationPreview, cancelSelectedParcels } from '../lib/cancellation/repository';
import { validateSellerFormSubmission } from '../lib/forms/submission';
import { listCustomerCancellationAnswers } from '../lib/forms/cancellation-history';

void test('actual current customer cancellation preserves native core replay and authorized original answer history', async () => {
  const f = await manualOrderFixture();
  try {
    const access = { orderNumber: f.order.orderNumber, customerId: 'customer' };
    const sellerIds = f.sqlite.prepare('SELECT DISTINCT seller_id FROM order_items WHERE order_id=? ORDER BY seller_id').all(f.orderId).map(row => String(row.seller_id));
    assert.ok(sellerIds.length > 0);
    const preview = await cancellationPreview(f.db, access, sellerIds);
    const checked = await validateSellerFormSubmission(f.db, 'commerce.order-cancellation', 1, []), requestId = 'native-core-order-cancellation';
    const command = { sellerIds, fingerprint: preview.fingerprint, requestId, note: 'The original customer cancels its original unhanded parcel.', now: Date.now(),
      form: { formId: 'commerce.order-cancellation' as const, requestId, versionId: checked.versionId, answers: checked.answers } };
    await cancelSelectedParcels(f.db, access, command);
    await cancelSelectedParcels(f.db, access, command);
    const history = await listCustomerCancellationAnswers(f.db, { customerId: 'customer', orderId: f.orderId });
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].versionId, checked.versionId);
    assert.equal((await listCustomerCancellationAnswers(f.db, { customerId: 'foreign', orderId: f.orderId })).items.length, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='commerce.order-cancellation'").get()?.n, 0);
    await assert.rejects(cancelSelectedParcels(f.db, { ...access, customerId: 'foreign' }, command));
  } finally { f.dispose(); }
});
