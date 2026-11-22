import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedReplacement} from './helpers/return-handling-fixture';
import {createCustomerReturnRequest,reviewReturnAsAdmin,advanceReturnAsAdmin,listReturnsForCustomerReceipt,getCustomerReturnDetail,getSellerReturnDetail} from '../lib/db/repositories/returns';
import {getReturnHandling,recordReturnHandling,publicReturnHandling,type HandlingInput} from '../lib/returns/handling';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {prepareOrderStockSettlement} from '../lib/products/order-stock-settlement';


void test('a replacement reference alone cannot claim delivery or restock uninspected returned goods',async()=>{
 const f=await approvedReplacement();try{
  const before=f.sqlite.prepare("SELECT inventory_quantity n FROM products WHERE id='product-a'").get()!.n;
  await assert.rejects(advanceReturnAsAdmin(f.database,{returnRequestId:f.caseId,actorId:'owner',actorRole:'super_admin',action:'resolve_replacement',note:'Attempt to close with only a reference and no physical delivery.',publicMessageEn:'Replacement completion is being checked.',publicMessageNe:'प्रतिस्थापन पूरा भएको पुष्टि गर्दैछौँ।',reference:'FICTIONAL-REFERENCE-ONLY',restockQuantity:1,requestId:'reference-is-not-delivery',now:Date.now()}));
  assert.equal(f.sqlite.prepare('SELECT status FROM return_requests WHERE id=?').get(f.caseId)!.status,'approved');assert.equal(f.sqlite.prepare("SELECT inventory_quantity n FROM products WHERE id='product-a'").get()!.n,before);
 }finally{await f.dispose();}
});
void test('physical return restores only the original variant and replacement cancellation releases its exact reservation once',async()=>{
 const f=await manualOrderFixture({method:'cod'});try{
  const itemId=String(f.sqlite.prepare('SELECT id FROM order_items WHERE order_id=?').get(f.orderId)!.id);
  // Complete the original fictional stock movement without inventing company cash or a delivery timestamp.
  await f.db.batch(await prepareOrderStockSettlement(f.db,{orderId:f.orderId,itemIds:[itemId],action:'consume',actorId:'reviewer',requestId:'variant-original-dispatch',reason:'Original fictional unit physically left inventory.'}));
  f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE id=?").run(itemId);
  const request=await createCustomerReturnRequest(f.db,{orderNumber:f.order.orderNumber,customerId:'customer',receiptTokenHash:null,orderItemId:itemId,quantity:1,reason:'defective',requestedResolution:'replacement',detail:'The actual medium variant was delivered with a defect and needs the same replacement.',locale:'en-NP',idempotencyKey:'variant-return-original',evidence:[],now:Date.now()});
  await reviewReturnAsAdmin(f.db,{returnRequestId:request.id,actorId:'reviewer',actorRole:'super_admin',action:'approve',note:'Checked the actual original variant and customer agreement to replacement.',publicMessageEn:'The exact original variant replacement is approved for physical handling.',publicMessageNe:'उही विकल्पको प्रतिस्थापन स्वीकृत भयो।',responsibility:'seller',outcome:'replacement',requestId:'variant-return-approve',now:Date.now()});
  const stock=(id:string)=>({...f.sqlite.prepare('SELECT available,reserved FROM offer_stock WHERE offer_id=?').get(id)!}),medium=stock('medium'),large=stock('large');let sequence=0;
  async function act(extra:Partial<HandlingInput>&{action:HandlingInput['action']}){const row=(await getReturnHandling(f.db,request.id))!,ctx={actorId:'reviewer',expectedRevision:String(row.revision),requestId:'variant-physical-'+sequence++,now:Date.now()},input:HandlingInput={caseId:request.id,occurredAt:row.now,publicMessage:'The exact variant handling has been recorded in this case.',privateNote:'Verified the fictional receipt, original offer identity and actual quantity.',evidenceReference:'FICTIONAL-VARIANT-EVIDENCE',...extra};const result=await recordReturnHandling(f.db,ctx,input);assert.deepEqual(await recordReturnHandling(f.db,ctx,input),result);return result;}
  await act({action:'receive',quantity:1});await act({action:'inspect',quantity:1,disposition:'restock'});
  assert.equal(stock('medium').available,Number(medium.available)+1);assert.deepEqual(stock('large'),large);
  const replacement=await act({action:'prepare_replacement',customerAgreementReference:'FICTIONAL-AGREED-MEDIUM-REPLACEMENT',promisedAt:Date.now()+86400000});
  assert.equal(stock('medium').available,medium.available);assert.equal(stock('medium').reserved,Number(medium.reserved)+1);
  await act({action:'cancel_replacement',shipmentId:replacement.shipmentId!});assert.equal(stock('medium').available,Number(medium.available)+1);assert.equal(stock('medium').reserved,medium.reserved);assert.deepEqual(stock('large'),large);
 }finally{f.dispose();}
});
void test('customer and seller case projections omit private investigation and event notes',async()=>{
 const f=await approvedReplacement();try{
  const list=await listReturnsForCustomerReceipt(f.database,f.access.orderNumber,null,'checkout-buyer');
  assert.equal(list[0].investigationSummary,null);
  const customer=await getCustomerReturnDetail(f.database,f.caseId,f.access.orderNumber,null,'checkout-buyer'),seller=await getSellerReturnDetail(f.database,f.caseId,'seller-a');
  assert.equal(customer!.investigationSummary,null);assert.equal(seller!.investigationSummary,null);assert.ok(customer!.events.every(e=>e.internalNote===null));assert.ok(seller!.events.every(e=>e.internalNote===null));
 }finally{await f.dispose();}
});
void test('company-funded return, quarantine and actual replacement delivery retain distinct facts and consume stock once',async()=>{
 const f=await approvedReplacement();try{
  let sequence=0;
  async function act(extra:Partial<HandlingInput>&{action:HandlingInput['action']}){
   const row=(await getReturnHandling(f.database,f.caseId))!,ctx={actorId:'owner',expectedRevision:String(row.revision),requestId:'physical-action-'+sequence++,now:Date.now()},input:HandlingInput={caseId:f.caseId,occurredAt:Date.now()-100,publicMessage:'The recorded return handling is available in this case.',privateNote:'Independently checked the fictional physical source and exact case quantity.',evidenceReference:'FICTIONAL-PHYSICAL-EVIDENCE',...extra};
   const result=await recordReturnHandling(f.database,ctx,input);assert.deepEqual(await recordReturnHandling(f.database,ctx,input),result);return result;
  }
  const before=Number(f.sqlite.prepare("SELECT inventory_quantity n FROM products WHERE id='product-a'").get()!.n);
  await act({action:'instructions',instructions:{destination:'Fictional approved receiving location, Kathmandu',method:'Company-arranged collection',packaging:'Keep the damaged goods safely wrapped for the approved collection.',safeHandlingConfirmed:true}});
  const issued=(await getReturnHandling(f.database,f.caseId))!;assert.equal(JSON.parse(issued.instructionsJson!).fundedBy,'company');assert.equal(issued.handoffDueAt!-issued.instructionsAt!,5*86400000);
  await act({action:'handoff'});await act({action:'receive',quantity:1});
  assert.equal((await getReturnHandling(f.database,f.caseId))!.inspectedQuantity,0);
  await act({action:'inspect',quantity:1,disposition:'quarantine'});assert.equal(f.sqlite.prepare("SELECT inventory_quantity n FROM products WHERE id='product-a'").get()!.n,before);
  const replacement=await act({action:'prepare_replacement',customerAgreementReference:'FICTIONAL-ORIGINAL-CUSTOMER-REPLACEMENT-REQUEST',promisedAt:Date.now()+86400000});
  assert.equal(f.sqlite.prepare("SELECT inventory_quantity n FROM products WHERE id='product-a'").get()!.n,before-1);
  await act({action:'dispatch_replacement',shipmentId:replacement.shipmentId!,carrierReference:'FICTIONAL-REPLACEMENT-CARRIER'});
  await act({action:'deliver_replacement',shipmentId:replacement.shipmentId!});
  await advanceReturnAsAdmin(f.database,{returnRequestId:f.caseId,actorId:'owner',actorRole:'super_admin',action:'resolve_replacement',note:'Original returned goods quarantined and replacement delivery independently evidenced.',publicMessageEn:'The supported replacement was delivered and the return case is complete.',publicMessageNe:'प्रतिस्थापन डेलिभरी भएको पुष्टि भयो र फिर्ता प्रक्रिया पूरा भयो।',reference:'FICTIONAL-REPLACEMENT-CARRIER',restockQuantity:0,requestId:'actual-replacement-close',now:Date.now()});
  assert.equal(f.sqlite.prepare('SELECT status FROM return_requests WHERE id=?').get(f.caseId)!.status,'resolved');
  assert.equal(f.sqlite.prepare("SELECT inventory_quantity n FROM products WHERE id='product-a'").get()!.n,before-1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM return_stock_actions WHERE case_id=? AND kind='replacement_reserve'").get(f.caseId)!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM refunds WHERE order_id=?').get(f.orderId)!.n,0);
 }finally{await f.dispose();}
});

void test('a new agreed collection preserves age and original instructions and cannot redirect goods after handoff',async()=>{
 const f=await approvedReplacement();try{
  let sequence=0;
  async function act(extra:Partial<HandlingInput>&{action:HandlingInput['action']}){const row=(await getReturnHandling(f.database,f.caseId))!;return recordReturnHandling(f.database,{actorId:'owner',expectedRevision:String(row.revision),requestId:'arrangement-'+sequence++,now:Date.now()},{caseId:f.caseId,occurredAt:row.now,publicMessage:'The actual agreed collection arrangement has been recorded.',privateNote:'PRIVATE verified customer agreement and safe receiving location.',evidenceReference:'PRIVATE-ARRANGEMENT-PROOF',...extra});}
  await act({action:'instructions',instructions:{destination:'Original fictional receiving warehouse',method:'Company funded safe collection',packaging:'Retain the safe protective packaging for collection.',safeHandlingConfirmed:true}});
  const original=(await getReturnHandling(f.database,f.caseId))!,availabilityAt=Date.now()+7*86400000;
  await act({action:'arrange',availabilityAt,customerAgreementReference:'PRIVATE-CUSTOMER-AGREEMENT',instructions:{destination:'Agreed alternate fictional receiving warehouse',method:'Company funded safe collection',packaging:'Use the agreed protective box and safe collection.',safeHandlingConfirmed:true}});
  const current=(await getReturnHandling(f.database,f.caseId))!,view=(await publicReturnHandling(f.database,f.caseId))!;
  assert.equal(current.firstReceivedAt,original.firstReceivedAt);assert.equal(current.handoffDueAt,original.handoffDueAt);assert.equal(current.instructionsJson,original.instructionsJson);
  assert.equal(view.instructions?.destination,'Agreed alternate fictional receiving warehouse');assert.equal(view.arrangement?.availabilityAt,availabilityAt);assert.equal(JSON.stringify(view).includes('PRIVATE'),false);
  await act({action:'handoff'});
  await assert.rejects(act({action:'arrange',availabilityAt:availabilityAt+86400000,customerAgreementReference:'PRIVATE-LATE-REDIRECTION'}),/in-flight return cannot be redirected/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM return_handling_events WHERE case_id=?').get(f.caseId)!.n,3);
 }finally{await f.dispose();}
});

void test('new aftercare targets retain the approved continuous calendar and earliest sufficient evidence',async()=>{
 const f=await approvedReplacement();try{
  const original=(await getReturnHandling(f.database,f.caseId))!;
  const clock=f.sqlite.prepare('SELECT calendar_version calendar,enough_information_at enough,instructions_due_at due FROM return_handling WHERE case_id=?').get(f.caseId)!;
  assert.equal(clock.calendar,'continuous-v1');assert.equal(clock.enough,original.firstReceivedAt);assert.equal(clock.due,original.firstReceivedAt+2*86400000);
  async function act(action:'sufficient_evidence'|'receive',occurredAt:number){const row=(await getReturnHandling(f.database,f.caseId))!;await recordReturnHandling(f.database,{actorId:'owner',expectedRevision:String(row.revision),requestId:'calendar-'+action,now:Date.now()},{caseId:f.caseId,action,occurredAt,quantity:1,publicMessage:'The evidence and physical handling target are recorded.',privateNote:'Actual sufficient evidence arrived with the original supported request.',evidenceReference:'FICTIONAL-EARLIEST-EVIDENCE'});}
  await act('sufficient_evidence',original.firstReceivedAt);
  await act('receive',(await getReturnHandling(f.database,f.caseId))!.now);
  assert.equal((await getReturnHandling(f.database,f.caseId))!.inspectionDueAt,original.firstReceivedAt+3*86400000);
 }finally{await f.dispose();}
});
