import {historicalPartialRegisteredFixture} from './helpers/historical-partial-registered-fixture';
import assert from 'node:assert/strict';
import test from 'node:test';
import {historicalPartialManagedFixture} from './helpers/historical-partial-managed-fixture';
import * as recovery from '../lib/payments/seller-recovery';

void test('managed partial original payment requires explicit unpaid-component reconciliation before approving recovery',async()=>{
 const f=await historicalPartialManagedFixture();try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('managed-partial-original-open'),{kind:'refund',id:f.refundId,reason:'Reconcile actual original partial payment and the still-unpaid original entitlement before any recovery demand.'});
  const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  assert.equal(review.source.nativeDebitPaisa,91000);
  assert.ok(review.source.blocker,'The 45500 original unpaid component must not become another 45500 cash demand.');
  assert.equal(review.source.partialUnpaidSource?.offsetPaisa,45500);
  await assert.rejects(recovery.approveSellerRecovery(f.db,f.ctx('managed-partial-unreconciled-approval','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PARTIAL-ORIGINAL-PROOF',reason:'Do not approve the entire native debit while the original unpaid component remains unreconciled.'}));
  const applied=await recovery.reviewPartialUnpaidSellerRecoverySource(f.db,f.ctx('managed-partial-original-review','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PARTIAL-ORIGINAL-PROOF',reason:'Recognize exactly the unpaid original entitlement component once.',publicMessage:'Your original unpaid earnings cover NPR 455; only the additional NPR 455 remains for review.',environment:f.context.environment});
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  assert.equal(after.source.confirmedPaisa,45500);assert.equal(after.source.originalUnpaidOffsetPaisa,45500);assert.equal(after.source.blocker,null);
  await recovery.approveSellerRecovery(f.db,f.ctx('managed-partial-reconciled-approval',String(applied.revision)),{caseId:opened.id,reviewDigest:after.reviewDigest,evidenceReference:'FICTIONAL-PARTIAL-ORIGINAL-PROOF',reason:'Approve only the actual additional deficit after original unpaid earnings are recognized.'});
 }finally{f.dispose();}
});

void test('a smaller refund uses only the remaining unpaid original portion and creates no collectible balance',async()=>{
 const f=await historicalPartialManagedFixture(2);try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('managed-partial-paid-full-unpaid-open'),{kind:'refund',id:f.refundId,reason:'Recognize the smaller original refund wholly within the still-unpaid portion of the original entitlement.'});
  const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.nativeDebitPaisa,45500);assert.equal(review.source.confirmedPaisa,0);assert.equal(review.source.unpaidSource?.offsetPaisa,45500);
  const input={caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PARTIAL-PAID-UNPAID-PROOF',reason:'Use only the still-unpaid original portion once without creating another charge or recording repayment.',publicMessage:'The refund uses NPR 455 of your original unpaid earnings. No additional recovery is due.',environment:f.context.environment};
  const result=await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('managed-partial-paid-full-unpaid-review','0'),input);
  assert.deepEqual(await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('managed-partial-paid-full-unpaid-review','0'),input),result);
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(after.source.confirmedPaisa,0);assert.equal(after.source.blocker,null);assert.equal(after.position.recoveredPaisa,0);assert.equal(after.source.originalUnpaidOffsetPaisa,45500);
  assert.equal(f.sqlite.prepare('SELECT used_paisa FROM seller_recovery_original_unpaid_pools').get()!.used_paisa,45500);
  assert.throws(()=>f.sqlite.exec('UPDATE seller_recovery_original_unpaid_pools SET used_paisa=0'),/projection/);
  assert.throws(()=>f.sqlite.exec('DELETE FROM seller_recovery_original_unpaid_pools'),/retained/);
 }finally{f.dispose();}
});

void test('registered partial original payment keeps the released reserve separate from actual paid earnings',async()=>{
 const f=await historicalPartialRegisteredFixture();try{
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('registered-partial-original-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the original paid portion and later release of the original unpaid reserve before any collection.'});
  const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(review.source.confirmedPaisa,0);assert.equal(review.source.partialUnpaidSource?.offsetPaisa,f.originalUnpaidPaisa);
  await recovery.reviewPartialUnpaidSellerRecoverySource(f.db,f.ctx('registered-partial-original-review','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-REGISTERED-PARTIAL-ORIGINAL',reason:'Recognize the released original reserve once while preserving the exact original commission reversal.',publicMessage:'Your remaining original unpaid earnings are used once; only the additional deficit remains for review.'});
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);assert.equal(after.source.confirmedPaisa,f.originalPaidPaisa);assert.equal(after.source.blocker,null);assert.equal(after.position.recoveredPaisa,0);
  await recovery.approveSellerRecovery(f.db,f.ctx('registered-partial-approved','1'),{caseId:opened.id,reviewDigest:after.reviewDigest,evidenceReference:'FICTIONAL-REGISTERED-PARTIAL-ORIGINAL',reason:'Approve only the verified additional deficit after the original unpaid component is recognized.'});
 }finally{f.dispose();}
});
