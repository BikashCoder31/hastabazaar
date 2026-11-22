import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {createStaffInvitation} from '../lib/db/repositories/staff';
import {saveFormDraft} from '../lib/db/repositories/form-catalog';

const state={db:null as D1Database|null,subject:'reviewer',email:'reviewer@local.hastabazaar.test'};
(globalThis as typeof globalThis&{catalogAuthorizationFixture:typeof state}).catalogAuthorizationFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.catalogAuthorizationFixture.db},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://catalog-intent.test"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:globalThis.catalogAuthorizationFixture.subject,email:globalThis.catalogAuthorizationFixture.email,fullName:"Fictional catalogue reviewer",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
};return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
const origin='https://catalog-intent.test';
function snapshot(f:Awaited<ReturnType<typeof completeVersionFixture>>){const hash=(table:string)=>createHash('sha256').update(JSON.stringify(f.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).digest('hex');return{users:hash('users'),roles:hash('user_roles'),invitations:hash('staff_invitations'),versions:hash('form_config_versions')};}
async function fixture(){const f=await completeVersionFixture(Date.now());assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));state.db=f.db;state.subject='reviewer';state.email='reviewer@local.hastabazaar.test';return f;}
async function pendingInvitation(f:Awaited<ReturnType<typeof fixture>>){state.email='pending-catalog@local.hastabazaar.test';await createStaffInvitation(f.db,{email:state.email,role:'super_admin',permissions:[],invitedBy:'reviewer',actorAuthSubject:'reviewer',now:Date.now(),requestId:'catalog-pending-invitation'});state.subject='pending-catalog-external';}
function mutation(actor:string){return new Request(origin+'/api/admin/forms/public.contact/draft',{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify({requestId:'catalog-current-draft',expectedPublishedVersion:0,reason:'Maintain the current optional contact questions.',config:{formId:'public.contact',fields:[]}})});}

for(const target of ['collection','detail'] as const)void test(`catalog ${target} GET without an intent header cannot accept a pending invitation`,async()=>{
 const f=await fixture();try{await pendingInvitation(f);const before=snapshot(f);const response=target==='collection'?await(await import('../app/api/admin/forms/route')).GET(new Request(origin+'/api/admin/forms')):await(await import('../app/api/admin/forms/[formId]/route')).GET(new Request(origin+'/api/admin/forms/public.contact'),{params:Promise.resolve({formId:'public.contact'})});assert.equal(response.status,403);assert.deepEqual(snapshot(f),before,'A read must not create a user, grant a role, accept an invitation or change catalogue state.');}finally{state.db=null;f.dispose();}
});
void test('catalog automatic HEAD read cannot accept a pending invitation without an intent header',async()=>{
 const f=await fixture();try{await pendingInvitation(f);const before=snapshot(f);const response=await(await import('../app/api/admin/forms/route')).GET(new Request(origin+'/api/admin/forms',{method:'HEAD'}));assert.equal(response.status,403);assert.deepEqual(snapshot(f),before);}finally{state.db=null;f.dispose();}
});
void test('old displayed catalogue actor cannot accept a newly authenticated pending invitation before rejection',async()=>{
 const f=await fixture();try{await pendingInvitation(f);const before=snapshot(f),response=await(await import('../app/api/admin/forms/[formId]/draft/route')).POST(mutation('reviewer'),{params:Promise.resolve({formId:'public.contact'})});assert.equal(response.status,403);assert.deepEqual(snapshot(f),before);}finally{state.db=null;f.dispose();}
});
void test('catalogue current role remains authoritative and matching actor keeps native draft save',async()=>{
 const f=await fixture();try{f.sqlite.exec("UPDATE users SET auth_subject='catalog-current-b' WHERE id='foreign';INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',1)");state.subject='catalog-current-b';state.email='foreign@local.hastabazaar.test';const api=await import('../app/api/admin/forms/[formId]/draft/route'),context={params:Promise.resolve({formId:'public.contact'})};const before=snapshot(f);assert.equal((await api.POST(mutation('reviewer'),context)).status,403);assert.deepEqual(snapshot(f),before);assert.equal((await api.POST(mutation('foreign'),context)).status,201);assert.equal(f.sqlite.prepare("SELECT created_by FROM form_config_versions WHERE form_id='public.contact'").get()?.created_by,'foreign');f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='foreign' AND role='super_admin'").run();const denied=snapshot(f);assert.equal((await api.POST(mutation('foreign'),context)).status,403);assert.deepEqual(snapshot(f),denied);}finally{state.db=null;f.dispose();}
});
void test('catalogue private history is not returned after authority changes during its real read',async()=>{
 const f=await fixture();try{
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',1)").run();
  await saveFormDraft(f.db,{formId:'public.contact',actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,reason:'Maintain an unpublished operational question.',requestId:'catalog-private-history',now:Date.now(),config:{formId:'public.contact',fields:[{id:'private_prompt',key:'private_prompt',label:'Unpublished operational prompt',type:'short_text',required:false,status:'active',order:0}]}});
  let revoked=false;const prepare=f.db.prepare.bind(f.db);
  const watch=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(target,property){if(property==='bind')return(...values:Parameters<D1PreparedStatement['bind']>)=>watch(target.bind(...values));if(property==='all')return async<T>()=>{const result=await target.all<T>();f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();revoked=true;return result;};if(property==='first')return target.first.bind(target);if(property==='run')return target.run.bind(target);if(property==='raw')return target.raw.bind(target);return Reflect.get(target,property);}});
  f.db.prepare=sql=>sql.includes('FROM form_config_versions WHERE form_id = ? ORDER BY')?watch(prepare(sql)):prepare(sql);
  const response=await(await import('../app/api/admin/forms/[formId]/route')).GET(new Request(origin+'/api/admin/forms/public.contact',{headers:{'X-Hastabazaar-Actor':'reviewer'}}),{params:Promise.resolve({formId:'public.contact'})});const body=await response.text();assert.equal(revoked,true);assert.equal(response.status,403,`Private unpublished projection present: ${body.includes('Unpublished operational prompt')}`);assert.doesNotMatch(body,/Unpublished operational prompt/);
 }finally{state.db=null;f.dispose();}
});
