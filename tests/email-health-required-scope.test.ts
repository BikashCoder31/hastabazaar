import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {recordServiceHealthObservation,evaluateServiceHealth} from '../lib/operations/service-health-repository';
import {readSystemHealthWorkspace} from '../lib/operations/system-health-workspace';

void test('explicitly missing current release retains actual failures and observations but cannot certify email recovery',async()=>{
 const f=serviceHealthFixture();try{
  let now=2_000_000_000_000;const start=now;
  const observe=async(successful:boolean,evidenceScope:string|null)=>{await recordServiceHealthObservation(f.db,{environment:'test',serviceKey:'email.sender',runKey:'scope-'+now,observedAt:now,successful,functionalSuccess:successful,eligibleBacklog:successful?0:1,oldestEligibleAt:successful?null:start,progressCount:successful?1:0,failureCategory:successful?null:'worker',sourceKind:'sender',evidenceScope});return evaluateServiceHealth(f.db,{environment:'test',serviceKey:'email.sender',expectedSince:start,now,evidenceScope});};
  await observe(false,null);now+=60_000;const outage=await observe(false,null);assert.equal(outage.state,'action_needed');assert.ok(outage.incident);
  now+=60_000;await observe(true,null);now+=60_000;const unknown=await observe(true,null);
  assert.equal(unknown.state,'unknown');assert.equal(unknown.reason,'evidence_scope_unverified');assert.notEqual(unknown.incident?.state,'resolved');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_observations WHERE functional_success=1').get()!.n,2,'Actual functional outcomes are retained even without current release proof.');
  now+=60_000;await observe(true,'current-fixture');now+=60_000;const recovered=await observe(true,'current-fixture');assert.equal(recovered.incident?.state,'resolved');
 }finally{f.sqlite.close();}
});
void test('combined health workspace cannot borrow another release email success',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  await recordServiceHealthObservation(f.db,{environment:'test',serviceKey:'email.sender',runKey:'old-release-success',observedAt:f.now,successful:true,functionalSuccess:true,eligibleBacklog:0,oldestEligibleAt:null,progressCount:1,failureCategory:null,sourceKind:'sender',evidenceScope:'previous-fixture'});
  const result=await readSystemHealthWorkspace(f.db,'reviewer',{environment:'test',releaseId:'current-fixture',now:f.now,expectedSince:f.now-1});
  assert.equal(result.services.find(row=>row.serviceKey==='email.sender')?.state,'unknown');
 }finally{f.dispose();}
});
