import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';

const origin='http://localhost:3018';
const state={db:null as D1Database|null,actor:'reviewer'};
(globalThis as typeof globalThis&{documentAdminRecoveryFixture:typeof state}).documentAdminRecoveryFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.documentAdminRecoveryFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const actor=globalThis.documentAdminRecoveryFixture.actor;return{userId:actor,email:actor+"@local.hastabazaar.test",fullName:"Fictional document reviewer",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

async function fixture(){
 const f=await completeVersionFixture(Date.now()-60_000);state.db=f.db;state.actor='reviewer';
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',?)").run(f.now);
 const document=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!;
 return{...f,documentId:String(document.id)};
}
function post(path:string,body:unknown,actor='reviewer'){
 return new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});
}

async function prepared(f:Awaited<ReturnType<typeof fixture>>,kind:'review'|'permission'){
 const domain=await import('../lib/sellers/document-review');
 let sourceId=f.documentId,body:Record<string,unknown>={sellerId:'maker',decision:'verify',expectedReviewId:null};
 if(kind==='permission'){
  await domain.verifySellerDocument(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'reviewer',reason:'Inspect the exact fictional original identity evidence.',now:f.now});
  sourceId=await domain.requestDocumentChange(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'Replace this exact fictional identity evidence after permission.',now:f.now+1});
  const row=f.sqlite.prepare('SELECT operation_request_id AS operationId FROM seller_document_change_requests WHERE id=?').get(sourceId)!;
  body={decision:'approve',expectedOperationId:row.operationId};
 }
 const api=kind==='review'?await import('../app/api/admin/seller-documents/[id]/review/route'):await import('../app/api/admin/seller-document-change-requests/[id]/route');
 const path=kind==='review'?`/api/admin/seller-documents/${sourceId}/review`:`/api/admin/seller-document-change-requests/${sourceId}`;
 const commandId=crypto.randomUUID();
 const commandBody:Record<string,unknown>={...body,commandId,reason:'The original reviewer inspected the exact fictional evidence and scope.'};
 return{api,path,sourceId,commandId,body:commandBody,context:{params:Promise.resolve({id:sourceId})}};
}

for(const kind of ['review','permission'] as const)void test(`original document ${kind} outcome is read-only, actor-bound and independent of later current state`,async()=>{
 const f=await fixture();try{
  const target=await prepared(f,kind),read=(target.api as Record<string,unknown>).GET;
  assert.equal(typeof read,'function','Original saved-outcome GET is required for reload without another decision.');
  if(typeof read!=='function')throw new Error('Missing original outcome reader.');
  const saved=await target.api.POST(post(target.path,target.body),target.context);
  assert.equal(saved.status,200,await saved.clone().text());
  const confirmation=await saved.json() as Record<string,unknown>;
  assert.equal(confirmation.recorded,true);assert.equal(confirmation.requestId,target.commandId);assert.equal(confirmation.actorId,'reviewer');assert.equal(confirmation.sourceId,target.sourceId);
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const query=()=>new Request(origin+target.path+'?commandId='+target.commandId,{headers:{'X-Hastabazaar-Actor':'reviewer'}});
  const recovered=await read(query(),target.context) as Response;
  assert.equal(recovered.status,200,await recovered.clone().text());
  assert.deepEqual(await recovered.json(),confirmation);
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before,'GET must not write guards, accept invitations or create a second decision.');
  const repeat=await target.api.POST(post(target.path,target.body),target.context);
  assert.equal(repeat.status,200,await repeat.clone().text());assert.deepEqual(await repeat.json(),confirmation);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND command_key IS NOT NULL').get(target.commandId)!.n,1);
  state.actor='foreign';
  const foreign=await read(new Request(origin+target.path+'?commandId='+target.commandId,{headers:{'X-Hastabazaar-Actor':'foreign'}}),target.context) as Response;
  assert.equal(foreign.status,404);assert.doesNotMatch(await foreign.text(),/original reviewer inspected|maker-user|authSubject/);
  state.actor='reviewer';
  const wrong=await read(query(),{params:Promise.resolve({id:'different-source'})}) as Response;assert.equal(wrong.status,404);
  f.sqlite.prepare("UPDATE users SET auth_subject='reviewer-rebound' WHERE id='reviewer'").run();state.actor='reviewer-rebound';
  const rebound=await read(query(),target.context) as Response;assert.equal(rebound.status,403,'A new authenticated subject cannot adopt the original receipt.');
  const reboundReplay=await target.api.POST(post(target.path,target.body),target.context);assert.equal(reboundReplay.status,403);
 }finally{f.dispose();state.db=null;}
});

