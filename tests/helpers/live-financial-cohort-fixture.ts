import {agreeRecovery} from './recovery-agreement-fixture';
import * as recovery from '../../lib/payments/seller-recovery';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout} from '../../lib/managed-commerce/live-payout-operations';
import assert from 'node:assert/strict';
import {deliveredLiveFinancialFixture,refundActualLiveOrder} from './live-financial-lifecycle-fixture';
import {prepareManagedPayout} from '../../lib/managed-commerce/payout-operations';
import * as transfers from '../../lib/payments/payout-transfers';
import {resolveRuntimeEnvironment,SIMULATED_RECORD_LABEL} from '../../lib/staging/environment';
import {getPublicOfferSet} from '../../lib/products/public-offers';
import {addOfferCartLine} from '../../lib/cart/offer-cart';
import {createCodOrder} from '../../lib/db/repositories/orders';
import {getFirstCodReview,confirmFirstCodReview} from '../../lib/orders/first-cod-review';
import {transitionCompanyPreparation} from '../../lib/db/repositories/fulfillment';
import {prepareSellerParcels,listParcels,operateParcel} from '../../lib/operations/parcels';

type F=Awaited<ReturnType<typeof deliveredLiveFinancialFixture>>;
/** Explicit retained simulation economic state, never a new live sale or relabelled original. */
export async function appendRetainedSimulationEarning(f:F,tag='cohort-simulation'){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(r=>r.file===''));
 const orderId=tag+'-order',orderItemId=tag+'-item',snapshotId=tag+'-snapshot',entitlementId=tag+'-entitlement',old=Date.now()-86400000;
 function copy(table:string,row:Record<string,import('node:sqlite').SQLOutputValue>,changes:Record<string,import('node:sqlite').SQLInputValue>){const actual={...row,...changes},columns=(f.sqlite.prepare('PRAGMA table_xinfo('+table+')').all() as {name:string;hidden:number}[]).filter(c=>c.hidden===0).map(c=>c.name);f.sqlite.prepare('INSERT INTO '+table+'('+columns.map(c=>'"'+c+'"').join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(c=>actual[c]));}
 const number='SIM-RETAINED-'+tag.toUpperCase()+'-ORDER';
 copy('orders',f.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(f.orderId)!,{id:orderId,order_number:number,receipt_token_hash:tag+'-token',operation_request_id:null,created_at:old,updated_at:old,delivered_at:old});
 copy('products',f.sqlite.prepare('SELECT * FROM products WHERE id=?').get(f.productId)!,{id:tag+'-product',slug:tag+'-product',sku:'SIM-'+tag.toUpperCase(),status:'published',inventory_quantity:10,created_at:old,updated_at:old});
 copy('order_items',f.sqlite.prepare('SELECT * FROM order_items WHERE id=?').get(f.orderItemId)!,{id:orderItemId,order_id:orderId,product_id:tag+'-product',fulfillment_request_id:null,offer_reservation_id:null,created_at:old});
 copy('order_delivery_allocations',f.sqlite.prepare('SELECT * FROM order_delivery_allocations WHERE order_item_id=?').get(f.orderItemId)!,{order_item_id:orderItemId,order_id:orderId,created_at:old});
 copy('managed_commercial_snapshots',f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots WHERE order_item_id=?').get(f.orderItemId)!,{id:snapshotId,order_item_id:orderItemId,record_kind:'simulation',simulation_label:SIMULATED_RECORD_LABEL,live_activation_decision_id:null,live_clearance_id:null,live_financial_scope_id:null,live_customer_id:null,created_at:old});
 copy('managed_entitlements',f.sqlite.prepare('SELECT * FROM managed_entitlements WHERE id=?').get(f.entitlementId)!,{id:entitlementId,snapshot_id:snapshotId,status:'eligible',earned_at:old,hold_until:old,eligible_at:old,paid_at:null,created_at:old,updated_at:old,version:1});
 f.sqlite.prepare("INSERT INTO managed_settlement_entries(id,entitlement_id,type,amount_paisa,metadata_json,reason_code,request_id,created_by,created_at)VALUES(?,?,'earned',69000,'{}','retained_simulation_fixture',?,'reviewer',?)").run(tag+'-earned',entitlementId,tag+'-earned',old);
 const job=f.sqlite.prepare('SELECT * FROM shipping_jobs WHERE order_id=?').get(f.orderId)!;copy('shipping_jobs',job,{id:tag+'-job',order_id:orderId,created_request_id:tag+'-job',created_at:old,updated_at:old});
 const parcel=f.sqlite.prepare('SELECT * FROM shipping_parcels WHERE shipping_job_id=?').get(job.id)!;
 const collection=f.sqlite.prepare("SELECT * FROM parcel_cash_records WHERE shipping_job_id=? AND kind='collection' AND status='posted'").get(job.id);
 assert.ok(collection);
 assert.equal(collection.amount_paisa,parcel.collected_paisa);
 assert.equal(parcel.collected_paisa,parcel.cod_due_paisa);
 copy('shipping_parcels',parcel,{shipping_job_id:tag+'-job',remitted_paisa:parcel.collected_paisa,delivered_at:old,created_at:old});
 copy('parcel_cash_records',collection,{id:tag+'-collection',shipping_job_id:tag+'-job',evidence_reference:'FICTIONAL-RETAINED-'+tag.toUpperCase()+'-COLLECTION',created_at:old});
 const historical={...f,order:{...f.order,orderNumber:number},orderId,orderItemId,entitlementId};
 return historical;
}

