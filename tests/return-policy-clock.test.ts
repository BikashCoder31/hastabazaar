import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateReturnEligibility,type ReturnPolicySnapshot} from '../lib/returns/validation';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
import {createCustomerReturnRequest} from '../lib/db/repositories/returns';
const policy:ReturnPolicySnapshot={generalRequestWindowDays:7,sealedGoodsWindowDays:15,deliveryDamageEvidenceWindowHours:48,changeOfMindEnabled:true,highValueRefundThresholdPaisa:1000000,refundInitiationBusinessDays:2,codRefundEstimateBusinessDays:[2,5]};
const time=(value:string)=>Date.parse(value+'+05:45');
void test('Nepal delivery day is zero; the complete seventh and fifteenth calendar days remain available',()=>{
 const base={reason:'change_of_mind' as const,deliveredAt:time('2026-11-01T23:55:00'),productReturnEligible:true,policy};
 assert.equal(evaluateReturnEligibility({...base,now:time('2026-11-08T23:59:59.999')}).decision,'eligible');
 assert.equal(evaluateReturnEligibility({...base,now:time('2026-11-09T00:00:00')}).decision,'ineligible');
 assert.equal(evaluateReturnEligibility({...base,originalSealIntact:true,now:time('2026-11-16T23:59:59.999')}).decision,'manual_review');
 assert.equal(evaluateReturnEligibility({...base,originalSealIntact:true,now:time('2026-11-17T00:00:00')}).decision,'ineligible');
 assert.equal(evaluateReturnEligibility({...base,policy:{...policy,generalRequestWindowDays:30},now:time('2026-11-25T12:00:00')}).decision,'eligible');
});
void test('unknown or future delivery facts need reconciliation and never start an invented return window',()=>{
 const base={reason:'change_of_mind' as const,productReturnEligible:true,policy,now:time('2026-11-02T12:00:00')};
 for(const deliveredAt of [0,NaN,time('2026-11-03T12:00:00')])assert.equal(evaluateReturnEligibility({...base,deliveredAt}).decision,'manual_review');
});
void test('late damage and non-returnable flags preserve a problem-item review route',()=>{
 const base={deliveredAt:time('2026-11-01T12:00:00'),now:time('2026-12-02T12:00:00'),policy,productReturnEligible:false};
 assert.equal(evaluateReturnEligibility({...base,reason:'damaged'}).decision,'manual_review');
 assert.equal(evaluateReturnEligibility({...base,reason:'defective'}).decision,'eligible');
});
void test('a historical delivered item with unknown receipt time retains a no-photo case for reconciliation',async()=>{
 const f=await commerceOrderFixture(true);try{
  // Explicit fictional imported-history gap: no item delivery event or parcel receipt date.
  f.sqlite.exec("UPDATE order_items SET fulfillment_status='delivered'; UPDATE orders SET status='delivered',delivered_at=1793592900000");
  const item=String(f.sqlite.prepare("SELECT id FROM order_items WHERE seller_id='seller-a'").get()!.id);
  const result=await createCustomerReturnRequest(f.database,{...f.access,receiptTokenHash:null,orderItemId:item,quantity:1,reason:'damaged',requestedResolution:'refund',detail:'The historical item has visible damage but no reliable receipt timestamp.',locale:'en-NP',idempotencyKey:'unknown-delivery-return',evidence:[],now:time('2026-11-02T12:00:00')});
  assert.equal(result.eligibilityDecision,'manual_review');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM return_evidence WHERE return_request_id=?').get(result.id)!.n,0);
 }finally{await f.dispose();}
});
void test('return intake uses this outbound delivery and competing cases cannot claim the same quantity',async()=>{
 const f=await commerceOrderFixture(true);try{
  await f.deliver();const item=String(f.sqlite.prepare("SELECT id FROM order_items WHERE seller_id='seller-a'").get()!.id);
  const delivered=time('2026-11-01T12:00:00');f.sqlite.prepare("UPDATE shipping_parcels SET delivered_at=? WHERE shipping_job_id IN(SELECT id FROM shipping_jobs WHERE seller_id='seller-a')").run(delivered);
  const input={...f.access,receiptTokenHash:null,orderItemId:item,quantity:1,reason:'defective' as const,requestedResolution:'refund' as const,detail:'The purchased item is defective; please review the exact original quantity.',locale:'en-NP' as const,evidence:[],now:time('2026-11-02T12:00:00')};
  const results=await Promise.allSettled([createCustomerReturnRequest(f.database,{...input,idempotencyKey:'quantity-return-one'}),createCustomerReturnRequest(f.database,{...input,idempotencyKey:'quantity-return-two'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.sqlite.prepare('SELECT SUM(quantity) n FROM return_requests WHERE order_item_id=?').get(item)!.n,1);
 }finally{await f.dispose();}
});
void test('staff records a timely supported request without replacing its first receipt with the later entry time',async()=>{
 const f=await commerceOrderFixture();try{
  await f.deliver();const item=String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id),delivered=time('2026-10-20T12:00:00'),received=time('2026-10-27T23:50:00'),entered=Date.now();
  f.sqlite.prepare('UPDATE shipping_parcels SET delivered_at=?').run(delivered);
  const input:Parameters<typeof createCustomerReturnRequest>[1]&{supportIntake:{actorId:string;receivedAt:number;channel:'email';sourceReference:string}}={...f.access,receiptTokenHash:null,orderItemId:item,quantity:1,reason:'change_of_mind',requestedResolution:'refund',detail:'The first support email requested this return before the saved window closed.',locale:'en-NP',idempotencyKey:'supported-timely-return',evidence:[],now:entered,supportIntake:{actorId:'owner',receivedAt:received,channel:'email',sourceReference:'FICTIONAL-CAPTURED-SUPPORT-MESSAGE'}};
  const result=await createCustomerReturnRequest(f.database,input);assert.equal(result.eligibilityDecision,'eligible');
  const row=f.sqlite.prepare('SELECT requested_at,recorded_at,intake_recorded_by FROM return_requests WHERE id=?').get(result.id)!;assert.equal(row.requested_at,received);assert.ok(Number(row.recorded_at)>=received);assert.equal(row.intake_recorded_by,'owner');
  await assert.rejects(createCustomerReturnRequest(f.database,{...input,supportIntake:{...input.supportIntake,receivedAt:received-1000}}));
 }finally{await f.dispose();}
});
