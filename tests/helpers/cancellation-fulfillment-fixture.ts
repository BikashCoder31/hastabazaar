import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {actionableOrderFixture} from './order-response-fixture';
import {cancellationPreview,cancelSelectedParcels} from '../../lib/cancellation/repository';
export const state={db:null as D1Database|null,actor:'reviewer'};
(globalThis as typeof globalThis&{cancellationFulfillmentFixture:typeof state}).cancellationFulfillmentFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.cancellationFulfillmentFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const actor=globalThis.cancellationFulfillmentFixture.actor;return{userId:actor,email:actor+"@local.hastabazaar.test",fullName:"Fictional actor",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 '@/lib/email/send-order-updates':'export async function sendPendingOrderUpdates(){}',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
export const origin='http://localhost:3018';
export function post(path:string,body:unknown,actor:string){return new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});}
export async function fixture(){const f=await actionableOrderFixture();state.db=f.db;state.actor='reviewer';assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));return f;}

export async function target(f:Awaited<ReturnType<typeof fixture>>,kind:'cancellation'|'fulfillment'){
  const requestId=crypto.randomUUID();let sourceId=f.orderId,body:Record<string,unknown>,actorId:string,path:string;
  if(kind==='cancellation'){
   sourceId='original-review';const sellers=[String(f.rows[0].sellerId)],p=await cancellationPreview(f.db,{orderNumber:f.order.orderNumber,customerId:'customer'},sellers);
   await cancelSelectedParcels(f.db,{orderNumber:f.order.orderNumber,customerId:'customer'},{sellerIds:sellers,fingerprint:p.fingerprint,requestId:sourceId,note:'Please review the original paid order before dispatch.',now:Date.now()});
   actorId='reviewer';body={reviewId:sourceId,action:'reject',note:'Original evidence supports keeping this paid order.',formVersion:1,customAnswers:[],clientAttemptId:requestId};path='/api/admin/cancellations';
  }else{actorId='registered-owner';body={requestId,action:'start_packing',itemIds:f.rows.map(row=>String(row.id)),note:'Started actual preparation of the selected items.'};path=`/api/seller/orders/${sourceId}/fulfillment`;}
  state.actor=actorId;
  const api=kind==='cancellation'?await import('../../app/api/admin/cancellations/route'):await import('../../app/api/seller/orders/[id]/fulfillment/route');
  const context={params:Promise.resolve({id:sourceId})};
return{requestId,sourceId,body,actorId,path,api,context};
}
