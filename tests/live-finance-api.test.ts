import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {FORM_REGISTRY,IMPLEMENTED_FORM_ADAPTERS} from '../lib/forms/registry';
declare global{var liveFinanceRouteDb:D1Database;var liveFinanceRouteActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.liveFinanceRouteDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){return{id:globalThis.liveFinanceRouteActor}}',shortCircuit:true};
 return next(specifier,context);
}});
void test('actual finance and original invoice correction forms are registered as protected fixed server contracts',()=>{
 for(const [id,path] of [['system.managed-live-finance','/api/admin/managed-makers/[id]/finance'],['system.live-invoice-adjustment','/api/admin/invoices/[id]/live-adjustments']]){
  assert.equal(FORM_REGISTRY[id].mode,'system');assert.equal(FORM_REGISTRY[id].route,path);assert.equal(FORM_REGISTRY[id].adapterId,id);assert.deepEqual(FORM_REGISTRY[id].capabilities.customFieldTypes,[]);assert.equal(IMPLEMENTED_FORM_ADAPTERS[id].route,path);
 }
});
void test('actual protected finance routes prepare and recover one source-bound reservation without simulation permission',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  globalThis.liveFinanceRouteDb=f.db;globalThis.liveFinanceRouteActor='reviewer';const route=await import('../app/api/admin/managed-makers/[id]/finance/route'),context={params:Promise.resolve({id:f.sellerId})},origin='https://live-finance.test',url=origin+'/api/admin/managed-makers/'+f.sellerId+'/finance';
  const read=await route.GET(new Request(url),context);assert.equal(read.status,200);assert.match(read.headers.get('cache-control')!,/private.*no-store/);const {finance}=await read.json() as {finance:{preview:{amountPaisa:number;snapshotDigest:string}}};assert.equal(finance.preview.amountPaisa,69000);
  const body={sourceFormId:'system.managed-live-finance',action:'prepare',expectedRevision:null,requestId:'protected-actual-finance',input:{scheduledFor:Date.now(),expectedAmountPaisa:finance.preview.amountPaisa,expectedSnapshot:finance.preview.snapshotDigest,reason:'Prepare the independently reviewed original actual live sources for protected bank execution.'}},send=(value:unknown,requestOrigin=origin)=>route.POST(new Request(url,{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json'},body:JSON.stringify(value)}),context);
  const response=await send(body);assert.equal(response.status,200,await response.clone().text());const saved=await response.json() as {id:string;recordKind:string};assert.equal(saved.recordKind,'live');
  const recovered=await route.GET(new Request(url+'?attempt='+body.requestId),context);assert.equal((await recovered.json() as {outcome:{id:string}}).outcome.id,saved.id);assert.equal((await send(body)).status,200);
  assert.equal((await send({...body,input:{...body.input,reason:'Different content must never reuse the recorded original financial action.'}})).status,409);
  assert.equal((await send({...body,action:'mark_paid'})).status,400);assert.equal((await send(body,'https://foreign.test')).status,403);
  globalThis.liveFinanceRouteActor=f.ownerId;assert.equal((await route.GET(new Request(url),context)).status,403);assert.equal((await send(body)).status,403);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_payouts WHERE record_kind='live'").get()!.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_transfer_packets').get()!.n,0);
 }finally{f.dispose();}
});
