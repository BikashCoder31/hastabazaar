import { fixtureWithOverrides } from './helpers/fixture-delegation';
import assert from 'node:assert/strict';
import test from 'node:test';
import {publishedOfferFixture} from './helpers/public-offer-fixture';
import {seedVerifiedCheckoutContact,readyCheckoutSeller} from './helpers/checkout-contact';
import {addOfferCartLine} from '../lib/cart/offer-cart';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {getCart,addCartItem} from '../lib/db/repositories/cart';
import {createCodOrder,getOrderDocument,getOrderReceipt} from '../lib/db/repositories/orders';
import {getSellerOrderDetail} from '../lib/db/repositories/fulfillment';
import { createCustomerReturnRequest, getCustomerReturnDetail } from '../lib/db/repositories/returns';
import {parseCheckoutInput} from '../lib/checkout/validation';
import {assertReviewedCheckoutQuote} from '../lib/checkout/reviewed-quote';

void test('reviewed quote binds the exact physical offer and published versions, even at the same price',()=>{
 const quote={lines:[{id:'cart-line',sellerId:'registered',pricePaisa:80000,quantity:1,offerId:'medium',offerVersionId:'offer-v1',publicVersionId:'public-v1',revision:0}],deliveryPaisa:15000,walletPaisa:0,referralPaisa:0,promoPaisa:0,payablePaisa:95000,policyContext:'a'.repeat(64),referralCampaign:null};
 for(const changed of [{offerId:'different-physical-item'},{offerVersionId:'offer-v2'},{publicVersionId:'public-v2'},{revision:1}])assert.throws(()=>assertReviewedCheckoutQuote(quote,{...quote,lines:[{...quote.lines[0],...changed}]}),/review/i);
});

void test('a mixed-seller failure keeps both real selected and legacy lines, customer entry and stock',async()=>{
 const f=await publishedOfferFixture();try{
  await seedVerifiedCheckoutContact(f.db,'customer','9811111111',f.now);
  f.sqlite.exec("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) SELECT 'second','foreign','Second Fictional Seller','Second Fictional Shop','Fixture','FIX-SECOND','PAN','FIX-SECOND-PAN','Fictional Owner',support_phone,'foreign@local.hastabazaar.test',province,district,municipality,locality,'approved',created_at,updated_at FROM seller_profiles WHERE id='registered'");
  f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','seller',1)");
  await readyCheckoutSeller({database:f.db,sqlite:f.sqlite},'second','foreign','reviewer',Date.now());
  f.sqlite.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) SELECT 'second-product','second',category_id,'fictional-second-product','FIX-SECOND-PRODUCT','Second retained product','Original retained fixture for the second seller',12550,2,'Fictional maker','NP','Clay','published',created_at,updated_at FROM products WHERE id=?").run(f.productId);
  const set=(await getPublicOfferSet(f.db,f.productId))!;
  await addOfferCartLine(f.db,'mixed-checkout',{productId:f.productId,offerId:'medium',versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:80000,quantity:1,requestId:'mixed-checkout-add'},Date.now());
  await addCartItem(f.db,'mixed-checkout','second-product',1,Date.now());assert.equal((await getCart(f.db,'mixed-checkout')).items.length,2);
  const original=f.db.batch.bind(f.db);let injected=false;
  const guarded={prepare:f.db.prepare.bind(f.db),batch:async function<T>(statements:D1PreparedStatement[]){if(!injected){injected=true;f.sqlite.exec("INSERT INTO seller_restrictions(seller_id,mode,obligation_mode,reason_code,private_reason,version,applied_by,applied_at,updated_at) VALUES('second','disabled','allow_existing','fixture','Fictional commit-time hold',1,'reviewer',1,1)");}return original<T>(statements);}} as D1Database;
  const input={customerAuthSubject:'customer',customerEmail:'customer@local.hastabazaar.test',customerPhone:'9811111111',locale:'en-NP' as const,termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Fictional Buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Keep this exact delivery entry'}};const entry=JSON.stringify(input);
  await assert.rejects(createCodOrder(guarded,'mixed-checkout','mixed-receipt',input,Date.now(),'customer'));assert.equal(injected,true);assert.equal(JSON.stringify(input),entry);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM offer_stock_reservations').get()!.n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM orders WHERE id<>'legacy-order'").get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM cart_offer_lines').get()!.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM cart_items').get()!.n,1);
  assert.equal(f.sqlite.prepare("SELECT inventory_quantity AS n FROM products WHERE id='second-product'").get()!.n,2);
 }finally{f.dispose();}
});

