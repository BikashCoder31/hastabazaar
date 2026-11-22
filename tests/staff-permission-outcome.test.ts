import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
const state={db:null as D1Database|null,subject:'reviewer'};
(globalThis as typeof globalThis&{permissionOutcomeFixture:typeof state}).permissionOutcomeFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.permissionOutcomeFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:globalThis.permissionOutcomeFixture.subject,email:"reviewer@local.hastabazaar.test",fullName:"Fictional staff",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
async function fixture(){const f=await completeVersionFixture(Date.now());state.db=f.db;state.subject='reviewer';
 f.sqlite.exec("UPDATE users SET auth_subject='external-permission-b' WHERE id='foreign';INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',1)");
 for(const formId of ['staff.staff-permission-1','staff.staff-permission-2'])f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
  VALUES(?,?,1,'published',?,'Retained fictional publication','reviewer',1,'reviewer',1,'reviewer',?,?)`).run(formId+'-retained',formId,JSON.stringify({formId,fields:[]}),f.now-1000,formId+'-retained');
 return f;
}
function request(body:unknown,actor='reviewer'){return new Request('http://localhost:3018/api/admin/staff-permissions',{method:'POST',headers:{origin:'http://localhost:3018','content-type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});}
function query(action:string,requestId:string,actor='reviewer'){return new Request('http://localhost:3018/api/admin/staff-permissions?action='+action+'&requestId='+requestId,{headers:{'X-Hastabazaar-Actor':actor}});}
const proposal={action:'propose',userId:'delegate',permissions:['order.manage'],version:1,reason:'Original scoped work access change.',requestId:'original-permission-proposal',formVersion:1,customAnswers:[]};

void test('permission original outcomes preserve direct application and exact original actor/source',{timeout:60_000},async t=>{
 const f=await fixture();try{const api=await import('../app/api/admin/staff-permissions/route');
 const first=await api.POST(request(proposal));assert.equal(first.status,201,await first.clone().text());const saved=await first.json() as Record<string,unknown>;
 assert.equal(f.sqlite.prepare("SELECT status FROM staff_permission_requests WHERE id=?").get(proposal.requestId)!.status,'approved');
 assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'["order.manage"]');
 await t.test('POST returns primitive recorded metadata, never a new approval requirement',()=>{
  assert.equal(saved.recorded,true);assert.equal(saved.actorId,'reviewer');assert.equal(saved.action,'propose');assert.equal(saved.requestId,proposal.requestId);assert.equal(saved.sourceId,'delegate');assert.equal(saved.id,proposal.requestId);assert.equal(saved.status,'approved');assert.equal(saved.phase,'recorded');
 });
 const get=Reflect.get(api,'GET') as ((r:Request)=>Promise<Response>)|undefined;
 await t.test('GET confirms original application without private permissions or current profile substitution',async()=>{
  assert.ok(get);const response=await get(query('propose',proposal.requestId));assert.equal(response.status,200);assert.deepEqual(await response.json(),{recorded:true,actorId:'reviewer',action:'propose',requestId:proposal.requestId,sourceId:'delegate',id:proposal.requestId,status:'approved'});
 });
 await t.test('unknown or another eligible actor cannot adopt the original reference',async()=>{
  assert.ok(get);assert.equal((await get(query('propose','unknown-original'))).status,404);state.subject='external-permission-b';try{assert.equal((await get(query('propose',proposal.requestId,'foreign'))).status,404);}finally{state.subject='reviewer';}
 });
 await t.test('later lawful grant does not replace original proof or get reapplied by exact retry',async()=>{
  const changed=await api.POST(request({...proposal,permissions:['support.manage'],version:2,requestId:'later-lawful-grant'}));assert.equal(changed.status,201,await changed.clone().text());
  assert.ok(get);const result=await get(query('propose',proposal.requestId));assert.equal(result.status,200);assert.equal((await result.json() as {sourceId:string}).sourceId,'delegate');
  assert.equal((await api.POST(request(proposal))).status,201);
  assert.equal(f.sqlite.prepare("SELECT version FROM staff_permission_profiles WHERE user_id='delegate'").get()!.version,3);
  assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()!.permissions_json,'["support.manage"]');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='staff.permissions.applied' AND request_id=?").get(proposal.requestId)!.n,1);
  assert.equal((await api.POST(request({...proposal,permissions:['support.manage']}))).status,409);
 });
 await t.test('current eligible no-header GET is readonly and validation rejection is pre-write',async()=>{
  assert.ok(get);const tables=['users','user_roles','staff_permission_profiles','staff_permission_requests','audit_logs','form_answer_sets','notification_messages'];
  const snapshot=()=>JSON.stringify(tables.map(table=>[table,f.sqlite.prepare('SELECT * FROM '+table+' ORDER BY 1').all()]));
  const before=snapshot();const response=await get(new Request('http://localhost:3018/api/admin/staff-permissions?action=propose&requestId='+proposal.requestId));assert.equal(response.status,200);assert.equal(snapshot(),before);
  const invalid=await api.POST(request({...proposal,reason:'short'}));assert.equal(invalid.status,400);assert.equal((await invalid.json() as {phase:string}).phase,'rejected_before_write');
 });
 await t.test('readback failure after actual commit is unconfirmed, not a definite rejected write',async()=>{
  const {getStaffPermissionProfile}=await import('../lib/db/repositories/staff-permissions'),before=await getStaffPermissionProfile(f.db,'delegate'),wrapped=Object.create(f.db) as D1Database;let blocked=false;
  wrapped.prepare=((sql:string)=>{if(sql.includes('FROM form_answer_sets a JOIN staff_permission_requests r')){blocked=true;throw new Error('fictional_permission_readback_unavailable');}return f.db.prepare(sql);}) as D1Database['prepare'];state.db=wrapped;
  const body={...proposal,version:before.version,requestId:'permission-readback-unavailable'};
  try{const response=await api.POST(request(body)),result=await response.json() as {phase:string;requestId:string;sourceId:string};assert.equal(blocked,true);assert.equal(response.status,503);assert.equal(result.phase,'outcome_unconfirmed');assert.equal(result.requestId,body.requestId);assert.equal(result.sourceId,'delegate');assert.equal((await getStaffPermissionProfile(f.db,'delegate')).version,before.version+1);}
  finally{state.db=f.db;}
  assert.ok(get);assert.equal((await get(query('propose',body.requestId))).status,200);
 });
 for(const race of ['role','subject','session'] as const)await t.test('original permission GET conceals '+race+' change during private projection',async()=>{
  assert.ok(get);const wrapped=Object.create(f.db) as D1Database;let raced=false;
  wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('FROM form_answer_sets a JOIN staff_permission_requests r')){const first=statement.first.bind(statement);statement.first=(async()=>{const row=await first();if(!raced){raced=true;
   if(race==='role')f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");
   if(race==='subject')f.sqlite.exec("UPDATE users SET auth_subject='rebound-subject' WHERE id='reviewer'");
   if(race==='session')state.subject='external-permission-b';}return row;}) as D1PreparedStatement['first'];}return statement;}) as D1Database['prepare'];state.db=wrapped;
  try{const response=await get(query('propose',proposal.requestId));assert.equal(raced,true);assert.equal(response.status,403,await response.text());}
  finally{state.db=f.db;state.subject='reviewer';f.sqlite.exec("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer';INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)");}
 });
 await t.test('lost native acknowledgment remains unconfirmed until readonly original proof, without a second grant',async()=>{
  const {getStaffPermissionProfile}=await import('../lib/db/repositories/staff-permissions'),before=await getStaffPermissionProfile(f.db,'delegate');
  const wrapped=Object.create(f.db) as D1Database;let ready=false,committed=false;
  wrapped.prepare=((sql:string)=>{if(sql.includes('INSERT INTO staff_permission_requests'))ready=true;return f.db.prepare(sql);}) as D1Database['prepare'];
  wrapped.batch=(async(statements:D1PreparedStatement[])=>{const rows=await f.db.batch(statements);if(ready&&!committed){committed=true;throw new Error('fictional_lost_permission_commit_ack');}return rows;}) as D1Database['batch'];state.db=wrapped;
  const body={...proposal,version:before.version,requestId:'lost-permission-ack'};
  try{const response=await api.POST(request(body));const result=await response.json() as {phase:string;requestId:string};assert.equal(committed,true);assert.equal(response.status,409);assert.equal(result.phase,'outcome_unconfirmed');assert.equal(result.requestId,body.requestId);assert.ok(get);assert.equal((await get(query('propose',body.requestId))).status,200);
   assert.equal((await getStaffPermissionProfile(f.db,'delegate')).version,before.version+1);assert.equal((await api.POST(request(body))).status,201);assert.equal((await getStaffPermissionProfile(f.db,'delegate')).version,before.version+1);
  }finally{state.db=f.db;}
 });
 await t.test('native proposal fences the original authenticated subject at commit',async()=>{
  const {proposeStaffPermissions,getStaffPermissionProfile}=await import('../lib/db/repositories/staff-permissions'),{validateSellerFormSubmission}=await import('../lib/forms/submission');
  const profile=await getStaffPermissionProfile(f.db,'delegate'),form=await validateSellerFormSubmission(f.db,'staff.staff-permission-1',1,[],'permission-subject-race');
  const wrapped=Object.create(f.db) as D1Database;let ready=false,raced=false;
  wrapped.prepare=((sql:string)=>{if(sql.includes('INSERT INTO staff_permission_requests'))ready=true;return f.db.prepare(sql);}) as D1Database['prepare'];
  wrapped.batch=(async(statements:D1PreparedStatement[])=>{if(ready&&!raced){raced=true;f.sqlite.exec("UPDATE users SET auth_subject='rebound-subject' WHERE id='reviewer'");}return f.db.batch(statements);}) as D1Database['batch'];
  const options={actorId:'reviewer',actorAuthSubject:'reviewer',userId:'delegate',permissions:['support.manage'],version:profile.version,reason:'Subject binding must survive the actual batch.',now:f.now,requestId:'permission-subject-race',form:{requestId:'permission-subject-race',versionId:form.versionId,answers:form.answers}};
  try{await assert.rejects(proposeStaffPermissions(wrapped,options));assert.equal(raced,true);assert.equal((await getStaffPermissionProfile(f.db,'delegate')).version,profile.version);}finally{f.sqlite.exec("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer'");}
 });
 await t.test('legacy original actor history is qualified without backfilling identity or current permissions',async()=>{
  const {proposeStaffPermissions,getStaffPermissionProfile}=await import('../lib/db/repositories/staff-permissions'),{validateSellerFormSubmission}=await import('../lib/forms/submission');
  const profile=await getStaffPermissionProfile(f.db,'delegate'),form=await validateSellerFormSubmission(f.db,'staff.staff-permission-1',1,[],'legacy-permission-proof');
  const oldWriter=Object.create(f.db) as D1Database;let retained=false;
  oldWriter.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(/^\s*INSERT INTO audit_logs\b/.test(sql)&&sql.includes("'staff_permissions'")){const bind=statement.bind.bind(statement);statement.bind=((...values:unknown[])=>{assert.equal(values.length,9);const next=JSON.parse(String(values[6])) as Record<string,unknown>;assert.ok(next.commandProof);delete next.commandProof;values[6]=JSON.stringify(next);retained=true;return bind(...values);}) as D1PreparedStatement['bind'];}return statement;}) as D1Database['prepare'];
  const options={actorId:'reviewer',actorAuthSubject:'reviewer',userId:'delegate',permissions:['product.review'],version:profile.version,reason:'Retained original work access command.',now:f.now,requestId:'legacy-permission-proof',form:{requestId:'legacy-permission-proof',versionId:form.versionId,answers:form.answers}};
  await proposeStaffPermissions(oldWriter,options);assert.equal(retained,true);const before=f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE action='staff.permissions.applied' AND request_id=?").get(options.requestId)!.next_json;
  assert.ok(get);const response=await get(query('propose',options.requestId));assert.equal(response.status,200);assert.equal((await response.json() as {originalIdentityProof:string}).originalIdentityProof,'legacy_unclassified');
  assert.equal(await proposeStaffPermissions(f.db,options),options.requestId);await assert.rejects(proposeStaffPermissions(f.db,{...options,permissions:['support.manage']}));
  assert.equal(f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE action='staff.permissions.applied' AND request_id=?").get(options.requestId)!.next_json,before);
 });
 }finally{state.db=null;f.dispose();}
});

for(const action of ['approve','reject'] as const)void test('legacy pending permission '+action+' records a decision nonce distinct from its proposal',{timeout:60_000},async t=>{
 const f=await fixture();try{const sourceId='legacy-pending-'+action,nonce='original-decision-'+action;
  // Explicit retained pending source; current new proposals still apply immediately.
  f.sqlite.prepare(`INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at,status)
   VALUES(?,'delegate','["order.manage"]',1,'Retained original proposal.','reviewer',?,'pending')`).run(sourceId,f.now-1000);
  const api=await import('../app/api/admin/staff-permissions/route'),body={action,requestId:sourceId,formRequestId:nonce,reason:'Original lawful retained request decision.',formVersion:1,customAnswers:[]};
  const first=await api.POST(request(body));assert.equal(first.status,200,await first.clone().text());const saved=await first.json() as Record<string,unknown>;
  await t.test('decision recorded metadata is bound to the actual original proposal',()=>{
   assert.equal(saved.recorded,true);assert.equal(saved.requestId,nonce);assert.equal(saved.sourceId,sourceId);assert.equal(saved.id,sourceId);assert.equal(saved.action,action);assert.equal(saved.status,action==='approve'?'approved':'rejected');
  });
  await t.test('readonly decision recovery never confuses proposal ID with command nonce',async()=>{
   const get=Reflect.get(api,'GET') as ((r:Request)=>Promise<Response>)|undefined;assert.ok(get);
   const response=await get(query(action,nonce));assert.equal(response.status,200);const result=await response.json() as Record<string,unknown>;assert.equal(result.requestId,nonce);assert.equal(result.sourceId,sourceId);assert.equal((await get(query(action,sourceId))).status,404);
   assert.equal((await api.POST(request(body))).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets WHERE request_id=?').get(nonce)!.n,1);
   assert.equal((await get(query(action==='approve'?'reject':'approve',nonce))).status,404);
   assert.equal((await api.POST(request({...body,reason:'Changed original decision reason.'}))).status,409);
  });
  await t.test('decision actual batch rejects an original authenticated subject rebound',async()=>{
   const {decideStaffPermissions,getStaffPermissionProfile}=await import('../lib/db/repositories/staff-permissions'),{validateSellerFormSubmission}=await import('../lib/forms/submission');
   const profile=await getStaffPermissionProfile(f.db,'delegate'),raceId='race-pending-'+action,raceNonce='race-decision-'+action;
   f.sqlite.prepare(`INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,reason,proposed_by,proposed_at,status) VALUES(?,'delegate','["support.manage"]',?,'Retained pending race source.','reviewer',?,'pending')`).run(raceId,profile.version,f.now-1000);
   const form=await validateSellerFormSubmission(f.db,'staff.staff-permission-2',1,[],raceNonce),wrapped=Object.create(f.db) as D1Database;let ready=false,raced=false;
   wrapped.prepare=((sql:string)=>{if(sql.includes('UPDATE staff_permission_requests SET status='))ready=true;return f.db.prepare(sql);}) as D1Database['prepare'];
   wrapped.batch=(async(statements:D1PreparedStatement[])=>{if(ready&&!raced){raced=true;f.sqlite.exec("UPDATE users SET auth_subject='rebound-subject' WHERE id='reviewer'");}return f.db.batch(statements);}) as D1Database['batch'];
   const options={actorId:'reviewer',actorAuthSubject:'reviewer',requestId:raceId,decision:action,reason:'Original authenticated decision source.',now:f.now,formRequestId:raceNonce,form:{requestId:raceNonce,versionId:form.versionId,answers:form.answers}};
   try{await assert.rejects(decideStaffPermissions(wrapped,options));assert.equal(raced,true);assert.equal(f.sqlite.prepare('SELECT status FROM staff_permission_requests WHERE id=?').get(raceId)!.status,'pending');assert.equal((await getStaffPermissionProfile(f.db,'delegate')).version,profile.version);}finally{f.sqlite.exec("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer'");}
  });
 }finally{state.db=null;f.dispose();}
});
