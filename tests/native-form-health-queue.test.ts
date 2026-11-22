import assert from 'node:assert/strict';
import test from 'node:test';
import {companyStoreMakerFixture} from './helpers/company-store-maker-fixture';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
import {getProfileContactLocations,saveProfileSupport} from '../lib/sellers/profile-contact-locations';
import {ingestCommittedFormSaves,evaluateFormHealth,readFormHealth,recordFormLoadObservation} from '../lib/operations/form-health';
import {nativeFormContract} from '../lib/operations/native-form-health';
import {sweepCommittedFormSaves} from '../lib/operations/form-save-sweep';

const formId='seller.public-support-contacts',releaseId='native-queue-test';
async function fixture(){
 const f=await companyStoreMakerFixture();
 f.sqlite.exec("UPDATE seller_profiles SET support_email='',support_phone='' WHERE id='maker'");
 captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RELEASE_ID:releaseId,NODE_ENV:'test'});
 const view=await getProfileContactLocations(f.db,'maker','maker-user'),now=Date.now();
 const command={sellerId:'maker',actorId:'maker-user',expectedRevision:view.support.revision,email:'',phoneCountry:'NP',phone:'',publicDisclosureConfirmed:true,requestId:'noop',now};
 return {...f,command,scope:{environment:'test' as const,releaseId,now:now+1000}};
}
function copied(f:Awaited<ReturnType<typeof fixture>>){return f.sqlite.prepare("SELECT a.request_id FROM form_health_observations h JOIN audit_logs a ON a.id=h.evidence_id WHERE h.evidence_kind='native_command' ORDER BY h.observed_at,h.id").all().map(row=>row.request_id);}
function cloneReceipt(f:Awaited<ReturnType<typeof fixture>>,requestId:string,patch:Record<string,string|number|null>={}){
 const original=f.sqlite.prepare("SELECT * FROM audit_logs WHERE request_id='real-save' AND command_key IS NOT NULL").get()!;
 const row={...original,id:crypto.randomUUID(),request_id:requestId,command_key:crypto.randomUUID().replaceAll('-','').repeat(2),...patch};
 const names=Object.keys(row);f.sqlite.prepare(`INSERT INTO audit_logs(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...Object.values(row));
 return row;
}

for(const size of [1,100])void test(`native queue progresses past ${size} genuine noop receipts with its ${size===1?'one-row':'default'} bound`,async()=>{
 const f=await fixture();try{
  for(let i=0;i<size;i++)await saveProfileSupport(f.db,{...f.command,requestId:'noop-'+i,now:f.command.now+i});
  await saveProfileSupport(f.db,{...f.command,email:'changed@local.hastabazaar.test',requestId:'real-save',now:f.command.now+size});
  const scope={...f.scope,...(size===1?{limit:1}:{})};
  const first=await evaluateFormHealth(f.db,scope);assert.equal(first.scanned,0);assert.equal(first.budgetExhausted,true,'Unvalidated receipts remaining after the bounded sweep must be reported.');
  assert.deepEqual(copied(f),[]);assert.equal(await ingestCommittedFormSaves(f.db,scope),1);
  assert.deepEqual(copied(f),['real-save']);assert.equal(await ingestCommittedFormSaves(f.db,scope),0);
  assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.sqlite.close();}
});

void test('arbitrary invalid originals cannot starve real saves or become healthy proof',async()=>{
 const f=await fixture();try{
  await saveProfileSupport(f.db,{...f.command,email:'PRIVATE-valid@local.hastabazaar.test',requestId:'real-save',now:f.command.now+20});
  const receipt=f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE request_id='real-save' AND command_key IS NOT NULL").get()!;
  const metadata=JSON.parse(String(receipt.next_json));
  const patches:Record<string,string|number|null>[]=[{command_result_json:'null'},{subject_type:'unrelated'},{action:'unmapped.native.command'},{subject_id:'missing-original-outcome'},
   {next_json:JSON.stringify({nativeFormHealth:{...metadata.nativeFormHealth,configurationHash:'a'.repeat(64)}})},
   {next_json:JSON.stringify({nativeFormHealth:{...metadata.nativeFormHealth,audience:'staff'}})}];
  for(const [index,patch] of patches.entries())cloneReceipt(f,'invalid-'+index,{created_at:f.command.now+index,...patch});
  // Invalid generic source is part of the same bounded queue, not a permanently preferred lane.
  f.sqlite.prepare("INSERT INTO audit_logs(id,action,subject_type,next_json,created_at) VALUES('invalid-core','form.core_answers','form',?,?)").run(JSON.stringify({formId:'unmapped',version:1,healthScope:{environment:'test',releaseId}}),f.command.now-1);
  const originals=f.sqlite.prepare('SELECT id,next_json,command_result_json FROM audit_logs WHERE command_key IS NOT NULL ORDER BY id').all();
  for(let i=0;i<7;i++){const result=await sweepCommittedFormSaves(f.db,{...f.scope,limit:1});assert.equal(result.scanned,1);assert.equal(result.recorded,0);assert.equal(result.budgetExhausted,true);}
  assert.deepEqual(copied(f),[]);assert.equal(await ingestCommittedFormSaves(f.db,{...f.scope,limit:1}),1);assert.deepEqual(copied(f),['real-save']);
  assert.deepEqual(f.sqlite.prepare('SELECT id,next_json,command_result_json FROM audit_logs WHERE command_key IS NOT NULL ORDER BY id').all(),originals);
  assert.doesNotMatch(JSON.stringify(f.sqlite.prepare('SELECT * FROM form_health_observations').all()),/PRIVATE-valid|missing-original-outcome/);
 }finally{f.sqlite.close();}
});

void test('finite sweeps revisit recovered evidence and backdated arrivals despite new forward work',async()=>{
 const f=await fixture();try{
  await saveProfileSupport(f.db,{...f.command,requestId:'noop'});
  const saved=await saveProfileSupport(f.db,{...f.command,email:'first@local.hastabazaar.test',requestId:'real-save',now:f.command.now+10});
  assert.equal(await ingestCommittedFormSaves(f.db,{...f.scope,limit:1}),0);
  const late=await saveProfileSupport(f.db,{...f.command,expectedRevision:saved.revision,email:'backdated@local.hastabazaar.test',requestId:'backdated',now:f.command.now-10});
  await saveProfileSupport(f.db,{...f.command,expectedRevision:late.revision,email:'forward@local.hastabazaar.test',requestId:'forward',now:f.command.now+20});
  // A temporarily unreadable native outcome is not permanently discarded. All writes stay real.
  const unavailable=Object.create(f.db) as D1Database;
  unavailable.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.startsWith('SELECT 1 FROM seller_public_profile_events'))statement.first=async()=>null;return statement;}) as D1Database['prepare'];
  assert.equal(await ingestCommittedFormSaves(unavailable,{...f.scope,limit:1}),0);
  assert.deepEqual(copied(f),[]);
  assert.equal(await ingestCommittedFormSaves(f.db,{...f.scope,limit:1}),1);assert.deepEqual(copied(f),['backdated']);
  assert.equal(await ingestCommittedFormSaves(f.db,{...f.scope,limit:1}),0); // retained noop
  assert.equal(await ingestCommittedFormSaves(f.db,{...f.scope,limit:1}),1);assert.deepEqual(copied(f),['backdated','real-save']);
  assert.equal(await ingestCommittedFormSaves(f.db,{...f.scope,limit:1}),1);assert.deepEqual(copied(f),['backdated','real-save','forward']);
  const originalClock=f.sqlite.prepare("SELECT observed_at FROM form_health_observations WHERE evidence_id=(SELECT id FROM audit_logs WHERE request_id='real-save' AND command_key IS NOT NULL)").get()!.observed_at;
  assert.equal(originalClock,f.command.now+10);
 }finally{f.sqlite.close();}
});

for(const failure of ['rollback','lost-response','lease-stolen'] as const)void test(`scan checkpoint and original observation stay atomic after ${failure}`,async()=>{
 const f=await fixture();try{
  await saveProfileSupport(f.db,{...f.command,email:'atomic@local.hastabazaar.test',requestId:'real-save'});
  const originalReceipt=f.sqlite.prepare("SELECT * FROM audit_logs WHERE request_id='real-save' AND command_key IS NOT NULL").get();
  const interrupted=Object.create(f.db) as D1Database;
  interrupted.batch=(async(statements:D1PreparedStatement[])=>{
   if(failure==='rollback')return f.db.batch([...statements,f.db.prepare("INSERT INTO staff_permission_guards(id,valid) VALUES('abort-scan',0)")]);
   if(failure==='lease-stolen'){f.sqlite.exec("UPDATE operational_reminder_cursors SET lease_token='other-worker',revision=revision+1 WHERE family LIKE 'form-saves:%'");return f.db.batch(statements);}
   await f.db.batch(statements);throw new Error('Committed scan response lost');
  }) as D1Database['batch'];
  await assert.rejects(ingestCommittedFormSaves(interrupted,{...f.scope,limit:1}));
  assert.deepEqual(copied(f),failure==='lost-response'?['real-save']:[]);
  if(failure==='lease-stolen'){
   const busy=await sweepCommittedFormSaves(f.db,{...f.scope,limit:1});assert.equal(busy.busy,true);assert.equal(busy.scanned,0);
   f.sqlite.exec("UPDATE operational_reminder_cursors SET lease_until=0 WHERE family LIKE 'form-saves:%'");
  }
  assert.equal(await ingestCommittedFormSaves(f.db,{...f.scope,limit:1}),failure==='lost-response'?0:1);
  assert.deepEqual(copied(f),['real-save']);assert.equal(await ingestCommittedFormSaves(f.db,{...f.scope,limit:1}),0);
  assert.deepEqual(f.sqlite.prepare("SELECT * FROM audit_logs WHERE request_id='real-save' AND command_key IS NOT NULL").get(),originalReceipt);
  assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.sqlite.close();}
});

void test('expired deadline leaves originals unconsumed and unrelated cursor families unchanged',async()=>{
 const f=await fixture();try{
  await saveProfileSupport(f.db,{...f.command,email:'deadline@local.hastabazaar.test',requestId:'real-save'});
  f.sqlite.exec("INSERT INTO operational_reminder_cursors(family,cursor,revision,lease_token,lease_until) VALUES('dispatch','untouched',9,'reminder-worker',9999999999999)");
  const result=await evaluateFormHealth(f.db,{...f.scope,limit:1,deadlineMs:0});assert.equal(result.scanned,0);assert.equal(result.budgetExhausted,true);assert.deepEqual(copied(f),[]);
  assert.equal(await ingestCommittedFormSaves(f.db,{...f.scope,limit:1}),1);
  assert.deepEqual({...f.sqlite.prepare("SELECT * FROM operational_reminder_cursors WHERE family='dispatch'").get()!},{family:'dispatch',cursor:'untouched',revision:9,lease_token:'reminder-worker',lease_until:9999999999999});
  const cursor=f.sqlite.prepare("SELECT family,cursor FROM operational_reminder_cursors WHERE family LIKE 'form-saves:%'").get()!;assert.ok(String(cursor.family).length<191);assert.doesNotMatch(JSON.stringify(cursor),/deadline@|maker/);
 }finally{f.sqlite.close();}
});

void test('current native observations bypass stale versions before monitor and read limits without borrowing foreign scope',async()=>{
 const f=await fixture();try{
  const current=(await nativeFormContract(formId))!.version,stale=current===1?2:1;
  for(let i=0;i<101;i++)await recordFormLoadObservation(f.db,{...f.scope,now:i===0?f.command.now-100:f.command.now+i+10,formId,version:stale,outcome:'blocked',category:'read_unavailable'});
  await recordFormLoadObservation(f.db,{...f.scope,now:f.command.now+1,formId,version:current,outcome:'blocked',category:'read_unavailable'});
  await recordFormLoadObservation(f.db,{...f.scope,releaseId:'other-release',now:f.command.now+200,formId,version:current,outcome:'blocked',category:'read_unavailable'});
  await recordFormLoadObservation(f.db,{...f.scope,environment:'development',now:f.command.now+200,formId,version:current,outcome:'blocked',category:'read_unavailable'});
  const result=await evaluateFormHealth(f.db,{...f.scope,limit:1});assert.equal(result.scanned,1);assert.equal(result.budgetExhausted,false);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_observations').get()!.n,1);
  const [health]=await readFormHealth(f.db,'reviewer',{...f.scope,formId});assert.equal(health.state,'action_needed');assert.equal(health.lastLoad?.version,current);
  assert.equal((await evaluateFormHealth(f.db,{...f.scope,limit:1})).scanned,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_health_observations WHERE outcome=?').get('blocked')!.n,104,'Original stale and foreign facts are retained.');
 }finally{f.sqlite.close();}
});
