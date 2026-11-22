import assert from 'node:assert/strict';
import test from 'node:test';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {runEmailAutomation} from '../lib/email/automation';
import {readServiceHealth} from '../lib/operations/service-health-repository';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
const empty={processed:0,business:{accepted:0,failed:0,cancelled:0},orders:{sent:0,failed:0,cancelled:0}};
void test('email recovery records the trusted release and cannot combine successes across releases',async()=>{
 const f=serviceHealthFixture();try{
  let now=1_800_000,failed=true;
  const bind=(releaseId:string)=>captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',NODE_ENV:'test',APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RELEASE_ID:releaseId});
  const tick=()=>runEmailAutomation(f.db,{environment:'test',expectedSince:1_799_000},{clock:()=>now,evaluate:async()=>({scanned:1,created:0,cancelled:0,failures:[]}),send:async()=>({...empty,processed:1,business:{accepted:failed?0:1,failed:failed?1:0,cancelled:0}}),attemptFailures:async()=>failed?['temporary']:[],queueSnapshot:async()=>({eligibleBacklog:0,oldestEligibleAt:null,backoffCategory:null}),transitions:async()=>[]});
  bind('fixture-release-a');await tick();
  assert.equal(f.sqlite.prepare("SELECT evidence_scope FROM service_health_observations WHERE service_key='email.sender'").get()!.evidence_scope,'fixture-release-a');
  now+=60_000;await tick();failed=false;now+=60_000;await tick();
  bind('fixture-release-b');now+=60_000;await tick();
  assert.notEqual(f.sqlite.prepare("SELECT state FROM service_health_incidents WHERE service_key='email.sender'").get()!.state,'resolved');
  now+=60_000;await tick();
  assert.equal(f.sqlite.prepare("SELECT state FROM service_health_incidents WHERE service_key='email.sender'").get()!.state,'resolved');
 }finally{f.sqlite.close();}
});
void test('a time-budget stop cannot claim evaluator recovery merely because it scanned one source',async()=>{
 const f=serviceHealthFixture();try{
  const now=1_800_000;
  await runEmailAutomation(f.db,{environment:'test',expectedSince:now-1000},{clock:()=>now,evaluate:async()=>({scanned:1,created:0,cancelled:0,failures:[],budgetExhausted:true}),send:async()=>empty,attemptFailures:async()=>[],queueSnapshot:async()=>({eligibleBacklog:0,oldestEligibleAt:null,backoffCategory:null}),transitions:async()=>[]});
  assert.equal(f.sqlite.prepare("SELECT functional_success FROM service_health_observations WHERE service_key='email.evaluator'").get()!.functional_success,0);
 }finally{f.sqlite.close();}
});
void test('mixed accepted and failed sends retain both progress and failed sender evidence',async()=>{
 const f=serviceHealthFixture();try{
  const now=1_800_000;
  const result=await runEmailAutomation(f.db,{environment:'test',expectedSince:now-1000},{clock:()=>now,evaluate:async()=>({scanned:0,created:0,cancelled:0,failures:[]}),send:async()=>({...empty,business:{accepted:1,failed:1,cancelled:0}}),attemptFailures:async()=>['temporary'],queueSnapshot:async()=>({eligibleBacklog:0,oldestEligibleAt:null,backoffCategory:null}),transitions:async()=>[]});
  assert.equal(result.healthRecorded,true);
  const observation=f.sqlite.prepare("SELECT successful,functional_success,progress_count,failure_category FROM service_health_observations WHERE service_key='email.sender'").get();
  assert.deepEqual({...observation},{successful:0,functional_success:0,progress_count:1,failure_category:'provider'});
 }finally{f.sqlite.close();}
});
void test('scheduled tick sends saved work despite evaluator failure and records independent actual outcomes',async()=>{
 const f=serviceHealthFixture();try{
  const now=1_800_000;let sent=0;
  const result=await runEmailAutomation(f.db,{environment:'test',expectedSince:now-1000},{clock:()=>now,evaluate:async()=>{throw Error('synthetic source failure');},send:async()=>{sent++;return {...empty,processed:1,business:{accepted:1,failed:0,cancelled:0}};},queueSnapshot:async()=>({eligibleBacklog:0,oldestEligibleAt:null,backoffCategory:null}),transitions:async()=>[]});
  assert.equal(sent,1);assert.equal(result.ok,false);assert.equal(result.healthRecorded,true);
  assert.equal((await readServiceHealth(f.db,{environment:'test',serviceKey:'email.sender',expectedSince:now-1000,now})).state,'healthy');
  assert.equal((await readServiceHealth(f.db,{environment:'test',serviceKey:'email.evaluator',expectedSince:now-1000,now})).state,'degraded');
 }finally{f.sqlite.close();}
});
void test('empty ticks require a genuine transport probe and valid backoff prevents probing',async()=>{
 const f=serviceHealthFixture();try{
  let now=1_800_000,probes=0,blocked=false;
  const dependencies={clock:()=>now,evaluate:async()=>({scanned:0,created:0,cancelled:0,failures:[]}),send:async()=>empty,queueSnapshot:async()=>({eligibleBacklog:0,oldestEligibleAt:null,backoffCategory:blocked?'provider' as const:null}),transitions:async()=>[]};
  await runEmailAutomation(f.db,{environment:'test',expectedSince:now-1000},dependencies);
  assert.equal((await readServiceHealth(f.db,{environment:'test',serviceKey:'email.sender',expectedSince:now-1000,now})).state,'unknown');
  now+=60_000;const mail={send:async()=>{},probe:async()=>{probes++;return {available:true as const,transport:'capture' as const};}};
  await runEmailAutomation(f.db,{environment:'test',expectedSince:1_799_000,mail},dependencies);assert.equal(probes,1);
  assert.equal((await readServiceHealth(f.db,{environment:'test',serviceKey:'email.sender',expectedSince:1_799_000,now})).state,'healthy');
  blocked=true;now+=60_000;await runEmailAutomation(f.db,{environment:'test',expectedSince:1_799_000,mail},dependencies);assert.equal(probes,1);
  assert.equal((await readServiceHealth(f.db,{environment:'test',serviceKey:'email.sender',expectedSince:1_799_000,now})).state,'degraded');
 }finally{f.sqlite.close();}
});
