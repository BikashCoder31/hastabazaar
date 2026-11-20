import assert from 'node:assert/strict';
import test from 'node:test';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import * as recovery from '../lib/payments/seller-recovery';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';

void test('native competing company-source reviews produce one actual offset, immutable decision and no seller recovery',async()=>{
 const f=await managedRecoveryFixture('platform',1,true);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('native-company-source-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the actual completed company-owned refund and the old uncompensated native debit.'});
 native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);
 const input={caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-COMPANY-SOURCE-PROOF',reason:'Independently restore the original company-owned cost once without creating any seller debt.',publicMessage:'The original company-owned charge is removed from your earnings.'};
 const bodies=['native-company-a','native-company-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'compensate_source',requestId,expectedRevision:'0',input}));
 const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',f.context.environment)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
 const winner=results.findIndex(r=>r.status==='fulfilled');
 assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',bodies[winner].requestId,'staff'),(results[winner] as PromiseFulfilledResult<unknown>).value);
 assert.deepEqual(await runRecoveryCommand(db,'reviewer',bodies[winner],'staff',f.context.environment),(results[winner] as PromiseFulfilledResult<unknown>).value);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_source_reviews').first<{n:number}>())!.n,1);
 assert.equal((await db.prepare("SELECT SUM(amount_paisa) n FROM managed_settlement_entries WHERE refund_id=? AND reason_code='refund_responsibility'").bind(f.refundId).first<{n:number}>())!.n,f.originalPaidPaisa);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
 await assert.rejects(db.prepare('DELETE FROM seller_recovery_source_reviews').run(),/retained/i);
 await assert.rejects(db.prepare('UPDATE seller_recovery_source_reviews SET amount_paisa=1').run(),/retained/i);
 }finally{await native?.dispose();f.dispose();}
});
