import assert from 'node:assert/strict';
import test from 'node:test';
import {readyNativeOffer} from './helpers/ready-native-offer';
import {seedCheckoutBuyer} from './helpers/checkout-contact';
import {addOfferCartLine} from '../lib/cart/offer-cart';
import {createCodOrder} from '../lib/db/repositories/orders';
import {confirmOfferStock,getOfferStock,pauseOfferStock} from '../lib/products/offer-inventory';

function input(buyer:string,phone:string){return {customerAuthSubject:buyer,customerEmail:buyer+'@local.hastabazaar.test',customerPhone:phone,locale:'en-NP' as const,termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Fictional '+buyer,phone,province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional locality'}};}
void test('native D1 last-unit race commits one exact order and receipt replay cannot reserve twice',async()=>{
 const f=await readyNativeOffer();try{
  await confirmOfferStock(f.db,{actorId:'owner',requestId:'native-last-unit-count',expectedRevision:'0',now:Date.now()},{offerId:f.mapped.offerId,available:1,reason:'Count exactly one fictional physical unit for this native checkout race.',independentStockConfirmed:true});
  const buyers=[input('buyer-a','9811111111'),input('buyer-b','9811111112')];
  for(const buyer of buyers){await seedCheckoutBuyer(f.db,buyer.customerAuthSubject,buyer.customerEmail,buyer.customerPhone);await addOfferCartLine(f.db,buyer.customerAuthSubject,{productId:'p',offerId:f.mapped.offerId,versionId:f.mapped.versionId,publicVersionId:null,pricePaisa:12550,quantity:1,requestId:'native-add-'+buyer.customerAuthSubject},Date.now());}
  const results=await Promise.allSettled(buyers.map(buyer=>createCodOrder(f.db,buyer.customerAuthSubject,'receipt-'+buyer.customerAuthSubject,buyer,Date.now(),buyer.customerAuthSubject)));
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1,JSON.stringify(results));
  const winner=results.findIndex(row=>row.status==='fulfilled'),buyer=buyers[winner],result=results[winner] as PromiseFulfilledResult<Awaited<ReturnType<typeof createCodOrder>>>;
  assert.deepEqual(await createCodOrder(f.db,buyer.customerAuthSubject,'receipt-'+buyer.customerAuthSubject,buyer,Date.now(),buyer.customerAuthSubject),result.value);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM orders').first<{n:number}>())!.n,1);
  const stock=await getOfferStock(f.db,f.mapped.offerId);assert.equal(stock?.available,0);assert.equal(stock?.reserved,1);
 }finally{await f.dispose();}
});

for(const cause of ['offer pause','commission starts'] as const)void test('native D1 commit-time '+cause+' rolls back offer reservation and every order/tender write',async()=>{
 const f=await readyNativeOffer();try{
  const buyer=input('buyer','9811111111');await seedCheckoutBuyer(f.db,'buyer',buyer.customerEmail,buyer.customerPhone);
  await addOfferCartLine(f.db,'held-checkout',{productId:'p',offerId:f.mapped.offerId,versionId:f.mapped.versionId,publicVersionId:null,pricePaisa:12550,quantity:1,requestId:'held-checkout-add'},Date.now());
  const batch=f.db.batch.bind(f.db);let injected=false;
  const guardedDb={prepare:f.db.prepare.bind(f.db),batch:async function<T>(statements:D1PreparedStatement[]){if(!injected){injected=true;if(cause==='commission starts'){await new Promise(resolve=>setTimeout(resolve,20));await f.db.prepare("INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id) VALUES('native-new-terms','independent_seller_commission_bps',2,'1400','published',1,'controlled',?,'Fictional approved publication reaches its start','reviewer',1,'native-new-terms')").bind(Date.now()).run();}else await pauseOfferStock(f.db,{actorId:'owner',requestId:'pause-at-order-commit',expectedRevision:'0',now:Date.now()},{offerId:f.mapped.offerId,paused:true,reason:'Pause this actual fictional offer after checkout preparation.'});}return batch<T>(statements);}} as D1Database;
  await assert.rejects(createCodOrder(guardedDb,'held-checkout','held-receipt',buyer,Date.now(),'buyer'));
  assert.equal(injected,true);
  for(const table of ['orders','payments','offer_stock_reservations','order_item_offer_snapshots'])assert.equal((await f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{n:number}>())!.n,0,table);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM cart_offer_lines').first<{n:number}>())!.n,1);
  assert.equal((await getOfferStock(f.db,f.mapped.offerId))?.available,2);
 }finally{await f.dispose();}
});

void test('native D1 concurrent identical checkout requests return one order and one stock reservation',async()=>{
 const f=await readyNativeOffer();try{
  const buyer=input('buyer','9811111111');await seedCheckoutBuyer(f.db,'buyer',buyer.customerEmail,buyer.customerPhone);
  await addOfferCartLine(f.db,'same-checkout',{productId:'p',offerId:f.mapped.offerId,versionId:f.mapped.versionId,publicVersionId:null,pricePaisa:12550,quantity:1,requestId:'same-checkout-add'},Date.now());
  const results=await Promise.all([createCodOrder(f.db,'same-checkout','same-receipt',buyer,Date.now(),'buyer'),createCodOrder(f.db,'same-checkout','same-receipt',buyer,Date.now(),'buyer')]);
  assert.deepEqual(results[0],results[1]);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM orders').first<{n:number}>())!.n,1);
  assert.equal((await getOfferStock(f.db,f.mapped.offerId))?.reserved,1);
 }finally{await f.dispose();}
});
