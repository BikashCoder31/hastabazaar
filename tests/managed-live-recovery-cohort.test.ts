import test from 'node:test';
import assert from 'node:assert/strict';
import {actualMixedCohortFixture,appendRetainedSimulationEarning} from './helpers/live-financial-cohort-fixture';
import * as recovery from '../lib/payments/seller-recovery';
import {readModelRecoveryEarnings,modelRecoveryNettingStatements} from '../lib/payments/recovery-earnings-models';
import {getSellerEarnings} from '../lib/seller/earnings';


void test('older simulation plan/dispute cannot consume or block actual live netting and native allocations reject cross-cohort debit',async()=>{
 const f=await actualMixedCohortFixture();try{
 const historicalBefore=f.sqlite.prepare('SELECT * FROM seller_recovery_cases WHERE id=?').get(f.historicalCase)!;
 const visible=(await getSellerEarnings(f.db,f.sellerId)).managed!;assert.equal(visible.recordKind,'live');assert.equal(visible.summary.paidPaisa,69000);assert.equal(visible.summary.calculatedPaisa,138000);assert.equal(visible.summary.balancePaisa,-15000);assert.equal(visible.simulationHistory!.paidPaisa,69000);assert.equal(visible.simulationHistory!.balancePaisa,-84000);
 const actualReview=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.actualCase),pool=await readModelRecoveryEarnings(f.db,actualReview.source,Date.now());
 assert.equal(pool.recordKind,'live');assert.equal(pool.amount,69000);assert.equal(pool.futureId,f.future.entitlementId);
 const simulatedReview=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.historicalCase),simPool=await readModelRecoveryEarnings(f.db,simulatedReview.source,Date.now());assert.equal(simPool.recordKind,'simulation');assert.notEqual(simPool.futureId,f.future.entitlementId);
 assert.ok(Number(historicalBefore.disputed_paisa)>0);assert.ok(historicalBefore.plan_json,'The older simulated case actually has a retained approved plan.');
 const ledgerBefore=f.sqlite.prepare('SELECT * FROM managed_settlement_entries ORDER BY id').all();
 const proposal=JSON.parse(String(f.sqlite.prepare('SELECT plan_json FROM seller_recovery_cases WHERE id=?').get(f.actualCase)!.plan_json));
 await assert.rejects(()=>f.db.batch(modelRecoveryNettingStatements(f.db,actualReview.source,f.ctx('forged-cross-cohort'),{caseId:f.actualCase,allocationId:'forged-cross-cohort',futureId:f.historical.entitlementId,amount:1,creditId:'forged-cross-credit',debitId:'forged-cross-debit',proposalId:proposal.proposalId})),/managed_recovery_cannot_mix_simulation_live/);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM managed_settlement_entries ORDER BY id').all(),ledgerBefore);
 const ctx=f.ctx('actual-isolated-native-netting',String(actualReview.case.revision)),input={caseId:f.actualCase};
 const applied=await recovery.applySellerRecoveryEarnings(f.db,ctx,input);assert.equal(applied.amountPaisa,69000);assert.deepEqual(await recovery.applySellerRecoveryEarnings(f.db,ctx,input),applied);
 assert.equal((await recovery.getSellerRecoveryReview(f.db,'reviewer',f.actualCase)).position.remainingPaisa,actualReview.position.remainingPaisa-applied.amountPaisa);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM seller_recovery_cases WHERE id=?').get(f.historicalCase),historicalBefore);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE entitlement_id=? AND reason_code='recovery_netting_withholding'").get(f.historical.entitlementId)!.n,0);
 }finally{f.dispose();}
});

void test('older live plan/dispute cannot consume or block later simulation netting',async()=>{
 const f=await actualMixedCohortFixture(true);try{
 const simulatedFuture=await appendRetainedSimulationEarning(f.future,'converse-simulation-future');
 const older=f.sqlite.prepare('SELECT * FROM seller_recovery_cases WHERE id=?').get(f.actualCase)!;
 const later=f.sqlite.prepare('SELECT * FROM seller_recovery_cases WHERE id=?').get(f.historicalCase)!;
 assert.ok(Number(older.created_at)<Number(later.created_at),'Actual case and approved plan were genuinely opened earlier.');
 assert.ok(Number(older.disputed_paisa)>0);assert.ok(older.plan_json);
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.historicalCase),pool=await readModelRecoveryEarnings(f.db,review.source,Date.now());
 assert.equal(pool.recordKind,'simulation');assert.equal(pool.amount,69000);assert.equal(pool.futureId,simulatedFuture.entitlementId);
 const proposal=JSON.parse(String(later.plan_json));
 await assert.rejects(()=>f.db.batch(modelRecoveryNettingStatements(f.db,review.source,f.ctx('forged-live-to-simulation'),{caseId:f.historicalCase,allocationId:'forged-live-to-simulation',futureId:f.future.entitlementId,amount:1,creditId:'forged-live-to-simulation-credit',debitId:'forged-live-to-simulation-debit',proposalId:proposal.proposalId})),/managed_recovery_cannot_mix_simulation_live/);
 const applied=await recovery.applySellerRecoveryEarnings(f.db,f.ctx('isolated-simulation-netting',String(review.case.revision)),{caseId:f.historicalCase,environment:f.historical.environment});
 assert.equal(applied.amountPaisa,69000,'The earlier live disputed paisa and approved plan cannot reduce or queue simulation earnings.');
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM seller_recovery_cases WHERE id=?').get(f.actualCase),older);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE entitlement_id=? AND reason_code='recovery_netting_withholding'").get(f.future.entitlementId)!.n,0);
 }finally{f.dispose();}
});
