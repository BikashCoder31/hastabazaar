import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
declare global{var sellerWorkDb:D1Database;var sellerWorkIdentity:{userId:string}|null;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.sellerWorkDb}}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(){throw new Error("Unexpected fixture redirect")}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.sellerWorkIdentity};export async function requireAuthenticatedUser(){return globalThis.sellerWorkIdentity}',shortCircuit:true};
 return next(specifier,context);
}});
void test('actual work-list GET enforces current Seller Center access and never accepts client actor selection',async()=>{
 const f=await completeVersionFixture(Date.now());try{globalThis.sellerWorkDb=f.db;const {GET}=await import('../app/api/seller/workspace-tasks/route');
 const get=(query='')=>GET(new Request('https://seller-work.test/api/seller/workspace-tasks?view=all'+query));
 globalThis.sellerWorkIdentity=null;assert.equal((await get()).status,401);
 globalThis.sellerWorkIdentity={userId:'registered-owner'};const response=await get('&actorId=reviewer');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.ok(body&&typeof body==='object'&&'tasks'in body&&Array.isArray(body.tasks));assert.equal(body.tasks.some((task:{family:string})=>task.family==='payout'),true);assert.doesNotMatch(JSON.stringify(body),/stamp|auth_subject|processingNote|evidence_reference/);
 assert.equal((await get('&cursor=invalid')).status,409);
 f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='registered-owner'").run();assert.equal((await get()).status,403);
 }finally{globalThis.sellerWorkIdentity=null;f.dispose();}
});
