import assert from 'node:assert/strict';
import {activatedLiveMakerFixture} from './activated-live-maker-fixture';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../../lib/db/repositories/business-settings';
import {seedCheckoutBuyer} from './checkout-contact';
import {getPublicOfferSet} from '../../lib/products/public-offers';
import {addOfferCartLine} from '../../lib/cart/offer-cart';
import {createCodOrder} from '../../lib/db/repositories/orders';
import {getFirstCodReview,confirmFirstCodReview} from '../../lib/orders/first-cod-review';
import {saveFormDraft,publishFormDraft} from '../../lib/db/repositories/form-catalog';
import {transitionCompanyPreparation} from '../../lib/db/repositories/fulfillment';
import {prepareSellerParcels,listParcels,operateParcel} from '../../lib/operations/parcels';
import {createCustomerReturnRequest,reviewReturnAsAdmin,advanceReturnAsAdmin} from '../../lib/db/repositories/returns';
import * as refunds from '../../lib/payments/refund-obligations';
import {getReturnHandling,recordReturnHandling} from '../../lib/returns/handling';

/** Actual source APIs throughout; a genuinely published zero-day fixture hold avoids time travel. */
export async function deliveredLiveFinancialFixture(holdDays=0){
 const f=await activatedLiveMakerFixture('actual-financial-lifecycle');try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(r=>r.file===''));
 const draft=await createBusinessSettingDraft(f.db,{key:'seller_delivery_hold_days',value:holdDays,actorId:'reviewer',reason:'Publish the declared hold only in this inspected fictional actual lifecycle fixture.',requestId:'live-financial-hold-draft',now:Date.now()});
 const holdPublishedAt=Date.now();
 await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:holdPublishedAt,reason:'Use the genuine controlled holding-period publisher for the isolated lifecycle.',requestId:'live-financial-hold-publish',now:holdPublishedAt,simulationAllowed:true});
 const buyerId='actual-financial-buyer',cartToken='actual-financial-cart';
 await seedCheckoutBuyer(f.db,buyerId,buyerId+'@local.hastabazaar.test','9811111111');
 const offers=await getPublicOfferSet(f.db,f.productId);assert.ok(offers?.orderable);
 await addOfferCartLine(f.db,cartToken,{productId:f.productId,offerId:f.offerId,versionId:offers.versionId,publicVersionId:offers.publicVersionId,pricePaisa:80000,quantity:1,requestId:'actual-financial-cart-add'},Date.now());
 const order=await createCodOrder(f.db,cartToken,'actual-financial-receipt-token',{customerAuthSubject:buyerId,customerEmail:buyerId+'@local.hastabazaar.test',customerPhone:'9811111111',locale:'en-NP',termsAccepted:true,idempotencyKey:'actual-financial-order',address:{recipientName:'Fictional Actual Buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional actual delivery'}},Date.now(),buyerId);
 const orderId=String(f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)!.id),orderItemId=String(f.sqlite.prepare('SELECT id FROM order_items WHERE order_id=?').get(orderId)!.id);
 if((await getFirstCodReview(f.db,orderId))?.status==='pending')await confirmFirstCodReview(f.db,{orderId,actorId:'reviewer',reason:'Independently confirm the actual fictional customer COD instruction before release.',requestId:'actual-financial-cod-confirmed',now:Date.now()});
 const formDraft=await saveFormDraft(f.db,{formId:'staff.order-fulfillment',actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId:'staff.order-fulfillment',fields:[]},reason:'Publish the actual isolated company preparation form contract.',requestId:'actual-financial-preparation-form-draft',now:Date.now()});
 const form=await publishFormDraft(f.db,{formId:'staff.order-fulfillment',draftId:formDraft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:formDraft.revision,expectedPublishedVersion:0,reason:'Independently publish the actual fictional preparation form.',requestId:'actual-financial-preparation-form-publish',now:Date.now()});
 for(const action of ['start_packing','ready_for_pickup'] as const){const requestId='actual-financial-company-'+action;await transitionCompanyPreparation(f.db,{orderId,sellerId:f.sellerId,actorId:'reviewer',action,note:'The actual company operator records this exact original preparation step.',requestId,now:Date.now(),form:{requestId,versionId:form.id,answers:{formId:'staff.order-fulfillment',version:form.version,answers:[]}}});}
 await prepareSellerParcels(f.db,{orderId,actorId:'reviewer',requestId:'actual-financial-parcel',now:Date.now()});
 for(const action of ['assign','dispatch','deliver','collect']){const p=(await listParcels(f.db,orderId))[0];await operateParcel(f.db,{jobId:p.id,actorId:'reviewer',action,version:p.version,note:'Retain the actual fictional original delivery and customer COD facts.',requestId:'actual-financial-parcel-'+action,now:Date.now(),...(action==='assign'?{method:'courier',courierName:'Fictional Actual Courier',trackingCode:'ACTUAL-FICTIONAL-CUSTODY'}:{}),...(action==='collect'?{amountPaisa:p.codDuePaisa,reference:'FICTIONAL-ORIGINAL-CUSTOMER-COD-COLLECTION'}:{})});}
 const original=f.sqlite.prepare('SELECT status,payment_status FROM orders WHERE id=?').get(orderId)!;assert.equal(original.status,'delivered');assert.equal(original.payment_status,'paid');
 const entitlement=f.sqlite.prepare('SELECT id,status FROM managed_entitlements WHERE snapshot_id=(SELECT id FROM managed_commercial_snapshots WHERE order_item_id=?)').get(orderItemId)!;assert.equal(entitlement.status,holdDays===0?'eligible':'held');
 return {...f,buyerId,order,orderId,orderItemId,entitlementId:String(entitlement.id)};
 }catch(error){f.dispose();throw error;}
}