export async function appendHistoricalSimulationCohort(f:F){
 const historical=await appendRetainedSimulationEarning(f);
 const environment=resolveRuntimeEnvironment({runtimeEnvironment:'local_staging',nodeEnvironment:'development',appOrigin:'http://localhost:3018'});
 const payoutId=await prepareManagedPayout(f.db,{sellerId:f.sellerId,actorId:'reviewer',requestId:'cohort-simulation-payout',now:Date.now(),reason:'Retain this explicit fictional historical simulation payout as its own cohort.',environment,destinationReference:f.sources.beneficiaryReference,scheduledFor:Date.now()});
 const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('cohort-simulation-packet'),{model:'managed',payoutId,accountVersionId:f.sources.accountVersionId,environment,reason:'Retain the exact fictional simulated original native bank evidence independently.'});
 await transfers.approvePayoutTransfer(f.db,f.ctx('cohort-simulation-approved','0'),{packetId:packet.id,environment,reason:'Approve the exact fictional retained simulation source and beneficiary.'});
 await transfers.startPayoutTransfer(f.db,f.ctx('cohort-simulation-started','1'),{packetId:packet.id,environment,reason:'Retain this original fictional simulation instruction as processing.'});
 await transfers.recordPayoutTransferOutcome(f.db,f.ctx('cohort-simulation-paid','2'),{packetId:packet.id,environment,outcome:'paid',amountPaisa:69000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-RETAINED-SIMULATION-DEBIT',evidenceReference:'FICTIONAL-RETAINED-SIMULATION-BANK-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Retain the original fictional simulation debit without reclassifying its commerce source.'});
 const refund=await refundActualLiveOrder(historical,'cohort-simulation-refund');
 return {...historical,...refund,environment,payoutId};
}

/** A second genuinely orderable, paid and delivered live order using current source APIs. */
export async function appendDeliveredLiveCohort(f:F,tag:string){
 const buyerId=f.buyerId,token='live-cohort-cart-'+tag,offers=await getPublicOfferSet(f.db,f.productId);assert.ok(offers?.orderable);
 await addOfferCartLine(f.db,token,{productId:f.productId,offerId:f.offerId,versionId:offers.versionId,publicVersionId:offers.publicVersionId,pricePaisa:80000,quantity:1,requestId:tag+'-cart'},Date.now());
 const order=await createCodOrder(f.db,token,tag+'-receipt',{customerAuthSubject:buyerId,customerEmail:buyerId+'@local.hastabazaar.test',customerPhone:'9811111111',locale:'en-NP',termsAccepted:true,idempotencyKey:tag+'-order',address:{recipientName:'Fictional Actual Buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional actual delivery'}},Date.now(),buyerId);
 const orderId=String(f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)!.id),orderItemId=String(f.sqlite.prepare('SELECT id FROM order_items WHERE order_id=?').get(orderId)!.id);
 if((await getFirstCodReview(f.db,orderId))?.status==='pending')await confirmFirstCodReview(f.db,{orderId,actorId:'reviewer',reason:'Confirm this separate actual fictional COD order before company preparation.',requestId:tag+'-cod',now:Date.now()});
 const form=f.sqlite.prepare("SELECT id,version FROM form_config_versions WHERE form_id='staff.order-fulfillment' AND status='published' ORDER BY version DESC LIMIT 1").get()!;
 for(const action of ['start_packing','ready_for_pickup'] as const){const requestId=tag+'-'+action;await transitionCompanyPreparation(f.db,{orderId,sellerId:f.sellerId,actorId:'reviewer',action,note:'Record this exact separate actual company preparation step.',requestId,now:Date.now(),form:{requestId,versionId:String(form.id),answers:{formId:'staff.order-fulfillment',version:Number(form.version),answers:[]}}});}
 await prepareSellerParcels(f.db,{orderId,actorId:'reviewer',requestId:tag+'-parcel',now:Date.now()});
 for(const action of ['assign','dispatch','deliver','collect']){const p=(await listParcels(f.db,orderId))[0];await operateParcel(f.db,{jobId:p.id,actorId:'reviewer',action,version:p.version,note:'Retain actual original delivery and customer collection.',requestId:tag+'-'+action,now:Date.now(),...(action==='assign'?{method:'courier',courierName:'Fictional Actual Courier',trackingCode:tag+'-track'}:{}),...(action==='collect'?{amountPaisa:p.codDuePaisa,reference:tag+'-actual-customer-collection'}:{})});}
 const entitlementId=String(f.sqlite.prepare('SELECT e.id FROM managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE s.order_item_id=?').get(orderItemId)!.id);
 return {...f,order,orderId,orderItemId,entitlementId};
}