for(const kind of ['review','permission'] as const)void test(`document ${kind} commit rejects a changed authenticated subject`,async()=>{
 const f=await fixture();try{
  const target=await prepared(f,kind);
  f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE users SET auth_subject='changed-before-document-commit' WHERE id='reviewer'").run();});
  const response=await target.api.POST(post(target.path,target.body),target.context);
  assert.ok([403,409].includes(response.status),await response.text());
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND command_key IS NOT NULL').get(target.commandId)!.n,0);
  assert.equal(f.sqlite.prepare(kind==='review'?'SELECT status FROM seller_documents WHERE id=?':'SELECT status FROM seller_document_change_requests WHERE id=?').get(target.sourceId)!.status,kind==='review'?'pending':'submitted');
 }finally{f.dispose();state.db=null;}
});

for(const kind of ['review','permission'] as const)void test(`document ${kind} rejects displayed A when another eligible Super Admin B is authenticated`,async()=>{
 const f=await fixture();try{
  const domain=await import('../lib/sellers/document-review');
  let sourceId=f.documentId,body:Record<string,unknown>={sellerId:'maker',decision:'verify',expectedReviewId:null};
  if(kind==='permission'){
   await domain.verifySellerDocument(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'reviewer',reason:'Inspect the exact fictional original identity evidence.',now:f.now});
   sourceId=await domain.requestDocumentChange(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'Replace this exact fictional identity evidence after permission.',now:f.now+1});
   const request=f.sqlite.prepare('SELECT operation_request_id AS operationId FROM seller_document_change_requests WHERE id=?').get(sourceId)!;
   body={decision:'approve',expectedOperationId:request.operationId};
  }
  const commandId=crypto.randomUUID();body={...body,commandId,reason:'The displayed original reviewer inspected this fictional document.'};
  const notices=f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()!.n;
  state.actor='foreign';
  const api=kind==='review'?await import('../app/api/admin/seller-documents/[id]/review/route'):await import('../app/api/admin/seller-document-change-requests/[id]/route');
  const path=kind==='review'?`/api/admin/seller-documents/${sourceId}/review`:`/api/admin/seller-document-change-requests/${sourceId}`;
  const response=await api.POST(post(path,body),{params:Promise.resolve({id:sourceId})});
  assert.equal(response.status,403,await response.text());
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND command_key IS NOT NULL').get(commandId)!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()!.n,notices);
  assert.equal(f.sqlite.prepare(kind==='review'?'SELECT status FROM seller_documents WHERE id=?':'SELECT status FROM seller_document_change_requests WHERE id=?').get(sourceId)!.status,kind==='review'?'pending':'submitted');
 }finally{f.dispose();state.db=null;}
});

