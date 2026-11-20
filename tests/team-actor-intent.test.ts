import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import type {Permission} from '../lib/marketplace/permissions';

declare global {
 var teamIntentDb:D1Database;
 var teamIntentActor:string;
 var teamIntentAuthority:(permission:Permission)=>Promise<{id:string;role:string;authSubject:string}>;
}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.teamIntentDb},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://team-intent.test"}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(permission){return globalThis.teamIntentAuthority(permission)}',shortCircuit:true};
 return next(specifier,context);
}});
const origin='https://team-intent.test';
async function fixture(){
 const f=await completeVersionFixture(Date.now()-60000);
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 // Both fictional accounts are genuinely eligible; role denial cannot mask an account switch.
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('delegate','super_admin',?)").run(f.now);
 f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES('team-intent-form','staff.team-governance',1,'published',?,'Fictional Team contract','reviewer',?,'reviewer',?,'reviewer',?,'team-intent-publish')")
  .run(JSON.stringify({formId:'staff.team-governance',fields:[]}),f.now,f.now,f.now);
 globalThis.teamIntentDb=f.db;globalThis.teamIntentActor='reviewer';
 globalThis.teamIntentAuthority=async permission=>{const id=globalThis.teamIntentActor,proof=await staffMutationGuard(f.db,id,permission,Error);return{id,role:proof.role,authSubject:id};};
 return f;
}
function request(actor:string,requestId=crypto.randomUUID()){
 return new Request(origin+'/api/admin/team/governance',{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify({action:'save_duty',sourceId:'products',expectedRevision:null,requestId,reason:'Original private roster choice from the displayed account.',primaryId:'reviewer',backupIds:[],formVersion:1,customAnswers:[]})});
}
void test('Team rejects displayed A intent after authentication changes to equally eligible B before native write',async()=>{
 const f=await fixture();try{
  const api=await import('../app/api/admin/team/governance/route');globalThis.teamIntentActor='delegate';
  const response=await api.POST(request('reviewer'));
  assert.equal(response.status,403,await response.text());
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_events WHERE action='save_duty'").get()!.n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='team.save_duty'").get()!.n,0);
 }finally{f.dispose();}
});
void test('Team outcome read rejects old displayed account intent instead of reporting a misleading absent receipt',async()=>{
 const f=await fixture();try{
  const api=await import('../app/api/admin/team/governance/route'),requestId=crypto.randomUUID();
  assert.equal((await api.POST(request('reviewer',requestId))).status,200);
  globalThis.teamIntentActor='delegate';
  const response=await api.GET(new Request(origin+'/api/admin/team/governance?requestId='+requestId,{headers:{'X-Hastabazaar-Actor':'reviewer'}}));
  assert.equal(response.status,403,await response.text());
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='team.save_duty'").get()!.n,1);
 }finally{f.dispose();}
});
void test('Team matching displayed account keeps native save and exact original replay',async()=>{
 const f=await fixture();try{
  const api=await import('../app/api/admin/team/governance/route'),requestId=crypto.randomUUID();globalThis.teamIntentActor='delegate';
  const first=await api.POST(request('delegate',requestId)),again=await api.POST(request('delegate',requestId));
  assert.equal(first.status,200);assert.equal(again.status,200);
  assert.deepEqual(await first.json(),await again.json());
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='team.save_duty' AND actor_id='delegate'").get()!.n,1);
 }finally{f.dispose();}
});
void test('Team separates an actual committed lost acknowledgement from a native rejection before writing',async()=>{
 const f=await fixture();try{
  const api=await import('../app/api/admin/team/governance/route'),invalid=request('reviewer');
  const invalidPayload=await invalid.json() as Record<string,unknown>;invalidPayload.backupIds=['reviewer'];
  const rejected=await api.POST(new Request(invalid.url,{method:'POST',headers:invalid.headers,body:JSON.stringify(invalidPayload)}));
  assert.equal(rejected.status,409);assert.equal((await rejected.json() as {phase:string}).phase,'rejected_before_write');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='team.save_duty'").get()!.n,0);
  const wrapped=Object.create(f.db) as D1Database;let committed=false;
  wrapped.prepare=(sql:string)=>{if(committed&&sql.includes('SELECT command_digest AS digest'))throw new Error('Fictional original outcome reader unavailable after COMMIT.');return f.db.prepare(sql);};
  wrapped.batch=(async(statements:D1PreparedStatement[])=>{await f.db.batch(statements);committed=true;throw new Error('Fictional acknowledgement lost after actual COMMIT.');}) as D1Database['batch'];
  globalThis.teamIntentDb=wrapped;const requestId=crypto.randomUUID(),uncertain=await api.POST(request('reviewer',requestId));
  assert.equal(committed,true);assert.equal(uncertain.status,503);assert.equal((await uncertain.json() as {phase:string}).phase,'outcome_unconfirmed');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='team.save_duty'").get()!.n,1);
  globalThis.teamIntentDb=f.db;
  const recovered=await api.GET(new Request(origin+'/api/admin/team/governance?'+new URLSearchParams({requestId,action:'save_duty',sourceId:'products'}),{headers:{'X-Hastabazaar-Actor':'reviewer'}}));
  assert.equal(recovered.status,200);const body=await recovered.json() as {saved:boolean;reference:unknown};assert.equal(body.saved,true);assert.deepEqual(body.reference,{actorId:'reviewer',requestId,action:'save_duty',sourceId:'products'});
  const wrongSource=await api.GET(new Request(origin+'/api/admin/team/governance?'+new URLSearchParams({requestId,action:'save_duty',sourceId:'orders'}),{headers:{'X-Hastabazaar-Actor':'reviewer'}}));
  assert.equal(wrongSource.status,409);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='team.save_duty'").get()!.n,1);
 }finally{f.dispose();}
});
