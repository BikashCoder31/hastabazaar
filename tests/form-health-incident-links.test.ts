import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {evaluateFormHealth,recordFormLoadObservation,formDiagnosticRetention} from '../lib/operations/form-health';
import {nativeFormContract} from '../lib/operations/native-form-health';
import {recordServiceHealthObservation,type HealthTransitionStatements} from '../lib/operations/service-health-repository';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
import {buildFormAnswerInsert} from '../lib/db/repositories/form-answers';

const scope={environment:'test' as const,releaseId:'incident-links',now:1980000,limit:1};
function fixture(){
 const f=serviceHealthFixture();
 f.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY,form_id TEXT,config_version_id TEXT,answers_json TEXT,created_at INTEGER);CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,next_json TEXT,created_at INTEGER);CREATE TABLE form_config_versions(form_id TEXT,status TEXT,version INTEGER,config_json TEXT,published_at INTEGER);');
 f.sqlite.exec(readFileSync(new URL('../drizzle/0151_form_health_records.sql',import.meta.url),'utf8'));
 const invalid=(now:number)=>f.sqlite.prepare("INSERT INTO audit_logs(id,action,subject_type,next_json,created_at) VALUES(?,'form.core_answers','form',?,?)").run('invalid-'+now,JSON.stringify({formId:'unmapped',version:1,healthScope:{environment:scope.environment,releaseId:scope.releaseId}}),now);
 const blocked=async(now:number,extra:Partial<Parameters<typeof recordFormLoadObservation>[1]>={})=>{
  const reference=await recordFormLoadObservation(f.db,{...scope,now,formId:'seller.inventory',version:1,outcome:'blocked',category:'definition_unavailable',...extra});
  return String(f.sqlite.prepare('SELECT id FROM form_health_observations WHERE support_reference=?').get(reference)!.id);
 };
 const transitions:HealthTransitionStatements=async(db,t)=>[db.prepare('INSERT INTO transition_notices(id,transition,incident_id) VALUES(?,?,?)').bind(crypto.randomUUID(),t.transition,t.incidentId)];
 const scan=(extra:Partial<Parameters<typeof evaluateFormHealth>[1]>={})=>evaluateFormHealth(f.db,{...scope,...extra},transitions);
 const deliver=async(id:string)=>{
  const row=f.sqlite.prepare('SELECT * FROM form_health_observations WHERE id=?').get(id)!;
  const evidenceScope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([row.release_id,row.form_id,row.form_version])))),v=>v.toString(16).padStart(2,'0')).join('');
  await recordServiceHealthObservation(f.db,{environment:row.environment as 'test',serviceKey:'form.'+String(row.form_id),runKey:id,observedAt:Number(row.observed_at),successful:false,functionalSuccess:false,eligibleBacklog:1,oldestEligibleAt:Number(row.observed_at),progressCount:0,failureCategory:'worker',sourceKind:'evaluator',evidenceScope});
 };
 const count=(table:string)=>Number(f.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get()!.n);
 const links=(incident?:string)=>f.sqlite.prepare('SELECT observation_id id FROM form_health_incident_links'+(incident?' WHERE incident_id=?':'')+' ORDER BY observation_id').all(...(incident?[incident]:[])).map(r=>String(r.id));
 return {...f,invalid,blocked,scan,count,links,transitions,deliver};
}

void test('deferred incident retains both earlier delivered blockers, and exact retry adds no notice or link',async()=>{
 const f=fixture();try{
  for(const at of [1600000,1610000,1620000,1630000])f.invalid(at);
  const ids=[await f.blocked(1800000),await f.blocked(1860000)].sort();
  for(let i=0;i<3;i++){await f.scan();assert.equal(f.count('service_health_incidents'),0);}
  const completed=await f.scan();assert.equal(completed.scanned,0);assert.equal(f.count('service_health_incidents'),1);
  assert.deepEqual(f.links(),ids);
  for(let i=0;i<4;i++)await f.scan();
  assert.deepEqual(f.links(),ids);assert.equal(f.count('transition_notices'),1);
 }finally{f.sqlite.close();}
});

void test('a rejected originating link rolls back the incident and notice, then retries exactly once',async()=>{
 const f=fixture();try{
  const ids=[await f.blocked(1800000),await f.blocked(1860000)].sort();
  f.sqlite.exec("CREATE TRIGGER reject_link BEFORE INSERT ON form_health_incident_links BEGIN SELECT RAISE(ABORT,'link_write_failed'); END;");
  await assert.rejects(f.scan({limit:100}),/link_write_failed/);
  assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);
  f.sqlite.exec('DROP TRIGGER reject_link');
  await f.scan();await f.scan();
  assert.deepEqual(f.links(),ids);assert.equal(f.count('transition_notices'),1);
 }finally{f.sqlite.close();}
});

