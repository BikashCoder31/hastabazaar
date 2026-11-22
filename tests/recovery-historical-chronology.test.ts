import assert from 'node:assert/strict';
import test from 'node:test';
import {historicalLaterRefundFixture} from './helpers/historical-later-refund-fixture';
import {readSellerRecoverySource} from '../lib/payments/seller-recovery';
import {readHistoricalRecoveryCandidates} from '../lib/payments/recovery-historical';
void test('an actual historical deduction cannot be reassigned to a later refund on the same original entitlement',async()=>{
 const f=await historicalLaterRefundFixture();try{
  const source=await readSellerRecoverySource(f.db,{kind:'refund',id:f.secondRefundId});
  assert.equal(source.historicalNettingPaisa,0,'The earlier deduction occurred before this refund existed.');
  assert.deepEqual(await readHistoricalRecoveryCandidates(f.db,source),[]);
  assert.equal(source.confirmedPaisa,45500);assert.equal(source.blocker,null);
  const first=await readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId});
  const originalCandidates=await readHistoricalRecoveryCandidates(f.db,first);assert.equal(originalCandidates.length,1);assert.equal(originalCandidates[0].payoutId,f.historicalPayoutId);assert.equal(originalCandidates[0].capacityPaisa,45500);assert.equal(originalCandidates[0].nativeProof,true);
 }finally{f.dispose();}
});
