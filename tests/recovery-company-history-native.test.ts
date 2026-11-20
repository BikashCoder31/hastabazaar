import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalManagedRecoveryFixture} from './helpers/historical-managed-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import * as recovery from '../lib/payments/seller-recovery';
import {readHistoricalRecoveryCandidates} from '../lib/payments/recovery-historical';

void test('native company and seller reviews share one immutable historical capacity and require a fresh losing review',async()=>{
 const f=await historicalManagedRecoveryFixture({twoRefunds:true,responsibility:'platform',legacyMissingResponsibility:true});let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));assert.ok(f.secondRefundId);
 const first=await recovery.openSellerRecovery(f.db,f.ctx('native-history-open-a'),{kind:'refund',id:f.refundId,reason:'Review the first actual refunded unit in its shared original historical deduction.'});
 const second=await recovery.openSellerRecovery(f.db,f.ctx('native-history-open-b'),{kind:'refund',id:f.secondRefundId,reason:'Review the second actual refunded unit in its shared original historical deduction.'});
 native=await nativeFinanceClone(f.sqlite);const db=native.db;
 async function attempt(id:string,name:string){const current=await recovery.getSellerRecoveryReview(db,'reviewer',id);return {ctx:f.ctx(name,String(current.case.revision)),input:{caseId:id,reviewDigest:current.reviewDigest,candidate:(await readHistoricalRecoveryCandidates(db,current.source))[0],amountPaisa:f.originalPaidPaisa/2,evidenceReference:'FICTIONAL-NATIVE-HISTORICAL-ATTRIBUTION',reason:'Attribute only this original refund share against the actual one native paid deduction.',publicMessage:'The original deduction attributable to this refund is confirmed.',environment:f.context.environment}};}
 const attempts=await Promise.all([attempt(first.id,'native-history-a'),attempt(second.id,'native-history-b')]);
 const run=(index:number,attempt:typeof attempts[number])=>(index===0?recovery.reviewSellerRecoveryCompanyHistory:recovery.reviewSellerRecoveryHistory)(db,attempt.ctx,attempt.input);
 const results=await Promise.allSettled(attempts.map((a,index)=>run(index,a)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results));
 const winner=results.findIndex(r=>r.status==='fulfilled'),loser=1-winner;
 assert.deepEqual(await run(winner,attempts[winner]),(results[winner] as PromiseFulfilledResult<unknown>).value);
 const refreshed=await attempt(attempts[loser].input.caseId,'native-history-refreshed');await run(loser,refreshed);
 assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM seller_recovery_all_historical_uses').first<{n:number}>())!.n,f.originalPaidPaisa);
 const journal=await db.prepare('SELECT * FROM seller_recovery_historical_attributions LIMIT 1').first();assert.ok(journal);
 await assert.rejects(db.prepare('UPDATE seller_recovery_historical_attributions SET amount_paisa=1 WHERE id=?').bind(journal.id).run(),/retained/i);
 await assert.rejects(db.prepare('DELETE FROM seller_recovery_historical_attributions WHERE id=?').bind(journal.id).run(),/retained/i);
 await assert.rejects(db.prepare(`INSERT INTO seller_recovery_historical_attributions SELECT 'native-over-cap',case_id,case_revision+1,seller_id,refund_id,kind,payout_id,scope_id,native_deduction_paisa,1,actor_id,'native-over-cap',created_at,evidence_reference,reason,public_message FROM seller_recovery_historical_attributions WHERE id=?`).bind(journal.id).run(),/capacity/i);
 const pool=await db.prepare('SELECT principal_paisa principal,used_paisa used FROM seller_recovery_historical_pools').first<{principal:number;used:number}>();assert.deepEqual(pool,{principal:f.originalPaidPaisa,used:f.originalPaidPaisa});
 await assert.rejects(db.prepare('UPDATE seller_recovery_historical_pools SET used_paisa=0').run(),/projection/i);
 await assert.rejects(db.prepare('DELETE FROM seller_recovery_historical_pools').run(),/retained/i);
 await assert.rejects(db.prepare('UPDATE seller_recovery_company_deductions SET amount_paisa=1').run(),/retained/i);
 await assert.rejects(db.prepare('DELETE FROM seller_recovery_company_deductions').run(),/retained/i);
 const company=await recovery.getSellerRecoveryReview(db,'reviewer',first.id);assert.equal(company.position.recoveredPaisa,0);
 await recovery.compensateSellerRecoverySource(db,f.ctx('native-company-history-compensation',String(company.case.revision)),{caseId:first.id,reviewDigest:company.reviewDigest,environment:f.context.environment,evidenceReference:'FICTIONAL-NATIVE-COMPANY-CORRECTION',reason:'Restore only the original company-owned charge after its exact actual historical deduction is identified.',publicMessage:'The original company charge is corrected without seller repayment.'});
 const final=await recovery.getSellerRecoveryReview(db,'reviewer',first.id);assert.equal(final.source.blocker,null);assert.equal(final.source.companyCompensatedPaisa,f.originalPaidPaisa/2);assert.equal(final.position.recoveredPaisa,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').first<{n:number}>())!.n,0);
 }finally{await native?.dispose();f.dispose();}
});
