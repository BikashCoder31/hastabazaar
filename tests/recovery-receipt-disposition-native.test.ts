import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {recoveryReceiptReversalFixture} from './helpers/recovery-receipt-reversal-fixture';
import * as disposition from '../lib/payments/recovery-receipt-disposition';
import * as recovery from '../lib/payments/seller-recovery';
for(const model of ['registered','managed','fixed'] as const)for(const restored of [false,true])void test(`native ${model} ${restored?'company-loss':'original-debt'} competing reversal decisions attribute one real bank return once`,async()=>{
 const f=await recoveryReceiptReversalFixture(model,restored,restored?20000:30000);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await disposition.getRecoveryReceiptReversalReview(db,'reviewer',f.reversalId),env=f.environment?{environment:f.environment}:{};
  const input={reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocationId,amountPaisa:10000,companyLossApproved:restored}],...env,evidenceReference:'FICTIONAL-NATIVE-REVERSAL-ATTRIBUTION',reason:'Attribute only this actual reversed receipt amount against its exact original allocation and retained responsibility.',publicMessage:'NPR 100 of the original repayment was reversed. The actual retained repayment and remaining original balance are corrected.'};
  const contexts=['native-reversal-attribution-a','native-reversal-attribution-b'].map(id=>f.ctx(id,String(review.receiptRevision)));
  const results=await Promise.allSettled(contexts.map(ctx=>disposition.reconcileRecoveryReceiptReversal(db,ctx,input)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(r=>r.status==='fulfilled');assert.deepEqual(await disposition.reconcileRecoveryReceiptReversal(db,contexts[winner],input),(results[winner] as PromiseFulfilledResult<unknown>).value);
  const after=await recovery.getSellerRecoveryReview(db,'reviewer',f.caseId);assert.equal(after.unreconciledReceiptPaisa,0);assert.equal(after.position.recoveredPaisa,restored?0:10000);assert.equal(after.position.remainingPaisa,restored?0:f.originalConfirmedPaisa-10000);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_receipt_reversal_parts').first<{n:number}>())!.n,1);
  await assert.rejects(db.prepare('DELETE FROM seller_recovery_receipt_reversal_parts').run(),/retained/);
  if(!restored){const current=await disposition.getRecoveryReceiptReversalReview(db,'reviewer',f.reversalId);await recovery.allocateSellerRecoveryReceipt(db,f.ctx('native-original-unused-allocation',String(after.case.revision)),{caseId:f.caseId,receiptId:f.receiptId,receiptRevision:current.receiptRevision,amountPaisa:10000,method:'cash',...env,evidenceReference:'FICTIONAL-NATIVE-ORIGINAL-UNUSED',reason:'Apply only the original unused actual credit after the allocated reversal was completely attributed.'});assert.equal((await recovery.getSellerRecoveryReview(db,'reviewer',f.caseId)).position.recoveredPaisa,20000);}

 }finally{await native?.dispose();f.dispose();}
});