for(const kind of ['review','permission'] as const)void test(`document ${kind} original proof survives lost commit acknowledgement and refuses altered replay`,async()=>{
 const f=await fixture();try{
  const target=await prepared(f,kind),wrapped=Object.create(f.db) as D1Database;let committed=false;
  wrapped.prepare=((sql:string)=>{if(committed&&sql.includes('SELECT command_digest AS digest'))throw new Error('fictional_original_receipt_read_unavailable');return f.db.prepare(sql);}) as D1Database['prepare'];
  wrapped.batch=(async(statements:D1PreparedStatement[])=>{const result=await f.db.batch(statements);if(!committed){committed=true;throw new Error('fictional_document_commit_ack_lost');}return result;}) as D1Database['batch'];state.db=wrapped;
  const unknown=await target.api.POST(post(target.path,target.body),target.context);assert.equal(committed,true);assert.equal(unknown.status,503);
  state.db=f.db;
  const count=()=>f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()!.n,notices=count();
  const get=await target.api.GET(new Request(origin+target.path+'?commandId='+target.commandId,{headers:{'X-Hastabazaar-Actor':'reviewer'}}),target.context);
  assert.equal(get.status,200,await get.clone().text());const original=await get.json();
  const replay=await target.api.POST(post(target.path,target.body),target.context);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),original);
  const changed=await target.api.POST(post(target.path,{...target.body,reason:'A different note cannot adopt the original saved reference.'}),target.context);assert.equal(changed.status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND command_key IS NOT NULL').get(target.commandId)!.n,1);assert.equal(count(),notices);
 }finally{state.db=f.db;f.dispose();state.db=null;}
});

for(const kind of ['review','permission'] as const)void test(`document ${kind} receipt without original authenticated-subject proof stays unconfirmed`,async()=>{
 const f=await fixture();try{
  const target=await prepared(f,kind),domain=await import('../lib/sellers/document-review');
  if(kind==='review')await domain.reviewSellerDocument(f.db,{actorId:'reviewer',sellerId:'maker',documentId:target.sourceId,decision:'verify',expectedReviewId:null,commandId:target.commandId,reason:target.body.reason as string,now:Date.now()});
  else await domain.reviewDocumentChange(f.db,{actorId:'reviewer',requestId:target.sourceId,decision:'approve',expectedOperationId:target.body.expectedOperationId as string|null,commandId:target.commandId,reason:target.body.reason as string,now:Date.now()});
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n,audits=f.sqlite.prepare('SELECT * FROM audit_logs ORDER BY id').all();
  const missing=await target.api.GET(new Request(origin+target.path+'?commandId='+target.commandId),target.context);assert.equal(missing.status,404);
  const replay=await target.api.POST(post(target.path,target.body),target.context);assert.equal(replay.status,503,'A retained string receipt cannot invent its original authenticated subject.');
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM audit_logs ORDER BY id').all(),audits);
 }finally{f.dispose();state.db=null;}
});

for(const kind of ['review','permission'] as const)void test(`document ${kind} original read fences current role, subject and authenticated-session races`,async(t)=>{
 const f=await fixture();try{
  const target=await prepared(f,kind);assert.equal((await target.api.POST(post(target.path,target.body),target.context)).status,200);
  for(const race of ['role','subject','session'] as const)await t.test(race,async()=>{
   const wrapped=Object.create(f.db) as D1Database;let raced=false;
   wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('FROM audit_logs WHERE actor_id=')){
    const first=statement.first.bind(statement);statement.first=(async()=>{const row=await first();if(!raced){raced=true;
     if(race==='role')f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");
     if(race==='subject')f.sqlite.exec("UPDATE users SET auth_subject='changed-during-document-read' WHERE id='reviewer'");
     if(race==='session')state.actor='foreign';}return row;}) as D1PreparedStatement['first'];}return statement;}) as D1Database['prepare'];state.db=wrapped;
   try{const result=await target.api.GET(new Request(origin+target.path+'?commandId='+target.commandId,{headers:{'X-Hastabazaar-Actor':'reviewer'}}),target.context);assert.equal(raced,true);assert.equal(result.status,403);assert.doesNotMatch(await result.text(),/recorded|original reviewer inspected|maker-user/);}
   finally{state.db=f.db;state.actor='reviewer';f.sqlite.exec("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer';INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)");}
  });
 }finally{f.dispose();state.db=null;}
});

