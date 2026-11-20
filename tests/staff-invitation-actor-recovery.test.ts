import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';

const state={db:null as D1Database|null,subject:'external-staff-b',email:'foreign@local.hastabazaar.test',mail:0};
(globalThis as typeof globalThis&{staffInvitationFixture:typeof state}).staffInvitationFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.staffInvitationFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:globalThis.staffInvitationFixture.subject,email:globalThis.staffInvitationFixture.email,fullName:"Fictional staff",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 '@/lib/email/staff-invitation':'export async function sendStaffInvitationEmail(){globalThis.staffInvitationFixture.mail++;}',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
const input={email:'fictional-invited@local.hastabazaar.test',role:'admin',permissions:['order.manage'],requestId:'original-invitation',formVersion:1,customAnswers:[]};
function request(path:string,actor:string,method='POST',body:unknown=input){return new Request('http://localhost:3018'+path,{method,headers:{origin:'http://localhost:3018','content-type':'application/json','X-Hastabazaar-Actor':actor},...(method==='GET'||method==='DELETE'?{}:{body:JSON.stringify(body)})});}
function retainedPublication(f:Awaited<ReturnType<typeof completeVersionFixture>>){
 // Historical publication is declared explicitly; this form is outside native57.
 f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
  VALUES('retained-invite-config','staff.staff-invitation',1,'published',?,'Retained fictional publication','reviewer',1,'reviewer',1,'reviewer',?,'retained-invite-config')`)
  .run(JSON.stringify({formId:'staff.staff-invitation',fields:[]}),f.now-1000);
}

void test('actual staff invitation and permission routes reject another eligible actor before private intake',{timeout:60_000},async t=>{
 const f=await completeVersionFixture(Date.now());state.db=f.db;state.mail=0;state.subject='external-staff-b';state.email='foreign@local.hastabazaar.test';retainedPublication(f);
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.exec("UPDATE users SET auth_subject='external-staff-b' WHERE id='foreign';INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',1)");
 try{
  const staff=await import('../lib/auth/staff');assert.equal((await staff.requireStaffApi('admin.invite')).id,'foreign');
  const collection=await import('../app/api/admin/staff-invitations/route');
  const item=await import('../app/api/admin/staff-invitations/[id]/route');
  const permissions=await import('../app/api/admin/staff-permissions/route');
  await t.test('invitation POST consumes no private body and sends no captured mail',async()=>{
   const old=request('/api/admin/staff-invitations','reviewer'),stream=old.body;let reads=0;Object.defineProperty(old,'body',{get(){reads++;return stream;}});
   const response=await collection.POST(old);assert.equal(response.status,403,await response.text());assert.equal(reads,0);assert.equal(state.mail,0);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM staff_invitations').get()!.n,0);
  });
  await t.test('revocation preserves the pending original when the rendered actor changed',async()=>{
   const {createStaffInvitation}=await import('../lib/db/repositories/staff');
   const invitation=await createStaffInvitation(f.db,{email:'revoke-target@local.hastabazaar.test',role:'admin',permissions:[],invitedBy:'reviewer',now:f.now});
   const response=await item.DELETE(request('/api/admin/staff-invitations/'+invitation.id,'reviewer','DELETE'),{params:Promise.resolve({id:invitation.id})});
   assert.equal(response.status,403,await response.text());assert.equal(f.sqlite.prepare('SELECT status FROM staff_invitations WHERE id=?').get(invitation.id)!.status,'pending');
  });
  await t.test('permission POST rejects old actor before parsing private permission input',async()=>{
   const old=request('/api/admin/staff-permissions','reviewer'),stream=old.body;let reads=0;Object.defineProperty(old,'body',{get(){reads++;return stream;}});
   const response=await permissions.POST(old);assert.equal(response.status,403,await response.text());assert.equal(reads,0);
  });
  await t.test('definite validation rejection is distinguished from unconfirmed committed creation',async()=>{
   const invalid=await collection.POST(request('/api/admin/staff-invitations','foreign','POST',{...input,email:'invalid'}));assert.equal(invalid.status,400);assert.equal((await invalid.json() as {phase:string}).phase,'rejected_before_write');
   const wrapped=Object.create(f.db) as D1Database;let blocked=false;
   wrapped.prepare=((sql:string)=>{if(sql.includes('JOIN audit_logs original')){blocked=true;throw new Error('fictional_readback_unavailable');}return f.db.prepare(sql);}) as D1Database['prepare'];state.db=wrapped;
   try{const response=await collection.POST(request('/api/admin/staff-invitations','foreign','POST',{...input,email:'unconfirmed@local.hastabazaar.test',requestId:'unconfirmed-create'}));
    const body=await response.json() as {phase:string;requestId:string;code:string};assert.equal(blocked,true);assert.equal(response.status,503);assert.equal(body.phase,'outcome_unconfirmed');assert.equal(body.requestId,'unconfirmed-create');assert.equal(body.code,'outcome_unconfirmed');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM staff_invitations WHERE email='unconfirmed@local.hastabazaar.test'").get()!.n,1);assert.equal(state.mail,0);
   }finally{state.db=f.db;}
  });
  let original:{id:string;expiresAt:number};
  await t.test('matched internal actor creates once and GET/replay never resend',async()=>{
   const created=await collection.POST(request('/api/admin/staff-invitations','foreign'));assert.equal(created.status,201,await created.clone().text());
   original=await created.json() as typeof original;assert.equal(state.mail,1);
   const replay=await collection.POST(request('/api/admin/staff-invitations','foreign'));assert.equal(replay.status,200,await replay.clone().text());assert.equal(state.mail,1);
   const outcome=await collection.GET(request('/api/admin/staff-invitations?requestId='+input.requestId,'foreign','GET'));
   assert.equal(outcome.status,200,await outcome.clone().text());assert.deepEqual(await outcome.json(),{recorded:true,requestId:input.requestId,id:original.id,expiresAt:original.expiresAt,status:'pending'});assert.equal(state.mail,1);
   const missing=await collection.GET(request('/api/admin/staff-invitations?requestId=unknown-original','foreign','GET'));assert.equal(missing.status,404);assert.equal((await missing.json() as {code:string}).code,'outcome_unconfirmed');assert.equal(state.mail,1);
  });
  await t.test('current invitation status by ID is private readonly oversight, never a causal receipt',async()=>{
   const get=Reflect.get(item,'GET') as ((input:Request,context:{params:Promise<{id:string}>})=>Promise<Response>)|undefined;assert.equal(typeof get,'function');assert.ok(get);
   const target=f.sqlite.prepare("SELECT id FROM staff_invitations WHERE email='revoke-target@local.hastabazaar.test'").get() as {id:string};
   const context={params:Promise.resolve({id:target.id})},path='/api/admin/staff-invitations/'+target.id;
   const old=await get(request(path,'reviewer','GET'),context);assert.equal(old.status,403);
   const current=await get(request(path,'foreign','GET'),context);assert.equal(current.status,200);assert.deepEqual(await current.json(),{id:target.id,status:'pending'});assert.equal(state.mail,1);
   const revoked=await item.DELETE(request(path,'foreign','DELETE'),context);assert.equal(revoked.status,200);assert.deepEqual(await revoked.json(),{id:target.id,revoked:true,actorId:'foreign',message:'Invitation revoked.'});
   const after=await get(request(path,'foreign','GET'),context);const status=await after.json() as {id:string;status:string;revokedAt:number};assert.equal(after.status,200);assert.equal(status.id,target.id);assert.equal(status.status,'revoked');assert.ok(Number.isSafeInteger(status.revokedAt));assert.deepEqual(Object.keys(status).sort(),['id','revokedAt','status']);assert.equal(state.mail,1);
  });
  await t.test('another current Super Admin cannot read the original actor receipt',async()=>{
   state.subject='reviewer';try{const response=await collection.GET(request('/api/admin/staff-invitations?requestId='+input.requestId,'reviewer','GET'));assert.equal(response.status,404);assert.equal(state.mail,1);}finally{state.subject='external-staff-b';}
  });
  await t.test('by-id status conceals current role loss during its native projection',async()=>{
   const get=Reflect.get(item,'GET') as (input:Request,context:{params:Promise<{id:string}>})=>Promise<Response>;
   let raced=false;const wrapped=Object.create(f.db) as D1Database;
   wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('i.revoked_at AS revokedAt')){const first=statement.first.bind(statement);statement.first=(async()=>{const row=await first();raced=true;f.sqlite.exec("DELETE FROM user_roles WHERE user_id='foreign' AND role='super_admin'");return row;}) as D1PreparedStatement['first'];}return statement;}) as D1Database['prepare'];state.db=wrapped;
   try{const response=await get(request('/api/admin/staff-invitations/'+original.id,'foreign','GET'),{params:Promise.resolve({id:original.id})});assert.equal(raced,true);assert.equal(response.status,403,await response.text());assert.equal(state.mail,1);}
   finally{state.db=f.db;f.sqlite.exec("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',1)");}
  });
  await t.test('intended staff authentication rejects a subject rebound during staff projection',async()=>{
   let raced=false;const wrapped=Object.create(f.db) as D1Database;
   wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(/WHERE users\.auth_subject\s*=\s*\?/.test(sql)){const first=statement.first.bind(statement);statement.first=(async()=>{const row=await first();if(!raced){raced=true;f.sqlite.exec("UPDATE users SET auth_subject='rebound-subject' WHERE id='foreign'");}return row;}) as D1PreparedStatement['first'];}return statement;}) as D1Database['prepare'];state.db=wrapped;
   try{let rejected=false;try{await staff.requireStaffApi('admin.invite',{intendedActorId:'foreign'});}catch(error){assert.ok(error instanceof staff.StaffAuthorizationError);rejected=true;}assert.equal(raced,true);assert.equal(rejected,true);}
   finally{state.db=f.db;f.sqlite.exec("UPDATE users SET auth_subject='external-staff-b' WHERE id='foreign'");}
  });
  for(const race of ['role','subject','session'] as const)await t.test('original outcome conceals a '+race+' change during private projection',async()=>{
   let raced=false;const wrapped=Object.create(f.db) as D1Database;
   wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('JOIN audit_logs original')){const first=statement.first.bind(statement);statement.first=(async(column?:string)=>{const row=column===undefined?await first():await first(column);raced=true;
    if(race==='role')f.sqlite.exec("DELETE FROM user_roles WHERE user_id='foreign' AND role='super_admin'");
    if(race==='subject')f.sqlite.exec("UPDATE users SET auth_subject='rebound-subject' WHERE id='foreign'");
    if(race==='session')state.subject='reviewer';return row;}) as D1PreparedStatement['first'];}return statement;}) as D1Database['prepare'];
   state.db=wrapped;
   try{const response=await collection.GET(request('/api/admin/staff-invitations?requestId='+input.requestId,'foreign','GET'));assert.equal(raced,true);assert.equal(response.status,403,await response.text());assert.equal(state.mail,1);}
   finally{state.db=f.db;state.subject='external-staff-b';f.sqlite.exec("UPDATE users SET auth_subject='external-staff-b' WHERE id='foreign';INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',1)");}
  });
  await t.test('lost native commit acknowledgement recovers original receipt without a second mail attempt',async()=>{
   const wrapped=Object.create(f.db) as D1Database;let committed=false;
   wrapped.batch=(async(statements:D1PreparedStatement[])=>{const result=await f.db.batch(statements);if(!committed){committed=true;throw new Error('fictional_lost_commit_ack');}return result;}) as D1Database['batch'];state.db=wrapped;
   try{const body={...input,email:'lost-ack@local.hastabazaar.test',requestId:'lost-native-ack'};
    const response=await collection.POST(request('/api/admin/staff-invitations','foreign','POST',body));assert.equal(committed,true);assert.equal(response.status,200,await response.text());
    const outcome=await collection.GET(request('/api/admin/staff-invitations?requestId=lost-native-ack','foreign','GET'));assert.equal(outcome.status,200);assert.equal(state.mail,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='staff.invitation.created' AND request_id='lost-native-ack'").get()!.n,1);
   }finally{state.db=f.db;}
  });
  await t.test('wrong intended actor cannot accept a different verified identity invitation during authorization',async()=>{
   f.sqlite.exec("DELETE FROM user_roles WHERE user_id='foreign' AND role='super_admin'");
   const {createStaffInvitation}=await import('../lib/db/repositories/staff');
   const invitation=await createStaffInvitation(f.db,{email:'foreign@local.hastabazaar.test',role:'super_admin',invitedBy:'reviewer',now:f.now});
   const response=await collection.POST(request('/api/admin/staff-invitations','reviewer'));
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='foreign' AND role='super_admin'").get()!.n,0,'reject-only intent must precede invitation acceptance');
   assert.equal(f.sqlite.prepare('SELECT status FROM staff_invitations WHERE id=?').get(invitation.id)!.status,'pending');
   assert.equal(response.status,403,await response.text());
  });
  await t.test('wrong intended actor cannot create a user for a new invited identity',async()=>{
   const {createStaffInvitation}=await import('../lib/db/repositories/staff');
   const invitation=await createStaffInvitation(f.db,{email:'new-identity@local.hastabazaar.test',role:'super_admin',invitedBy:'reviewer',now:f.now});
   const before=f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n;state.subject='new-external-identity';state.email='new-identity@local.hastabazaar.test';
   const response=await collection.POST(request('/api/admin/staff-invitations','reviewer'));
   assert.equal(response.status,403,await response.text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n,before);
   assert.equal(f.sqlite.prepare('SELECT status FROM staff_invitations WHERE id=?').get(invitation.id)!.status,'pending');
  });
  await t.test('new outcome GET is read-only even without an intent header',async()=>{
   const before=f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n;
   const response=await collection.GET(new Request('http://localhost:3018/api/admin/staff-invitations?requestId=unknown-original'));
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n,before);
   assert.equal(f.sqlite.prepare("SELECT status FROM staff_invitations WHERE email='new-identity@local.hastabazaar.test'").get()!.status,'pending');
   assert.equal(response.status,403,await response.text());
  });
  await t.test('normal no-intent sign-in retains mailbox-proven invitation acceptance',async()=>{
   const before=f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n;
   const accepted=await staff.requireStaffApi('admin.invite');assert.equal(accepted.role,'super_admin');assert.equal(accepted.authSubject,'new-external-identity');
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n,Number(before)+1);
   assert.equal(f.sqlite.prepare("SELECT status FROM staff_invitations WHERE email='new-identity@local.hastabazaar.test'").get()!.status,'accepted');
  });
 }finally{state.db=null;f.dispose();}
});

void test('original invitation receipt binds original command and authenticated subject',{timeout:60_000},async t=>{
 const f=await completeVersionFixture(Date.now());
 try{
  retainedPublication(f);
  const {validateSellerFormSubmission}=await import('../lib/forms/submission');
  const configured=await validateSellerFormSubmission(f.db,'staff.staff-invitation',1,[],'stable-original');
  const repository=await import('../lib/db/repositories/staff');
  const options={email:'original-command@local.hastabazaar.test',role:'admin' as const,permissions:['order.manage'],invitedBy:'reviewer',actorAuthSubject:'reviewer',now:f.now,requestId:'stable-original',form:{requestId:'stable-original',versionId:configured.versionId,answers:configured.answers}};
  const original=await repository.createStaffInvitation(f.db,options);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets WHERE request_id=?').get(options.requestId)!.n,1);
  f.sqlite.prepare('UPDATE staff_invitation_grants SET permissions_json=? WHERE invitation_id=?').run('["product.review"]',original.id);
  await t.test('exact original retry ignores later mutable grant metadata',async()=>{
   assert.deepEqual(await repository.createStaffInvitation(f.db,options),{...original,duplicate:true});
  });
  await t.test('changed input cannot adopt the later grant under original request identity',async()=>{
   await assert.rejects(repository.createStaffInvitation(f.db,{...options,permissions:['product.review']}));
  });
  await t.test('creation fences the original authenticated subject inside the actual batch',async()=>{
   const wrapped=Object.create(f.db) as D1Database;let raced=false;
   wrapped.batch=(async(statements:D1PreparedStatement[])=>{raced=true;f.sqlite.exec("UPDATE users SET auth_subject='rebound-subject' WHERE id='reviewer'");return f.db.batch(statements);}) as D1Database['batch'];
   const form=await validateSellerFormSubmission(f.db,'staff.staff-invitation',1,[],'subject-race');
   try{await assert.rejects(repository.createStaffInvitation(wrapped,{...options,email:'subject-race@local.hastabazaar.test',requestId:'subject-race',form:{requestId:'subject-race',versionId:form.versionId,answers:form.answers}}));
    assert.equal(raced,true);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM staff_invitations WHERE email='subject-race@local.hastabazaar.test'").get()!.n,0);
   }finally{f.sqlite.exec("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer'");}
  });
  await t.test('authorized original-outcome read exists without resending or exposing private intake',async()=>{
   const read=Reflect.get(repository,'readStaffInvitationOutcome');assert.equal(typeof read,'function');
   const result=await Reflect.apply(read,undefined,[f.db,{actorId:'reviewer',actorAuthSubject:'reviewer',requestId:options.requestId,now:f.now}]);
   assert.deepEqual(result,{recorded:true,requestId:options.requestId,id:original.id,expiresAt:original.expiresAt,status:'pending'});
  });
  await t.test('legacy creation remains readable but mutable grants never invent original input proof',async()=>{
   const oldWriter=Object.create(f.db) as D1Database;let legacyShapeWritten=false;
   oldWriter.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(/^\s*INSERT INTO audit_logs\b/.test(sql)&&sql.includes("'staff.invitation.created'")){
    const bind=statement.bind.bind(statement);statement.bind=((...values:unknown[])=>{
     assert.equal(values.length,6);const snapshot=JSON.parse(String(values[3])) as Record<string,unknown>;assert.ok(snapshot.commandProof);
     delete snapshot.commandProof;values[3]=JSON.stringify(snapshot);legacyShapeWritten=true;return bind(...values);
    }) as D1PreparedStatement['bind'];
   }return statement;}) as D1Database['prepare'];
   const form=await validateSellerFormSubmission(f.db,'staff.staff-invitation',1,[],'legacy-original');
   const legacyOptions={...options,email:'legacy@local.hastabazaar.test',requestId:'legacy-original',form:{requestId:'legacy-original',versionId:form.versionId,answers:form.answers}};
   const legacy=await repository.createStaffInvitation(oldWriter,legacyOptions);assert.equal(legacyShapeWritten,true);
   const before=f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE action='staff.invitation.created' AND request_id='legacy-original'").get()!.next_json;
   f.sqlite.prepare('UPDATE staff_invitation_grants SET permissions_json=? WHERE invitation_id=?').run('["product.review"]',legacy.id);
   const read=await repository.readStaffInvitationOutcome(f.db,{actorId:'reviewer',actorAuthSubject:'reviewer',requestId:'legacy-original',now:f.now});
   assert.deepEqual(read,{recorded:true,requestId:'legacy-original',id:legacy.id,expiresAt:legacy.expiresAt,status:'pending',replayable:false,originalInputProof:'legacy_unclassified'});
   await assert.rejects(repository.createStaffInvitation(f.db,legacyOptions));
   await assert.rejects(repository.createStaffInvitation(f.db,{...legacyOptions,permissions:['product.review']}));
   assert.equal(f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE action='staff.invitation.created' AND request_id='legacy-original'").get()!.next_json,before);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='staff.invitation.created' AND request_id='legacy-original'").get()!.n,1);
  });
 }finally{f.dispose();}
});
