import assert from 'node:assert/strict';
import test from 'node:test';
import {carrierUnpaidFixture} from './helpers/carrier-unpaid-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {checkoutCommitClock} from '../lib/checkout/commit-policy-guards';
import * as recovery from '../lib/payments/seller-recovery';

for(const model of ['registered','managed','fixed'] as const)void test(`${model} actual carrier coverage restores the original unpaid deduction without recording seller collection`,async()=>{
 const f=await carrierUnpaidFixture(model);try{
  const {amount,input}=f,before=await f.balance(),bank={id:f.receiptId};
  const ctx=f.ctx('carrier-unpaid-reviewed',String(f.review.case.revision));
  const result=await recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(f.db,ctx,input);
  assert.deepEqual(await recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(f.db,ctx,input),result);
  const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  assert.equal(after.source.blocker,null);assert.equal(after.case.confirmedPaisa,0);assert.equal(after.position.recoveredPaisa,0);assert.equal(after.position.remainingPaisa,0);assert.equal(after.position.collectiblePaisa,0);assert.equal(after.case.state,'closed_no_balance');assert.equal(await f.balance(),before+amount);
  assert.equal(after.source.carrierUnpaidCoveredPaisa,amount);assert.equal(after.case.restoredPaisa,amount);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) amount FROM seller_recovery_allocations WHERE receipt_id=?').get(bank.id)!.amount,amount);
  await assert.rejects(recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(f.db,f.ctx('carrier-unpaid-again',String(after.case.revision)),{...input,receiptRevision:1,amountPaisa:1,reviewDigest:after.reviewDigest}),/unpaid|remaining|original/i);
 }finally{f.dispose();}
});

for(const model of ['registered','managed','fixed'] as const)void test(`${model} a correction can restore uncovered unpaid cost but cannot gift the carrier-owned portion`,async()=>{
 const f=await carrierUnpaidFixture(model);try{
  const covered=Math.floor(f.amount/2),before=await f.balance();
  await recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(f.db,f.ctx('carrier-unpaid-half',String(f.review.case.revision)),{...f.input,amountPaisa:covered});
  let current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  const input={caseId:f.caseId,newUnpaidResponsibilityPaisa:covered,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-CARRIER-UNCOVERED-CORRECTION',reason:'Overturn only the remaining uncovered original unpaid responsibility, preserving carrier-owned funds.',publicMessage:'The remaining uncovered original charge is restored. Carrier coverage remains separately recorded.',...(f.environment?{environment:f.environment}:{})};
  await recovery.correctUnpaidSellerRecoverySource(f.db,f.ctx('carrier-unpaid-uncovered',String(current.case.revision)),input);
  current=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(current.source.carrierUnpaidCoveredPaisa,covered);assert.equal(current.source.unpaidResponsibilityRestoredPaisa,f.amount-covered);assert.equal(current.position.recoveredPaisa,0);assert.equal(await f.balance(),before+f.amount);
  await assert.rejects(recovery.correctUnpaidSellerRecoverySource(f.db,f.ctx('carrier-unpaid-owned',String(current.case.revision)),{...input,newUnpaidResponsibilityPaisa:0,reviewDigest:current.reviewDigest}),/carrier|disposition/i);
 }finally{f.dispose();}
});

void test('original unpaid carrier decisions and saved outcomes retain current independent authority',async()=>{
 const f=await carrierUnpaidFixture('registered');try{
  const {runRecoveryCommand,recoverRecoveryCommand}=await import('../lib/payments/recovery-commands');
  const body={sourceFormId:'system.recovery-finance',action:'carrier_unpaid',requestId:'carrier-unpaid-authority',expectedRevision:String(f.review.case.revision),input:f.input};
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.review.source.ownerId);
  await assert.rejects(runRecoveryCommand(f.db,f.review.source.ownerId,body,'staff'),/personal|independent/i);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',{...body,input:{...f.input,originalUnpaidCostConfirmed:false}},'staff'),/protected recovery form/i);
  const result=await runRecoveryCommand(f.db,'reviewer',body,'staff');assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),result);
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();
  await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',body.requestId,'staff'),/permission|staff/i);
 }finally{f.dispose();}
});

for(const model of ['registered','managed'] as const)void test(`${model} carrier coverage of unpaid earnings and the additional deficit share one actual receipt without merging their balances`,async()=>{
 const {partialUnpaidFixture}=await import('./helpers/partial-unpaid-fixture');
 const f=await partialUnpaidFixture(model);try{
  const env=f.environment?{environment:f.environment}:{};
  await recovery.reviewPartialUnpaidSellerRecoverySource(f.db,f.ctx('carrier-partial-source','0'),{...f.input,...env});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);const unpaid=review.source.originalUnpaidOffsetPaisa!,deficit=review.case.confirmedPaisa;
  const now=(await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} now`).first<{now:number}>())!.now;
  const bank=await recordBankReceipt(f.db,{...f.ctx('carrier-partial-bank'),now},{accountVersionId:'payoutSources'in f?f.payoutSources.accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CARRIER-PARTIAL-COST',bankAt:now,amountMinor:unpaid+deficit+500,currency:'NPR',payerReference:'Fictional independent carrier',payerUserId:null,completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-CARRIER-PARTIAL-ACTUAL-CREDIT',reason:'Independently verify one actual reimbursement with separately reviewed original cost components.'});
  const common={caseId:f.caseId,receiptId:bank.id,evidenceReference:'FICTIONAL-CARRIER-PARTIAL-COMPONENT-LINK',reason:'Reconcile each original cost component once against the same independently verified incoming credit.',publicMessage:'Carrier coverage of original unpaid earnings and the additional deficit are shown separately.',...env};
  await recovery.reconcileSellerRecoveryUnpaidCarrierReceipt(f.db,f.ctx('carrier-partial-unpaid','1'),{...common,receiptRevision:0,amountPaisa:unpaid,reviewDigest:review.reviewDigest,originalUnpaidCostConfirmed:true});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(review.position.recoveredPaisa,0);assert.equal(review.position.remainingPaisa,deficit);assert.equal(review.case.state,'awaiting_approval');assert.equal(review.source.blocker,null);
  await recovery.reconcileSellerRecoveryCarrierReceipt(f.db,f.ctx('carrier-partial-deficit','2'),{...common,receiptRevision:1,amountPaisa:deficit,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,originalCostReimbursementConfirmed:true});
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.caseId);assert.equal(review.position.recoveredPaisa,deficit);assert.equal(review.position.remainingPaisa,0);assert.equal(review.case.restoredPaisa,unpaid);
  await assert.rejects(recovery.correctSellerRecoveryLiability(f.db,f.ctx('carrier-partial-owned','3'),{...common,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest}),/carrier/i);
  assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_allocations WHERE receipt_id=?').get(bank.id)!.n,unpaid+deficit);
 }finally{f.dispose();}
});
