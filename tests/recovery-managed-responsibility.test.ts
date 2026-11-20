import assert from 'node:assert/strict';
import test from 'node:test';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {readSellerRecoverySource} from '../lib/payments/seller-recovery';
import {recordBankReceipt} from '../lib/payments/manual-receipts';

for(const responsibility of ['seller','platform'] as const)void test(`actual managed post-payout refund reconciles original ${responsibility} responsibility without changing its paid payout`,async()=>{
 const f=await managedRecoveryFixture(responsibility);try{
 const source=await readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId});
 assert.equal(source.model,'managed');assert.equal(source.blocker,null);
 assert.equal(source.confirmedPaisa,responsibility==='seller'?f.originalPaidPaisa:0);
 assert.equal(source.nativeDebitPaisa,responsibility==='seller'?f.originalPaidPaisa:0);
 assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(f.payoutId)!.status,'paid');
 assert.equal(f.sqlite.prepare('SELECT state FROM refund_obligations WHERE id=?').get(f.obligationId)!.state,'completed');
 }finally{f.dispose();}
});

void test('managed actual repayment settles the original native entitlement debt once and preserves the commercial model',async()=>{
 const f=await managedRecoveryFixture();try{
 const path='../lib/payments/seller-recovery';const m=await import(path);
 const opened=await m.openSellerRecovery(f.db,f.ctx('managed-case-open'),{kind:'refund',id:f.refundId,reason:'Reconcile original managed responsibility and the actual completed refund and payout.'});
 const review=await m.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 await m.approveSellerRecovery(f.db,f.ctx('managed-case-approved','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-MANAGED-ORIGINAL-RECONCILIATION',reason:'Approve only the original managed net liability with one eligible Super Admin.'});
 const receipt=await recordBankReceipt(f.db,f.ctx('managed-actual-repayment'),{accountVersionId:f.payoutSources.accountVersionId,transactionIdentity:'FICTIONAL-MANAGED-REPAYMENT-CREDIT',bankAt:Date.now()-10,amountMinor:f.originalPaidPaisa,currency:'NPR',payerReference:'Fictional original maker',payerUserId:review.source.ownerId,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-MANAGED-ACTUAL-RECEIPT',reason:'Match the independently confirmed actual same-maker company credit before allocation.'});
 const input={caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:f.originalPaidPaisa,method:'cash',environment:f.context.environment,evidenceReference:'FICTIONAL-MANAGED-ACTUAL-ALLOCATION',reason:'Apply the original matched money to this same managed entitlement without charging it again.'};
 await m.allocateSellerRecoveryReceipt(f.db,f.ctx('managed-repayment-allocation','1'),input);
 await m.allocateSellerRecoveryReceipt(f.db,f.ctx('managed-repayment-allocation','1'),input);
 assert.equal((await m.getSellerRecoveryReview(f.db,'reviewer',opened.id)).position.remainingPaisa,0);
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM managed_settlement_entries WHERE entitlement_id=?").get(f.entitlementId)!.n,f.originalPaidPaisa);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries WHERE seller_id=?').get(f.sellerId)!.n,0);
 }finally{f.dispose();}
});

