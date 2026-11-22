import assert from 'node:assert/strict';
import test from 'node:test';
import {protectedTarget,state,origin} from './helpers/protected-admin-fixture';

void test('protected concurrent same-nonce native permission returns the one committed receipt ID to both callers',async()=>{
 const f=await protectedTarget('permission');try{
  assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);
  const {reviewProtectedChangePermission}=await import('../lib/sellers/protected-change-requests');
  let arrivals=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),db=Object.create(f.db) as D1Database;
  db.batch=(async(statements:D1PreparedStatement[])=>{arrivals++;if(arrivals===2)release();await gate;return f.db.batch(statements);}) as D1Database['batch'];
  const input={caseId:f.caseId,actorId:'reviewer',actorAuthSubject:'reviewer',expectedVersion:0,expectedIdentityRevision:f.body.identityRevision as number,expectedBankRevision:f.body.bankRevision as number,decision:'permit' as const,reason:f.body.reason as string,requestId:f.commandId,now:Date.now()};
  const returned=await Promise.all([reviewProtectedChangePermission(db,input),reviewProtectedChangePermission(db,input)]);
  const saved=f.sqlite.prepare('SELECT id FROM seller_protected_change_permissions WHERE case_id=?').all(f.caseId);
  const receipt=f.sqlite.prepare('SELECT command_result_json FROM audit_logs WHERE request_id=? AND command_key IS NOT NULL').get(f.commandId)!;
  assert.equal(arrivals,2);assert.equal(saved.length,1);assert.deepEqual(returned,[saved[0].id,saved[0].id]);assert.equal(JSON.parse(String(receipt.command_result_json)),saved[0].id);
  assert.equal(await reviewProtectedChangePermission(f.db,input),saved[0].id);assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.dispose();state.db=null;}
});

for(const scenario of ['empty_scopes','duplicate_scopes','missing_evidence_confirmation','missing_bank_confirmation','missing_route_bank_confirmation'] as const)void test('protected first invalid disposition has exact before-write proof and zero changes: '+scenario,async()=>{
 const f=await protectedTarget('disposition');try{
  assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);
  if(scenario==='empty_scopes')f.body.capabilities=[];
  else if(scenario==='duplicate_scopes')f.body.capabilities=['payouts','payouts'];
  else{
   const {withdrawProtectedChange}=await import('../lib/sellers/protected-change-disposition');
   await withdrawProtectedChange(f.db,{caseId:f.caseId,actorId:'maker-user',expectedVersion:0,reason:'Fictional withdrawal before separate readiness review.',requestId:crypto.randomUUID(),now:Date.now()});
   Object.assign(f.body,{version:1,action:'release_holds',capabilities:[scenario==='missing_route_bank_confirmation'?'new_orders':'payouts'],currentEvidenceValidConfirmed:scenario!=='missing_evidence_confirmation',bankOwnershipConfirmed:false});
  }
  let batch=false;f.setBeforeBatch(()=>{batch=true;});const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  for(let attempt=0;attempt<2;attempt++){
   const response=await f.api.POST(f.request(),f.context);assert.equal(response.status,400);const body=await response.json() as Record<string,unknown>;
   assert.equal(body.phase,'before_write');assert.equal(body.actorId,'reviewer');assert.equal(body.action,'disposition');assert.equal(body.sourceId,f.caseId);assert.equal(body.requestId,f.commandId);
   assert.match(String(body.error),scenario==='missing_bank_confirmation'||scenario==='missing_route_bank_confirmation'?/account ownership/i:/hold scopes|current valid evidence/i);
  }
  assert.equal((await f.api.GET(f.query(),f.context)).status,404);assert.equal(batch,false);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 }finally{f.dispose();state.db=null;}
});

