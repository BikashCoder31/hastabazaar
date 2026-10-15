import assert from 'node:assert/strict';
import test from 'node:test';
import { earnedMaker, refund } from './helpers/company-store-financial-fixture';


import { addCartItem } from '../lib/db/repositories/cart';
import { createCodOrder } from '../lib/db/repositories/orders';

import { accrueManagedEntitlements, prepareManagedPayout,
  transitionManagedPayout, cancelManagedPayout, getManagedFinanceSummary, releaseManagedEligibility } from '../lib/db/repositories/managed-settlements';
import { getManagedSettlementBlockers } from '../lib/managed-commerce/settlement-readiness';

test('refund racing preparation cannot reserve the previous amount', async () => {
  const f = await earnedMaker();
  try {
    f.setBeforeBatch(() => refund(f));
    await assert.rejects(prepareManagedPayout(f.db, f.context));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE subject_type='managed_payout'").get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT amount_paisa FROM managed_settlement_entries WHERE type='refund_adjustment'").get()?.amount_paisa, -27300);
  } finally { f.dispose(); }
});

test('cancel unpaid reservation permits correct re-preparation without deleting history', async () => {
  const f = await earnedMaker();
  try {
    const first = await prepareManagedPayout(f.db, f.context);
    const reserved = await getManagedFinanceSummary(f.db, f.sellerId, f.financialNow);
    assert.equal(reserved.reservedPaisa, 91000);
    assert.equal(reserved.eligiblePaisa, 0);
    await refund(f);
    const cancellation = { payoutId: first, actorId: 'reviewer', requestId: 'cancel-fictional-payment',
      environment: f.context.environment, reason: 'Cancel stale reservation after the recorded refund.', now: f.financialNow + 1 };
    await cancelManagedPayout(f.db, cancellation);
    await cancelManagedPayout(f.db, cancellation);
    assert.equal(f.sqlite.prepare('SELECT disposition FROM managed_payout_allocations WHERE payout_id=?').get(first)?.disposition, 'released');
    const second = await prepareManagedPayout(f.db, { ...f.context, requestId: 'prepare-corrected-payment', now: f.financialNow + 2 });
    assert.notEqual(second, first);
    assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(second)?.amount_paisa, 63700);
    await transitionManagedPayout(f.db, { ...f.context, payoutId: second, action: 'mark_paid', requestId: 'pay-corrected-payment', providerReference: 'SIM-CORRECTED-PAID', now: f.financialNow + 3 });
    assert.equal((await getManagedFinanceSummary(f.db, f.sellerId, f.financialNow + 4)).balancePaisa, 0);
    await assert.rejects(cancelManagedPayout(f.db, { ...cancellation, payoutId: second, requestId: 'cancel-paid-attempt' }), /paid|unpaid/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 2);
  } finally { f.dispose(); }
});

