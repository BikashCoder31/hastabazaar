import assert from 'node:assert/strict';
import {test} from 'node:test';
import {commissionDatabase} from './helpers/commission-database';
import {seedNativeCustomerFeeSources,feeManagedSeller} from './helpers/customer-fee-native-sources';
import {readManagedLiveEligibility} from '../lib/managed-commerce/live-activation';
import {prepareSellerParcels,operateParcel,listParcels} from '../lib/operations/parcels';
import {getFirstCodReview,confirmFirstCodReview} from '../lib/orders/first-cod-review';
import {createCustomerReturnRequest,reviewReturnAsAdmin} from '../lib/db/repositories/returns';
import {authorizeLawfulFeeRefund} from '../lib/payments/refund-obligations';
import {executeFixtureRefund} from './helpers/execute-fixture-refund';
import {createCodOrder} from '../lib/db/repositories/orders';

void test('command-built native fee sources retain complete provenance in memory (not native acceptance)',async()=>{
 const f=await commissionDatabase({seedSellers:false});
 try {
  // The ordinary memory allocator seeds only four actors; remove those before
  // this independently owned constructor creates its exact fictional actors.
  f.sqlite.exec('DELETE FROM user_roles; DELETE FROM users;');
  const now=Date.now(),input=await seedNativeCustomerFeeSources(f.database,now);
  const eligibility=await readManagedLiveEligibility(f.database,feeManagedSeller,Date.now());
  assert.equal(eligibility.enabled,true,JSON.stringify(eligibility.blockers));assert.ok(eligibility.proof);
  for(const product of ['product','managed-product']){
   const key='native-source-'+product;
   await f.database.prepare("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES(?,?,'NPR',1,1)").bind(key,key).run();
   await f.database.prepare('INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES(?,?,?,3,1,1)').bind(key,key,product).run();
   const receipt=await createCodOrder(f.database,key,key,{...input,idempotencyKey:key},Date.now(),'checkout-buyer');
   assert.ok(receipt.orderNumber);
   if(product==='managed-product'){
    const provenance=await f.database.prepare('SELECT record_kind,simulation_label,live_activation_decision_id,live_clearance_id,live_financial_scope_id,accepted_managed_detail_id FROM managed_commercial_snapshots').first<Record<string,unknown>>();
    assert.equal(provenance!.record_kind,'live');assert.equal(provenance!.simulation_label,null);
    for(const name of ['live_activation_decision_id','live_clearance_id','live_financial_scope_id','accepted_managed_detail_id'])assert.ok(provenance![name]);
   }else{
    const db=f.database,item=(await db.prepare('SELECT id,order_id FROM order_items').first<{id:string;order_id:string}>())!;
    if(await getFirstCodReview(db,item.order_id))await confirmFirstCodReview(db,{orderId:item.order_id,actorId:'owner',reason:'Confirm fictional native buyer COD intent.',requestId:key+'-confirm',now:Date.now()});
    await prepareSellerParcels(db,{orderId:item.order_id,actorId:'owner',requestId:key+'-prepare',now:Date.now()});
    for(const action of ['assign','dispatch','deliver','collect']){
     const parcel=(await listParcels(db,item.order_id))[0];
     if(action==='dispatch')await db.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=?").bind(item.order_id).run();
     await operateParcel(db,{jobId:parcel.id,actorId:'owner',action,version:parcel.version,note:'Fictional native-source parcel and collection.',requestId:key+'-'+action,now:Date.now(),...(action==='assign'?{method:'courier',courierName:'Fictional Courier',trackingCode:key}:{}),...(action==='collect'?{amountPaisa:receipt.grandTotalPaisa,reference:key+'-cash'}:{})});
    }
    const request=await createCustomerReturnRequest(db,{orderNumber:receipt.orderNumber,receiptTokenHash:key,customerId:'checkout-buyer',orderItemId:item.id,quantity:1,reason:'defective',requestedResolution:'refund',detail:'Fictional native-source documented manufacturing defect.',locale:'en-NP',idempotencyKey:key+'-return',evidence:[],now:Date.now()});
    await reviewReturnAsAdmin(db,{returnRequestId:request.id,actorId:'owner',actorRole:'super_admin',note:'Fictional native-source return evidence.',publicMessageEn:'Return approved.',publicMessageNe:'Return approved.',action:'approve',responsibility:'seller',outcome:'refund',itemRefundPaisa:100000,deliveryRefundPaisa:5000,requestId:key+'-approve',now:Date.now()});
    const refund=(await db.prepare('SELECT id,amount_paisa,wallet_credit_paisa,commission_reversal_paisa FROM refunds WHERE return_request_id=?').bind(request.id).first<{id:string;amount_paisa:number;wallet_credit_paisa:number;commission_reversal_paisa:number}>())!;
    assert.deepEqual([refund.amount_paisa,refund.wallet_credit_paisa],[105000,0]);
    const execution=await executeFixtureRefund(db,{actorId:'owner',kind:'return_refund',sourceId:refund.id,customerId:'checkout-buyer',deferCompletion:true});
    const paid=await execution.complete();assert.deepEqual(await execution.complete(),paid);
    assert.equal((await db.prepare('SELECT commission_reversal_paisa FROM refunds WHERE id=?').bind(refund.id).first<{commission_reversal_paisa:number}>())!.commission_reversal_paisa,12000);
    const authorize=(amountPaisa:number,requestId:string)=>authorizeLawfulFeeRefund(db,{actorId:'owner',requestId,expectedRevision:null,now:Date.now()},{orderId:item.order_id,amountPaisa,legalBasis:'Mandatory fictional consumer remedy after reviewed case.',caseReference:'NATIVE-SOURCE-'+requestId,evidenceReference:'FICTIONAL-NATIVE-LEGAL-DECISION'});
    const authorization=await authorize(1000,key+'-lawful');assert.deepEqual(await authorize(1000,key+'-lawful'),authorization);
    const feeExecution=await executeFixtureRefund(db,{actorId:'owner',kind:'service_fee',sourceId:authorization.id,customerId:'checkout-buyer',deferCompletion:true});
    const feePaid=await feeExecution.complete();assert.deepEqual(await feeExecution.complete(),feePaid);
    await assert.rejects(authorize(1,key+'-excess'),/fee|remaining/i);

   }
  }
  assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 } finally {await f.dispose();}
});
