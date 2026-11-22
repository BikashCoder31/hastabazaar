import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {historicalPartialManagedFixture} from './helpers/historical-partial-managed-fixture';
import * as recovery from '../lib/payments/seller-recovery';
void test('native partial original payment retains one unpaid review and confirms only the actual deficit',async()=>{
 const f=await historicalPartialManagedFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('native-partial-paid-open'),{kind:'refund',id:f.refundId,reason:'Review the actual partial original payment and unpaid component before recovering any additional deficit.'});
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);
  const input={caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-PARTIAL-PAID-PROOF',reason:'Recognize exactly the original unpaid portion once against the actual native bank payment.',publicMessage:'Your original unpaid NPR 455 is used once; the additional NPR 455 remains for independent review.',environment:f.context.environment};
  const contexts=['native-partial-paid-a','native-partial-paid-b'].map(id=>f.ctx(id,String(review.case.revision)));
  const results=await Promise.allSettled(contexts.map(ctx=>recovery.reviewPartialUnpaidSellerRecoverySource(db,ctx,input)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(r=>r.status==='fulfilled');assert.deepEqual(await recovery.reviewPartialUnpaidSellerRecoverySource(db,contexts[winner],input),(results[winner] as PromiseFulfilledResult<unknown>).value);
  const after=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);assert.equal(after.source.confirmedPaisa,45500);assert.equal(after.source.originalUnpaidOffsetPaisa,45500);assert.equal(after.source.blocker,null);
  await recovery.approveSellerRecovery(db,f.ctx('native-partial-paid-approve',String(after.case.revision)),{caseId:opened.id,reviewDigest:after.reviewDigest,evidenceReference:input.evidenceReference,reason:'Approve only the actual additional deficit after recognizing the original unpaid component.'});
 }finally{await native?.dispose();f.dispose();}
});

void test('native different refund cases cannot consume the same remaining unpaid original payment component twice',async()=>{
 const {completeManagedRecoveryRefund}=await import('./helpers/managed-recovery-fixture');
 const f=await historicalPartialManagedFixture(2);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  const {getReturnHandling,recordReturnHandling}=await import('../lib/returns/handling');const {advanceReturnAsAdmin}=await import('../lib/db/repositories/returns');
  const caseId=String(f.sqlite.prepare('SELECT return_request_id FROM refunds WHERE id=?').get(f.refundId)!.return_request_id),handling=(await getReturnHandling(f.db,caseId))!;
  await recordReturnHandling(f.db,f.ctx('partial-paid-native-physical-review',String(handling.revision)),{caseId,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The physical return is waived after the original product review.',privateNote:'The fictional no-return evidence was reviewed before closing physical care.',evidenceReference:'FICTIONAL-PARTIAL-NO-RETURN-PROOF'});
  await advanceReturnAsAdmin(f.db,{returnRequestId:caseId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'Original actual refund and physical care complete.',publicMessageEn:'Your original refund case is complete.',publicMessageNe:'Original refund case complete.',requestId:'partial-paid-native-physical-complete',now:Date.now()});
  const second=await completeManagedRecoveryRefund(f,'seller','native-partial-paid-second-refund',50000);
  const cases=[];for(const [index,id] of [f.refundId,second.refundId].entries())cases.push(await recovery.openSellerRecovery(f.db,f.ctx('native-partial-paid-shared-open-'+index),{kind:'refund',id,reason:'Review this actual refund against the same original paid and unpaid entitlement components.'}));
  native=await nativeFinanceClone(f.sqlite);const db=native.db,reviews=await Promise.all(cases.map(c=>recovery.getSellerRecoveryReview(db,'reviewer',c.id)));
  const results=await Promise.allSettled(reviews.map((review,index)=>recovery.reviewUnpaidSellerRecoverySource(db,f.ctx('native-partial-paid-shared-review-'+index,'0'),{caseId:review.case.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-SHARED-PARTIAL-PAID-ORIGINAL',reason:'Use the remaining original unpaid component once with the exact current shared original pool.',publicMessage:'The remaining original unpaid earnings are applied once against this original refund.',environment:f.context.environment})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  assert.equal((await db.prepare('SELECT used_paisa FROM seller_recovery_original_unpaid_pools').first<{used_paisa:number}>())!.used_paisa,45500);
  const loser=results.findIndex(r=>r.status==='rejected'),fresh=await recovery.getSellerRecoveryReview(db,'reviewer',cases[loser].id);assert.equal(fresh.source.unpaidSource,null);assert.equal(fresh.source.confirmedPaisa,45500);assert.equal(fresh.source.blocker,null);
  await recovery.approveSellerRecovery(db,f.ctx('native-partial-paid-second-deficit','0'),{caseId:fresh.case.id,reviewDigest:fresh.reviewDigest,evidenceReference:'FICTIONAL-SHARED-PARTIAL-PAID-ORIGINAL',reason:'The shared original unpaid earnings are already used; approve only this separate actual remaining deficit.'});
 }finally{await native?.dispose();f.dispose();}
});

void test('native registered partial bank payment preserves the released-reserve unpaid component',async()=>{
 const {historicalPartialRegisteredReviewFixture}=await import('./helpers/historical-partial-registered-fixture');
 const f=await historicalPartialRegisteredReviewFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await recovery.getSellerRecoveryReview(db,'reviewer',f.caseId);
  assert.equal(review.source.partialUnpaidSource?.offsetPaisa,f.originalUnpaidPaisa);
  const input={caseId:f.caseId,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-REGISTERED-PARTIAL-PAYMENT',reason:'Review the exact original bank payment and later release of the retained original reserve.',publicMessage:'The original released reserve is used once; only the additional deficit remains for recovery approval.'};
  await recovery.reviewPartialUnpaidSellerRecoverySource(db,f.ctx('native-registered-partial-source','0'),input);
  const after=await recovery.getSellerRecoveryReview(db,'reviewer',f.caseId);assert.equal(after.source.blocker,null);assert.equal(after.source.confirmedPaisa,f.originalPaidPaisa);assert.equal(after.source.originalUnpaidOffsetPaisa,f.originalUnpaidPaisa);
  await assert.rejects(db.prepare('UPDATE seller_recovery_original_unpaid_pools SET used_paisa=0').run(),/projection/);
  await recovery.approveSellerRecovery(db,f.ctx('native-registered-partial-approved','1'),{...input,reviewDigest:after.reviewDigest});
 }finally{await native?.dispose();f.dispose();}
});