test('release respects an open return and payment rechecks authority at commit', async () => {
  const f = await earnedMaker(false);
  try {
    f.sqlite.prepare(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at) VALUES('held-return',?,'Fictional return','Review this item','requested',?)`).run(f.itemId, f.now);
    assert.equal((await getManagedSettlementBlockers(f.db, { sellerId: f.sellerId, entitlementId: f.entitlementId, now: f.financialNow }))[0]?.kind, 'return');
    const release = { ...f.context, requestId: 'release-held-earnings' };
    assert.equal((await releaseManagedEligibility(f.db, release)).released, 0);
    f.sqlite.prepare("UPDATE return_requests SET status='resolved' WHERE id='held-return'").run();
    assert.equal((await releaseManagedEligibility(f.db, { ...release, requestId: 'release-resolved-earnings' })).released, 1);
    f.setBeforeBatch(() => { f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run(); });
    await assert.rejects(prepareManagedPayout(f.db, f.context), /authority|changed/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 0);
  } finally { f.dispose(); }
});

test('open item and order-wide cases block payment preparation', async () => {
  const f = await earnedMaker();
  try {
    f.sqlite.prepare(`INSERT INTO complaints(id,reference_number,order_id,category,subject,detail,status,created_at,updated_at)
      VALUES('complaint-one','FICT-COMP',?,'product','Fictional complaint','Order-wide attribution','open',1,1)`).run(f.orderId);
    await assert.rejects(prepareManagedPayout(f.db, f.context), /case|complaint|blocked|eligible/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 0);
  } finally { f.dispose(); }
});

test('prepared payment is blocked by a later refund and changed retry intent', async () => {
  const f = await earnedMaker();
  try {
    const payoutId = await prepareManagedPayout(f.db, f.context);
    await assert.rejects(prepareManagedPayout(f.db, { ...f.context, destinationReference: 'SIM-DIFFERENT-DESTINATION' }), /different|reference|receiving/i);
    await refund(f);
    await assert.rejects(transitionManagedPayout(f.db, { payoutId, actorId: 'reviewer', action: 'mark_paid',
      requestId: 'record-fictional-payment', providerReference: 'SIM-PAID-REFERENCE', reason: f.context.reason,
      environment: f.context.environment, now: f.financialNow }), /changed|refund|balance|reconcil/i);
    assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts').get()?.status, 'approved');
  } finally { f.dispose(); }
});

test('post-payment refund offsets a later entitlement once', async () => {
  const f = await earnedMaker();
  try {
    const first = await prepareManagedPayout(f.db, f.context);
    await transitionManagedPayout(f.db, { ...f.context, payoutId: first, action: 'mark_paid', requestId: 'first-paid', providerReference: 'SIM-FIRST-PAID' });
    await refund(f);
    assert.equal((await getManagedFinanceSummary(f.db, f.sellerId, f.financialNow)).balancePaisa, -27300);
    await addCartItem(f.db, 'second-cart', 'cup', 1, f.financialNow + 1);
    await createCodOrder(f.db, 'second-cart', 'second-receipt', {
      customerEmail: 'buyer@local.hastabazaar.test', customerPhone: '9811111111', customerAuthSubject: 'buyer', locale: 'en-NP', termsAccepted: true,
      idempotencyKey: 'second-order', address: { recipientName: 'Fictional buyer', phone: '9811111111', province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional street' },
    }, f.financialNow + 2, 'buyer');
    const secondOrder = String(f.sqlite.prepare('SELECT id FROM orders WHERE id<>?').get(f.orderId)?.id);
    f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=? WHERE id=?").run(f.financialNow + 3, secondOrder);
    f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE order_id=?").run(secondOrder);
    const later = f.financialNow + 8 * 86_400_000;
    await accrueManagedEntitlements(f.db, { orderId: secondOrder, actorId: 'reviewer', requestId: 'second-earned', now: later });
    const second = await prepareManagedPayout(f.db, { ...f.context, requestId: 'second-prepared', scheduledFor: later, now: later });
    assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(second)?.amount_paisa, 63700);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payout_allocations WHERE payout_id=? AND amount_paisa=-27300').get(second)?.n, 1);
    await transitionManagedPayout(f.db, { ...f.context, payoutId: second, action: 'mark_paid', requestId: 'second-paid', providerReference: 'SIM-SECOND-PAID', now: later });
    assert.equal((await getManagedFinanceSummary(f.db, f.sellerId, later)).balancePaisa, 0);
    await assert.rejects(prepareManagedPayout(f.db, { ...f.context, requestId: 'duplicate-offset-attempt', now: later }), /positive|eligible/i);
    assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(first)?.amount_paisa, 91000);
    assert.equal(f.sqlite.prepare('SELECT paid_at FROM managed_entitlements WHERE id=?').get(f.entitlementId)?.paid_at,
      f.financialNow, 'a later refund offset must preserve the original paid earning time');
  } finally { f.dispose(); }
});

test('cancelling a legacy reservation preserves its permanent entry links', async () => {
  const f = await earnedMaker();
  try {
    f.sqlite.prepare(`INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,simulation_label,
      prepared_by,approved_by,scheduled_for,request_id,created_at,updated_at) VALUES('legacy-payment',?,'SIM-LEGACY',91000,'approved',?,'SIMULATED','reviewer','reviewer',?,'legacy-payment',?,?)`)
      .run(f.sellerId, f.context.destinationReference, f.financialNow, f.financialNow, f.financialNow);
    f.sqlite.prepare(`INSERT INTO managed_payout_entries(payout_id,settlement_entry_id) SELECT 'legacy-payment',id FROM managed_settlement_entries WHERE entitlement_id=?`).run(f.entitlementId);
    await refund(f);
    await cancelManagedPayout(f.db, { ...f.context, payoutId: 'legacy-payment', requestId: 'cancel-legacy-reservation' });
    await prepareManagedPayout(f.db, { ...f.context, requestId: 'new-allocation-after-legacy' });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payout_entries').get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT status FROM managed_payouts WHERE id='legacy-payment'").get()?.status, 'rejected');
    assert.equal(f.sqlite.prepare("SELECT amount_paisa FROM managed_payouts WHERE id<>'legacy-payment'").get()?.amount_paisa, 63700);
  } finally { f.dispose(); }
});

test('new cases block approval and payment until their recorded resolution', async () => {
  const f = await earnedMaker();
  try {
    f.sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at)
      VALUES('legacy-preparer','preparer@local.hastabazaar.test','Fictional legacy finance preparer','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES('legacy-preparer','admin',1);`);
    const payoutId = await prepareManagedPayout(f.db, { ...f.context, actorId: 'legacy-preparer' });
    assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts').get()?.status, 'prepared');
    f.sqlite.prepare(`INSERT INTO complaints(id,reference_number,order_id,category,subject,detail,status,created_at,updated_at)
      VALUES('later-complaint','LATER-COMP',?,'product','Fictional complaint','Order-wide complaint','open',1,1)`).run(f.orderId);
    const approval = { ...f.context, payoutId, action: 'approve' as const, requestId: 'approve-after-cases' };
    await assert.rejects(transitionManagedPayout(f.db, approval), /case|reconcil/i);
    f.sqlite.prepare("UPDATE complaints SET status='resolved' WHERE id='later-complaint'").run();
    await transitionManagedPayout(f.db, approval);
    f.sqlite.prepare(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at)
      VALUES('later-return',?,'Fictional return','Item review','requested',?)`).run(f.itemId, f.financialNow);
    const payment = { ...f.context, payoutId, action: 'mark_paid' as const, requestId: 'pay-after-cases', providerReference: 'SIM-REVIEWED-PAYMENT' };
    await assert.rejects(transitionManagedPayout(f.db, payment), /case|reconcil/i);
    f.sqlite.prepare("UPDATE return_requests SET status='resolved' WHERE id='later-return'").run();
    f.sqlite.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,reason,requested_at)
      VALUES('pending-refund',?,'later-return','approved',30000,'Fictional pending refund',?)`).run(f.orderId, f.financialNow);
    await assert.rejects(transitionManagedPayout(f.db, payment), /refund|case|reconcil/i);
    f.sqlite.prepare("UPDATE refunds SET status='rejected' WHERE id='pending-refund'").run();
    await transitionManagedPayout(f.db, payment);
    assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts').get()?.status, 'paid');
    assert.throws(() => f.sqlite.prepare('DELETE FROM managed_payout_allocations').run(), /permanent/i);
    assert.throws(() => f.sqlite.prepare('UPDATE managed_payout_allocations SET amount_paisa=1').run(), /immutable/i);
  } finally { f.dispose(); }
});

