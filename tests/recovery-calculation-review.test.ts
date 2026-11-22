import test from 'node:test';
import assert from 'node:assert/strict';
import {unpaidCorrectionFixture} from './helpers/unpaid-correction-fixture';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';
import {recoveryReviewSource} from '../lib/payments/recovery-followup';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {correctUnpaidSellerRecoverySource} from '../lib/payments/seller-recovery';

for(const model of ['registered','managed','fixed'] as const)void test(`${model} owner can review a zero-balance original deduction without inventing a debt or money movement`,async()=>{
 const f=await unpaidCorrectionFixture(model);try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const balance=await f.balance(),revision=f.review.case.revision,owner=f.review.source.ownerId;
  assert.equal((await recoveryReviewSource(f.db,f.caseId)).needsAction,false,'A reviewed closed original source must not retain an initial review task.');
  const body={sourceFormId:'system.recovery-seller',action:'request_calculation_review',requestId:'owner-zero-statement-review',expectedRevision:String(revision),input:{caseId:f.caseId,reason:'Please explain the original earnings deduction even though no cash repayment is due.',evidenceReference:null}};
  const result=await runRecoveryCommand(f.db,owner,body,'seller');assert.deepEqual(await recoverRecoveryCommand(f.db,owner,body.requestId,'seller'),result);assert.deepEqual(await runRecoveryCommand(f.db,owner,body,'seller'),result);
  const pending=await getSellerRecoveryStatement(f.db,owner,f.caseId),work=await recoveryReviewSource(f.db,f.caseId);
  assert.equal(pending.calculationReviews.length,1);assert.equal(pending.calculationReviews[0].status,'pending');assert.equal(work.status,'calculation_review');assert.equal(work.needsAction,true);assert.equal(work.dueAt-work.startedAt,86400000);
  assert.equal(pending.confirmedPaisa,0);assert.equal(pending.disputedPaisa,0);assert.equal(await f.balance(),balance);
  await assert.rejects(runRecoveryCommand(f.db,owner,{...body,requestId:'duplicate-owner-zero-review',expectedRevision:String(revision+1)},'seller'),/existing|pending/i);
  const review=await getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  const answer={sourceFormId:'system.recovery-finance',action:'answer_calculation_review',requestId:'finance-zero-statement-answer',expectedRevision:String(review.case.revision),input:{caseId:f.caseId,reviewId:pending.calculationReviews[0].id,reviewDigest:review.reviewDigest,reason:'FICTIONAL-PRIVATE-REVIEW: independently checked the original earned entitlement and retained native deduction.',publicMessage:'The original unpaid earnings covered this deduction once. No cash repayment or new charge is required.'}};
  f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(owner);
  await assert.rejects(runRecoveryCommand(f.db,owner,answer,'staff',f.environment),/personal|independent/i);
  const answered=await runRecoveryCommand(f.db,'reviewer',answer,'staff',f.environment);assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',answer.requestId,'staff'),answered);
  const final=await getSellerRecoveryStatement(f.db,owner,f.caseId);assert.equal(final.calculationReviews[0].status,'answered');assert.equal(final.calculationReviews[0].publicMessage,answer.input.publicMessage);assert.equal(JSON.stringify(final).includes('FICTIONAL-PRIVATE-REVIEW'),false);
  assert.equal((await recoveryReviewSource(f.db,f.caseId)).needsAction,false);assert.equal(await f.balance(),balance);assert.equal(final.confirmedPaisa,0);assert.equal(final.originalUnpaidOffsetPaisa,pending.originalUnpaidOffsetPaisa);
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)").run();
  await assert.rejects(recoverRecoveryCommand(f.db,'reviewer',answer.requestId,'staff'),/permission/i);
 }finally{f.dispose();}
});

void test('a current recovery amount keeps its amount-based dispute path and collection pause',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  await assert.rejects(runRecoveryCommand(f.db,'registered-owner',{sourceFormId:'system.recovery-seller',action:'request_calculation_review',requestId:'positive-balance-review-path',expectedRevision:'1',input:{caseId:f.recoveryId,reason:'Please review the current remaining recovery amount.',evidenceReference:null}},'seller'),/amount-based review/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_calculation_reviews').get()!.n,0);
 }finally{f.dispose();}
});

void test('a financial correction preserves the owner review and its original clock until a current answer',async()=>{
 const f=await unpaidCorrectionFixture('registered');try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  await runRecoveryCommand(f.db,f.review.source.ownerId,{sourceFormId:'system.recovery-seller',action:'request_calculation_review',requestId:'review-before-unpaid-correction',expectedRevision:String(f.review.case.revision),input:{caseId:f.caseId,reason:'The original deduction appears incorrect even though no cash repayment is due.',evidenceReference:null}},'seller');
  let review=await getSellerRecoveryReview(f.db,'reviewer',f.caseId);const pending=(await getSellerRecoveryStatement(f.db,f.review.source.ownerId,f.caseId)).calculationReviews[0];
  const answer={sourceFormId:'system.recovery-finance',action:'answer_calculation_review',requestId:'review-after-unpaid-correction',expectedRevision:String(review.case.revision),input:{caseId:f.caseId,reviewId:pending.id,reviewDigest:review.reviewDigest,reason:'The independently approved original correction is retained and the current owner calculation has been checked.',publicMessage:'The original deduction was overturned and credited to your balance once. No cash repayment is required.'}};
  await correctUnpaidSellerRecoverySource(f.db,f.ctx('owner-review-original-correction',String(review.case.revision)),{caseId:f.caseId,newUnpaidResponsibilityPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-OWNER-REVIEW-CORRECTION',reason:'Independent source evidence overturns the original unpaid deduction using its separate authorized financial correction.',publicMessage:'The original unpaid deduction is restored to your balance.'});
  const preserved=(await getSellerRecoveryStatement(f.db,f.review.source.ownerId,f.caseId)).calculationReviews[0];assert.equal(preserved.status,'pending');assert.equal(preserved.dueAt,pending.dueAt);assert.equal((await recoveryReviewSource(f.db,f.caseId)).needsAction,true);
  await assert.rejects(runRecoveryCommand(f.db,'reviewer',answer,'staff'),/current pending statement review/);
  review=await getSellerRecoveryReview(f.db,'reviewer',f.caseId);
  await runRecoveryCommand(f.db,'reviewer',{...answer,expectedRevision:String(review.case.revision),input:{...answer.input,reviewDigest:review.reviewDigest}},'staff');
  assert.equal((await recoveryReviewSource(f.db,f.caseId)).needsAction,false);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_unpaid_corrections').get()!.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_calculation_answers').get()!.n,1);
 }finally{f.dispose();}
});
