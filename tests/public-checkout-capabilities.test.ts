import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/public-checkout-runtime';
import {publicCheckoutFixture} from './helpers/public-checkout-fixture';
import {readCheckoutPaymentCapabilities} from '../lib/checkout/payment-capabilities';
import {confirmOfferStock} from '../lib/products/offer-inventory';
import {retireCompanyAccount} from '../lib/payments/company-accounts';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {addOfferCartLine} from '../lib/cart/offer-cart';
import {getCart} from '../lib/db/repositories/cart';
import {seedCheckoutBuyer} from './helpers/checkout-contact';
import {saveFormDraft,publishFormDraft} from '../lib/db/repositories/form-catalog';
import {validateSellerFormSubmission} from '../lib/forms/submission';
import {updateCustomerProfile} from '../lib/db/repositories/customers';
void test('actual public COD route accepts genuine reviewed in-stock variant and retains one original order on retry',async()=>{
 const f=await publicCheckoutFixture();try{globalThis.publicCheckoutDb=f.db;globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};const before=Number(f.sqlite.prepare("SELECT COUNT(*) n FROM orders WHERE customer_id='customer'").get()!.n),api=await import('../app/api/checkout/route'),response=await api.POST(f.request()),body=await response.json()as{orderNumber?:string;error?:string};assert.equal(response.status,201,JSON.stringify(body));assert.ok(body.orderNumber);const replay=await api.POST(f.request());assert.equal(replay.status,201);assert.equal((await replay.json()as{orderNumber:string}).orderNumber,body.orderNumber);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM orders WHERE customer_id='customer'").get()!.n,before+1);assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,1);}finally{globalThis.publicCheckoutActor=null;f.dispose();}
});
void test('current genuine stock and selected verified NPR source determine methods without exposing bank data',async()=>{
 const f=await publicCheckoutFixture({bank:true});try{
  assert.deepEqual(await readCheckoutPaymentCapabilities(f.db,{cartHash:f.cartHash}),{cod:true,manual_bank:true,state:'ready'});
  const revision=Number(f.sqlite.prepare('SELECT revision FROM company_payment_account_versions WHERE id=?').get(f.accountVersionId)!.revision);
  await retireCompanyAccount(f.db,{actorId:'reviewer',requestId:'public-bank-retired',expectedRevision:String(revision),now:Date.now()},{versionId:f.accountVersionId!,reason:'Retire this original fictional receiving account while preserving old instructions.'});
  const actual=await readCheckoutPaymentCapabilities(f.db,{cartHash:f.cartHash});assert.equal(actual.cod,true);assert.equal(actual.manual_bank,false);assert.equal(JSON.stringify(actual).includes('TEST-PUBLIC'),false);
  const stock=Number(f.sqlite.prepare("SELECT revision FROM offer_stock WHERE offer_id='medium'").get()!.revision);
  await confirmOfferStock(f.db,{actorId:'registered-owner',requestId:'public-stock-empty',expectedRevision:String(stock),now:Date.now()},{offerId:'medium',available:0,independentStockConfirmed:true,reason:'The actual fictional medium-size allocation is no longer available.'});
  assert.deepEqual(await readCheckoutPaymentCapabilities(f.db,{cartHash:f.cartHash}),{cod:false,manual_bank:false,state:'cart_unavailable'});
 }finally{f.dispose();}
});
void test('manual public checkout retains original instructions and exact replay after account retirement, but refuses a fresh bank order',async()=>{
 const f=await publicCheckoutFixture({bank:true});try{globalThis.publicCheckoutDb=f.db;globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};const api=await import('../app/api/checkout/route'),response=await api.POST(f.request()),body=await response.json()as{orderNumber:string;error?:string};assert.equal(response.status,201,JSON.stringify(body));
  const saved=f.sqlite.prepare('SELECT o.id,o.status,o.payment_status,i.account_version_id,w.issued_at,w.deadline_at FROM orders o JOIN company_payment_instructions i ON i.order_id=o.id JOIN manual_payment_windows w ON w.order_id=o.id WHERE o.order_number=?').get(body.orderNumber)!;assert.equal(saved.status,'placed');assert.equal(saved.payment_status,'unpaid');assert.equal(saved.account_version_id,f.accountVersionId);assert.equal(Number(saved.deadline_at)-Number(saved.issued_at),86400000);
  const revision=Number(f.sqlite.prepare('SELECT revision FROM company_payment_account_versions WHERE id=?').get(f.accountVersionId)!.revision);await retireCompanyAccount(f.db,{actorId:'reviewer',requestId:'issued-bank-retired',expectedRevision:String(revision),now:Date.now()},{versionId:f.accountVersionId!,reason:'Stop new instructions without invalidating this actually issued original order.'});
  const replay=await api.POST(f.request());assert.equal(replay.status,201);assert.equal((await replay.json()as{orderNumber:string}).orderNumber,body.orderNumber);
  const set=(await getPublicOfferSet(f.db,f.productId))!;await addOfferCartLine(f.db,f.cartHash,{productId:f.productId,offerId:'medium',versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:80000,quantity:1,requestId:crypto.randomUUID()},Date.now());const current=await getCart(f.db,f.cartHash);
  const fresh={...f.body,idempotencyKey:crypto.randomUUID(),reviewedQuote:{...f.body.reviewedQuote,lines:current.items.map(i=>({id:i.id,sellerId:i.sellerId,pricePaisa:i.pricePaisa!,quantity:i.quantity,offerId:i.offerId!,offerVersionId:i.offerVersionId!,publicVersionId:i.publicVersionId!,revision:i.revision!}))}};
  assert.equal((await api.POST(f.request(fresh))).status,503);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_payment_instructions').get()!.n,1);assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,1);assert.equal((await getCart(f.db,f.cartHash)).items.length,1);
 }finally{globalThis.publicCheckoutActor=null;f.dispose();}
});
void test('public route rechecks native current stock at commit and keeps the exact cart on a competing count',async()=>{
 const f=await publicCheckoutFixture();try{let changed=false;const before=Number(f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n);globalThis.publicCheckoutDb={prepare:f.db.prepare.bind(f.db),batch:async(statements:D1PreparedStatement[])=>{if(!changed){changed=true;await confirmOfferStock(f.db,{actorId:'registered-owner',requestId:'public-competing-stock',expectedRevision:'0',now:Date.now()},{offerId:'medium',available:0,independentStockConfirmed:true,reason:'A genuine current count wins before this checkout reservation commits.'});}return f.db.batch(statements);}} as D1Database;globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};const api=await import('../app/api/checkout/route'),response=await api.POST(f.request());assert.equal(response.status,409,await response.text());assert.equal(changed,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n,before);assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,0);assert.equal((await getCart(f.db,f.cartHash)).items.length,1);}finally{globalThis.publicCheckoutActor=null;f.dispose();}
});
void test('a retained browser identity cannot place a public order after actual customer access is revoked',async()=>{
 const f=await publicCheckoutFixture();try{globalThis.publicCheckoutDb=f.db;globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='customer'").run();const api=await import('../app/api/checkout/route'),response=await api.POST(f.request());assert.equal(response.status,401,await response.text());assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,0);assert.equal((await getCart(f.db,f.cartHash)).items.length,1);}finally{globalThis.publicCheckoutActor=null;f.dispose();}
});
void test('old checkout actor intent cannot place the former address after legitimate phone ownership and account changes',async()=>{
 const f=await publicCheckoutFixture();try{
  const formId='account.profile',draft=await saveFormDraft(f.db,{formId,actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId,fields:[]},reason:'Publish the actual supported profile contract for this fictional contact change.',requestId:crypto.randomUUID(),now:Date.now()}),published=await publishFormDraft(f.db,{formId,draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:0,reason:'Review the original profile form before changing the former account contact.',requestId:crypto.randomUUID(),now:Date.now()}),validated=await validateSellerFormSubmission(f.db,formId,published.version,[]);
  await updateCustomerProfile(f.db,{userId:'customer',displayName:'Fictional original customer',phone:'9823333333',locale:'en-NP',requestId:crypto.randomUUID(),now:Date.now(),formVersion:published.version,versionId:validated.versionId,answers:validated.answers});
  await seedCheckoutBuyer(f.db,'checkout-b','checkout-b@local.hastabazaar.test','9811111111',Date.now());globalThis.publicCheckoutDb=f.db;globalThis.publicCheckoutActor={userId:'checkout-b',authSubject:'checkout-b',email:'checkout-b@local.hastabazaar.test'};
  const api=await import('../app/api/checkout/route'),original=f.request(),headers=new Headers(original.headers);headers.set('X-Hastabazaar-Actor','customer');const response=await api.POST(new Request(original,{headers}));
  assert.equal(response.status,403,await response.text());assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM orders WHERE customer_id='checkout-b'").get()!.n,0);assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,0);assert.equal((await getCart(f.db,f.cartHash)).items.length,1);
 }finally{globalThis.publicCheckoutActor=null;f.dispose();}
});