void test('an existing incident with missing links repairs old opening evidence after newer observations arrive',async()=>{
 const f=fixture();try{
  const ids=[await f.blocked(1800000),await f.blocked(1860000)].sort();
  for(const at of [1600000,1610000,1620000,1630000])f.invalid(at);
  await f.scan();await f.scan();
  assert.equal(f.count('service_health_observations'),2);assert.equal(f.count('service_health_incidents'),0);
  // Simulate an earlier deployed evaluator that committed its incident/notice but lost all links.
  f.sqlite.exec("INSERT INTO service_health_incidents(id,environment,service_key,episode,state,severity,first_seen_at,last_seen_at,resolved_at,failure_category,revision) VALUES('prior-unlinked','test','form.seller.inventory',1,'detected','high',1980000,1980000,NULL,'worker',0);INSERT INTO transition_notices VALUES('prior-notice','outage','prior-unlinked');");
  await f.scan({limit:100,deadlineMs:0});assert.equal(f.count('form_health_incident_links'),0);
  for(let i=0;i<105;i++)await f.blocked(2000000+i);
  await f.scan({limit:200,now:2100000});await f.scan({limit:200,now:2100000});
  for(const id of ids)assert.ok(f.links('prior-unlinked').includes(id),'Opening evidence must survive displacement from the latest 100 observations');
  assert.equal(f.count('transition_notices'),1);
 }finally{f.sqlite.close();}
});

void test('link repair excludes other scope, stale native version, future evidence and non-evaluator delivery',async()=>{
 const f=fixture();try{
  const formId='seller.document-change-request',version=(await nativeFormContract(formId))!.version;
  const excluded=[await f.blocked(1800000,{environment:'development',formId,version}),await f.blocked(1800000,{releaseId:'other-release',formId,version}),await f.blocked(1800000,{formId,version:1}),await f.blocked(1990000,{formId,version}),await f.blocked(1800000,{formId:'seller.inventory'})];
  // Deliver older out-of-scope facts too, so isolation is tested at retention, not only ingestion.
  for(const id of excluded.filter((_,i)=>i!==3))await f.deliver(id);
  const wrongSource=await f.blocked(1750000,{formId,version});excluded.push(wrongSource);
  const evidenceScope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([scope.releaseId,formId,version])))),v=>v.toString(16).padStart(2,'0')).join('');
  await recordServiceHealthObservation(f.db,{environment:'test',serviceKey:'form.'+formId,runKey:wrongSource,observedAt:1750000,successful:false,functionalSuccess:false,eligibleBacklog:1,oldestEligibleAt:1750000,progressCount:0,failureCategory:'worker',sourceKind:'watchdog',evidenceScope});
  const ids=[await f.blocked(1800000,{formId,version}),await f.blocked(1860000,{formId,version})].sort();
  await f.scan({formId,limit:200});await f.scan({formId,limit:200});
  assert.deepEqual(f.links(),ids);for(const id of excluded)assert.ok(!f.links().includes(id));
 }finally{f.sqlite.close();}
});

void test('a successful submission separates unrelated historical failures from the opening evidence',async()=>{
 const f=fixture();try{
  await f.blocked(1600000);
  captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RELEASE_ID:scope.releaseId,NODE_ENV:'test'});
  await f.db.batch([buildFormAnswerInsert(f.db,{formId:'seller.inventory',requestId:'prior-recovery',versionId:'core:seller.inventory:1',subjectType:'product',subjectId:'fictional-product',actorId:'sa',answers:{formId:'seller.inventory',version:1,answers:[]},now:1700000})]);
  const ids=[await f.blocked(1800000),await f.blocked(1860000)].sort();
  await f.scan({limit:100});assert.deepEqual(f.links(),ids);
 }finally{f.sqlite.close();}
});

void test('a lost committed response retries retained links and notice without duplicates',async()=>{
 const f=fixture();try{
  const ids=[await f.blocked(1800000),await f.blocked(1860000)].sort();
  for(const id of ids)await f.deliver(id);
  const original=f.db.batch.bind(f.db);let lost=false;
  const interrupted=Object.create(f.db) as D1Database;
  interrupted.batch=(async statements=>{
   const result=await original(statements);
   if(!lost&&f.count('service_health_incidents')===1){lost=true;throw new Error('incident_response_lost');}
   return result;
  }) as D1Database['batch'];
  await assert.rejects(evaluateFormHealth(interrupted,scope,f.transitions),/incident_response_lost/);
  assert.deepEqual(f.links(),ids);assert.equal(f.count('transition_notices'),1);
  await f.scan();assert.deepEqual(f.links(),ids);assert.equal(f.count('transition_notices'),1);
 }finally{f.sqlite.close();}
});

