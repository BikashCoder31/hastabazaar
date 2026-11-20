import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
declare global{var payoutApiDb:D1Database;var payoutApiActor:string;var payoutApiAuthorize:(permission:string)=>Promise<{id:string;role:string}|null>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.payoutApiDb},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3018"}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{status=403};export async function requireStaffApi(permission){const actor=await globalThis.payoutApiAuthorize(permission);if(!actor)throw new StaffAuthorizationError("Current staff authority required.");return actor}',shortCircuit:true};
 return next(specifier,context);
}});
void test('payout route rejects forged context, preserves exact request recovery and rechecks current decision authority',async()=>{
 const f=await payoutTransferFixture();try{
 globalThis.payoutApiDb=f.db;globalThis.payoutApiActor='reviewer';globalThis.payoutApiAuthorize=async(permission)=>{try{const authority=await staffMutationGuard(f.db,globalThis.payoutApiActor,permission as never,Error);return {id:globalThis.payoutApiActor,role:authority.role};}catch{return null;}};
 const path='../app/api/admin/payout-transfers/route';const route=await import(path),url='http://localhost:3018/api/admin/payout-transfers';
 const post=(body:unknown,origin='http://localhost:3018')=>route.POST(new Request(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 const input={model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Review original native earning sources and verified actual funding.'},body={sourceFormId:'system.payout-finance',action:'prepare',requestId:'route-payout-prepare',expectedRevision:null,input};
 assert.equal((await post(body,'https://untrusted.example')).status,403);
 assert.equal((await post({...body,actorId:'payout-owner'})).status,400);
 assert.equal((await post({...body,input:{...input,amountPaisa:1}})).status,400);
 const response=await post(body);assert.equal(response.status,200);const saved=await response.json();
 assert.deepEqual(await(await post(body)).json(),saved);
 assert.equal((await post({...body,input:{...input,reason:'Changed original command content must not reuse the saved reference.'}})).status,409);
 assert.deepEqual((await(await route.GET(new Request(url+'?attempt='+body.requestId))).json()).outcome,saved);
 const approval={sourceFormId:'system.payout-finance',action:'approve',requestId:'route-payout-approve',expectedRevision:'0',input:{packetId:saved.id,reason:'Approve the exact current original payout as the eligible Super Admin.'}};
 assert.equal((await post(approval)).status,200);
 f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'; INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','admin',1)");
 assert.equal((await post(approval)).status,403);
 assert.equal((await route.GET(new Request(url+'?attempt='+approval.requestId))).status,403);
 globalThis.payoutApiActor='payout-owner';assert.equal((await route.GET(new Request(url+'?attempt='+body.requestId))).status,403);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_transfer_packets').get()!.n,1);
 }finally{f.dispose();}
});
