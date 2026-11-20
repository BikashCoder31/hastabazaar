import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {unpaidCorrectionFixture} from './helpers/unpaid-correction-fixture';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';

for(const model of ['registered','managed','fixed'] as const)void test(`native ${model} competing unpaid corrections restore one credit and retain zero recovery`,async()=>{
 const f=await unpaidCorrectionFixture(model);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  const bodies=['native-unpaid-correction-a','native-unpaid-correction-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'correct_unpaid',requestId,expectedRevision:String(review.case.revision),input:{caseId:f.caseId,newUnpaidResponsibilityPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-UNPAID-CORRECTION',reason:'Review the original evidence and restore an overturned charge against original unpaid earnings once.',publicMessage:'The original unpaid charge is removed and restored to your payable balance.'}}));
  const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',f.environment)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(r=>r.status==='fulfilled'),result=(results[winner] as PromiseFulfilledResult<unknown>).value;
  assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',bodies[winner].requestId,'staff'),result);
  assert.deepEqual(await runRecoveryCommand(db,'reviewer',bodies[winner],'staff',f.environment),result);
  const current=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  assert.equal(current.source.unpaidResponsibilityRestoredPaisa,review.source.nativeDebitPaisa);
  assert.equal(current.case.confirmedPaisa,0);assert.equal(current.position.recoveredPaisa,0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_unpaid_corrections').first<{n:number}>())!.n,1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
  await assert.rejects(db.prepare('DELETE FROM seller_recovery_unpaid_corrections').run(),/retained/i);
  await assert.rejects(db.prepare('UPDATE seller_recovery_unpaid_corrections SET amount_paisa=1').run(),/retained/i);
 }finally{await native?.dispose();f.dispose();}
});
