import assert from 'node:assert/strict';
import test from 'node:test';
import {incomingRecoveryDisposition} from '../lib/payments/recovery-incoming-disposition';

void test('carrier coverage separates remaining liability, restored seller collections and original unpaid earnings',()=>{
 const input={kind:'carrier' as const,confirmed:10000,absorbed:2000,disputed:0,recovered:5000,carrierRecovered:1000,incoming:10000,resolveDisputed:0,originalUnpaidAvailable:3000};
 const result=incomingRecoveryDisposition(input);
 assert.deepEqual(result,{nativeCreditPaisa:10000,restoredPaisa:7000,restoredSellerPaisa:4000,originalUnpaidCoveredPaisa:3000,returnedPrincipalExcessPaisa:0,recoveredPaisa:8000,remainingPaisa:0,disputedPaisa:0});
 assert.equal(result.nativeCreditPaisa,(result.recoveredPaisa-input.recovered)+result.restoredPaisa);
 assert.throws(()=>incomingRecoveryDisposition({...input,incoming:10001}),/original cost/);
});
void test('returned original principal cannot restore carrier money or exceed its verified original source',()=>{
 const input={kind:'returned_payout' as const,confirmed:10000,absorbed:2000,disputed:0,recovered:5000,carrierRecovered:1000,incoming:10000,resolveDisputed:0,returnedPrincipalAvailable:15000};
 assert.deepEqual(incomingRecoveryDisposition(input),{nativeCreditPaisa:10000,restoredPaisa:7000,restoredSellerPaisa:4000,originalUnpaidCoveredPaisa:0,returnedPrincipalExcessPaisa:3000,recoveredPaisa:8000,remainingPaisa:0,disputedPaisa:0});
 assert.throws(()=>incomingRecoveryDisposition({...input,incoming:15001}),/original payout/);
});
void test('zero recovery can still retain a separate unpaid-cost reimbursement or returned-principal disposition',()=>{
 const common={confirmed:0,absorbed:0,disputed:0,recovered:0,carrierRecovered:0,incoming:6000,resolveDisputed:0};
 const carrier=incomingRecoveryDisposition({...common,kind:'carrier',originalUnpaidAvailable:6000});
 assert.equal(carrier.originalUnpaidCoveredPaisa,6000);assert.equal(carrier.restoredSellerPaisa,0);assert.equal(carrier.recoveredPaisa,0);
 const returned=incomingRecoveryDisposition({...common,kind:'returned_payout',returnedPrincipalAvailable:6000});
 assert.equal(returned.returnedPrincipalExcessPaisa,6000);assert.equal(returned.originalUnpaidCoveredPaisa,0);assert.equal(returned.recoveredPaisa,0);
});
void test('incoming coverage requires an explicit resolution for an affected dispute',()=>{
 const input={kind:'carrier' as const,confirmed:10000,absorbed:0,disputed:5000,recovered:5000,carrierRecovered:0,incoming:10000,resolveDisputed:0,originalUnpaidAvailable:0};
 assert.throws(()=>incomingRecoveryDisposition(input),/disputed/);
 assert.equal(incomingRecoveryDisposition({...input,resolveDisputed:5000}).disputedPaisa,0);
 assert.throws(()=>incomingRecoveryDisposition({...input,resolveDisputed:5001}),/disputed/);
});
void test('exact arithmetic preserves conservation at the supported monetary limit',()=>{
 const maximum=Number.MAX_SAFE_INTEGER;
 const result=incomingRecoveryDisposition({kind:'returned_payout',confirmed:maximum,absorbed:0,disputed:0,recovered:maximum,carrierRecovered:0,incoming:maximum,resolveDisputed:0,returnedPrincipalAvailable:maximum});
 assert.equal(result.restoredSellerPaisa,maximum);assert.equal(result.recoveredPaisa,maximum);assert.equal(result.remainingPaisa,0);
 assert.throws(()=>incomingRecoveryDisposition({kind:'carrier',confirmed:maximum,absorbed:0,disputed:0,recovered:0,carrierRecovered:0,incoming:1,resolveDisputed:0,originalUnpaidAvailable:1}),/supported/);
});
void test('all bounded incoming cases conserve native credit and preserve the previous carrier share',()=>{
 for(const confirmed of [0,1,100])for(const absorbed of [0,confirmed])for(const recovered of [0,confirmed-absorbed])for(const carrierRecovered of [0,recovered])for(const incoming of [1,25,150]){
  const result=incomingRecoveryDisposition({kind:'returned_payout',confirmed,absorbed,disputed:0,recovered,carrierRecovered,incoming,resolveDisputed:0,returnedPrincipalAvailable:150});
  assert.equal(incoming,result.recoveredPaisa-recovered+result.restoredPaisa);
  assert.ok(result.restoredSellerPaisa<=recovered-carrierRecovered);
  assert.equal(result.restoredPaisa,result.restoredSellerPaisa+result.returnedPrincipalExcessPaisa);
  assert.ok(result.recoveredPaisa>=carrierRecovered);assert.equal(result.recoveredPaisa+result.remainingPaisa,confirmed-absorbed);
 }
});
