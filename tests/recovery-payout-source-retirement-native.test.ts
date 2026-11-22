import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {reservedManagedRefundFixture} from './helpers/reserved-recovery-fixture';
import {sellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {fixedRecoveryFixture} from './helpers/fixed-recovery-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {runRecoveryCommand,recoverRecoveryCommand} from '../lib/payments/recovery-commands';

for(const model of ['registered','managed','fixed'] as const)void test(`native ${model} competing retirement decisions release one unsent instruction without moving money`,async()=>{
 const f=await(model==='registered'?sellerRecoveryFixture(true,'seller',true,40000,'prepared'):model==='managed'?reservedManagedRefundFixture():fixedRecoveryFixture('prepared'));
 let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const source='adjustmentId' in f?{kind:'supplier_adjustment' as const,id:f.adjustmentId}:{kind:'refund' as const,id:f.refundId};
  const environment='environment' in f?f.environment:'context' in f?f.context.environment:undefined;
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('native-retirement-open'),{...source,reason:'Review the retained original instruction and its actual outcome before releasing any native reservation.'});
  native=await nativeFinanceClone(f.sqlite);const db=native.db;
  const money=async()=>Promise.all(['seller_ledger_entries','managed_settlement_entries','company_money_receipts','seller_recovery_allocations','managed_supplier_adjustments'].map(async table=>(await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first<{n:number}>())!.n));
  const originalMoney=await money(),review=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);
  const input={caseId:opened.id,payoutId:f.payoutId,reviewDigest:review.reviewDigest,noFundsRemainSentConfirmed:true,evidenceReference:'FICTIONAL-NATIVE-UNSENT-INSTRUCTION',reason:'Confirm the exact original instruction was never sent before releasing its existing reservation.',publicMessage:'The old unsent reservation has been retired for review of the original remaining earnings.'};
  const bodies=['native-retirement-a','native-retirement-b'].map(requestId=>({sourceFormId:'system.recovery-finance',action:'retire_payout',requestId,expectedRevision:'0',input}));
  const results=await Promise.allSettled(bodies.map(body=>runRecoveryCommand(db,'reviewer',body,'staff',environment)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(r=>r.status==='fulfilled'),result=(results[winner] as PromiseFulfilledResult<unknown>).value;
  assert.deepEqual(await recoverRecoveryCommand(db,'reviewer',bodies[winner].requestId,'staff'),result);
  assert.deepEqual(await runRecoveryCommand(db,'reviewer',bodies[winner],'staff',environment),result);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_payout_retirements').first<{n:number}>())!.n,1);
  assert.deepEqual(await money(),originalMoney);
  await assert.rejects(db.prepare('DELETE FROM seller_recovery_payout_retirements').run(),/retained/i);
  await assert.rejects(db.prepare('UPDATE seller_recovery_payout_retirements SET original_amount_paisa=1').run(),/retained/i);
  const current=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);
  const followup={sourceFormId:'system.recovery-finance',action:model==='fixed'?'refresh_source':'unpaid_source',requestId:'native-retirement-source-review',expectedRevision:'1',input:{caseId:opened.id,reviewDigest:current.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-ORIGINAL-BALANCE',reason:'Review the actual original earnings and completed native adjustment after the old unsent reservation was released.',publicMessage:'No recovery is owed. Your original remaining entitlement stays payable.'}};
  await runRecoveryCommand(db,'reviewer',followup,'staff',environment);
  const after=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);
  assert.equal(after.case.blocker,null);assert.equal(after.case.confirmedPaisa,0);
  assert.deepEqual(await money(),originalMoney);
 }finally{await native?.dispose();f.dispose();}
});
