import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {captureDatabaseHealthScope} from '../lib/db/health-context';

const origin='http://localhost:3018';
const state={db:null as D1Database|null,actor:'reviewer'};
(globalThis as typeof globalThis&{incidentRecoveryFixture:typeof state}).incidentRecoveryFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.incidentRecoveryFixture.db},HASTABAZAAR_RUNTIME_ENV:"test",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018",HASTABAZAAR_RELEASE_ID:"fictional-incident-release"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const actor=globalThis.incidentRecoveryFixture.actor;return{userId:actor,email:actor+"@local.hastabazaar.test",fullName:"Fictional incident reviewer",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

async function fixture(){
 const f=await completeVersionFixture(Date.now()-60_000);state.db=f.db;state.actor='reviewer';
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',?)").run(f.now);
 f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES('incident-recovery-form','staff.incident-review',1,'published',?,'Fictional incident recovery controls','reviewer',?,'reviewer',?,'reviewer',?,'incident-recovery-publication')")
  .run(JSON.stringify({formId:'staff.incident-review',fields:[]}),f.now,f.now,f.now);
 captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:origin,HASTABAZAAR_RELEASE_ID:'fictional-incident-release',NODE_ENV:'development'});
 const body={action:'create',requestId:crypto.randomUUID(),expectedRevision:null,formVersion:1,customAnswers:[],serviceKey:'fictional.incident',failureSignature:'fictional-incident-failure',title:'Fictional protected incident',impactSummary:'Fictional workflow is unavailable and needs an authorized response.',impactClass:'ordinary',severity:'routine'};
 const api=await import('../app/api/admin/system-health/incidents/route');
 return{...f,body,api};
}
function post(body:unknown,actor='reviewer'){return new Request(origin+'/api/admin/system-health/incidents',{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});}

void test('native incident fixture admits the current authorized reviewer',async()=>{
 const f=await fixture();try{const response=await f.api.POST(post(f.body));assert.equal(response.status,200,await response.clone().text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,1);}finally{f.dispose();state.db=null;}
});

void test('incident POST rejects displayed A when equally eligible B is authenticated',async()=>{
 const f=await fixture();try{state.actor='foreign';const response=await f.api.POST(post(f.body));assert.equal(response.status,403,await response.clone().text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,0);}finally{f.dispose();state.db=null;}
});

void test('incident GET returns the original actor-bound command outcome without writes',async()=>{
 const f=await fixture();try{const saved=await f.api.POST(post(f.body));assert.equal(saved.status,200,await saved.clone().text());const result=await saved.json() as {incidentId:string};const changes=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const get=f.api.GET as (request:Request)=>Promise<Response>;
  const response=await get(new Request(origin+'/api/admin/system-health/incidents?requestId='+f.body.requestId+'&action=create&sourceId=new',{headers:{'X-Hastabazaar-Actor':'reviewer'}}));
  assert.equal(response.status,200,await response.clone().text());const outcome=await response.json() as Record<string,unknown>;assert.equal(outcome.recorded,true);assert.equal(outcome.actorId,'reviewer');assert.equal(outcome.requestId,f.body.requestId);assert.equal(outcome.action,'create');assert.equal(outcome.sourceId,'new');assert.equal(outcome.incidentId,result.incidentId);assert.equal(outcome.historical,true);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,changes);
 }finally{f.dispose();state.db=null;}
});

void test('incident commit rejects a replaced authenticated subject',async()=>{
 const f=await fixture();try{f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE users SET auth_subject='replacement-subject' WHERE id='reviewer'").run();});const response=await f.api.POST(post(f.body));assert.ok(response.status>=400,await response.clone().text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,0);}finally{f.dispose();state.db=null;}
});

void test('incident original outcome remains historical after another administrator changes ownership',async()=>{
 const f=await fixture();try{
  const saved=await f.api.POST(post(f.body));assert.equal(saved.status,200);const original=await saved.json() as {incidentId:string;version:string};
  state.actor='foreign';const changed=await f.api.POST(post({action:'assign',incidentId:original.incidentId,ownerId:'foreign',backupId:null,reason:'Another authorized responder takes ownership of the fictional incident.',requestId:crypto.randomUUID(),expectedRevision:original.version,formVersion:1,customAnswers:[]},'foreign'));assert.equal(changed.status,200,await changed.clone().text());
  state.actor='reviewer';const replay=await f.api.POST(post(f.body));assert.equal(replay.status,200);assert.equal((await replay.json() as Record<string,unknown>).version,original.version);
  const response=await f.api.GET(new Request(origin+'/api/admin/system-health/incidents?requestId='+f.body.requestId+'&action=create&sourceId=new',{headers:{'X-Hastabazaar-Actor':'reviewer'}}));assert.equal(response.status,200);assert.equal((await response.json() as Record<string,unknown>).version,original.version);
  assert.equal(f.sqlite.prepare('SELECT owner_id AS ownerId FROM service_incident_governance WHERE incident_id=?').get(original.incidentId)!.ownerId,'foreign');
 }finally{f.dispose();state.db=null;}
});

void test('incident original reference cannot be adopted by another actor or action/source',async()=>{
 const f=await fixture();try{
  const saved=await f.api.POST(post(f.body));assert.equal(saved.status,200);
  for(const [actor,action,sourceId] of [['foreign','create','new'],['reviewer','assign','new'],['reviewer','create','wrong-source']]){
   state.actor=actor;const changes=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
   const response=await f.api.GET(new Request(origin+'/api/admin/system-health/incidents?requestId='+f.body.requestId+'&action='+action+'&sourceId='+sourceId,{headers:{'X-Hastabazaar-Actor':actor}}));assert.equal(response.status,404,await response.clone().text());assert.equal((await response.json() as Record<string,unknown>).recorded,false);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,changes);
  }
 }finally{f.dispose();state.db=null;}
});

