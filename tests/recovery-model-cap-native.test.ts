import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';
import {openSellerRecovery,getSellerRecoveryReview,approveSellerRecovery,allocateSellerRecoveryReceipt} from '../lib/payments/seller-recovery';
import {recordBankReceipt} from '../lib/payments/manual-receipts';

for(const scenario of [
 {model:'managed',fixture:async()=>{const f=await managedRecoveryFixture('seller');return {...f,environment:f.context.environment,accountVersionId:f.payoutSources.accountVersionId,recoverySource:{kind:'refund' as const,id:f.refundId}};},creditSql:"SELECT SUM(amount_paisa) n FROM managed_settlement_entries WHERE reason_code='recovery_settlement'"},
 {model:'fixed',fixture:async()=>{const f=await fixedRecoveryFixture();return {...f,accountVersionId:f.sources.accountVersionId,recoverySource:{kind:'supplier_adjustment' as const,id:f.adjustmentId}};},creditSql:'SELECT SUM(amount_paisa) n FROM managed_supplier_recovery_credits'},
])void test(`native ${scenario.model} competing repayments retain one cap and one original-model settlement`,async()=>{
 const source=await scenario.fixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 const opened=await openSellerRecovery(source.db,source.ctx('native-model-case'),{...source.recoverySource,reason:'Reconcile the original actual paid native obligation and confirmed responsibility before allocation.'});
 const review=await getSellerRecoveryReview(source.db,'reviewer',opened.id),amount=review.source.confirmedPaisa;
 await approveSellerRecovery(source.db,source.ctx('native-model-approval','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-MODEL-RESPONSIBILITY-REVIEW',reason:'One eligible Super Admin approves only the confirmed original native debt.'});
 const receipts=[];
 for(const suffix of ['one','two'])receipts.push(await recordBankReceipt(source.db,source.ctx('model-receipt-'+suffix),{accountVersionId:source.accountVersionId,transactionIdentity:'FICTIONAL-MODEL-INCOMING-'+suffix,bankAt:Date.now()-1,amountMinor:amount,currency:'NPR',payerReference:'Fictional original same-model owner',payerUserId:review.source.ownerId,completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-MODEL-INDEPENDENT-CREDIT-'+suffix,reason:'Verify the actual original owner company credit before the disposable native race.'}));
 target=await nativeFinanceClone(source.sqlite);
 const results=await Promise.allSettled(receipts.map((receipt,i)=>allocateSellerRecoveryReceipt(target!.db,source.ctx('native-model-allocation-'+i,'1'),{caseId:opened.id,receiptId:receipt.id,receiptRevision:0,amountPaisa:amount,method:'cash',environment:source.environment,evidenceReference:'FICTIONAL-MODEL-NATIVE-REPAYMENT',reason:'Apply only actual same-owner money to the original same-model liability once.'})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
 assert.equal((await target.db.prepare(scenario.creditSql).first<{n:number}>())!.n,amount);
 assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,1);
 const current=await getSellerRecoveryReview(target.db,'reviewer',opened.id);assert.equal(current.position.remainingPaisa,0);assert.equal(current.position.overRecoveredPaisa,0);
 const loser=results.findIndex(r=>r.status==='rejected');
 assert.equal((await target.db.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').bind(receipts[loser].id).first<{revision:number}>())!.revision,0);
 }finally{await target?.dispose();source.dispose();}
});
