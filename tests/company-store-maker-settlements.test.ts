import assert from 'node:assert/strict';
import test from 'node:test';
import { earnedMaker, refund, appendHistoricalManagedSale } from './helpers/company-store-financial-fixture';


import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';

import { accrueManagedEntitlements, applyManagedRefundAdjustment, prepareManagedPayout,
  transitionManagedPayout, cancelManagedPayout, getManagedFinanceSummary, releaseManagedEligibility } from '../lib/db/repositories/managed-settlements';
import { getManagedSettlementBlockers } from '../lib/managed-commerce/settlement-readiness';

/** Records fictional actual bank evidence through the same protected packet path, never the legacy reference-only writer. */
async function fixtureManagedTransition(f:Awaited<ReturnType<typeof earnedMaker>>,input:Parameters<typeof transitionManagedPayout>[1]){
 if(input.action==='approve')return transitionManagedPayout(f.db,input);
 const context=(suffix:string,revision:string|null=null)=>({...f.payoutSources.ctx(input.requestId+suffix,revision),actorId:input.actorId});
 const packet=await preparePayoutTransfer(f.db,context(':packet'),{model:'managed',payoutId:input.payoutId,accountVersionId:f.payoutSources.accountVersionId,reason:'Review original actual earnings before sending this fictional instruction.',environment:input.environment});
 const approved=await approvePayoutTransfer(f.db,context(':approval','0'),{packetId:packet.id,reason:'Approve the original exact amount and independently verified funding.',environment:input.environment});assert.notEqual(approved.blocked,true);
 await startPayoutTransfer(f.db,context(':start','1'),{packetId:packet.id,reason:'Record the exact fictional original manual bank instruction as processing.',environment:input.environment});
 const amount=Number(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(input.payoutId)!.amount_paisa),retained=f.sqlite.prepare('SELECT bank_at FROM payout_transfer_packets WHERE id=?').get(packet.id)!;
 return recordPayoutTransferOutcome(f.db,context('','2'),{packetId:packet.id,outcome:'paid',amountPaisa:amount,bankAt:retained.bank_at===null?Date.now()-1:Number(retained.bank_at),transactionIdentity:input.providerReference!,evidenceReference:'FICTIONAL-INDEPENDENT-BANK-PROOF-'+input.requestId,completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:input.reason??'Independently verify the original actual fictional completed bank debit.',environment:input.environment});
}

void test('a zero-money cumulative refund is reconciled without a forbidden zero ledger entry',async()=>{
 const f=await earnedMaker();
 try {
  await refund(f,5);
  f.sqlite.prepare(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at) VALUES('tiny-return',?,'Fictional tiny refund','Evidence','resolved',?)`).run(f.itemId,f.financialNow);
  f.sqlite.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,commission_base_refunded_paisa,reason,requested_at)
   VALUES('tiny-refund',?,'tiny-return','paid',1,1,'Fictional rounding refund',?)`).run(f.orderId,f.financialNow);
  await applyManagedRefundAdjustment(f.db,{entitlementId:f.entitlementId,refundId:'tiny-refund',refundedEligibleBasePaisa:1,actorId:'reviewer',reasonCode:'refund',requestId:'tiny-refund-adjustment',now:f.financialNow});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM managed_settlement_entries WHERE refund_id='tiny-refund'").get()?.n,0);
  assert.deepEqual(await getManagedSettlementBlockers(f.db,{sellerId:f.sellerId,entitlementId:f.entitlementId,now:f.financialNow}),[]);
  assert.equal((await getManagedFinanceSummary(f.db,f.sellerId,f.financialNow)).payablePaisa,90995);
  const payoutId=await prepareManagedPayout(f.db,{...f.context,requestId:'tiny-reconciled-prepare'});
  await fixtureManagedTransition(f,{...f.context,payoutId,action:'mark_paid',requestId:'tiny-reconciled-paid',providerReference:'SIM-TINY-RECONCILED'});
  assert.equal((await getManagedFinanceSummary(f.db,f.sellerId,f.financialNow)).balancePaisa,0);
 }finally{f.dispose();}
});