void test('historical replacement approval remains original after a later lawful rejection',async()=>{
 const f=await fixture();try{
  const target=await prepared(f,'permission'),saved=await target.api.POST(post(target.path,target.body),target.context);assert.equal(saved.status,200);const original=await saved.json();
  const operation=f.sqlite.prepare('SELECT operation_request_id id FROM seller_document_change_requests WHERE id=?').get(target.sourceId)!;
  const domain=await import('../lib/sellers/document-review');await domain.reviewDocumentChange(f.db,{requestId:target.sourceId,actorId:'foreign',actorAuthSubject:'foreign',decision:'reject',reason:'Later independent review rejects further replacement permission.',expectedOperationId:operation.id as string,commandId:crypto.randomUUID(),now:Date.now()+1});
  assert.equal(f.sqlite.prepare('SELECT status FROM seller_document_change_requests WHERE id=?').get(target.sourceId)!.status,'rejected');
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  const get=await target.api.GET(new Request(origin+target.path+'?commandId='+target.commandId),target.context);assert.equal(get.status,200);assert.deepEqual(await get.json(),original);
  const replay=await target.api.POST(post(target.path,target.body),target.context);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),original);
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);assert.equal(f.sqlite.prepare('SELECT active_permission_id id FROM seller_document_change_requests WHERE id=?').get(target.sourceId)!.id,null);
 }finally{f.dispose();state.db=null;}
});

for(const kind of ['review','permission'] as const)void test(`document ${kind} before-write proof is exact and never classifies an earlier unknown outcome`,async()=>{
 const f=await fixture();try{
  const target=await prepared(f,kind);let invoked=false;f.setBeforeBatch(()=>{invoked=true;});
  const stale={...target.body,[kind==='review'?'expectedReviewId':'expectedOperationId']:'a-different-current-source'};
  const rejected=await target.api.POST(post(target.path,stale),target.context),first=await rejected.json() as Record<string,unknown>;
  assert.equal(rejected.status,409);assert.equal(first.phase,'before_write');assert.equal(invoked,false);
  for(const [key,value] of Object.entries({actorId:'reviewer',action:kind,sourceId:target.sourceId,requestId:target.commandId}))assert.equal(first[key],value);
  const invalid=await target.api.POST(post(target.path,{...target.body,reason:'short'}),target.context);assert.equal(invalid.status,400);assert.equal((await invalid.json() as {phase:string}).phase,'before_write');
  const wrapped=Object.create(f.db) as D1Database;wrapped.batch=(async()=>{invoked=true;throw new Error('fictional_ambiguous_batch_transport');}) as D1Database['batch'];state.db=wrapped;
  const unknown=await target.api.POST(post(target.path,target.body),target.context),uncertain=await unknown.json() as Record<string,unknown>;
  assert.equal(invoked,true);assert.equal(unknown.status,503);assert.equal(uncertain.phase,'outcome_unconfirmed');assert.equal(uncertain.requestId,target.commandId);
  state.db=f.db;const domain=await import('../lib/sellers/document-review');
  if(kind==='review')await domain.reviewSellerDocument(f.db,{actorId:'foreign',actorAuthSubject:'foreign',documentId:target.sourceId,sellerId:'maker',decision:'verify',reason:'Another lawful reviewer resolves the current fictional evidence.',now:Date.now(),commandId:crypto.randomUUID()});
  else await domain.reviewDocumentChange(f.db,{actorId:'foreign',actorAuthSubject:'foreign',requestId:target.sourceId,decision:'reject',reason:'Another lawful reviewer rejects the current replacement permission.',now:Date.now(),commandId:crypto.randomUUID()});
  const later=await target.api.POST(post(target.path,target.body),target.context),conflict=await later.json() as Record<string,unknown>;
  assert.equal(later.status,409);assert.equal(conflict.phase,'before_write');assert.equal(conflict.requestId,uncertain.requestId,'A later invocation cannot replace or settle the earlier unknown reference.');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL AND request_id=?').get(target.commandId)!.n,0);
 }finally{state.db=f.db;f.dispose();state.db=null;}
});