export async function actualMixedCohortFixture(liveCaseFirst=false){
 const f=await deliveredLiveFinancialFixture();try{
 const historical=await appendHistoricalSimulationCohort(f),context=(tag:string)=>(id:string,revision:string|null=null)=>f.ctx(tag+'-'+id,revision);
 let historicalCase='';
 if(!liveCaseFirst){
 historicalCase=await agreeRecovery(f.db,context('historical-simulation'),{kind:'refund',id:historical.refundId});
 const old=await recovery.getSellerRecoveryReview(f.db,'reviewer',historicalCase);
 await recovery.disputeSellerRecovery(f.db,{...f.ctx('historical-simulation-disputed',String(old.case.revision)),actorId:f.ownerId},{caseId:historicalCase,amountPaisa:1,reason:'The owner disputes one paisa of this explicitly retained simulation source.',evidenceReference:'FICTIONAL-RETAINED-SIMULATION-DISPUTE'});
 }
 const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now());assert.equal(preview.amountPaisa,69000,'Old simulated debt/dispute is not actual live balance.');
 const payout=await prepareLiveManagedPayout(f.db,f.ctx('cohort-actual-payout'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'Use only the actual original earning, independently of retained simulation debt.'});
 const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('cohort-actual-packet'),{model:'managed',payoutId:payout.id,accountVersionId:f.sources.accountVersionId,reason:'Bind the actual original native source and beneficiary without simulation permission.'});
 await transfers.approvePayoutTransfer(f.db,f.ctx('cohort-actual-approved','0'),{packetId:packet.id,reason:'Approve the exact actual original verified funding and beneficiary.'});
 await transfers.startPayoutTransfer(f.db,f.ctx('cohort-actual-started','1'),{packetId:packet.id,reason:'Record the one original actual fictional bank instruction.'});
 await transfers.recordPayoutTransferOutcome(f.db,f.ctx('cohort-actual-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:69000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-ACTUAL-COHORT-MAKER-DEBIT',evidenceReference:'FICTIONAL-ACTUAL-COHORT-MAKER-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm only the actual native maker debit and retained original beneficiary.'});
 const actualRefund=await refundActualLiveOrder(f,'cohort-actual-refund');
 const actualCase=await agreeRecovery(f.db,context('actual-live'),{kind:'refund',id:actualRefund.refundId});
 if(liveCaseFirst){
 const older=await recovery.getSellerRecoveryReview(f.db,'reviewer',actualCase);
 await recovery.disputeSellerRecovery(f.db,{...f.ctx('older-actual-live-disputed',String(older.case.revision)),actorId:f.ownerId},{caseId:actualCase,amountPaisa:1,reason:'The owner disputes one paisa of the earlier actual original source.',evidenceReference:'FICTIONAL-OLDER-ACTUAL-DISPUTE'});
 historicalCase=await agreeRecovery(f.db,context('historical-simulation'),{kind:'refund',id:historical.refundId});
 }
 const future=await appendDeliveredLiveCohort(f,'cohort-actual-future');
 return {...f,historical,historicalCase,actualRefund,actualCase,future,context};
 }catch(error){f.dispose();throw error;}
}
