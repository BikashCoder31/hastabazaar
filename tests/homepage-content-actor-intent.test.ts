import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import {completeVersionFixture} from './helpers/complete-version-fixture';
const fixture={db:null as D1Database|null,subject:'external-home-b'};
(globalThis as typeof globalThis&{homepageIntentFixture:typeof fixture}).homepageIntentFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.homepageIntentFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:globalThis.homepageIntentFixture.subject,email:"foreign@local.hastabazaar.test",fullName:"Fictional current editor"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
function request(path:string,actor:string,body?:FormData){return new Request('http://localhost:3018'+path,{method:body?'POST':'GET',headers:{origin:'http://localhost:3018','X-Hastabazaar-Actor':actor},...(body?{body}:{})});}
void test('actual homepage media reads and upload intake reject a former staff actor before private bytes',{timeout:60_000},async t=>{
 const f=await completeVersionFixture();assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));f.sqlite.exec(await readFile('drizzle/0055_homepage_hero_carousel.sql','utf8'));fixture.db=f.db;f.sqlite.exec("UPDATE users SET auth_subject='external-home-b' WHERE id='foreign'; INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',1)");
 try{
  const staff=await import('../lib/auth/staff');assert.equal((await staff.requireStaffApi('business_settings.view')).id,'foreign');
  const repository=await import('../lib/db/repositories/homepage-hero');assert.ok(Array.isArray(await repository.listHomepageHeroMediaForAdmin(f.db)));
  const collection=await import('../app/api/admin/homepage/hero-media/route'),item=await import('../app/api/admin/homepage/hero-media/[id]/route');
  const valid=await Reflect.apply(collection.GET,undefined,[request('/api/admin/homepage/hero-media','foreign')]);assert.equal(valid.status,200,await valid.clone().text());
  await t.test('collection reads bind the rendered internal actor',async()=>{
   const denied=await Reflect.apply(collection.GET,undefined,[request('/api/admin/homepage/hero-media','reviewer')]);assert.equal(denied.status,403,await denied.text());
  });
  await t.test('draft asset reads bind the rendered internal actor before source lookup',async()=>{
   const asset=await item.GET(request('/api/admin/homepage/hero-media/unavailable','reviewer'),{params:Promise.resolve({id:'unavailable'})});assert.equal(asset.status,403,await asset.text());
  });
  await t.test('a current editor revoked during the private collection read cannot receive its result',async()=>{
   let raced=false;fixture.db={prepare(sql:string){const statement=f.db.prepare(sql);if(!/FROM\s+homepage_hero_media/i.test(sql))return statement;return new Proxy(statement,{get(target,key){if(key==='all')return async()=>{const rows=await target.all();raced=true;f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='foreign'");return rows;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});},batch:f.db.batch.bind(f.db)} as D1Database;
   try{const response=await Reflect.apply(collection.GET,undefined,[request('/api/admin/homepage/hero-media','foreign')]);assert.equal(raced,true);assert.equal(response.status,403,await response.text());}finally{fixture.db=f.db;f.sqlite.exec("UPDATE users SET status='active' WHERE id='foreign'");}
  });
  await t.test('upload rejects the old actor before consuming the multipart body',async()=>{
   const form=new FormData();form.set('file',new File(['Fictional former editor bytes'],'private.jpg',{type:'image/jpeg'}));const input=request('/api/admin/homepage/hero-media','reviewer',form),originalBody=input.body;let reads=0;Object.defineProperty(input,'body',{get(){reads++;return originalBody;}});
   const before=f.sqlite.prepare('SELECT COUNT(*)n FROM homepage_hero_media').get()!.n,response=await collection.POST(input);
   assert.equal(response.status,403,await response.text());assert.equal(reads,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*)n FROM homepage_hero_media').get()!.n,before);
  });
 }finally{fixture.db=null;f.dispose();}
});
