import assert from 'node:assert/strict';
import test from 'node:test';
import {unpaidManagedRefundFixture} from './helpers/managed-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import * as recovery from '../lib/payments/seller-recovery';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';

void test('native competing unpaid-source reviews retain one original deduction, no money movement and no seller recovery',async()=>{
 const f=await unpaidManagedRefundFixture('seller',false);let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const opened=await recovery.openSellerRecovery(f.db,f.ctx('native-unpaid-source-open'),{kind:'refund',id:f.refundId,reason:'Reconcile the actual completed seller-owned refund and the original unpaid native deduction.'});
 const ledger=Number(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').get()!.n);
 native=await nativeFinanceClone(f.sqlite);const db=native.db,review=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);
 const input={caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-COMPANY-SOURCE-PROOF',reason:'Recognize the existing deduction against wholly unpaid original earnings without posting any new money.',publicMessage:'The original refund is covered by unpaid original earnings. No repayment is due.'};
 const bodies=['native-company-a','native-company-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'unpaid_source',requestId,expectedRevision:'0',input}));
 const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',f.context.environment)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
 const winner=results.findIndex(r=>r.status==='fulfilled');
 assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',bodies[winner].requestId,'staff'),(results[winner] as PromiseFulfilledResult<unknown>).value);
 assert.deepEqual(await runRecoveryCommand(db,'reviewer',bodies[winner],'staff',f.context.environment),(results[winner] as PromiseFulfilledResult<unknown>).value);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_unpaid_sources').first<{n:number}>())!.n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM managed_settlement_entries').first<{n:number}>())!.n,ledger);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
 await assert.rejects(db.prepare('DELETE FROM seller_recovery_unpaid_sources').run(),/retained/i);
 await assert.rejects(db.prepare('UPDATE seller_recovery_unpaid_sources SET amount_paisa=1').run(),/retained/i);
 }finally{await native?.dispose();f.dispose();}
});