for(const kind of ['permission','verify-identity','disposition','bank-details'] as const)void test(`protected ${kind} lost commit acknowledgement recovers exact history with no duplicate effects`,async()=>{
 const f=await protectedTarget(kind);try{
  const wrapped=Object.create(f.db) as D1Database;let committed=false;
  wrapped.prepare=((sql:string)=>{if(committed&&sql.includes('SELECT command_digest AS digest'))throw Error('Fictional receipt read unavailable');return f.db.prepare(sql);}) as D1Database['prepare'];
  wrapped.batch=(async(statements:D1PreparedStatement[])=>{const result=await f.db.batch(statements);if(!committed){committed=true;throw Error('Fictional lost commit acknowledgement');}return result;}) as D1Database['batch'];state.db=wrapped;
  const unknown=await f.api.POST(f.request(),f.context);assert.equal(unknown.status,503);assert.equal((await unknown.json() as {phase:string}).phase,'outcome_unconfirmed');assert.equal(committed,true);state.db=f.db;
  const notices=f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()!.n;
  const recovered=await f.api.GET(f.query(),f.context);assert.equal(recovered.status,200,await recovered.clone().text());const original=await recovered.json();
  const replay=await f.api.POST(f.request(),f.context);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),original);
  f.body.reason='A new reason cannot replace the original saved command.';assert.equal((await f.api.POST(f.request(),f.context)).status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND command_key IS NOT NULL').get(f.commandId)!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()!.n,notices);
  const proof=f.sqlite.prepare("SELECT id FROM seller_protected_change_events WHERE action='admin_command_recorded' AND json_extract(payload_json,'$.requestId')=?").get(f.commandId)!;
  assert.throws(()=>f.sqlite.prepare('UPDATE seller_protected_change_events SET payload_json=? WHERE id=?').run('{}',proof.id),/immutable/);
 }finally{state.db=f.db;f.dispose();state.db=null;}
});
for(const kind of ['permission','verify-identity','disposition','bank-details'] as const)void test(`protected ${kind} read fences current role subject and session even on failing receipt reads`,async(t)=>{
 const f=await protectedTarget(kind);try{
  assert.equal((await f.api.POST(f.request(),f.context)).status,200);
  for(const race of ['role','subject','session','session-failed-read'] as const)await t.test(race,async()=>{
   let raced=false;const wrapped=Object.create(f.db) as D1Database;
   wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes("WHERE e.action='admin_command_recorded'")){
    const all=statement.all.bind(statement);statement.all=(async()=>{const result=await all();if(!raced){raced=true;
     if(race==='role')f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();
     if(race==='subject')f.sqlite.prepare("UPDATE users SET auth_subject='changed-during-read' WHERE id='reviewer'").run();
     if(race.startsWith('session'))state.actor='foreign';if(race==='session-failed-read')throw Error('Fictional read outage after session drift');
    }return result;}) as D1PreparedStatement['all'];}return statement;}) as D1Database['prepare'];state.db=wrapped;
   try{const denied=await f.api.GET(f.query(),f.context);assert.equal(raced,true);assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/recorded|original reviewer|maker-user|requestId/);}
   finally{state.db=f.db;state.actor='reviewer';f.sqlite.prepare("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer'").run();f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)").run();}
  });
 }finally{f.dispose();state.db=null;}
});
void test('protected original permission survives later lawful rejection without restoring it',async()=>{
 const f=await protectedTarget('permission');try{
  const first=await f.api.POST(f.request(),f.context);assert.equal(first.status,200);const original=await first.json();
  const {reviewProtectedChangePermission}=await import('../lib/sellers/protected-change-requests');
  await reviewProtectedChangePermission(f.db,{caseId:f.caseId,actorId:'foreign',actorAuthSubject:'foreign',expectedVersion:1,expectedIdentityRevision:f.body.identityRevision as number,expectedBankRevision:f.body.bankRevision as number,decision:'reject',reason:'Later lawful independent review rejects further permission.',requestId:crypto.randomUUID(),now:Date.now()});
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  assert.deepEqual(await (await f.api.GET(f.query(),f.context)).json(),original);assert.deepEqual(await (await f.api.POST(f.request(),f.context)).json(),original);
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);const current=f.sqlite.prepare('SELECT status,active_permission_id FROM seller_protected_change_cases WHERE id=?').get(f.caseId)!;assert.equal(current.status,'rejected');assert.equal(current.active_permission_id,null);
 }finally{f.dispose();state.db=null;}
});
void test('protected native legacy permission receipt remains unconfirmed with no historical proof backfill',async()=>{
 const f=await protectedTarget('permission');try{
  const {reviewProtectedChangePermission}=await import('../lib/sellers/protected-change-requests');
  await reviewProtectedChangePermission(f.db,{caseId:f.caseId,actorId:'reviewer',expectedVersion:0,expectedIdentityRevision:f.body.identityRevision as number,expectedBankRevision:f.body.bankRevision as number,decision:'permit',reason:f.body.reason as string,requestId:f.commandId,now:Date.now()});
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  assert.equal((await f.api.GET(f.query(),f.context)).status,404);assert.equal((await f.api.POST(f.request(),f.context)).status,503);
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
 }finally{f.dispose();state.db=null;}
});
void test('protected evidence-only disposition records original proof and subject guard without restoring independent holds',async()=>{
 const f=await protectedTarget('disposition');try{
  Object.assign(f.body,{action:'evidence_only',currentEvidenceValidConfirmed:true,factsUnchanged:true});
  // The case's own classification cannot release another case's bank restriction.
  const {sellerBankState,submitSellerBankDetails}=await import('../lib/sellers/bank-details');
  const before=await sellerBankState(f.db,'maker');
  await submitSellerBankDetails(f.db,{sellerId:'maker',actorId:'maker-user',revision:before.revision,now:f.now+4,details:{payoutBeneficiary:'Fictional Maker',bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'123456789'},document:{id:'independent-bank',kind:'bank_verification',objectKey:'private/seller-documents/maker/independent-bank',originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
  const bank=await sellerBankState(f.db,'maker'),bankCase=bank.change!.id;f.body.bankRevision=bank.bankRevision;
  const response=await f.api.POST(f.request(),f.context);assert.equal(response.status,200,await response.clone().text());const original=await response.json();
  assert.deepEqual(await (await f.api.GET(f.query(),f.context)).json(),original);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_capability_holds WHERE case_id=? AND released_at IS NULL').get(bankCase)!.n,1);
 }finally{f.dispose();state.db=null;}
});
void test('protected bank revalidation and scoped payout release retain distinct original results and order hold',async()=>{
 const f=await protectedTarget('bank-details');try{
  assert.equal((await f.api.POST(f.request(),f.context)).status,200);
  const {sellerBankState}=await import('../lib/sellers/bank-details'),{requestProtectedChange}=await import('../lib/sellers/protected-change-requests'),{withdrawProtectedChange}=await import('../lib/sellers/protected-change-disposition');
  let bank=await sellerBankState(f.db,'maker');
  const caseId=await requestProtectedChange(f.db,{sellerId:'maker',actorId:'maker-user',kind:'identity',fields:['legalName','representative_identity'],reason:'Inspect the same original legal identity and valid evidence.',expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,requestId:crypto.randomUUID(),now:f.now+4});
  await withdrawProtectedChange(f.db,{caseId,actorId:'maker-user',expectedVersion:0,reason:'The original evidence remains correct; withdraw the correction.',requestId:crypto.randomUUID(),now:f.now+5});
  const api=await import('../app/api/admin/seller-protected-changes/[id]/disposition/route'),context={params:Promise.resolve({id:caseId})},path=`/api/admin/seller-protected-changes/${caseId}/disposition`;
  for(const [action,version] of [['revalidate_bank',1],['release_holds',2]] as const){
   bank=await sellerBankState(f.db,'maker');const commandId=crypto.randomUUID(),body={commandId,action,version,identityRevision:bank.identityRevision,bankRevision:bank.bankRevision,bankOwnershipConfirmed:true,currentEvidenceValidConfirmed:true,ownershipBasis:'same_person',capabilities:['payouts'],evidenceReference:'REVALIDATED-ORIGINAL-BANK',reason:'Current original identity and bank ownership inspected independently.'};
   const request=()=>new Request(origin+path,{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify(body)});
   const response=await api.POST(request(),context);assert.equal(response.status,200,await response.clone().text());const original=await response.json();
   assert.deepEqual(await (await api.GET(new Request(origin+path+'?commandId='+commandId,{headers:{'X-Hastabazaar-Actor':'reviewer'}}),context)).json(),original);
   assert.deepEqual(await (await api.POST(request(),context)).json(),original);
  }
  assert.deepEqual(f.sqlite.prepare('SELECT capability FROM seller_capability_holds WHERE case_id=? AND released_at IS NULL').all(caseId).map(r=>r.capability),['new_orders']);
 }finally{f.dispose();state.db=null;}
});
void test('protected packet retirement recovers its original result without releasing reservations twice or changing destination',async()=>{
 const f=await protectedTarget('disposition');try{
  f.sqlite.prepare("INSERT INTO payouts(id,seller_id,payout_number,status,amount_paisa,destination_reference,prepared_by,approved_by,scheduled_for,created_at,updated_at) VALUES('original-packet','maker','FIX-PACKET','approved',10000,'ORIGINAL-DESTINATION','reviewer','reviewer',1,1,1)").run();
  f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('original-earning','maker','sale',10000,1,'Fictional earning',1)").run();
  f.sqlite.prepare("INSERT INTO payout_entries(payout_id,ledger_entry_id) VALUES('original-packet','original-earning')").run();
  const {protectedCaseHoldStatements}=await import('../lib/sellers/protected-change-policy');await f.db.batch(protectedCaseHoldStatements(f.db,f.caseId,f.now+5));
  Object.assign(f.body,{action:'retire_packet',model:'registered',payoutId:'original-packet',notExecutedConfirmed:true});
  const response=await f.api.POST(f.request(),f.context);assert.equal(response.status,200,await response.clone().text());const original=await response.json();
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  assert.deepEqual(await (await f.api.GET(f.query(),f.context)).json(),original);assert.deepEqual(await (await f.api.POST(f.request(),f.context)).json(),original);
  assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
  assert.equal(f.sqlite.prepare("SELECT destination_reference FROM payouts WHERE id='original-packet'").get()!.destination_reference,'ORIGINAL-DESTINATION');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_payout_packet_dispositions WHERE old_payout_id='original-packet'").get()!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_capability_holds WHERE case_id=? AND released_at IS NULL').get(f.caseId)!.n,2);
 }finally{f.dispose();state.db=null;}
});
for(const kind of ['permission','verify-identity','disposition','bank-details'] as const){
 void test(`protected ${kind} first invalid review has exact before-write proof and no batch`,async()=>{
  const f=await protectedTarget(kind);try{let batch=false;f.setBeforeBatch(()=>{batch=true;});f.body.reason='short';
   const response=await f.api.POST(f.request(),f.context);assert.equal(response.status,400);const proof=await response.json() as Record<string,unknown>;
   assert.equal(proof.phase,'before_write');assert.equal(proof.requestId,f.commandId);assert.equal(proof.actorId,'reviewer');assert.equal(proof.sourceId,f.sourceId);assert.equal(proof.action,kind);assert.equal(batch,false);
  }finally{f.dispose();state.db=null;}
 });
 void test(`protected ${kind} rejects displayed A with authenticated eligible B before writing`,async()=>{
  const f=await protectedTarget(kind);try{state.actor='foreign';const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
   const response=await f.api.POST(f.request(),f.context);assert.equal(response.status,403,await response.clone().text());
   assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
  }finally{f.dispose();state.db=null;}
 });
 void test(`protected ${kind} recovers only immutable original actor/source proof without writes`,async()=>{
  const f=await protectedTarget(kind);try{
   const read=(f.api as Record<string,unknown>).GET;assert.equal(typeof read,'function');if(typeof read!=='function')throw Error('Missing original GET');
   const saved=await f.api.POST(f.request(),f.context);assert.equal(saved.status,200,await saved.clone().text());const original=await saved.json() as Record<string,unknown>;
   assert.equal(original.recorded,true);assert.equal(original.requestId,f.commandId);assert.equal(original.actorId,'reviewer');assert.equal(original.sourceId,f.sourceId);assert.equal(original.action,kind);
   const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
   const recovered=await read(f.query(),f.context) as Response;assert.equal(recovered.status,200,await recovered.clone().text());assert.deepEqual(await recovered.json(),original);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
   const replay=await f.api.POST(f.request(),f.context);assert.equal(replay.status,200,await replay.clone().text());assert.deepEqual(await replay.json(),original);
   state.actor='foreign';assert.equal((await read(f.query('foreign'),f.context) as Response).status,404);state.actor='reviewer';
   assert.equal((await read(f.query(),{params:Promise.resolve({id:'other-source'})}) as Response).status,404);
   f.sqlite.prepare("UPDATE users SET auth_subject='rebound' WHERE id='reviewer'").run();state.actor='rebound';
   assert.equal((await read(f.query(),f.context) as Response).status,403);assert.equal((await f.api.POST(f.request(),f.context)).status,403);
  }finally{f.dispose();state.db=null;}
 });
 void test(`protected ${kind} rejects auth-subject drift at commit`,async()=>{
  const f=await protectedTarget(kind);try{f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE users SET auth_subject='changed-at-commit' WHERE id='reviewer'").run();});
   const response=await f.api.POST(f.request(),f.context);assert.ok([403,409,503].includes(response.status),await response.clone().text());
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND command_key IS NOT NULL').get(f.commandId)!.n,0);
  }finally{f.dispose();state.db=null;}
 });
}
