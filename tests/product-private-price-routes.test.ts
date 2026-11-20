import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {saveProductIntakeDraft} from '../lib/products/category-contracts';
declare global{var privatePriceDb:D1Database;var privatePriceActor:string|null;}
registerHooks({resolve(specifier,context,next){const source=specifier==='cloudflare:workers'?'export const env={get DB(){return globalThis.privatePriceDb}}':specifier==='@/app/auth'?"export async function getAuthenticatedUser(){const actor=globalThis.privatePriceActor;return actor?{userId:actor,email:actor+'@local.hastabazaar.test',fullName:'Fictional owner',mailboxVerified:true}:null};export const requireAuthenticatedUser=getAuthenticatedUser;":specifier==='next/navigation'?"export function redirect(url){throw Error(url)};":null;return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(specifier,context);}});
void test('private-price HTTP requests reject foreign access, unknown fields, duplicate refs and unsafe writes',async()=>{
 const f=await completeVersionFixture();globalThis.privatePriceDb=f.db;try{
  const route=await import('../app/api/seller/price-guidance/route'),ctx={actorId:'registered-owner',requestId:'http-price-draft',expectedRevision:null,now:f.now},draft=await saveProductIntakeDraft(f.db,ctx,{draftId:null,sellerId:'registered',categoryId:null,answers:{}}),subject={kind:'intake',id:draft.id,offerId:'base'},url='http://localhost:3018/api/seller/price-guidance',body={subject,cost:'600',target:'400',requestId:'http-private-price',expectedRevision:null};
  const get=()=>new Request(url+'?'+new URLSearchParams(subject)),post=(input:unknown=body,origin='http://localhost:3018')=>new Request(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(input)});
  globalThis.privatePriceActor=null;assert.equal((await route.GET(get())).status,401);
  for(const actor of ['foreign','reviewer','delegate']){globalThis.privatePriceActor=actor;assert.equal((await route.GET(get())).status,403);assert.equal((await route.POST(post())).status,403);}
  globalThis.privatePriceActor=ctx.actorId;assert.equal((await route.POST(post(body,'https://untrusted.example'))).status,403);assert.equal((await route.POST(post({...body,actorId:'reviewer'}))).status,400);assert.equal((await route.GET(new Request(get().url+'&id=another'))).status,400);
  const saved=await route.POST(post());assert.equal(saved.status,200);assert.equal(saved.headers.get('cache-control'),'no-store');assert.deepEqual(await(await route.POST(post())).json(),await saved.json());
  const opened=await route.GET(get());assert.equal(opened.status,200);assert.equal((await opened.json() as {inputs:{cost:string}}).inputs.cost,'600');assert.equal((await route.POST(post({...body,requestId:'http-private-stale',cost:'700'}))).status,409);
 }finally{f.dispose();}
});
