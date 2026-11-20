import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {resolvePublishedForm} from '../lib/forms/runtime';
import {publishAccountForms} from './helpers/account-workspace-fixture';
const fixture={db:null as D1Database|null,subject:'external-foreign',email:'foreign@local.hastabazaar.test'};
(globalThis as typeof globalThis&{accountIntentFixture:typeof fixture}).accountIntentFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.accountIntentFixture.db}};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const f=globalThis.accountIntentFixture;return{userId:f.subject,email:f.email,fullName:"Fictional current identity"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
function request(path:string,method:string,actor:string,body?:unknown){return new Request('http://localhost:3018'+path,{method,headers:{origin:'http://localhost:3018','content-type':'application/json','X-Hastabazaar-Actor':actor},...(body===undefined?{}:{body:JSON.stringify(body)})});}

void test('account native profile, new address and privacy commands reject former-account content before writing',async t=>{
 const f=await completeVersionFixture();fixture.db=f.db;fixture.subject='external-foreign';fixture.email='foreign@local.hastabazaar.test';f.sqlite.exec("UPDATE users SET auth_subject='external-foreign' WHERE id='foreign'");
 try{
  await publishAccountForms(f,['account.profile','account.address','account.privacy-request']);
  const {PATCH}=await import('../app/api/account/profile/route'),{POST:address}=await import('../app/api/account/addresses/route'),{POST:privacy}=await import('../app/api/account/privacy/route');
  const profile=await resolvePublishedForm(f.db,'account.profile'),addressForm=await resolvePublishedForm(f.db,'account.address'),privacyForm=await resolvePublishedForm(f.db,'account.privacy-request');
  const cases=[
   {name:'profile',path:'/api/account/profile',method:'PATCH',run:PATCH,status:200,body:{displayName:'Former account private name',phone:'',locale:'en-NP',idempotencyKey:'account-profile-intent',formVersion:profile.version,customAnswers:[]}},
   {name:'new address',path:'/api/account/addresses',method:'POST',run:address,status:201,body:{address:{label:'Fictional home',recipientName:'Former private recipient',phone:'9812345678',province:'Koshi',district:'Morang',municipality:'Biratnagar',ward:'4',locality:'Fictional private address',isDefault:false},idempotencyKey:'account-address-intent',formVersion:addressForm.version,customAnswers:[]}},
   {name:'privacy request',path:'/api/account/privacy',method:'POST',run:privacy,status:201,body:{requestType:'access',detail:'Please supply the requested fictional account data through the protected account workflow.',requestId:'account-privacy-intent',formVersion:privacyForm.version,customAnswers:[]}},
  ];
  for(const item of cases)await t.test(item.name,async()=>{
   const before=f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()!.n,denied=await item.run(request(item.path,item.method,'customer',item.body));
   assert.equal(denied.status,403,await denied.clone().text());assert.equal((await denied.json() as {code:unknown}).code,'access_denied_before_write');assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()!.n,before);
   const accepted=await item.run(request(item.path,item.method,'foreign',item.body));assert.equal(accepted.status,item.status,await accepted.text());
   const count=f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()!.n;
   assert.equal((await item.run(request(item.path,item.method,'foreign',item.body))).status,item.status);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()!.n,count);
  });
  const addressId=String(f.sqlite.prepare("SELECT id FROM addresses WHERE user_id='foreign'").get()!.id),context={params:Promise.resolve({id:addressId})};
  const {PATCH:edit,DELETE:remove}=await import('../app/api/account/addresses/[id]/route');
  const edits=[
   {name:'owned address edit',method:'PATCH',run:(req:Request)=>edit(req,context),body:{address:{label:'Updated fictional home',recipientName:'Current recipient',phone:'9812345678',province:'Koshi',district:'Morang',municipality:'Biratnagar',ward:'4',locality:'Current private address',isDefault:false},idempotencyKey:'account-address-edit-intent',formVersion:addressForm.version,customAnswers:[]}},
   {name:'owned address deletion',method:'DELETE',run:(req:Request)=>remove(req,context),body:{idempotencyKey:'account-address-delete-intent'}},
  ];
  for(const item of edits)await t.test(item.name,async()=>{
   const before=f.sqlite.prepare('SELECT total_changes() AS n').get()!.n;
   const denied=await item.run(request('/api/account/addresses/'+addressId,item.method,'customer',item.body));assert.equal(denied.status,403,await denied.clone().text());assert.equal((await denied.json() as {code:unknown}).code,'access_denied_before_write');assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get()!.n,before);
   const accepted=await item.run(request('/api/account/addresses/'+addressId,item.method,'foreign',item.body));assert.equal(accepted.status,200,await accepted.text());
   const count=f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()!.n;
   const replay=await item.run(request('/api/account/addresses/'+addressId,item.method,'foreign',item.body));assert.equal(replay.status,200,await replay.text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()!.n,count);
  });
 }finally{fixture.db=null;f.dispose();}
});

void test('wrong account intent cannot provision a newly authenticated user or customer role',async()=>{
 const f=await completeVersionFixture();fixture.db=f.db;fixture.subject='new-external-identity';fixture.email='new-identity@local.hastabazaar.test';try{
  await publishAccountForms(f,['account.profile']);
  const {PATCH}=await import('../app/api/account/profile/route'),form=await resolvePublishedForm(f.db,'account.profile');
  const before=f.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()!.n,roles=f.sqlite.prepare('SELECT COUNT(*) AS n FROM user_roles').get()!.n;
  const result=await PATCH(request('/api/account/profile','PATCH','customer',{displayName:'Former private name',phone:'',locale:'en-NP',idempotencyKey:'no-provision-intent',formVersion:form.version,customAnswers:[]}));
  assert.equal(result.status,403,await result.text());assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()!.n,before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM user_roles').get()!.n,roles);
 }finally{fixture.db=null;f.dispose();}
});

void test('contact-status read uses the internal account intent without revealing another external identity contact',async()=>{
 const f=await completeVersionFixture();fixture.db=f.db;fixture.subject='external-foreign';fixture.email='foreign@local.hastabazaar.test';f.sqlite.exec("UPDATE users SET auth_subject='external-foreign' WHERE id='foreign'");try{
  const {GET,POST}=await import('../app/api/account/contact-verification/route');
  const current=await GET(request('/api/account/contact-verification','GET','foreign'));assert.equal(current.status,200,await current.clone().text());
  const denied=await GET(request('/api/account/contact-verification','GET','customer'));assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/foreign@local/);
  const before=f.sqlite.prepare('SELECT total_changes() AS n').get()!.n;
  const changed=await POST(request('/api/account/contact-verification','POST','customer',{action:'verify',channel:'email',token:'A'.repeat(43),code:'123456'}));
  assert.equal(changed.status,403,await changed.clone().text());assert.match(await changed.text(),/signed-in account changed/);
  assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get()!.n,before,'Wrong-account verification cannot consume another account rate limit or alter its contact.');
 }finally{fixture.db=null;f.dispose();}
});