test('unpaid or undelivered sales earn zero and a full refund leaves no rounding residue', async () => {
  const f = await earnedMaker('calculated');
  try {
    f.sqlite.prepare("UPDATE orders SET status='delivered',delivered_at=? WHERE id=?").run(f.now + 7, f.orderId);
    f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE id=?").run(f.itemId);
    const earning = { orderId: f.orderId, actorId: 'reviewer', requestId: 'incomplete-earning', now: f.financialNow };
    assert.equal(await accrueManagedEntitlements(f.db, earning), 0);
    f.sqlite.prepare("UPDATE orders SET status='confirmed',payment_status='paid' WHERE id=?").run(f.orderId);
    f.sqlite.prepare("UPDATE order_items SET fulfillment_status='pending' WHERE id=?").run(f.itemId);
    assert.equal(await accrueManagedEntitlements(f.db, earning), 0);
    f.sqlite.prepare("UPDATE orders SET status='delivered' WHERE id=?").run(f.orderId);
    f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE id=?").run(f.itemId);
    assert.equal(await accrueManagedEntitlements(f.db, earning), 1);
    await refund(f, 100000);
    assert.equal((await getManagedFinanceSummary(f.db, f.sellerId, f.financialNow)).balancePaisa, 0);
    assert.equal(f.sqlite.prepare("SELECT amount_paisa FROM managed_settlement_entries WHERE type='refund_adjustment'").get()?.amount_paisa, -91000);
    await assert.rejects(prepareManagedPayout(f.db, f.context), /positive|eligible/i);
  } finally { f.dispose(); }
});

test('unattributed seller complaint or paid order-wide refund requires review', async () => {
  const f = await earnedMaker();
  try {
    f.sqlite.prepare(`INSERT INTO complaints(id,reference_number,seller_id,category,subject,detail,status,created_at,updated_at)
      VALUES('unattributed','UNATTRIBUTED',?,'product','Fictional complaint','Seller attribution needs review','open',1,1)`).run(f.sellerId);
    await assert.rejects(prepareManagedPayout(f.db, f.context), /unblocked|eligible|case/i);
    f.sqlite.prepare("UPDATE complaints SET status='closed' WHERE id='unattributed'").run();
    f.sqlite.prepare(`INSERT INTO refunds(id,order_id,status,amount_paisa,commission_base_refunded_paisa,reason,requested_at)
      VALUES('order-wide',?,'paid',30000,30000,'Fictional order-wide refund',?)`).run(f.orderId, f.financialNow);
    assert.equal((await getManagedSettlementBlockers(f.db, { sellerId: f.sellerId, entitlementId: f.entitlementId, now: f.financialNow }))[0]?.kind, 'refund');
    await assert.rejects(prepareManagedPayout(f.db, f.context), /unblocked|eligible|case/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 0);
  } finally { f.dispose(); }
});

test('payment preparation cannot silently replace the operator balance preview', async () => {
  const f = await earnedMaker();
  try {
    await assert.rejects(prepareManagedPayout(f.db, { ...f.context, expectedAmountPaisa: 90000 }), /preview|balance|changed/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 0);
  } finally { f.dispose(); }
});