void test('failure repairing a previously committed incident preserves its notice and retries later',async()=>{
 const f=fixture();try{
  const ids=[await f.blocked(1800000),await f.blocked(1860000)].sort();for(const id of ids)await f.deliver(id);
  f.sqlite.exec("INSERT INTO service_health_incidents(id,environment,service_key,episode,state,severity,first_seen_at,last_seen_at,resolved_at,failure_category,revision) VALUES('unlinked-retry','test','form.seller.inventory',1,'detected','high',1980000,1980000,NULL,'worker',0);INSERT INTO transition_notices VALUES('prior-notice','outage','unlinked-retry');CREATE TRIGGER reject_repair BEFORE INSERT ON form_health_incident_links BEGIN SELECT RAISE(ABORT,'repair_write_failed'); END;");
  await assert.rejects(f.scan(),/repair_write_failed/);
  assert.equal(f.count('form_health_incident_links'),0);assert.equal(f.count('transition_notices'),1);
  assert.equal(f.sqlite.prepare('SELECT revision FROM service_health_incidents').get()!.revision,0);
  f.sqlite.exec('DROP TRIGGER reject_repair');await f.scan();await f.scan();
  assert.deepEqual(f.links('unlinked-retry'),ids);assert.equal(f.count('transition_notices'),1);
 }finally{f.sqlite.close();}
});

void test('a new incident retains its own failure evidence without attaching it to a resolved episode',async()=>{
 const f=fixture();try{
  const oldIds=[await f.blocked(1800000),await f.blocked(1860000)].sort();
  await f.scan({limit:100});const old=String(f.sqlite.prepare('SELECT id FROM service_health_incidents').get()!.id);
  f.sqlite.prepare("UPDATE service_health_incidents SET state='resolved',resolved_at=2000000,revision=revision+1 WHERE id=?").run(old);
  const newIds=[await f.blocked(2100000),await f.blocked(2160000)].sort();
  await f.scan({limit:100,now:2200000});await f.scan({now:2200000});
  const next=String(f.sqlite.prepare('SELECT id FROM service_health_incidents WHERE episode=2').get()!.id);
  assert.deepEqual(f.links(old),oldIds);assert.deepEqual(f.links(next),newIds);assert.equal(f.count('transition_notices'),2);
 }finally{f.sqlite.close();}
});

void test('linked evidence keeps its original no-cleanup and immutable retention guards',async()=>{
 const f=fixture();try{
  await f.blocked(1800000);await f.blocked(1860000);await f.scan({limit:100});
  assert.equal(f.count('form_health_incident_links'),2);assert.equal(formDiagnosticRetention.cleanupEnabled,false);
  assert.throws(()=>f.sqlite.exec('DELETE FROM form_health_incident_links'),/form_health_incident_evidence_retained/);
  assert.throws(()=>f.sqlite.exec('DELETE FROM form_health_observations'),/form_health_cleanup_not_enabled/);
  assert.throws(()=>f.sqlite.exec('UPDATE form_health_incident_links SET retained_at=0'),/form_health_incident_link_retained/);
 }finally{f.sqlite.close();}
});

void test('opening retention is bounded to the evaluator snapshot rather than all delivered history',async()=>{
 const f=fixture();try{
  const ids=[];for(let i=0;i<120;i++)ids.push(await f.blocked(1800000+i));
  await f.scan({limit:200});
  assert.equal(f.count('service_health_observations'),120);
  assert.deepEqual(f.links(),ids.slice(20).sort());assert.equal(f.count('transition_notices'),1);
 }finally{f.sqlite.close();}
});

void test('deadline expiry during evidence preparation defers the entire incident transaction',async()=>{
 const f=fixture(),realNow=Date.now;try{
  const ids=[await f.blocked(1800000),await f.blocked(1860000)].sort();for(const id of ids)await f.deliver(id);
  const deadline=realNow()+60000,interrupted=Object.create(f.db) as D1Database;
  interrupted.prepare=(sql:string)=>{
   const statement=f.db.prepare(sql);
   if(sql.startsWith('SELECT resolved_at resolvedAt')){
    const first=statement.first.bind(statement);
    statement.first=(async()=>{const result=await first();Date.now=()=>deadline;return result;}) as D1PreparedStatement['first'];
   }
   return statement;
  };
  const result=await evaluateFormHealth(interrupted,{...scope,deadlineMs:deadline},f.transitions);
  assert.equal(result.budgetExhausted,true);assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);assert.equal(f.count('form_health_incident_links'),0);
  Date.now=realNow;await f.scan();assert.deepEqual(f.links(),ids);assert.equal(f.count('transition_notices'),1);
 }finally{Date.now=realNow;f.sqlite.close();}
});
