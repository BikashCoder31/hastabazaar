import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {partialUnpaidFixture,combinedPartialUnpaidFixture} from './helpers/partial-unpaid-fixture';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {openSellerRecovery} from '../lib/payments/seller-recovery';
import {completeManagedRecoveryRefund} from './helpers/managed-recovery-fixture';

for(const model of ['registered','managed'] as const)void test(`native ${model} competing original-source reviews recognize one partial unpaid disposition`,async()=>{
 const f=await partialUnpaidFixture(model);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  const bodies=['native-partial-a','native-partial-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'partial_source',requestId,expectedRevision:String(review.case.revision),input:{...f.input,reviewDigest:review.reviewDigest}}));
  const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',f.environment)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(r=>r.status==='fulfilled'),result=(results[winner] as PromiseFulfilledResult<unknown>).value;
  assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',bodies[winner].requestId,'staff'),result);
  assert.deepEqual(await runRecoveryCommand(db,'reviewer',bodies[winner],'staff',f.environment),result);
  const current=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  assert.equal(current.case.restoredPaisa,0);assert.equal(current.case.confirmedPaisa,model==='registered'?10000:14500);
  assert.equal(current.case.approvedCapPaisa,0);assert.equal(current.position.recoveredPaisa,0);assert.equal(current.source.blocker,null);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_partial_sources').first<{n:number}>())!.n,1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
  await assert.rejects(db.prepare('DELETE FROM seller_recovery_partial_sources').run(),/retained/i);
  await assert.rejects(db.prepare('UPDATE seller_recovery_partial_sources SET amount_paisa=1').run(),/retained/i);

 }finally{await native?.dispose();f.dispose();}
});

void test('native two-refund race cannot consume the shared original earned pool twice',async()=>{
 const f=await partialUnpaidFixture('managed');let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok('context'in f);assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const second=await completeManagedRecoveryRefund(f,'seller','partial-native-second-refund',50000);
  const opened=await openSellerRecovery(f.db,f.ctx('partial-native-second-open'),{kind:'refund',id:second.refundId,reason:'Review a second actual original refund that shares the same remaining original earned capacity.'});
  native=await nativeFinanceClone(f.sqlite);const db=native.db;
  const cases=await Promise.all([f.caseId,opened.id].map(id=>getSellerRecoveryReview(db,'reviewer',id)));
  const bodies=cases.map((review,index)=>({sourceFormId:'system.recovery-finance',action:'partial_source',requestId:'native-shared-original-'+index,expectedRevision:String(review.case.revision),input:{...f.input,caseId:review.case.id,reviewDigest:review.reviewDigest}}));
  const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',f.environment)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1,JSON.stringify(results));
  const loser=results.findIndex(result=>result.status==='rejected'),fresh=await getSellerRecoveryReview(db,'reviewer',cases[loser].case.id);
  assert.equal(fresh.source.partialUnpaidSource?.offsetPaisa,0);
  await runRecoveryCommand(db,'reviewer',{...bodies[loser],requestId:'native-shared-original-refreshed',input:{...bodies[loser].input,reviewDigest:fresh.reviewDigest}},'staff',f.environment);
  assert.equal((await db.prepare('SELECT SUM(amount_paisa) amount FROM seller_recovery_partial_sources').first<{amount:number}>())!.amount,31000);
  assert.equal((await db.prepare('SELECT SUM(confirmed_paisa) amount FROM seller_recovery_cases').first<{amount:number}>())!.amount,60000);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
 }finally{await native?.dispose();f.dispose();}
});

for(const model of ['registered','managed'] as const)void test(`native ${model} combined correction restores its original unpaid portion once after collected money is reconciled`,async()=>{
 const f=await combinedPartialUnpaidFixture(model);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  const {environment:_ignoredEnvironment,...input}=f.correctionInput;
  const bodies=['native-combined-a','native-combined-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'correct_unpaid',requestId,expectedRevision:String(review.case.revision),input:{...input,reviewDigest:review.reviewDigest}}));
  const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',f.environment)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(r=>r.status==='fulfilled'),result=(results[winner] as PromiseFulfilledResult<unknown>).value;
  assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',bodies[winner].requestId,'staff'),result);
  assert.deepEqual(await runRecoveryCommand(db,'reviewer',bodies[winner],'staff',f.environment),result);
  const current=await getSellerRecoveryReview(db,'reviewer',f.caseId);
  assert.equal(current.case.confirmedPaisa,0);assert.equal(current.case.restoredPaisa,f.deficit);assert.equal(current.source.unpaidResponsibilityRestoredPaisa,f.unpaid);assert.equal(current.source.blocker,null);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_unpaid_corrections').first<{n:number}>())!.n,1);
 }finally{await native?.dispose();f.dispose();}
});
