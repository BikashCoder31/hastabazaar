import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture,agreedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {readSellerWorkspaceTasks} from '../lib/seller/workspace-tasks';
import {submitRecoveryRepaymentClaim,reviewRecoveryRepaymentClaim} from '../lib/payments/recovery-repayments';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';

void test('unknown recovery contact remains a staff dependency, not seller lateness or a fresh invented deadline',async()=>{
 const f=await approvedSellerRecoveryFixture();try{const model=await readSellerWorkspaceTasks(f.db,'registered-owner',{now:Date.now()+8*86400000});assert.deepEqual(model.unavailableFamilies,[]);const task=model.tasks.find(row=>row.family==='recovery'&&row.sourceId===f.recoveryId);assert.ok(task);assert.equal(task.dueAt,null);assert.equal(task.severity,'normal');assert.equal(task.sellerActionRequired,false);assert.equal(task.nextActor,'Hastabazaar');}finally{f.dispose();}
});
void test('accepted installment and an actual evidence request retain separate native clocks and claims do not become paid money',async()=>{
 const f=await agreedSellerRecoveryFixture();try{
  const now=Date.now(),original=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),claim=await submitRecoveryRepaymentClaim(f.db,{actorId:'registered-owner',requestId:'workspace-claim',expectedRevision:String(original.case.revision),now},{caseId:f.recoveryId,amountPaisa:100,paymentReference:'FICTIONAL-WORKSPACE-REPORT',claimedAt:now-1,accountVersionId:null,evidenceReference:null,note:'Report the actual fictional transfer for independent Finance matching.'});
  const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);await reviewRecoveryRepaymentClaim(f.db,{actorId:'reviewer',requestId:'workspace-claim-question',expectedRevision:'0',now},{caseId:f.recoveryId,claimId:claim.claimId,decision:'needs_evidence',receiptId:null,receiptRevision:null,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PRIVATE-REVIEW',reason:'Request exact missing evidence without recording receipt or allocation.',publicMessage:'Please provide the missing transfer reference or retained supporting detail.',nextReviewAt:now+3600000});
  const model=await readSellerWorkspaceTasks(f.db,'registered-owner',{now});assert.deepEqual(model.unavailableFamilies,[]);const evidence=model.tasks.find(row=>row.sourceId===claim.claimId);assert.ok(evidence);assert.equal(evidence.sellerActionRequired,true);assert.equal(evidence.dueAt,null);assert.equal(evidence.nextUpdateAt,now+3600000);assert.equal(evidence.href,'/seller/finance/recoveries/claims/'+claim.claimId);assert.doesNotMatch(JSON.stringify(model),/FICTIONAL-PRIVATE-REVIEW|FICTIONAL-WORKSPACE-REPORT/);
  const arrangement=model.tasks.find(row=>row.sourceId===f.recoveryId);assert.ok(arrangement);assert.equal(arrangement.sellerActionRequired,true);assert.ok(arrangement.dueAt!==null&&arrangement.dueAt>now);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations WHERE case_id=?').get(f.recoveryId)!.n,0);
 }finally{f.dispose();}
});