void test('a first incident revision conflict identifies its exact before-write attempt',async()=>{
 const f=await fixture();try{
  const saved=await f.api.POST(post(f.body));assert.equal(saved.status,200);const original=await saved.json() as {incidentId:string;version:string};
  const changed=await f.api.POST(post({action:'assign',incidentId:original.incidentId,ownerId:'reviewer',backupId:null,reason:'Record a newer assignment before the original tab acknowledges it.',requestId:crypto.randomUUID(),expectedRevision:original.version,formVersion:1,customAnswers:[]}));assert.equal(changed.status,200);
  const requestId=crypto.randomUUID(),response=await f.api.POST(post({action:'acknowledge',incidentId:original.incidentId,reason:'The older tab still shows its original reviewed incident evidence.',requestId,expectedRevision:original.version,formVersion:1,customAnswers:[]}));assert.equal(response.status,409);
  const result=await response.json() as Record<string,unknown>;assert.equal(result.phase,'before_write');assert.equal(result.actorId,'reviewer');assert.equal(result.requestId,requestId);assert.equal(result.action,'acknowledge');assert.equal(result.sourceId,original.incidentId);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?').get(requestId)!.n,0);
 }finally{f.dispose();state.db=null;}
});

void test('incident rejected private input can be corrected after an attested first before-write rejection',async()=>{
 const f=await fixture();try{
  const response=await f.api.POST(post({...f.body,impactSummary:'A fictional.user@local.hastabazaar.test address was accidentally pasted into the technical summary.'}));assert.equal(response.status,409);const result=await response.json() as Record<string,unknown>;
  assert.equal(result.phase,'before_write');assert.equal(result.requestId,f.body.requestId);assert.equal(result.actorId,'reviewer');assert.equal(result.action,'create');assert.equal(result.sourceId,'new');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?').get(f.body.requestId)!.n,0);
 }finally{f.dispose();state.db=null;}
});

for(const stage of ['authority-read','commit','failure-read'] as const)void test(`incident POST curtains current authority loss at ${stage}`,async()=>{
 const f=await fixture();try{
  let raced=false;const revoke=()=>{raced=true;f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");};
  if(stage==='commit')f.setBeforeBatch(revoke);
  else{if(stage==='failure-read')f.setBeforeBatch(()=>{throw Error('Fictional failed Incident transaction.');});const wrapped=Object.create(f.db) as D1Database;wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(stage==='authority-read'?sql.startsWith('SELECT u.id,r.role,p.permissions_json'):sql.startsWith('SELECT id FROM form_config_versions WHERE form_id=?')&&sql.includes("AND status='published' ORDER BY version DESC LIMIT 1")){const first=statement.first.bind(statement);statement.first=(async()=>{if(!raced)revoke();return first();}) as D1PreparedStatement['first'];}return statement;}) as D1Database['prepare'];state.db=wrapped;}
  const response=await f.api.POST(post(f.body));assert.equal(raced,true);assert.equal(response.status,403,await response.clone().text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?').get(f.body.requestId)!.n,0);
 }finally{f.dispose();state.db=null;}
});

void test('a first incident form publication rejection attests its original prebusiness-write reference',async()=>{
 const f=await fixture();try{
  f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) SELECT 'incident-recovery-form-v2',form_id,2,'published',config_json,'Current fictional incident controls',created_by,created_at+1,updated_by,updated_at+1,published_by,published_at+1,'incident-recovery-publication-v2' FROM form_config_versions WHERE id='incident-recovery-form'").run();
  let entered=false;f.setBeforeBatch(()=>{entered=true;});
  const response=await f.api.POST(post(f.body));assert.equal(response.status,409,await response.clone().text());const result=await response.json() as Record<string,unknown>;
  assert.equal(entered,false);assert.equal(result.phase,'before_write');assert.equal(result.code,'form_review_required');assert.equal(result.actorId,'reviewer');assert.equal(result.requestId,f.body.requestId);assert.equal(result.action,'create');assert.equal(result.sourceId,'new');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,0);
 }finally{f.dispose();state.db=null;}
});

