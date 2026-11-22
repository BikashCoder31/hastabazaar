import assert from 'node:assert/strict';
import test from 'node:test';
import {historicalLaterRefundFixture} from './helpers/historical-later-refund-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {openSellerRecovery,readSellerRecoverySource} from '../lib/payments/seller-recovery';
import {readHistoricalRecoveryCandidates} from '../lib/payments/recovery-historical';
void test('native history proof refuses to attribute an earlier deduction to a later original refund',async()=>{
 const f=await historicalLaterRefundFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  native=await nativeFinanceClone(f.sqlite);const db=native.db;
  const source=await readSellerRecoverySource(db,{kind:'refund',id:f.secondRefundId});assert.equal(source.historicalNettingPaisa,0);assert.deepEqual(await readHistoricalRecoveryCandidates(db,source),[]);
  const first=await readSellerRecoverySource(db,{kind:'refund',id:f.refundId}),candidate=(await readHistoricalRecoveryCandidates(db,first))[0];assert.ok(candidate.nativeProof);
  const opened=await openSellerRecovery(db,f.ctx('native-later-source-open'),{kind:'refund',id:f.secondRefundId,reason:'Review the later actual refund without assigning it an earlier historical deduction.'});
  await assert.rejects(db.prepare(`INSERT INTO seller_recovery_historical_attributions(id,case_id,case_revision,seller_id,refund_id,kind,payout_id,scope_id,native_deduction_paisa,amount_paisa,actor_id,request_id,created_at,evidence_reference,reason,public_message) VALUES('invalid-later-attribution',?,0,?,?,?,?,?,?,1,'reviewer','invalid-later-attribution',?,'FICTIONAL-INVALID-LATER-SOURCE','Attempt to assign an earlier native deduction to a later original refund.','This invalid attribution must not be retained.')`).bind(opened.id,source.sellerId,f.secondRefundId,candidate.kind,candidate.payoutId,candidate.scopeId,candidate.capacityPaisa,Date.now()).run(),/actual_native_source/i);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_historical_attributions').first<{n:number}>())!.n,0);
 }finally{await native?.dispose();f.dispose();}
});