export async function refundActualLiveOrder(f:Awaited<ReturnType<typeof deliveredLiveFinancialFixture>>,prefix='actual-live-refund'){
 const ctx=f.ctx;
 const request=await createCustomerReturnRequest(f.db,{orderNumber:f.order.orderNumber,customerId:f.buyerId,receiptTokenHash:null,orderItemId:f.orderItemId,quantity:1,reason:'defective',requestedResolution:'refund',detail:'The original actual delivered product has an independently documented defect.',locale:'en-NP',idempotencyKey:prefix+'-return',evidence:[],now:Date.now()});
 await reviewReturnAsAdmin(f.db,{returnRequestId:request.id,actorId:'reviewer',actorRole:'super_admin',action:'approve',responsibility:'seller',outcome:'refund',itemRefundPaisa:80000,note:'Review actual merchandise responsibility and authorize the original customer remedy without inventing bank completion.',publicMessageEn:'Your original refund is approved; Finance will arrange its actual payment.',publicMessageNe:'Your original refund is approved.',requestId:prefix+'-authorized',now:Date.now()});
 const refundId=(await f.db.prepare('SELECT id FROM refunds WHERE return_request_id=?').bind(request.id).first<{id:string}>())!.id;
 const obligation=await refunds.openRefundObligation(f.db,ctx(prefix+'-obligation'),{kind:'return_refund',sourceId:refundId,reason:'Fund the genuine original customer obligation independently of maker recovery.'});
 await f.db.prepare('CREATE TABLE IF NOT EXISTS user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL)').run();
 await f.db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?,?)').bind(prefix+'-session',f.buyerId,Date.now()+3600000,Date.now()-1000,Date.now()).run();
 const destination=await refunds.submitRefundDestination(f.db,{...ctx(prefix+'-destination'),actorId:f.buyerId,sessionHash:prefix+'-session'},{obligationId:obligation.id,details:{holder:'Fictional Actual Buyer',bank:'Fictional Customer Bank',branch:'Fictional Branch',accountNumber:'TEST-ACTUAL-CUSTOMER-REFUND',currency:'NPR'},relationship:'own_account',authorization:'I authorize my original actual refund to this exact customer-owned account.',evidenceReference:'FICTIONAL-ACTUAL-CUSTOMER-INSTRUCTIONS',reason:'Retain authenticated actual original customer instructions for independent verification.'});
 await refunds.verifyRefundDestination(f.db,ctx(prefix+'-destination-verified','0'),{versionId:destination.id,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-ACTUAL-CUSTOMER-OWNERSHIP',reason:'Independently review exact original customer beneficiary ownership and relationship.'});
 const packet=await refunds.prepareRefundPacket(f.db,ctx(prefix+'-packet','0'),{obligationId:obligation.id,destinationVersionId:destination.id,fundingStatementId:f.sources.fundingId,reason:'Use independently verified actual company funding without waiting for maker collection.'});
 await refunds.approveRefundPacket(f.db,ctx(prefix+'-approved','0'),{packetId:packet.id,reason:'One eligible independent Super Admin approves this exact funded customer remedy.'});
 await refunds.startRefundPacket(f.db,ctx(prefix+'-started','1'),{packetId:packet.id,reason:'Record the actual fictional customer manual bank instruction once.'});
 const cashPaisa=Number((await f.db.prepare('SELECT cash_paisa FROM refund_obligations WHERE id=?').bind(obligation.id).first<{cash_paisa:number}>())!.cash_paisa);
 await refunds.recordRefundPacketOutcome(f.db,ctx(prefix+'-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:cashPaisa,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-ACTUAL-CUSTOMER-DEBIT-'+prefix,evidenceReference:'FICTIONAL-COMPLETED-ACTUAL-CUSTOMER-REFUND',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the actual original completed customer bank debit without conditioning the remedy on recovery.'});
 const handling=(await getReturnHandling(f.db,request.id))!;
 await recordReturnHandling(f.db,ctx(prefix+'-waive',String(handling.revision)),{caseId:request.id,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The original physical return is waived after documented review.',privateNote:'The eligible operator retained the original fictional physical evidence and waiver basis.',evidenceReference:'FICTIONAL-ACTUAL-ORIGINAL-PHYSICAL-REVIEW'});
 await advanceReturnAsAdmin(f.db,{returnRequestId:request.id,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'The actual original refund and physical disposition are both complete.',publicMessageEn:'Your original refund case is complete.',publicMessageNe:'Your original refund case is complete.',requestId:prefix+'-closed',now:Date.now()});
 return {refundId,obligationId:obligation.id,packetId:packet.id,returnRequestId:request.id,cashPaisa};
}
