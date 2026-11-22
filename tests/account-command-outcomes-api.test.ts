import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {publishAccountForms} from './helpers/account-workspace-fixture';
import {resolvePublishedForm} from '../lib/forms/runtime';
const fixture={db:null as D1Database|null,actor:'customer'};
(globalThis as typeof globalThis&{accountOutcomeFixture:typeof fixture}).accountOutcomeFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.accountOutcomeFixture.db}}',
 'next/navigation':'export function redirect(path){throw Error(path)}',
 '@/app/auth':'export async function getAuthenticatedUser(){const id=globalThis.accountOutcomeFixture.actor;return{userId:id,email:id+"@local.hastabazaar.test",fullName:"Fictional original account"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('actual account outcome GET is actor-intended, no-store and read-only, including unknown identity and current-role denial',async()=>{
 const f=await completeVersionFixture(Date.now());try{fixture.db=f.db;fixture.actor='customer';await publishAccountForms(f,['account.profile']);const form=await resolvePublishedForm(f.db,'account.profile'),profile=await import('../app/api/account/profile/route');
  const response=await profile.PATCH(new Request('http://localhost:3018/api/account/profile',{method:'PATCH',headers:{origin:'http://localhost:3018','Content-Type':'application/json','X-Hastabazaar-Actor':'customer'},body:JSON.stringify({displayName:'PRIVATE native original profile',phone:'',locale:'en-NP',idempotencyKey:'native-api-account-original',formVersion:form.version,customAnswers:[]})}));assert.equal(response.status,200,await response.text());
  const {GET}=await import('../app/api/account/command-outcomes/route'),url='http://localhost:3018/api/account/command-outcomes?'+new URLSearchParams({action:'profile.update',sourceId:'customer',requestId:'native-api-account-original'}),request=(actor='customer')=>new Request(url,{headers:{'X-Hastabazaar-Actor':actor}}),before={users:f.sqlite.prepare('SELECT COUNT(*)n FROM users').get()?.n,roles:f.sqlite.prepare('SELECT COUNT(*)n FROM user_roles').get()?.n,audits:f.sqlite.prepare('SELECT COUNT(*)n FROM audit_logs').get()?.n};
  const traces:string[]=[];fixture.db={prepare(sql:string){traces.push(sql);return f.db.prepare(sql);},batch:f.db.batch.bind(f.db)}as D1Database;
  const saved=await GET(request());assert.equal(saved.status,200,JSON.stringify({body:await saved.clone().text(),traces}));assert.match(saved.headers.get('Cache-Control')??'',/no-store/);assert.deepEqual(await saved.json(),{requestId:'native-api-account-original',status:'recorded'});
  fixture.actor='foreign';assert.equal((await GET(request())).status,403);const own=new URL(url);own.searchParams.set('sourceId','foreign');const foreign=await GET(new Request(own,{headers:{'X-Hastabazaar-Actor':'foreign'}}));assert.equal(foreign.status,200);assert.deepEqual(await foreign.json(),{requestId:'native-api-account-original',status:'unconfirmed'});
  fixture.actor='new-unprovisioned-identity';assert.ok([401,403].includes((await GET(request('new-unprovisioned-identity'))).status));
  assert.deepEqual({users:f.sqlite.prepare('SELECT COUNT(*)n FROM users').get()?.n,roles:f.sqlite.prepare('SELECT COUNT(*)n FROM user_roles').get()?.n,audits:f.sqlite.prepare('SELECT COUNT(*)n FROM audit_logs').get()?.n},before);
  fixture.actor='customer';f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='customer' AND role='customer'").run();assert.equal((await GET(request())).status,403);
 }finally{fixture.db=null;f.dispose();}
});
