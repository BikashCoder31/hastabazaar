import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
import {buildFormAnswerInsert} from '../lib/db/repositories/form-answers';
import {evaluateFormHealth,ingestCommittedFormSaves,recordFormLoadObservation} from '../lib/operations/form-health';
import type {HealthTransitionStatements} from '../lib/operations/service-health-repository';

const scope={environment:'test' as const,releaseId:'catchup-test',now:1980000,limit:1};
function fixture(){
 const f=serviceHealthFixture();
 f.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY,form_id TEXT,config_version_id TEXT,answers_json TEXT,created_at INTEGER);CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,next_json TEXT,created_at INTEGER);CREATE TABLE form_config_versions(form_id TEXT,status TEXT,version INTEGER,config_json TEXT,published_at INTEGER);');
 f.sqlite.exec(readFileSync(new URL('../drizzle/0151_form_health_records.sql',import.meta.url),'utf8'));
 captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RELEASE_ID:scope.releaseId,NODE_ENV:'test'});
 const invalid=(now:number)=>f.sqlite.prepare("INSERT INTO audit_logs(id,action,subject_type,next_json,created_at) VALUES(?,'form.core_answers','form',?,?)").run('invalid-'+now,JSON.stringify({formId:'unmapped',version:1,healthScope:{environment:scope.environment,releaseId:scope.releaseId}}),now);
 const blocked=(now:number,formId='seller.inventory')=>recordFormLoadObservation(f.db,{...scope,now,formId,version:1,outcome:'blocked',category:'definition_unavailable'});
 const save=(now:number)=>f.db.batch([buildFormAnswerInsert(f.db,{formId:'seller.inventory',requestId:'save-'+now,versionId:'core:seller.inventory:1',subjectType:'product',subjectId:'fictional-product',actorId:'sa',answers:{formId:'seller.inventory',version:1,answers:[]},now})]);
 const transitions:HealthTransitionStatements=async(db,t)=>[db.prepare('INSERT INTO transition_notices(id,transition,incident_id) VALUES(?,?,?)').bind(crypto.randomUUID(),t.transition,t.incidentId)];
 const count=(table:string)=>Number(f.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get()!.n);
 const scan=(extra:Partial<typeof scope>&{deadlineMs?:number;formId?:string}={})=>evaluateFormHealth(f.db,{...scope,...extra},transitions);
 return {...f,invalid,blocked,save,scan,count,transitions};
}

void test('rejected receipts cannot open or notify an obsolete outage before committed recovery is ingested',async()=>{
 const f=fixture();try{
  f.invalid(1700000);f.invalid(1710000);
  await f.blocked(1800000);await f.blocked(1860000);
  await f.save(1920000);await f.save(1980000);
  for(let i=0;i<8;i++){
   await f.scan();assert.equal(f.count('service_health_incidents'),0,'Catch-up must not manufacture a historical incident.');assert.equal(f.count('transition_notices'),0);
  }
  assert.equal(f.count('service_health_observations'),4);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_health_observations WHERE phase='save'").get()!.n,2);
  // A later real outage must still create exactly one current incident/notice.
  await f.blocked(2040000);await f.blocked(2100000);
  for(let i=0;i<6;i++)await f.scan({now:2100000});
  assert.equal(f.count('service_health_incidents'),1);assert.equal(f.count('transition_notices'),1);
  assert.equal(f.sqlite.prepare('SELECT first_seen_at FROM service_health_incidents').get()!.first_seen_at,2100000);
 }finally{f.sqlite.close();}
});

void test('permanently invalid receipts defer but never starve a genuine outage whose observations were already delivered',async()=>{
 const f=fixture();try{
  for(const now of [1600000,1610000,1620000,1630000])f.invalid(now);
  await f.blocked(1800000);await f.blocked(1860000);
  for(let i=0;i<3;i++){const result=await f.scan();assert.equal(result.budgetExhausted,true);assert.equal(f.count('service_health_incidents'),0);}
  assert.equal(f.count('service_health_observations'),2);
  const complete=await f.scan();assert.equal(complete.scanned,0);assert.equal(complete.budgetExhausted,false);
  assert.equal(f.count('service_health_incidents'),1);assert.equal(f.count('transition_notices'),1);
  for(let i=0;i<8;i++)await f.scan();
  assert.equal(f.count('audit_logs'),4);assert.equal(f.count('transition_notices'),1);
 }finally{f.sqlite.close();}
});

void test('a prolonged outage with fresh blocked loads on every pass is not starved by an older sweep snapshot',async()=>{
 const f=fixture();try{
  for(const now of [1600000,1610000,1620000,1630000])f.invalid(now);
  for(let i=0;i<8;i++){
   const now=1800000+i*60000;await f.blocked(now);await f.scan({now});
  }
  assert.equal(f.count('service_health_incidents'),1);assert.equal(f.count('transition_notices'),1);
 }finally{f.sqlite.close();}
});

void test('another worker holding the receipt lease cannot allow a premature incident',async()=>{
 const f=fixture();try{
  f.invalid(1700000);f.invalid(1710000);await f.blocked(1800000);await f.blocked(1860000);await f.save(1920000);
  await f.scan();
  f.sqlite.exec("UPDATE operational_reminder_cursors SET lease_token='other-worker',lease_until=9999999999999 WHERE family LIKE 'form-saves:%'");
  const busy=await f.scan();assert.equal(busy.busy,true);assert.equal(f.count('service_health_observations'),2);assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);
  f.sqlite.exec("UPDATE operational_reminder_cursors SET lease_until=0 WHERE family LIKE 'form-saves:%'");
  for(let i=0;i<5;i++)await f.scan();
  assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);
 }finally{f.sqlite.close();}
});

