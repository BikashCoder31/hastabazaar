import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {getProductPublicationReview} from '../lib/products/publication';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
declare global {var productIntentDb:D1Database;var productIntentActor:string;var productIntentStaff:(permission:string)=>Promise<{id:string;role:string}>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.productIntentDb}}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return{userId:globalThis.productIntentActor}};export async function requireAuthenticatedUser(){return{userId:globalThis.productIntentActor}}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(){throw new Error("Unexpected fixture redirect")}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(permission){try{return await globalThis.productIntentStaff(permission)}catch(error){throw new StaffAuthorizationError(error.message)}}',shortCircuit:true};
 return next(specifier,context);
}});
const nativeRequest=(path:string,body:unknown,actor:string)=>new Request('https://product-intent.test'+path,{method:'POST',headers:{Origin:'https://product-intent.test','Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});

void test('actual delayed A Product decision under authenticated B rejects; identical A retry records once and recovers',async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);try{globalThis.productIntentDb=f.db;globalThis.productIntentActor='reviewer';const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId),requestId='exact-original-product-intent',body={action:'request_changes',caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),expectedRevision:String(view.revision),checks:null,reason:'PRIVATE-ORIGINAL-A review findings must never be submitted as another signed-in staff member.',requestId};
  let enter=()=>{},release=()=>{};const entered=new Promise<void>(resolve=>enter=resolve),gate=new Promise<void>(resolve=>release=resolve);
  globalThis.productIntentStaff=async permission=>{enter();await gate;const proof=await staffMutationGuard(f.db,globalThis.productIntentActor,permission as never,Error);return{id:globalThis.productIntentActor,role:proof.role};};
  const api=await import('../app/api/admin/product-publications/route'),pending=api.POST(nativeRequest('/api/admin/product-publications',body,'reviewer'));await entered;globalThis.productIntentActor='delegate';release();const denied=await pending;assert.equal(denied.status,403);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='product.publication.request_changes'").get()!.n,0);
  globalThis.productIntentActor='reviewer';const first=await api.POST(nativeRequest('/api/admin/product-publications',body,'reviewer')),replay=await api.POST(nativeRequest('/api/admin/product-publications',body,'reviewer'));assert.equal(first.status,200);assert.equal(replay.status,200);assert.deepEqual(await first.json(),await replay.json());assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='product.publication.request_changes' AND request_id=?").get(requestId)!.n,1);
  const outcomes=await import('../app/api/admin/product-command-outcomes/route'),url='https://product-intent.test/api/admin/product-command-outcomes?'+new URLSearchParams({kind:'publication_review',action:'request_changes',sourceId:f.sent.caseId,requestId}),recorded=await outcomes.GET(new Request(url,{headers:{'X-Hastabazaar-Actor':'reviewer'}}));assert.equal(recorded.status,200);assert.deepEqual(await recorded.json(),{requestId,status:'recorded'});
  globalThis.productIntentActor='delegate';assert.equal((await outcomes.GET(new Request(url,{headers:{'X-Hastabazaar-Actor':'reviewer'}}))).status,403);
 }finally{f.dispose();}
});

void test('actual optional first-draft autosave cannot put A private fields in B account; same A empty intake stays optional and idempotent',async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);try{globalThis.productIntentDb=f.db;const api=await import('../app/api/seller/product-intakes/workspace/route'),before=f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_drafts').get()!.n,body={action:'save',requestId:'new-private-original-a',expectedRevision:null,draftId:null,categoryId:null,answers:{},offers:{axes:[],offers:[]},mediaIds:[],privateReview:{note:'PRIVATE-ORIGINAL-A incomplete optional product facts'}};
  globalThis.productIntentActor='maker-user';assert.equal((await api.POST(nativeRequest('/api/seller/product-intakes/workspace',body,'registered-owner'))).status,403);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_drafts').get()!.n,before);
  globalThis.productIntentActor='registered-owner';const first=await api.POST(nativeRequest('/api/seller/product-intakes/workspace',body,'registered-owner')),replay=await api.POST(nativeRequest('/api/seller/product-intakes/workspace',body,'registered-owner'));assert.equal(first.status,200);assert.equal(replay.status,200);assert.deepEqual(await first.json(),await replay.json());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_drafts').get()!.n,Number(before)+1);
 }finally{f.dispose();}
});
