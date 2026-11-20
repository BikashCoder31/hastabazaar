import * as recovery from '../lib/payments/seller-recovery';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {checkoutCommitClock} from '../lib/checkout/commit-policy-guards';
import assert from 'node:assert/strict';
import test from 'node:test';
import {carrierUnpaidFixture} from './helpers/carrier-unpaid-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {getSellerRecoveryReview,correctUnpaidSellerRecoverySource} from '../lib/payments/seller-recovery';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
for(const model of ['registered','managed','fixed'] as const)void test(`native ${model} competing carrier coverage restores the original unpaid component once`,async()=>{
 const f=await carrierUnpaidFixture(model);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await getSellerRecoveryReview(db,'reviewer',f.caseId),{environment,...input}=f.input;
  const covered=Math.floor(f.amount/2);
  const bodies=['carrier-unpaid-race-a','carrier-unpaid-race-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'carrier_unpaid',requestId,expectedRevision:String(review.case.revision),input:{...input,amountPaisa:covered,reviewDigest:review.reviewDigest}}));
  const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',environment)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(r=>r.status==='fulfilled'),result=(results[winner] as PromiseFulfilledResult<unknown>).value;
  assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',bodies[winner].requestId,'staff'),result);assert.deepEqual(await runRecoveryCommand(db,'reviewer',bodies[winner],'staff',environment),result);
  const current=await getSellerRecoveryReview(db,'reviewer',f.caseId);assert.equal(current.source.blocker,null);assert.equal(current.position.recoveredPaisa,0);assert.equal(current.position.remainingPaisa,0);assert.equal(current.case.restoredPaisa,covered);assert.equal(current.case.state,'closed_no_balance');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_carrier_unpaid_reviews').first<{n:number}>())!.n,1);
  assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations WHERE receipt_id=?').bind(f.receiptId).first<{n:number}>())!.n,covered);
  await correctUnpaidSellerRecoverySource(db,f.ctx('native-carrier-uncovered',String(current.case.revision)),{caseId:f.caseId,newUnpaidResponsibilityPaisa:covered,reviewDigest:current.reviewDigest,...(environment?{environment}:{}),evidenceReference:'FICTIONAL-NATIVE-CARRIER-UNCOVERED',reason:'Overturn only the remaining uncovered original unpaid responsibility after the actual carrier decision.',publicMessage:'The uncovered original charge is restored; actual carrier coverage remains separately retained.'});
  const corrected=await getSellerRecoveryReview(db,'reviewer',f.caseId);assert.equal(corrected.position.recoveredPaisa,0);assert.equal(corrected.source.unpaidResponsibilityRestoredPaisa,f.amount-covered);assert.equal(corrected.source.carrierUnpaidCoveredPaisa,covered);assert.equal(corrected.source.blocker,null);
  await assert.rejects(db.prepare('UPDATE seller_recovery_carrier_unpaid_reviews SET amount_paisa=1').run(),/retained/i);
  await assert.rejects(db.prepare('DELETE FROM seller_recovery_carrier_unpaid_reviews').run(),/retained/i);
 }finally{await native?.dispose();f.dispose();}
});
for(const model of ['managed'] as const)void test(`native ${model} carrier coverage of unpaid earnings and the additional deficit share one actual receipt without merging their balances`,async()=>{
 const {partialUnpaidFixture}=await import('./helpers/partial-unpaid-fixture');
 const f=await partialUnpaidFixture(model);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  const env=f.environment?{environment:f.environment}:{};
  await recovery.reviewPartialUnpaidSellerRecoverySource(f.db,f.ctx('carrier-partial-source','0'),{...f.input,...env});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);const unpaid=review.source.originalUnpaidOffsetPaisa!,deficit=review.case.confirmedPaisa;
  const now=(await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} now`).first<{now:number}>())!.now;
  const bank=await recordBankReceipt(f.db,{...f.ctx('carrier-partial-bank'),now},{accountVersionId:'payoutSources'in f?f.payoutSources.accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CARRIER-PARTIAL-COST',bankAt:now,amountMinor:unpaid+deficit+500,currency:'NPR',payerReference:'Fictional independent carrier',payerUserId:null,completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-CARRIER-PARTIAL-ACTUAL-CREDIT',reason:'Independently verify one actual reimbursement with separately reviewed original cost components.'});
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);const db=native.db;review=await recovery.getSellerRecoveryReview(db,'reviewer',f.caseId);
  const common={caseId:f.caseId,receiptId:bank.id,evidenceReference:'FICTIONAL-CARRIER-PARTIAL-COMPONENT-LINK',reason:'Reconcile each original cost component once against the same independently verified incoming credit.',publicMessage:'Carrier coverage of original unpaid earnings and the additional deficit are shown separately.',...env};
  await recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(db,f.ctx('carrier-partial-unpaid','1'),{...common,receiptRevision:0,amountPaisa:unpaid,reviewDigest:review.reviewDigest,originalUnpaidCostConfirmed:true});
  review=await recovery.getSellerRecoveryReview(db,'reviewer',f.caseId);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.position.remainingPaisa,deficit);assert.equal(review.case.state,'awaiting_approval');assert.equal(review.source.blocker,null);
  await recovery.reconcileSellerRecoveryCarrierReceipt(db,f.ctx('carrier-partial-deficit','2'),{...common,receiptRevision:1,amountPaisa:deficit,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,originalCostReimbursementConfirmed:true});
  review=await recovery.getSellerRecoveryReview(db,'reviewer',f.caseId);assert.equal(review.position.recoveredPaisa,deficit);assert.equal(review.position.remainingPaisa,0);assert.equal(review.case.restoredPaisa,unpaid);
  await assert.rejects(recovery.correctSellerRecoveryLiability(db,f.ctx('carrier-partial-owned','3'),{...common,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest}),/carrier/i);
  assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations WHERE receipt_id=?').bind(bank.id).first<{n:number}>())!.n,unpaid+deficit);
 }finally{await native?.dispose();f.dispose();}
});