void test('a resumed old snapshot cannot evaluate newer blocked observations before their recovery sweep',async()=>{
 const f=fixture();try{
  f.invalid(1700000);f.invalid(1710000);
  await f.scan({now:1750000});
  await f.blocked(1800000);await f.blocked(1860000);await f.save(1920000);
  for(let i=0;i<6;i++){await f.scan();assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);}
  assert.equal(f.count('service_health_observations'),3);
 }finally{f.sqlite.close();}
});

void test('recovery arriving beyond an active finite sweep upper bound defers the decision until the next sweep',async()=>{
 const f=fixture();try{
  f.invalid(1700000);f.invalid(1710000);await f.blocked(1800000);await f.blocked(1860000);
  await f.scan();await f.save(1920000);
  const finishing=await f.scan();assert.equal(finishing.budgetExhausted,true);assert.equal(f.count('service_health_incidents'),0);
  for(let i=0;i<6;i++){await f.scan();assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);}
 }finally{f.sqlite.close();}
});

void test('a newly committed backdated recovery behind the cursor cannot authorize a stale incident at sweep completion',async()=>{
 const f=fixture();try{
  f.invalid(1900000);f.invalid(1950000);await f.blocked(1800000);await f.blocked(1860000);
  await f.scan();await f.save(1890000);
  const finishing=await f.scan();assert.equal(finishing.budgetExhausted,true);assert.equal(f.count('service_health_incidents'),0);
  for(let i=0;i<6;i++){await f.scan();assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);}
  assert.equal(f.count('service_health_observations'),3);
 }finally{f.sqlite.close();}
});

void test('an expired deadline and a failed checkpoint leave incident decisions retryable',async()=>{
 const f=fixture();try{
  f.invalid(1700000);f.invalid(1710000);await f.blocked(1800000);await f.blocked(1860000);await f.save(1920000);
  const expired=await f.scan({deadlineMs:0});assert.equal(expired.budgetExhausted,true);assert.equal(expired.scanned,0);assert.equal(f.count('service_health_incidents'),0);
  const interrupted=Object.create(f.db) as D1Database;
  interrupted.batch=(async(statements:D1PreparedStatement[])=>f.db.batch([...statements,f.db.prepare("INSERT INTO staff_permission_guards(id,valid) VALUES('failed-checkpoint',0)")])) as D1Database['batch'];
  await assert.rejects(evaluateFormHealth(interrupted,scope,f.transitions));
  assert.equal(f.count('service_health_observations'),0);assert.equal(f.count('service_health_incidents'),0);
  for(let i=0;i<6;i++){await f.scan();assert.equal(f.count('transition_notices'),0);}
 }finally{f.sqlite.close();}
});

void test('a lost committed checkpoint response resumes without premature or duplicate notices',async()=>{
 const f=fixture();try{
  f.invalid(1700000);f.invalid(1710000);await f.blocked(1800000);await f.blocked(1860000);await f.save(1920000);
  const interrupted=Object.create(f.db) as D1Database;
  interrupted.batch=(async(statements:D1PreparedStatement[])=>{await f.db.batch(statements);throw new Error('Committed checkpoint response lost');}) as D1Database['batch'];
  await assert.rejects(evaluateFormHealth(interrupted,scope,f.transitions),/Committed checkpoint response lost/);
  assert.equal(f.count('service_health_observations'),0);
  for(let i=0;i<6;i++){await f.scan();assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);}
  assert.equal(f.count('service_health_observations'),3);
 }finally{f.sqlite.close();}
});

void test('a scoped sweep cannot authorize incident decisions for a different form with pending recovery',async()=>{
 const f=fixture();try{
  await f.blocked(1800000);await f.blocked(1860000);await f.save(1920000);
  for(let i=0;i<3;i++)await f.scan({formId:'seller.shipping-request'});
  assert.equal(f.count('service_health_observations'),0);assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);
  for(let i=0;i<3;i++)await f.scan();
  assert.equal(f.count('service_health_observations'),3);assert.equal(f.count('service_health_incidents'),0);
 }finally{f.sqlite.close();}
});

void test('an empty remaining window after another scoped consumer ingests recovery completes safely',async()=>{
 const f=fixture();try{
  f.invalid(1700000);await f.blocked(1800000);await f.blocked(1860000);await f.save(1920000);
  await f.scan();
  assert.equal(await ingestCommittedFormSaves(f.db,{...scope,formId:'seller.inventory'}),1);
  for(let i=0;i<4;i++){await f.scan();assert.equal(f.count('service_health_incidents'),0);assert.equal(f.count('transition_notices'),0);}
  assert.equal(f.count('service_health_observations'),3);
 }finally{f.sqlite.close();}
});

void test('legacy cursor progress without a source snapshot defers once and still reports a genuine outage',async()=>{
 const f=fixture();try{
  f.invalid(1700000);f.invalid(1710000);await f.blocked(1800000);await f.blocked(1860000);
  await f.scan();
  const row=f.sqlite.prepare("SELECT family,cursor FROM operational_reminder_cursors WHERE family LIKE 'form-saves:%'").get()!;
  const legacy=JSON.parse(String(row.cursor));delete legacy.sourceCount;
  f.sqlite.prepare('UPDATE operational_reminder_cursors SET cursor=? WHERE family=?').run(JSON.stringify(legacy),row.family);
  const incomplete=await f.scan();assert.equal(incomplete.budgetExhausted,true);assert.equal(f.count('service_health_incidents'),0);
  await f.scan();assert.equal(f.count('service_health_incidents'),0);
  const complete=await f.scan();assert.equal(complete.budgetExhausted,false);assert.equal(complete.scanned,0);
  assert.equal(f.count('service_health_incidents'),1);assert.equal(f.count('transition_notices'),1);
 }finally{f.sqlite.close();}
});
