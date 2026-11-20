import assert from 'node:assert/strict';
import test from 'node:test';
import {mixedFixedAfterRestoredFixture,historicalPartialFixedFixture} from './helpers/historical-partial-fixed-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import * as recovery from '../lib/payments/seller-recovery';

void test('native concurrent corrections restore only the original fixed unpaid component after a separately restored payout',async()=>{
 const f=await mixedFixedAfterRestoredFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await recovery.getSellerRecoveryReview(db,'reviewer',f.caseId);
  assert.equal(review.source.confirmedPaisa,0);assert.equal(review.source.originalUnpaidOffsetPaisa,40000);
  const input={caseId:f.caseId,reviewDigest:review.reviewDigest,newUnpaidResponsibilityPaisa:0,environment:f.environment,evidenceReference:'FICTIONAL-FIXED-NATIVE-UNPAID-CORRECTION',reason:'Correct only the original unpaid component while retaining the separately restored and actually paid repayment.',publicMessage:'Your original unpaid charge is corrected separately from your earlier repayment restoration.'};
  const contexts=['fixed-native-unpaid-a','fixed-native-unpaid-b'].map(id=>f.ctx(id,String(review.case.revision)));
  const attempts=await Promise.allSettled(contexts.map(ctx=>recovery.correctUnpaidSellerRecoverySource(db,ctx,input)));
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1,JSON.stringify(attempts,(_key,value)=>value instanceof Error?{message:value.message,stack:value.stack}:value));
  const winner=attempts.findIndex(a=>a.status==='fulfilled');assert.deepEqual(await recovery.correctUnpaidSellerRecoverySource(db,contexts[winner],input),(attempts[winner] as PromiseFulfilledResult<unknown>).value);
  const final=await recovery.getSellerRecoveryReview(db,'reviewer',f.caseId);assert.equal(final.source.unpaidResponsibilityRestoredPaisa,40000);assert.equal(final.source.confirmedPaisa,0);assert.equal(final.position.recoveredPaisa,0);assert.equal(final.source.blocker,null);
  assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_unpaid_corrections WHERE case_id=?').bind(f.caseId).first<{n:number}>())!.n,40000);
  await assert.rejects(db.prepare('UPDATE seller_recovery_unpaid_corrections SET amount_paisa=60000 WHERE case_id=?').bind(f.caseId).run(),/retained|immutable|constraint/i);
  await assert.rejects(db.prepare('DELETE FROM seller_recovery_unpaid_corrections WHERE case_id=?').bind(f.caseId).run(),/retained|immutable/i);
  assert.equal((await db.prepare('SELECT amount_paisa amount FROM managed_supplier_payments WHERE id=?').bind(f.payoutId).first<{amount:number}>())!.amount,40000);
 }finally{await native?.dispose();f.dispose();}
});

void test('native fixed unpaid and deficit carrier decisions share one receipt and require a refreshed competing review',async()=>{
 const {recordBankReceipt}=await import('../lib/payments/manual-receipts');
 const f=await historicalPartialFixedFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('fixed-native-components-open'),{kind:'supplier_adjustment',id:f.adjustmentId,reason:'Review the legacy original unpaid and additional deficit components against one actual carrier credit.'});
  const receipt=await recordBankReceipt(f.db,f.ctx('fixed-native-components-bank'),{accountVersionId:f.sources.accountVersionId,transactionIdentity:'FICTIONAL-FIXED-NATIVE-COMPONENTS',bankAt:Date.now()-1,amountMinor:60000,currency:'NPR',payerReference:'Fictional original carrier',payerUserId:null,conflictUserIds:[],completedCreditConfirmed:true,evidenceReference:'FICTIONAL-FIXED-NATIVE-CARRIER-CREDIT',reason:'Independently verify one actual fictional carrier credit covering both original components.'});
  native=await nativeFinanceClone(f.sqlite);const db=native.db;
  async function attempt(index:number,name:string){
   const review=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id),control=await db.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').bind(receipt.id).first<{revision:number}>();
   const ctx=f.ctx(name,String(review.case.revision)),common={caseId:opened.id,receiptId:receipt.id,receiptRevision:control!.revision,reviewDigest:review.reviewDigest,environment:f.environment,evidenceReference:'FICTIONAL-NATIVE-EXACT-ORIGINAL-COMPONENT',reason:'Match only this exact original component against the same retained actual carrier credit and original payment basis.',publicMessage:'Carrier coverage is applied once to this separately explained original component.'};
   return ()=>index===0?recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(db,ctx,{...common,amountPaisa:40000,originalUnpaidCostConfirmed:true}):recovery.reconcileSellerRecoveryCarrierReceipt(db,ctx,{...common,amountPaisa:20000,resolveDisputedPaisa:0,originalCostReimbursementConfirmed:true});
  }
  const attempts=await Promise.all([attempt(0,'fixed-native-unpaid-component'),attempt(1,'fixed-native-deficit-component')]);
  const results=await Promise.allSettled(attempts.map(run=>run()));assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results,(_key,v)=>v instanceof Error?v.message:v));
  const winner=results.findIndex(r=>r.status==='fulfilled');assert.deepEqual(await attempts[winner](),(results[winner] as PromiseFulfilledResult<unknown>).value);
  await(await attempt(1-winner,'fixed-native-refreshed-component'))();
  const final=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);assert.equal(final.source.confirmedPaisa,20000);assert.equal(final.position.recoveredPaisa,20000);assert.equal(final.position.remainingPaisa,0);assert.equal(final.source.carrierUnpaidCoveredPaisa,40000);assert.equal(final.source.carrierUnpaidAvailablePaisa,0);
  assert.equal((await db.prepare('SELECT SUM(amount_paisa) amount FROM seller_recovery_allocations WHERE receipt_id=?').bind(receipt.id).first<{amount:number}>())!.amount,60000);
 }finally{await native?.dispose();f.dispose();}
});