for (const action of ['approve','mark_paid'] as const) for (const race of [false,true]) {
  void test(`a refund on a previously paid sale blocks ${action==='mark_paid'?'an unsent transfer':action} of another reservation${race?' in its commit race':''}`,async()=>{
    const f=await earnedMaker();
    try {
      const first=await prepareManagedPayout(f.db,f.context);
      await fixtureManagedTransition(f,{...f.context,payoutId:first,action:'mark_paid',requestId:'original-sale-paid',providerReference:'SIM-ORIGINAL-PAID'});
      const later=f.financialNow+8*86400000;
      await appendHistoricalManagedSale(f,'later',f.financialNow+3,later);
      if(action==='approve')f.sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('preparer','preparer@local.hastabazaar.test','Fictional preparer','active',1,1);
        INSERT INTO user_roles(user_id,role,assigned_at) VALUES('preparer','admin',1);`);
      const second=await prepareManagedPayout(f.db,{...f.context,actorId:action==='approve'?'preparer':'reviewer',requestId:'later-prepared',now:later,scheduledFor:later});
      if(race)f.setBeforeBatch(async()=>{
        // A same-size new earned sale masks the refund in the aggregate balance.
        // The transaction must still see the unallocated negative old earning.
        await refund(f,100000);
        await appendHistoricalManagedSale(f,'race',f.financialNow+3,later);
      });else await refund(f);
      await assert.rejects(fixtureManagedTransition(f,{...f.context,payoutId:second,action,requestId:'stale-offset-transition',providerReference:'SIM-OVERPAYMENT-BLOCKED',now:later}),/refund|balance|reconcil/i);
      assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(second)?.status,action==='approve'?'prepared':'approved');
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id='stale-offset-transition'").get()?.n,0);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM managed_payout_allocations WHERE payout_id=? AND disposition='paid'").get(second)?.n,0);
      assert.equal((await getManagedFinanceSummary(f.db,f.sellerId,later)).balancePaisa,race?91000:63700);
      await cancelManagedPayout(f.db,{...f.context,payoutId:second,requestId:'cancel-stale-offset',now:later});
      // Cancellation releases the old reservation; it does not authorize debt collection.
      // This historical fixture has no completed-refund proof, itemized notice or netting agreement.
      await assert.rejects(prepareManagedPayout(f.db,{...f.context,requestId:'prepare-without-recovery-authority',now:later,scheduledFor:later}),/reconcil|changed/i);
      assert.equal((await getManagedFinanceSummary(f.db,f.sellerId,later)).balancePaisa,race?91000:63700);
      assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(first)?.amount_paisa,91000);
    }finally{f.dispose();}
  });
}

void test('refund racing preparation cannot reserve the previous amount', async () => {
  const f = await earnedMaker();
  try {
    f.setBeforeBatch(() => refund(f));
    await assert.rejects(prepareManagedPayout(f.db, f.context));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE subject_type='managed_payout'").get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT amount_paisa FROM managed_settlement_entries WHERE type='refund_adjustment'").get()?.amount_paisa, -27300);
  } finally { f.dispose(); }
});

void test('cancel unpaid reservation permits correct re-preparation without deleting history', async () => {
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
    await fixtureManagedTransition(f, { ...f.context, payoutId: second, action: 'mark_paid', requestId: 'pay-corrected-payment', providerReference: 'SIM-CORRECTED-PAID', now: f.financialNow + 3 });
    assert.equal((await getManagedFinanceSummary(f.db, f.sellerId, f.financialNow + 4)).balancePaisa, 0);
    await assert.rejects(cancelManagedPayout(f.db, { ...cancellation, payoutId: second, requestId: 'cancel-paid-attempt' }), /paid|unpaid/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 2);
  } finally { f.dispose(); }
});

void test('release respects an open return and payment rechecks authority at commit', async () => {
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

void test('open item and order-wide cases block payment preparation', async () => {
  const f = await earnedMaker();
  try {
    f.sqlite.prepare(`INSERT INTO complaints(id,reference_number,order_id,category,subject,detail,status,created_at,updated_at)
      VALUES('complaint-one','FICT-COMP',?,'product','Fictional complaint','Order-wide attribution','open',1,1)`).run(f.orderId);
    await assert.rejects(prepareManagedPayout(f.db, f.context), /case|complaint|blocked|eligible/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 0);
  } finally { f.dispose(); }
});

void test('prepared payment is blocked by a later refund and changed retry intent', async () => {
  const f = await earnedMaker();
  try {
    const payoutId = await prepareManagedPayout(f.db, f.context);
    await assert.rejects(prepareManagedPayout(f.db, { ...f.context, destinationReference: 'SIM-DIFFERENT-DESTINATION' }), /different|reference|receiving/i);
    await refund(f);
    await assert.rejects(fixtureManagedTransition(f, { payoutId, actorId: 'reviewer', action: 'mark_paid',
      requestId: 'record-fictional-payment', providerReference: 'SIM-PAID-REFERENCE', reason: f.context.reason,
      environment: f.context.environment, now: f.financialNow }), /changed|refund|balance|reconcil/i);
    assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts').get()?.status, 'approved');
  } finally { f.dispose(); }
});

void test('post-payment historical refund preserves its debt and cannot silently offset later earnings without recovery authority', async () => {
  const f = await earnedMaker();
  try {
    const first = await prepareManagedPayout(f.db, f.context);
    await fixtureManagedTransition(f, { ...f.context, payoutId: first, action: 'mark_paid', requestId: 'first-paid', providerReference: 'SIM-FIRST-PAID' });
    const originalPaidAt=f.sqlite.prepare('SELECT paid_at FROM managed_entitlements WHERE id=?').get(f.entitlementId)!.paid_at;
    await refund(f);
    assert.equal((await getManagedFinanceSummary(f.db, f.sellerId, f.financialNow)).balancePaisa, -27300);
    const later=f.financialNow+8*86400000;
    await appendHistoricalManagedSale(f,'second',f.financialNow+3,later);
    await assert.rejects(prepareManagedPayout(f.db, { ...f.context, requestId: 'second-prepared', scheduledFor: later, now: later }),/reconcil|changed/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n,1);
    assert.equal((await getManagedFinanceSummary(f.db, f.sellerId, later)).balancePaisa, 63700);
    assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM managed_payouts WHERE id=?').get(first)?.amount_paisa, 91000);
    assert.equal(f.sqlite.prepare('SELECT paid_at FROM managed_entitlements WHERE id=?').get(f.entitlementId)?.paid_at,
      originalPaidAt, 'a later refund offset must preserve the original paid earning time');
  } finally { f.dispose(); }
});

void test('cancelling a legacy reservation preserves its permanent entry links', async () => {
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

void test('new cases block approval and payment until their recorded resolution', async () => {
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
    await assert.rejects(fixtureManagedTransition(f, approval), /case|reconcil/i);
    f.sqlite.prepare("UPDATE complaints SET status='resolved' WHERE id='later-complaint'").run();
    await fixtureManagedTransition(f, approval);
    f.sqlite.prepare(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at)
      VALUES('later-return',?,'Fictional return','Item review','requested',?)`).run(f.itemId, f.financialNow);
    const payment = { ...f.context, payoutId, action: 'mark_paid' as const, requestId: 'pay-after-cases', providerReference: 'SIM-REVIEWED-PAYMENT' };
    await assert.rejects(fixtureManagedTransition(f, payment), /case|reconcil/i);
    f.sqlite.prepare("UPDATE return_requests SET status='resolved' WHERE id='later-return'").run();
    f.sqlite.prepare(`INSERT INTO refunds(id,order_id,return_request_id,status,amount_paisa,reason,requested_at)
      VALUES('pending-refund',?,'later-return','approved',30000,'Fictional pending refund',?)`).run(f.orderId, f.financialNow);
    await assert.rejects(fixtureManagedTransition(f, payment), /refund|case|reconcil/i);
    f.sqlite.prepare("UPDATE refunds SET status='rejected' WHERE id='pending-refund'").run();
    await fixtureManagedTransition(f, payment);
    assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts').get()?.status, 'paid');
    assert.throws(() => f.sqlite.prepare('DELETE FROM managed_payout_allocations').run(), /permanent/i);
    assert.throws(() => f.sqlite.prepare('UPDATE managed_payout_allocations SET amount_paisa=1').run(), /immutable/i);
  } finally { f.dispose(); }
});

void test('unpaid or undelivered sales earn zero and a full refund leaves no rounding residue', async () => {
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

void test('unattributed seller complaint or paid order-wide refund requires review', async () => {
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

void test('payment preparation cannot silently replace the operator balance preview', async () => {
  const f = await earnedMaker();
  try {
    await assert.rejects(prepareManagedPayout(f.db, { ...f.context, expectedAmountPaisa: 90000 }), /preview|balance|changed/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_payouts').get()?.n, 0);
  } finally { f.dispose(); }
});