for(const stage of ['form-read','batch','readback'] as const)void test(`incident ${stage} failure never attests an unused business reference`,async()=>{
 const f=await fixture();try{
  if(stage==='batch')f.setBeforeBatch(()=>{throw Error('Fictional uncertain commit failure.');});
  else{const wrapped=Object.create(f.db) as D1Database;wrapped.prepare=((sql:string)=>{
   if(stage==='form-read'&&sql.startsWith('SELECT version, config_json, published_at FROM form_config_versions'))throw Error('Fictional publication read unavailable.');
   if(stage==='readback'&&sql.includes('FROM audit_logs WHERE HEX(actor_id)'))throw Error('Fictional saved outcome read unavailable.');
   return f.db.prepare(sql);
  }) as D1Database['prepare'];state.db=wrapped;}
  const response=await f.api.POST(post(f.body));assert.ok(response.status>=400);const result=await response.json() as Record<string,unknown>;
  assert.equal(result.phase,undefined);assert.equal(result.code,undefined);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()!.n,stage==='readback'?1:0);
 }finally{f.dispose();state.db=null;}
});

void test('incident authorization loss after commit curtains access without denying the recorded write',async()=>{
 const f=await fixture();try{
  const wrapped=Object.create(f.db) as D1Database;wrapped.batch=(async(statements:D1PreparedStatement[])=>{const results=await f.db.batch(statements);f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");return results;}) as D1Database['batch'];state.db=wrapped;
  const response=await f.api.POST(post(f.body));assert.equal(response.status,403);assert.equal((await response.json() as Record<string,unknown>).phase,undefined);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?').get(f.body.requestId)!.n,1);
  state.db=f.db;f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)");
  const changes=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const recovered=await f.api.GET(new Request(origin+'/api/admin/system-health/incidents?requestId='+f.body.requestId+'&action=create&sourceId=new',{headers:{'X-Hastabazaar-Actor':'reviewer'}}));assert.equal(recovered.status,200);assert.equal((await recovered.json() as Record<string,unknown>).recorded,true);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,changes);
 }finally{f.dispose();state.db=null;}
});

void test('incident original reads fence role, authenticated subject and session races',async(t)=>{
 const f=await fixture();try{
  assert.equal((await f.api.POST(post(f.body))).status,200);
  for(const race of ['role','subject','session'] as const)await t.test(race,async()=>{
   const wrapped=Object.create(f.db) as D1Database;let raced=false;
   wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('FROM audit_logs WHERE HEX(actor_id)')){
    const first=statement.first.bind(statement);statement.first=(async()=>{const row=await first();if(!raced){raced=true;
     if(race==='role')f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");
     if(race==='subject')f.sqlite.exec("UPDATE users SET auth_subject='changed-during-incident-read' WHERE id='reviewer'");
     if(race==='session')state.actor='foreign';}return row;}) as D1PreparedStatement['first'];}return statement;}) as D1Database['prepare'];state.db=wrapped;
   try{const response=await f.api.GET(new Request(origin+'/api/admin/system-health/incidents?requestId='+f.body.requestId+'&action=create&sourceId=new',{headers:{'X-Hastabazaar-Actor':'reviewer'}}));assert.equal(raced,true);assert.equal(response.status,403,await response.clone().text());assert.doesNotMatch(await response.text(),/recorded|fictional.incident|impactSummary/);}
   finally{state.db=f.db;state.actor='reviewer';f.sqlite.exec("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer';INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)");}
  });
 }finally{f.dispose();state.db=null;}
});

void test('a legacy incident receipt cannot invent original authenticated-subject proof',async()=>{
 const f=await fixture();try{
  const {createIncident}=await import('../lib/operations/incident-review');
  const result=await createIncident(f.db,{actorId:'reviewer',requestId:f.body.requestId,expectedRevision:null,now:f.now},{environment:'test',serviceKey:f.body.serviceKey,failureSignature:f.body.failureSignature,title:f.body.title,impactSummary:f.body.impactSummary,impactClass:'ordinary',severity:'routine'});
  const changes=f.sqlite.prepare('SELECT total_changes() n').get()!.n,observations=f.sqlite.prepare('SELECT COUNT(*) n FROM form_health_observations').get()!.n as number,receipt=f.sqlite.prepare('SELECT command_result_json FROM audit_logs WHERE request_id=?').get(f.body.requestId)!.command_result_json;
  const response=await f.api.GET(new Request(origin+'/api/admin/system-health/incidents?requestId='+f.body.requestId+'&action=create&sourceId=new',{headers:{'X-Hastabazaar-Actor':'reviewer'}}));assert.equal(response.status,404);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,changes,'Original outcome GET performs no writes.');
  const replay=await f.api.POST(post(f.body));assert.equal(replay.status,503,'The old receipt cannot acquire a newly inferred original subject.');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_health_observations').get()!.n,observations+1,'Authenticated POST retains its existing form-load observation.');assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,Number(changes)+1);assert.equal(f.sqlite.prepare('SELECT command_result_json FROM audit_logs WHERE request_id=?').get(f.body.requestId)!.command_result_json,receipt,'No original authenticated-subject proof is backfilled.');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents WHERE id=?').get(result.incidentId)!.n,1);
 }finally{f.dispose();state.db=null;}
});
