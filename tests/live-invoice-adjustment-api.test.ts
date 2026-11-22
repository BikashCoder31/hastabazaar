import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {deliveredLiveFinancialFixture,refundActualLiveOrder} from './helpers/live-financial-lifecycle-fixture';

declare global {var invoiceAdjustmentDb:D1Database;var invoiceAdjustmentActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.invoiceAdjustmentDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{status=403};export async function requireStaffApi(){return {id:globalThis.invoiceAdjustmentActor}}',shortCircuit:true};
 return next(specifier,context);
}});
void test('actual invoice route derives completed original refund credit and recovers exactly one protected outcome',async()=>{
 const api=await import('../app/api/admin/invoices/[id]/live-adjustments/route');
 const f=await deliveredLiveFinancialFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(r=>r.file===''));
  globalThis.invoiceAdjustmentDb=f.db;globalThis.invoiceAdjustmentActor='reviewer';
  const invoice=f.sqlite.prepare("SELECT id,snapshot_json FROM managed_invoice_groups WHERE order_id=? AND record_kind='live'").get(f.orderId)!;
  const context={params:Promise.resolve({id:String(invoice.id)})},url='https://invoice.local.hastabazaar.test/api/admin/invoices/'+invoice.id+'/live-adjustments';
  assert.equal((await (await api.GET(new Request(url),context)).json() as {review:{sources:unknown[]}}).review.sources.length,0);
  const paid=await refundActualLiveOrder(f,'invoice-api-actual-refund');
  const review=await api.GET(new Request(url),context);assert.equal(review.status,200);assert.match(review.headers.get('Cache-Control')!,/private, no-store/);
  const body={sourceFormId:'system.live-invoice-adjustment',requestId:'invoice-api-exact-credit',expectedRevision:null,input:{sourceKind:'refund',sourceId:paid.refundId,reason:'Retain the actual original completed refund as an immutable commercial credit.'}};
  const send=(payload:unknown,origin='https://invoice.local.hastabazaar.test')=>api.POST(new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload)}),context);
  assert.equal((await send(body,'https://foreign.test')).status,403);
  assert.equal((await send({...body,input:{...body.input,amountPaisa:1}})).status,400);
  assert.equal((await send({...body,input:{...body.input,sourceId:'another-refund'}})).status,409);
  for(const userId of [f.ownerId,f.buyerId])f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',?)").run(userId,Date.now());
  globalThis.invoiceAdjustmentActor=f.ownerId;assert.equal((await send(body)).status,403);
  globalThis.invoiceAdjustmentActor=f.buyerId;assert.equal((await api.GET(new Request(url),context)).status,403);
  // Changing mutable order metadata cannot erase the retained original customer interest.
  f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(f.ownerId,f.orderId);
  assert.equal((await api.GET(new Request(url),context)).status,403);
  assert.equal((await send(body)).status,403);
  f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(f.buyerId,f.orderId);
  globalThis.invoiceAdjustmentActor='reviewer';const response=await send(body);assert.equal(response.status,200,await response.clone().text());const result=await response.json();
  assert.deepEqual(await (await send(body)).json(),result);
  assert.equal((await send({...body,input:{...body.input,reason:'Different later review content cannot reuse the original saved credit reference.'}})).status,409);
  assert.deepEqual((await (await api.GET(new Request(url+'?attempt='+body.requestId),context)).json() as {outcome:unknown}).outcome,result);
  const foreign=await api.GET(new Request(url+'?attempt='+body.requestId),{params:Promise.resolve({id:'foreign-invoice'})});assert.equal(foreign.status,404);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_adjustments WHERE invoice_group_id=?').get(invoice.id)!.n,1);
  assert.equal(f.sqlite.prepare('SELECT snapshot_json FROM managed_invoice_groups WHERE id=?').get(invoice.id)!.snapshot_json,invoice.snapshot_json);
  const after=await (await api.GET(new Request(url),context)).json() as {review:{sources:unknown[];adjustments:{amountPaisa:number}[]}};assert.equal(after.review.sources.length,0);assert.equal(after.review.adjustments[0].amountPaisa,95000);
  f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");assert.equal((await api.GET(new Request(url+'?attempt='+body.requestId),context)).status,403);
 }finally{f.dispose();}
});
