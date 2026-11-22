import assert from 'node:assert/strict';
import test from 'node:test';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {getFixedSupplyBalance} from '../lib/managed-commerce/fixed-supply';
import {recordBankReceipt} from '../lib/payments/manual-receipts';

void test('fixed supplier repayment settles only its original approved supply adjustment without a retail refund or invented second defect',async()=>{
 const f=await fixedRecoveryFixture();try{
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('fixed-recovery-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Reconcile the original paid supplier obligation and approved supply defect independently of resale.'});
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
 assert.equal(review.source.confirmedPaisa,20000);assert.equal(review.source.model,'fixed');
 await recovery.approveSellerRecovery(f.db,f.ctx('fixed-recovery-approval','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-FIXED-RESPONSIBILITY-REVIEW',reason:'Approve only the original confirmed supplier amount with one eligible Super Admin.'});
 const receipt=await recordBankReceipt(f.db,f.ctx('fixed-incoming-repayment'),{accountVersionId:f.sources.accountVersionId,transactionIdentity:'FICTIONAL-FIXED-INCOMING-REPAYMENT',bankAt:Date.now()-10,amountMinor:20000,currency:'NPR',payerReference:'Fictional original supplier',payerUserId:review.source.ownerId,completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-FIXED-INDEPENDENT-INCOMING-CREDIT',reason:'Independently verify the actual supplier repayment to the company and original payer.'});
 const input={caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:20000,method:'cash' as const,environment:f.environment,evidenceReference:'FICTIONAL-FIXED-ALLOCATION-EVIDENCE',reason:'Settle the original approved supplier debt through its own native model once.'};
 await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('fixed-repayment-allocation','1'),input);
 await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('fixed-repayment-allocation','1'),input);
 assert.equal((await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id)).position.remainingPaisa,0);
 assert.equal((await getFixedSupplyBalance(f.db,f.recordId)).recoverablePaisa,0);
 assert.equal((await getFixedSupplyBalance(f.db,f.recordId)).balancePaisa,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_supplier_adjustments').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_ledger_entries').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT status FROM managed_supplier_payments WHERE id=?').get(f.payoutId)!.status,'paid');
 }finally{f.dispose();}
});