void test('two selected sizes commit once with immutable exact order and invoice snapshots',async()=>{
 const f=await publishedOfferFixture();try{
  await seedVerifiedCheckoutContact(f.db,'customer','9811111111',f.now);
  const set=(await getPublicOfferSet(f.db,f.productId))!;
  for(const offerId of ['medium','large']){const offer=set.offers.find(row=>row.id===offerId)!;await addOfferCartLine(f.db,'checkout-offer-cart',{productId:f.productId,offerId,versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:offer.pricePaisa,quantity:1,requestId:'checkout-add-'+offerId},Date.now());}
  const input={customerAuthSubject:'customer',customerEmail:'customer@local.hastabazaar.test',customerPhone:'9811111111',locale:'en-NP' as const,termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Fictional Buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional locality'}};
  let replayRace=false;
  const racedDb={prepare(sql:string){const statement=f.db.prepare(sql);if(!sql.includes('AS checkoutIntentDigest,'))return statement;return fixtureWithOverrides(statement, {async first<T>(column?:string){const row=await statement.first<T>(column!);if(!row&&!replayRace){replayRace=true;await createCodOrder(f.db,'checkout-offer-cart','fictional-receipt',input,Date.now(),'customer');}return row;}});},batch:f.db.batch.bind(f.db)} as D1Database;
  const result=await createCodOrder(racedDb,'checkout-offer-cart','fictional-receipt',input,Date.now(),'customer');assert.equal(replayRace,true);
  assert.deepEqual(await createCodOrder(f.db,'checkout-offer-cart','fictional-receipt',input,Date.now(),'customer'),result);
  assert.equal((await getCart(f.db,'checkout-offer-cart')).items.length,0);
  const rows=f.sqlite.prepare('SELECT i.*,s.snapshot_json FROM order_items i JOIN orders o ON o.id=i.order_id JOIN order_item_offer_snapshots s ON s.order_item_id=i.id WHERE o.order_number=? ORDER BY i.unit_price_paisa').all(result.orderNumber);
  assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.unit_price_paisa),[80000,100000]);
  assert.deepEqual(rows.map(row=>JSON.parse(String(row.snapshot_json)).selection[0].value),['Medium','Large']);
  assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,1);
  assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='large'").get()!.reserved,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM orders WHERE order_number=?').get(result.orderNumber)!.n,1);
  // Simulate a later catalogue retirement; historical lookup must not join current offers.
  f.sqlite.exec("DELETE FROM product_offer_current WHERE offer_id='medium'");
  const receipt=await getOrderReceipt(f.db,result.orderNumber,null,'customer');assert.ok(receipt);
  assert.equal(receipt.items.find(row=>row.unitPricePaisa===80000)?.offerSnapshot?.selection[0].value,'Medium');
  assert.equal(receipt.items[0].offerSnapshot?.publicVersionId,set.publicVersionId);
  const document=await getOrderDocument(f.db,result.orderNumber,receipt.documents[0].id,null,'customer');assert.ok(document);
  assert.equal(document.snapshot.items.find(row=>row.unitPricePaisa===80000)?.offerSnapshot?.selection[0].value,'Medium');
  const orderId=String(rows[0].order_id),seller=await getSellerOrderDetail(f.db,orderId,'registered');assert.equal(seller?.items.length,2);assert.equal(seller?.items.find(row=>row.unitPricePaisa===80000)?.offerSnapshot?.selection[0].value,'Medium');
  assert.equal(await getSellerOrderDetail(f.db,orderId,'maker'),null);
  assert.equal(await getOrderReceipt(f.db,result.orderNumber,null,'foreign'),null);
  assert.equal(await getOrderDocument(f.db,result.orderNumber,receipt.documents[0].id,null,'foreign'),null);
  const publicInput=Object.fromEntries(Object.entries(input).filter(([key])=>key!=='customerAuthSubject'));
  assert.equal(parseCheckoutInput({...publicInput,paymentMethod:'manual_bank'}).value?.paymentMethod,'manual_bank');
  assert.equal(parseCheckoutInput({...publicInput,paymentMethod:'unsupported_card'}).value,undefined);
  // Explicit fictional historical delivery permits exercising the actual aftercare lookup.
  f.sqlite.prepare("UPDATE orders SET status='delivered',delivered_at=? WHERE id=?").run(Date.now(),orderId);
  f.sqlite.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE order_id=?").run(orderId);
  const claim=await createCustomerReturnRequest(f.db,{orderNumber:result.orderNumber,receiptTokenHash:null,customerId:'customer',orderItemId:String(rows[0].id),quantity:1,reason:'damaged',requestedResolution:'refund',detail:'The fictional medium cup arrived with a damaged rim.',locale:'en-NP',idempotencyKey:crypto.randomUUID(),evidence:[],now:Date.now()});
  assert.equal((await getCustomerReturnDetail(f.db,claim.id,result.orderNumber,null,'customer'))?.offerSnapshot?.selection[0].value,'Medium');
  assert.equal(await getCustomerReturnDetail(f.db,claim.id,result.orderNumber,null,'foreign'),null);
 }finally{f.dispose();}
});

void test('a commission publication becoming current after checkout preparation prevents the entire commit',async()=>{
 const f=await publishedOfferFixture();try{
  await seedVerifiedCheckoutContact(f.db,'customer','9811111111',f.now);const set=(await getPublicOfferSet(f.db,f.productId))!;
  await addOfferCartLine(f.db,'scheduled-terms',{productId:f.productId,offerId:'medium',versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:80000,quantity:1,requestId:'scheduled-terms-add'},Date.now());
  const original=f.db.batch.bind(f.db);let injected=false;
  const guarded={prepare:f.db.prepare.bind(f.db),batch:async function<T>(statements:D1PreparedStatement[]){if(!injected){injected=true;await new Promise(resolve=>setTimeout(resolve,20));f.sqlite.prepare("INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id) VALUES('new-current-terms','independent_seller_commission_bps',2,'1400','published',1,'controlled',?,'Fictional already approved publication reaches its start','reviewer',1,'new-current-terms')").run(Date.now());}return original<T>(statements);}} as D1Database;
  const input={customerAuthSubject:'customer',customerEmail:'customer@local.hastabazaar.test',customerPhone:'9811111111',locale:'en-NP' as const,termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Fictional Buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional locality'}};
  await assert.rejects(createCodOrder(guarded,'scheduled-terms','scheduled-receipt',input,Date.now(),'customer'));assert.equal(injected,true);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM offer_stock_reservations').get()!.n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM orders WHERE id<>'legacy-order'").get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM cart_offer_lines').get()!.n,1);
 }finally{f.dispose();}
});
