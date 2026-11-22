import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {recordFormLoadObservation,readFormHealth,formHealthRuntimeScope,evaluateFormHealth,ingestCommittedFormSaves} from '../lib/operations/form-health';
import {searchSystemRecords} from '../lib/operations/system-records';
import {resolvePublishedForm} from '../lib/forms/runtime';
import {isCoreFormDefinition} from '../lib/forms/core-contracts';
import {requireDatabase} from '../lib/db/d1';
import {readDatabaseHealthScope} from '../lib/db/health-context';
import {buildFormAnswerInsert} from '../lib/db/repositories/form-answers';
import {readIncident} from '../lib/operations/incident-review';

function fixture(){const f=serviceHealthFixture();f.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY,form_id TEXT,config_version_id TEXT,answers_json TEXT,created_at INTEGER);CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,next_json TEXT,created_at INTEGER);CREATE TABLE form_config_versions(form_id TEXT,status TEXT,version INTEGER,config_json TEXT,published_at INTEGER);CREATE TABLE IF NOT EXISTS operational_incidents(id TEXT PRIMARY KEY)');if(!f.sqlite.prepare('PRAGMA table_info(service_health_observations)').all().some(r=>r.name==='evidence_scope'))f.sqlite.exec(readFileSync(new URL('../drizzle/0150_incident_governance.sql',import.meta.url),'utf8'));f.sqlite.exec(readFileSync(new URL('../drizzle/0151_form_health_records.sql',import.meta.url),'utf8'));return f;}
const scope={environment:'test' as const,releaseId:'fictional-release',now:1800000};
void test('form compatibility is persisted sanitized evidence, never a successful durable submission',async()=>{
 const f=fixture();try{
  const support=await recordFormLoadObservation(f.db,{...scope,formId:'seller.inventory',version:1,outcome:'compatible'});
  const rows=await readFormHealth(f.db,'sa',{...scope,formId:'seller.inventory'});
  assert.equal(rows[0].lastLoad?.supportReference,support);assert.equal(rows[0].lastSave,null);assert.equal(rows[0].state,'unknown');
  assert.doesNotMatch(JSON.stringify(rows),/answers_json|customer_email|bank_account/);
  await assert.rejects(recordFormLoadObservation(f.db,{...scope,formId:'seller.inventory',version:1,outcome:'saved'} as never));
  await assert.rejects(readFormHealth(f.db,'customer',scope));
  const runtime=formHealthRuntimeScope({HASTABAZAAR_RUNTIME_ENV:'local_staging',APP_ORIGIN:'http://localhost:3018'},1800000);assert.equal(runtime.environment,'local_staging');
 }finally{f.sqlite.close();}
});
void test('absent core metadata resolves while malformed published metadata records a safe support reference',async()=>{
 const f=fixture();const previous=process.env.HASTABAZAAR_RUNTIME_ENV;process.env.HASTABAZAAR_RUNTIME_ENV='test';try{
  await resolvePublishedForm(f.db,'seller.inventory');
  assert.equal(f.sqlite.prepare('SELECT outcome FROM form_health_observations').get()!.outcome,'compatible');
  const core=await resolvePublishedForm(f.db,'staff.payout-1');
  assert.equal(core.formId,'staff.payout-1');
  assert.equal(isCoreFormDefinition(core),true,'Supported native controls remain usable without optional published metadata');
  f.sqlite.prepare("INSERT INTO form_config_versions(form_id,status,version,config_json,published_at) VALUES('staff.payout-1','published',1,'{PRIVATE_INVALID_PAYOUT_JSON',1)").run();
  await assert.rejects(resolvePublishedForm(f.db,'staff.payout-1'),error=>error instanceof Error&&'supportReference' in error&&String(error.supportReference).startsWith('form-health-'));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_health_observations WHERE outcome='blocked'").get()!.n,1);
 }finally{if(previous===undefined)delete process.env.HASTABAZAAR_RUNTIME_ENV;else process.env.HASTABAZAAR_RUNTIME_ENV=previous;f.sqlite.close();}
});
void test('trusted binding metadata is atomic with durable core saves and cannot be retrofitted onto historical receipts',async()=>{
 const f=fixture();try{
  requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:'fictional-release'});
  assert.equal(readDatabaseHealthScope(requireDatabase({DB:f.db}))?.releaseId,'fictional-release');
  const input={formId:'seller.inventory',requestId:'saved-core',versionId:'core:seller.inventory:1',subjectType:'product',subjectId:'fictional-product',actorId:'sa',answers:{formId:'seller.inventory',version:1,answers:[]},now:1800000};
  await f.db.batch([buildFormAnswerInsert(f.db,input)]);
  assert.equal(f.sqlite.prepare('SELECT json_extract(next_json,?) scope FROM audit_logs').get('$.healthScope.releaseId')!.scope,'fictional-release');
  await ingestCommittedFormSaves(f.db,scope);
  assert.equal((await readFormHealth(f.db,'sa',{...scope,formId:'seller.inventory'}))[0].lastSave?.outcome,'saved');
  await ingestCommittedFormSaves(f.db,scope);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_health_observations WHERE phase='save'").get()!.n,1);
  assert.throws(()=>requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'local_staging',APP_ORIGIN:'https://hastabazaar.com',HASTABAZAAR_RELEASE_ID:'new-release'}));assert.equal(readDatabaseHealthScope(f.db),null);
 }finally{f.sqlite.close();}
});
void test('supported blocked forms create one shared incident; metadata-only recovery never closes it',async()=>{
 const f=fixture();try{
  for(const now of [1800000,1860000]){await recordFormLoadObservation(f.db,{...scope,now,formId:'seller.inventory',version:1,outcome:'blocked',category:'definition_unavailable'});await evaluateFormHealth(f.db,{...scope,now},async()=>[]);}
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM service_health_incidents WHERE service_key='form.seller.inventory'").get()!.n,1);
  for(const now of [1920000,1980000]){await recordFormLoadObservation(f.db,{...scope,now,formId:'seller.inventory',version:1,outcome:'compatible'});await evaluateFormHealth(f.db,{...scope,now},async()=>[]);}
  assert.notEqual(f.sqlite.prepare("SELECT state FROM service_health_incidents WHERE service_key='form.seller.inventory'").get()!.state,'resolved');
 }finally{f.sqlite.close();}
});
void test('real saved receipts recover only after two fresh observations in the same release and contract scope',async()=>{
 const f=fixture();try{
  for(const now of [1800000,1860000]){await recordFormLoadObservation(f.db,{...scope,now,formId:'seller.inventory',version:1,outcome:'blocked',category:'definition_unavailable'});await evaluateFormHealth(f.db,{...scope,now},async()=>[]);}
  const save=async(requestId:string,now:number,releaseId:string)=>{requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:releaseId});await f.db.batch([buildFormAnswerInsert(f.db,{formId:'seller.inventory',requestId,versionId:'core:seller.inventory:1',subjectType:'product',subjectId:'fictional-product',actorId:'sa',answers:{formId:'seller.inventory',version:1,answers:[]},now})]);await evaluateFormHealth(f.db,{...scope,releaseId,now},async()=>[]);};
  await save('first-save',1920000,scope.releaseId);assert.notEqual(f.sqlite.prepare('SELECT state FROM service_health_incidents').get()!.state,'resolved');
  await save('different-release',1980000,'replacement-release');assert.notEqual(f.sqlite.prepare('SELECT state FROM service_health_incidents').get()!.state,'resolved');
  await recordFormLoadObservation(f.db,{...scope,releaseId:'replacement-release',now:2010000,formId:'seller.inventory',version:1,outcome:'compatible'});
  await save('second-current-save',2040000,'replacement-release');const incident=f.sqlite.prepare('SELECT id,state FROM service_health_incidents').get()!;assert.equal(incident.state,'monitoring');assert.equal((await readIncident(f.db,'sa',String(incident.id),'test',2040000)).recoveryReady,true,'Two matching real saves establish recovery evidence; authorized incident closure remains separate.');
  assert.equal((await searchSystemRecords(f.db,'sa',{environment:'test',type:'incident'})).records.length,1);
 }finally{f.sqlite.close();}
});
void test('rollback and unscoped historical saves never manufacture current release proof',async()=>{
 const f=fixture();try{
  const input={formId:'seller.inventory',requestId:'historical-core',versionId:'core:seller.inventory:1',subjectType:'product',subjectId:'fictional-product',actorId:'sa',answers:{formId:'seller.inventory',version:1,answers:[]},now:1800000};
  await f.db.batch([buildFormAnswerInsert(f.db,input)]);assert.equal(await ingestCommittedFormSaves(f.db,scope),0);
  requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:scope.releaseId});
  await assert.rejects(f.db.batch([buildFormAnswerInsert(f.db,{...input,requestId:'rolled-back'}),f.db.prepare('INSERT INTO staff_permission_guards(id,valid) VALUES(?,0)').bind('fail-atomic-save')]));
  assert.equal(await ingestCommittedFormSaves(f.db,scope),0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get()!.n,1);
 }finally{f.sqlite.close();}
});
void test('bounded catch-up does not open an obsolete blocked-form episode after later real saves, and idle forms stay unverified',async()=>{
 const f=fixture();try{
  for(const now of [1800000,1860000])await recordFormLoadObservation(f.db,{...scope,now,formId:'seller.inventory',version:1,outcome:'blocked',category:'definition_unavailable'});
  requireDatabase({DB:f.db,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:scope.releaseId});
  for(const now of [1920000,1980000])await f.db.batch([buildFormAnswerInsert(f.db,{formId:'seller.inventory',requestId:'catchup-'+now,versionId:'core:seller.inventory:1',subjectType:'product',subjectId:'fictional-product',actorId:'sa',answers:{formId:'seller.inventory',version:1,answers:[]},now})]);
  for(let scan=0;scan<5;scan++){await evaluateFormHealth(f.db,{...scope,now:1980000,limit:1},async()=>[]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,0);}
  await evaluateFormHealth(f.db,{...scope,now:1980000+3600000},async()=>[]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,0);
  assert.equal((await readFormHealth(f.db,'sa',{...scope,now:1980000+3600000,formId:'seller.inventory'}))[0].state,'unknown');
 }finally{f.sqlite.close();}
});
void test('scoped records reject unauthorized previews, bound filters and recheck authority after projection',async()=>{
 const f=fixture();try{
  await recordFormLoadObservation(f.db,{...scope,formId:'seller.inventory',version:1,outcome:'blocked',category:'definition_unavailable'});
  await assert.rejects(searchSystemRecords(f.db,'customer',{environment:'test'}));
  await assert.rejects(searchSystemRecords(f.db,'sa',{environment:'test',reference:'x'.repeat(201)}));
  const result=await searchSystemRecords(f.db,'sa',{environment:'test',type:'form'});assert.equal(result.records.length,1);assert.equal(result.records[0].status,'blocked');
  assert.doesNotMatch(JSON.stringify(result),/answers|secret|subject_id|customer/);
  const batch=f.db.batch.bind(f.db);f.db.batch=(async statements=>{f.sqlite.prepare('UPDATE users SET status=? WHERE id=?').run('disabled','sa');return batch(statements);}) as typeof f.db.batch;
  await assert.rejects(searchSystemRecords(f.db,'sa',{environment:'test'}));
 }finally{f.sqlite.close();}
});
