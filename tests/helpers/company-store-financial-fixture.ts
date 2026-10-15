import assert from 'node:assert/strict';
import { readyMaker } from './company-store-lifecycle-fixture';
import { activateManagedMakerForSimulation } from '../../lib/managed-commerce/activation';
import { reviewProduct } from '../../lib/db/repositories/products';
import { addCartItem } from '../../lib/db/repositories/cart';
import { createCodOrder } from '../../lib/db/repositories/orders';
import { seedCheckoutBuyer } from './checkout-contact';
import { accrueManagedEntitlements, applyManagedRefundAdjustment } from '../../lib/db/repositories/managed-settlements';
export async function earnedMaker(mature: boolean | 'calculated' = true) {
  const f = await readyMaker();
  await activateManagedMakerForSimulation(f.db, f.activation);
  await reviewProduct(f.db, { productId: 'cup', actorId: 'reviewer', action: 'publish', reason: 'Publish isolated settlement product', requestId: 'settlement-product', now: f.now + 4 });
  await addCartItem(f.db, 'settlement-cart', 'cup', 1, f.now + 5);
  await seedCheckoutBuyer(f.db, 'buyer', 'buyer@local.hastabazaar.test', '9811111111', f.now);
  await createCodOrder(f.db, 'settlement-cart', 'settlement-receipt', {
    customerEmail: 'buyer@local.hastabazaar.test', customerPhone: '9811111111', customerAuthSubject: 'buyer', locale: 'en-NP', termsAccepted: true,
    idempotencyKey: 'settlement-order', address: { recipientName: 'Fictional buyer', phone: '9811111111', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional street' },
  }, f.now + 6, 'buyer');
  const orderId = String(f.sqlite.prepare('SELECT id FROM orders').get()?.id);
  const itemId = String(f.sqlite.prepare('SELECT id FROM order_items').get()?.id);
  const entitlementId = String(f.sqlite.prepare('SELECT id FROM managed_entitlements').get()?.id);
  const financialNow = f.now + 8 * 86_400_000;
  if (mature !== 'calculated') {
    f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=? WHERE id=?").run(f.now + 7, orderId);
    f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE id=?").run(itemId);
    assert.equal(await accrueManagedEntitlements(f.db, { orderId, actorId: 'reviewer', requestId: 'earn-fictional', now: mature ? financialNow : f.now + 8 }), 1);
  }
  const context = { sellerId: f.sellerId, actorId: 'reviewer', destinationReference: f.activation.payoutBeneficiaryReference,
    requestId: 'prepare-fictional-payment', reason: 'Fictional completed paid sale reviewed for settlement.', now: financialNow,
    scheduledFor: financialNow, environment: f.activation.environment };
  return { ...f, financialNow, orderId, itemId, entitlementId, context };
}
type Earned = Awaited<ReturnType<typeof earnedMaker>>;
export async function refund(f: Earned, base = 30000) {
  f.sqlite.prepare(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at) VALUES('return-one',?,'Fictional refund','Fictional evidence','resolved',?)`).run(f.itemId, f.financialNow);
  f.sqlite.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,commission_base_refunded_paisa,reason,requested_at)
    VALUES('refund-one',?,'return-one','paid',?,?,'Fictional paid refund',?)`).run(f.orderId, base, base, f.financialNow);
  await applyManagedRefundAdjustment(f.db, { entitlementId: f.entitlementId, refundId: 'refund-one', refundedEligibleBasePaisa: base,
    actorId: 'reviewer', reasonCode: 'refund', requestId: 'fictional-refund-adjustment', now: f.financialNow });
}

