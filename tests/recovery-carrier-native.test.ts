import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {carrierRecoveryFixture} from './helpers/carrier-recovery-fixture';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {readOriginalRecoveryPayoutProofs} from '../lib/payments/recovery-original-payouts';
import {getSellerRecoveryReview,correctSellerRecoveryLiability,reconcileSellerRecoveryCarrierReceipt,approveSellerRecovery} from '../lib/payments/seller-recovery';

for(const model of ['registered','managed','fixed'] as const)void test(`native ${model} competing carrier reviews settle one cost and restore seller overlap once`,async()=>{
 const f=await carrierRecoveryFixture(model);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  const original=await readOriginalRecoveryPayoutProofs(db,f.caseId);assert.equal(original.length,1);assert.equal(original[0].model,model);
  const bodies=['native-carrier-a','native-carrier-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'carrier',requestId,expectedRevision:String(review.case.revision),input:{...f.input,reviewDigest:review.reviewDigest}}));
  const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',f.environment)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(r=>r.status==='fulfilled'),result=(results[winner] as PromiseFulfilledResult<unknown>).value;
  assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',bodies[winner].requestId,'staff'),result);
  assert.deepEqual(await runRecoveryCommand(db,'reviewer',bodies[winner],'staff',f.environment),result);
  const current=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  assert.equal(current.case.restoredPaisa,10000);assert.equal(current.case.confirmedPaisa,review.case.confirmedPaisa);
  assert.equal(current.position.recoveredPaisa,review.case.confirmedPaisa);assert.equal(current.position.remainingPaisa,0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_carrier_reviews').first<{n:number}>())!.n,1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM seller_recovery_allocations WHERE method='carrier'").first<{n:number}>())!.n,1);
  await assert.rejects(db.prepare('DELETE FROM seller_recovery_carrier_reviews').run(),/retained/i);
  await assert.rejects(db.prepare('UPDATE seller_recovery_carrier_restorations SET amount_paisa=1').run(),/retained/i);

 }finally{await native?.dispose();f.dispose();}
});

void test('native partial carrier reimbursement preserves the separate remaining-cap decision',async()=>{
 const f=await carrierRecoveryFixture('registered');let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);const db=native.db;
  let review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  await correctSellerRecoveryLiability(db,f.ctx('native-carrier-new-cap','2'),{caseId:f.caseId,newConfirmedPaisa:50000,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-CARRIER-CORRECTION',reason:'Reduce the original responsibility before reviewing this partial actual carrier reimbursement.',publicMessage:'The original cost is reduced; the remaining cap will be reviewed separately.'});
  review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  await reconcileSellerRecoveryCarrierReceipt(db,f.ctx('native-carrier-partial','3'),{...f.input,reviewDigest:review.reviewDigest,amountPaisa:1000});
  review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  assert.equal(review.case.state,'awaiting_approval');assert.equal(review.position.collectiblePaisa,0);
  await approveSellerRecovery(db,f.ctx('native-carrier-remaining-approved','4'),{caseId:f.caseId,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-CARRIER-REMAINING',reason:'Approve the current remaining original cap after recognizing the actual partial reimbursement.'});
  assert.equal((await getSellerRecoveryReview(db,'reviewer',f.caseId)).position.collectiblePaisa,39000);
 }finally{await native?.dispose();f.dispose();}
});
