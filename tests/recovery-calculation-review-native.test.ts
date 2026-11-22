import test from 'node:test';
import assert from 'node:assert/strict';
import {unpaidCorrectionFixture} from './helpers/unpaid-correction-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {getSellerRecoveryStatement} from '../lib/payments/recovery-workspace';
import {recoveryReviewSource} from '../lib/payments/recovery-followup';

void test('native statement-review races retain one owner request and one independent answer without moving money',async()=>{
 const f=await unpaidCorrectionFixture('registered');let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));native=await nativeFinanceClone(f.sqlite);const db=native.db,owner=f.review.source.ownerId;
  const money=async()=>db.prepare('SELECT COUNT(*) entries,SUM(amount_paisa) amount FROM seller_ledger_entries WHERE seller_id=?').bind(f.review.source.sellerId).first(),before=await money();
  const requests=['native-calculation-a','native-calculation-b'].map(requestId=>({sourceFormId:'system.recovery-seller',action:'request_calculation_review',requestId,expectedRevision:String(f.review.case.revision),input:{caseId:f.caseId,reason:'Explain the original deduction even though there is no outstanding recovery amount.',evidenceReference:null}}));
  const submitted=await Promise.allSettled(requests.map(body=>runRecoveryCommand(db,owner,body,'seller')));assert.equal(submitted.filter(result=>result.status==='fulfilled').length,1,JSON.stringify(submitted));
  const requestWinner=submitted.findIndex(result=>result.status==='fulfilled');assert.deepEqual(await recoverRecoveryCommand(db,owner,requests[requestWinner].requestId,'seller'),(submitted[requestWinner] as PromiseFulfilledResult<unknown>).value);
  const statement=await getSellerRecoveryStatement(db,owner,f.caseId),review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  const answers=['native-calculation-answer-a','native-calculation-answer-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'answer_calculation_review',requestId,expectedRevision:String(review.case.revision),input:{caseId:f.caseId,reviewId:statement.calculationReviews[0].id,reviewDigest:review.reviewDigest,reason:'Independently checked the retained original unpaid deduction and the unchanged native balance.',publicMessage:'The original unpaid earnings were used once. No separate repayment is required.'}}));
  const answered=await Promise.allSettled(answers.map(body=>runRecoveryCommand(db,'reviewer',body,'staff')));assert.equal(answered.filter(result=>result.status==='fulfilled').length,1,JSON.stringify(answered));
  const winner=answered.findIndex(result=>result.status==='fulfilled');assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',answers[winner].requestId,'staff'),(answered[winner] as PromiseFulfilledResult<unknown>).value);
  assert.deepEqual(await money(),before);assert.equal((await recoveryReviewSource(db,f.caseId)).needsAction,false);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_calculation_reviews').first<{n:number}>())!.n,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_calculation_answers').first<{n:number}>())!.n,1);
  await assert.rejects(db.prepare('DELETE FROM seller_recovery_calculation_reviews').run(),/retained/);await assert.rejects(db.prepare("UPDATE seller_recovery_calculation_answers SET public_message='changed'").run(),/retained/);
 }finally{await native?.dispose();f.dispose();}
});
