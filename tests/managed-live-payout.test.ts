import test from 'node:test';
import assert from 'node:assert/strict';
import {earnedMaker} from './helpers/company-store-financial-fixture';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout} from '../lib/managed-commerce/live-payout-operations';
import {recoveryPayoutReadySql} from '../lib/payments/recovery-payout-policy';
import {managedRecoveryFixture} from './helpers/managed-recovery-fixture';
import {openSellerRecovery} from '../lib/payments/seller-recovery';
void test('actual live payout never adopts historical simulation earnings even with a genuine current bank beneficiary',async()=>{
 const f=await earnedMaker();try{
 const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,f.financialNow);
 assert.equal(preview.balancePaisa,0);assert.equal(preview.amountPaisa,0);
 await assert.rejects(()=>prepareLiveManagedPayout(f.db,{actorId:'reviewer',requestId:'live-cannot-take-simulation',expectedRevision:null,now:f.financialNow},{sellerId:f.sellerId,scheduledFor:f.financialNow,expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'Actual source review must not collect historical simulated earnings.'}),/positive|live|eligible/i);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM managed_payouts WHERE record_kind='live'").get()!.n,0);
 }finally{f.dispose();}
});
void test('native live headers cannot claim simulation money',async()=>{
 const f=await earnedMaker();try{
 assert.throws(()=>f.sqlite.prepare("INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,simulation_label,prepared_by,approved_by,scheduled_for,request_id,created_at,updated_at,record_kind) VALUES('forged-live',?,'MP-FORGED',100,'approved',?,NULL,'reviewer','reviewer',1,'forged-live',1,1,'live')").run(f.sellerId,f.payoutSources.beneficiaryReference),/live.*source|live.*balance/i);
 }finally{f.dispose();}
});
void test('actual recovery readiness excludes retained simulated refund debt without clearing or altering that owned debt',async()=>{
 const f=await managedRecoveryFixture();try{
 await openSellerRecovery(f.db,f.ctx('retained-simulated-recovery-case'),{kind:'refund',id:f.refundId,reason:'Retain the original explicit simulated financial source as its own owned historical recovery.'});
 const cases=f.sqlite.prepare('SELECT * FROM seller_recovery_cases').all();assert.ok(cases.length>0);
 for(const [kind,expected] of [[undefined,0],['live',1]] as const){const sql=recoveryPayoutReadySql('?','managed',kind);assert.equal(f.sqlite.prepare('SELECT CASE WHEN '+sql+' THEN 1 ELSE 0 END AS ready').get(...Array.from({length:(sql.match(/\?/g)??[]).length},()=>f.sellerId))!.ready,expected);}
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM seller_recovery_cases').all(),cases);
 }finally{f.dispose();}
});
