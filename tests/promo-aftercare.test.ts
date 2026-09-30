import { seedVerifiedCheckoutContact } from './helpers/checkout-contact';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentType } from 'react';
import type { ReturnCaseDetail } from '../lib/db/repositories/returns';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncentiveDb, seedIncentiveCustomer, seedIncentiveInventory, incentiveOrder } from './helpers/incentive-db';
import { createCodOrder, getOrderReceipt, getOrderDocument } from '../lib/db/repositories/orders';
import { confirmFirstCodReview } from '../lib/orders/first-cod-review';
import { savePromoDraft, publishPromo, quotePromo } from '../lib/db/repositories/promo-codes';
import { quoteCheckoutPromo } from '../lib/incentives/quote-intent';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';
import type { CheckoutInput } from '../lib/checkout/validation';
import { cancellationPreview, cancelSelectedParcels, currentReceiptSnapshot } from '../lib/cancellation/repository';
import { createCustomerReturnRequest, reviewReturnAsAdmin, advanceReturnAsAdmin, getCustomerReturnDetail } from '../lib/db/repositories/returns';
import { splitCreditRefund } from '../lib/db/repositories/wallet';
import { buildOrderEmail } from '../lib/email/order-updates';
function checkoutInput(): CheckoutInput {
  return {
    customerEmail: 'customer@example.test',
    customerPhone: '9811111111',
    locale: 'en-NP',
    termsAccepted: true,
    idempotencyKey: crypto.randomUUID(),
    address: {
      recipientName: 'Fixture Buyer',
      phone: '9811111111',
      province: 'Bagmati',
      district: 'Kathmandu',
      municipality: 'Kathmandu',
      locality: 'Fixture locality',
    },
  };
}
async function fixture(options: {price?:number; delivery?:number; minimum?:number;fixed?:number} = {}) {
  const f = await createIncentiveDb();
  await seedIncentiveCustomer(f.db);
  await seedVerifiedCheckoutContact(f.db, 'customer');
  await seedIncentiveCustomer(f.db, 'super');
  await seedIncentiveInventory(f.db);
  await f.db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1)",
    )
    .run();
  await f.db
    .prepare(
      "UPDATE seller_profiles SET seller_agreement_version=? WHERE id='seller'",
    )
    .bind(SELLER_AGREEMENT_VERSION)
    .run();
  for (const id of [
    'staff.promo-code',
    'commerce.checkout',
    'commerce.promo-quote',
  ])
    await f.db
      .prepare(
        `INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?,?,1,1,'published',?,'Fixture','super',1,'super',1,'super',1,?)`,
      )
      .bind(
        id + '-v1',
        id,
        JSON.stringify({ formId: id, fields: [] }),
        id + '-seed',
      )
      .run();
  // Existing delivery rate configuration is immutable: publish a complete fictional rate version.
  await f.db
    .prepare(
      "INSERT INTO delivery_rate_versions(id,config_json,created_by,reason,created_at) VALUES ('fixture-rates',?,'super','Fictional delivery',1)",
    )
    .bind(
      JSON.stringify({
        zones: { valley: options.delivery ?? 500, terai: options.delivery ?? 500, nationwide: options.delivery ?? 500 },
        districts: {},
      }),
    )
    .run();
  await f.db
    .prepare(
      "UPDATE delivery_rate_current SET version_id='fixture-rates' WHERE id='default'",
    )
    .run();
  await f.db.prepare("UPDATE products SET price_paisa=? WHERE id='product'").bind(options.price ?? 10000).run();
  const context = {
    actorId: 'super',
    authSubject: 'super',
    requestId: 'draft',
    expectedVersion: 0,
    now: 100,
    reason: 'Fictional approved campaign',
    form: {
      formId: 'staff.promo-code' as const,
      versionId: 'staff.promo-code-v1',
      answers: { formId: 'staff.promo-code' as const, version: 1, answers: [] },
    },
  };
  const draft = await savePromoDraft(f.db, context, {
    code: 'SAVE10',
    label: 'Save ten',
    kind: 'fixed',
    fixedPaisa: options.fixed ?? 1000,
    minimumSubtotalPaisa: options.minimum ?? 0,
    startsAt: 0,
    endsAt: 100000,
    totalUseLimit: 20,
    perCustomerUseLimit: 3,
    budgetPaisa: 20000,
  });
  await publishPromo(
    f.db,
    { ...context, requestId: 'publish', expectedVersion: 1 },
    draft.campaignId,
  );
  return { ...f, campaignId: draft.campaignId };
}
async function cart(db: D1Database, token = 'cart') {
  await db
    .prepare(
      "INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES (?,?,'NPR',1000000,1,1)",
    )
    .bind(token, token)
    .run();
  await db
    .prepare(
      "INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,?,'product',1,1,1)",
    )
    .bind(token + '-item', token)
    .run();
}

// Compile the actual financial displays; fake only Next navigation and session
// boundaries. Repository reads still run against the same native D1 fixture.
async function refundViews(db:D1Database,id:string,detail:ReturnCaseDetail) {
 const compiled=await build({stdin:{resolveDir:process.cwd(),sourcefile:'promo-refund-view.tsx',loader:'tsx',contents:`export {CustomerAftercare} from './components/commerce/customer-aftercare';export {default as AdminReturnCasePage} from './app/admin/cases/returns/[id]/page';`},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/*','react-dom','react-dom/*'],plugins:[{name:'session-boundaries',setup(b){
  b.onResolve({filter:/^next\/navigation$|^next\/link$|^cloudflare:workers$|^@\/lib\/auth\/staff$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='next/navigation'?"export function useRouter(){return {refresh(){}}};export function notFound(){throw new Error('Not found')}" : args.path==='next/link'?"const React=require('react');export default function Link(props){return React.createElement('a',props,props.children)}" : args.path==='cloudflare:workers'?"export const env={DB:globalThis.promoAftercareDb}" : "export async function requireStaffPage(){return {id:'super',role:'super_admin',permissions:[]}}"}));
 }}]});
 const m={exports:{} as {CustomerAftercare:ComponentType<{orderNumber:string;orderStatus:string;items:never[];returns:ReturnCaseDetail[];complaints:never[]}>;AdminReturnCasePage:(props:{params:Promise<{id:string}>})=>Promise<React.ReactNode>}};
 runInNewContext(compiled.outputFiles[0].text,{require:createRequire(import.meta.url),module:m,exports:m.exports,process,console,URL,URLSearchParams,Headers,crypto,TextEncoder,TextDecoder,promoAftercareDb:db});
 return {customer:renderToStaticMarkup(createElement(m.exports.CustomerAftercare,{orderNumber:detail.orderNumber,orderStatus:'delivered',items:[],returns:[detail],complaints:[]})),admin:renderToStaticMarkup(await m.exports.AdminReturnCasePage({params:Promise.resolve({id})}))};
}
async function place(db:D1Database,quantity=1,extraProducts:readonly string[]=[]) {
  await cart(db);
  await db.prepare("UPDATE cart_items SET quantity=? WHERE cart_id='cart'").bind(quantity).run();
  for(const product of extraProducts)await db.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,'cart',?,1,1,1)").bind('cart-'+product,product).run();
  const q=await quoteCheckoutPromo(db,'customer','cart','SAVE10',100);
  const placed=await createCodOrder(db,'cart','receipt',{...checkoutInput(),useWallet:true,deliveryRateVersion:'fixture-rates',customerAuthSubject:'customer',promoCode:q.code,promoRevision:q.revision,promoQuoteIntent:q.quoteIntent},100,'customer',{versionId:'commerce.checkout-v1',answers:{formId:'commerce.checkout',version:1,answers:[]}});
  const order=await db.prepare('SELECT id,grand_total_paisa AS cash FROM orders WHERE order_number=?').bind(placed.orderNumber).first<{id:string;cash:number}>();
  assert.ok(order);
  const items=(await db.prepare('SELECT id,seller_id AS seller,promo_discount_paisa AS promo,line_total_paisa AS amount FROM order_items WHERE order_id=? ORDER BY id').bind(order.id).all<{id:string;seller:string;promo:number;amount:number}>()).results;
  return {...placed,id:order.id,cash:order.cash,items};
}
async function funding(db:D1Database) {
  await db.prepare("INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('gift','hash',1200,'super','gift',1,'customer',1,'redeem')").run();
  await db.prepare("INSERT INTO wallet_entries(id,user_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('gift-credit','customer','gift',1200,-1200,'gift_card',1)").run();
  await seedIncentiveCustomer(db,'friend');
  await incentiveOrder(db,'reward-order').run();
  await db.prepare("INSERT INTO referral_redemptions(customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at) VALUES ('friend','customer','reward-order','9899999999',800,7,1)").run();
  await db.prepare("INSERT INTO wallet_entries(id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('reward-credit','customer','reward-order',800,-800,'referral_reward',1)").run();
}
async function deliver(db:D1Database,id:string) {
  await db.prepare("UPDATE orders SET status='delivered',payment_status='paid',delivered_at=200 WHERE id=?").bind(id).run();
  await db.prepare("UPDATE order_items SET fulfillment_status='delivered' WHERE order_id=? AND fulfillment_status<>'cancelled'").bind(id).run();
}
async function approve(db:D1Database,orderNumber:string,itemId:string,amount:number,delivery=0,existingCaseId?:string) {
  const r=existingCaseId ? {id:existingCaseId} : await createCustomerReturnRequest(db,{orderNumber,receiptTokenHash:null,customerId:'customer',orderItemId:itemId,quantity:1,reason:'defective',requestedResolution:'refund',detail:'The fictional product has a documented defect.',locale:'en-NP',idempotencyKey:crypto.randomUUID(),evidence:[],now:300});
  await reviewReturnAsAdmin(db,{returnRequestId:r.id,actorId:'super',actorRole:'super_admin',action:'approve',note:'Documented product defect approved for refund.',publicMessageEn:'Refund approved.',publicMessageNe:'Refund approved.',responsibility:'seller',outcome:'refund',itemRefundPaisa:amount,deliveryRefundPaisa:delivery,requestId:crypto.randomUUID(),now:300});
  return r.id;
}
async function pay(db:D1Database,returnRequestId:string) {
  const o={returnRequestId,actorId:'super',actorRole:'super_admin' as const,note:'Verified fictional cash refund accounting.',publicMessageEn:'Refund paid.',publicMessageNe:'Refund paid.',now:400};
  await advanceReturnAsAdmin(db,{...o,action:'start_refund',requestId:crypto.randomUUID()});
  const paid={...o,action:'complete_refund' as const,requestId:crypto.randomUUID(),reference:'FICTIONAL-TRANSFER'};
  await advanceReturnAsAdmin(db,paid);
  await advanceReturnAsAdmin(db,paid);
}
void test('multi-seller cancellation retains immutable promo below minimum and excludes cancelled refund capacity',async()=>{
 const f=await fixture({minimum:15000});
 try {
  await seedIncentiveCustomer(f.db,'seller-owner2');
  await f.db.prepare("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at,seller_agreement_version) SELECT 'seller2','seller-owner2',legal_name,'Second Shop',registration_authority,'REG2',tax_mode,'PAN2',representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at,seller_agreement_version FROM seller_profiles WHERE id='seller'").run();
  await f.db.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at) SELECT 'product2','seller2',category_id,'second-product','SKU2',name_en,description_en,9999,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at FROM products WHERE id='product'").run();
  await cart(f.db);
  await f.db.prepare("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES ('cart-item2','cart','product2',1,1,1)").run();
  const q=await quoteCheckoutPromo(f.db,'customer','cart','SAVE10',100);
  const o=await createCodOrder(f.db,'cart','receipt',{...checkoutInput(),deliveryRateVersion:'fixture-rates',customerAuthSubject:'customer',promoCode:q.code,promoRevision:q.revision,promoQuoteIntent:q.quoteIntent},100,'customer',{versionId:'commerce.checkout-v1',answers:{formId:'commerce.checkout',version:1,answers:[]}});
  const row=await f.db.prepare('SELECT id FROM orders WHERE order_number=?').bind(o.orderNumber).first<{id:string}>();
  assert.ok(row);
  await f.db.prepare("UPDATE orders SET status='confirmed' WHERE id=?").bind(row.id).run();
  await f.db.prepare("UPDATE order_items SET fulfillment_status='confirmed',made_to_order_snapshot=0 WHERE order_id=?").bind(row.id).run();
  const access={orderNumber:o.orderNumber,customerId:'customer'};
  let preview!: Awaited<ReturnType<typeof cancellationPreview>>;
  await assert.doesNotReject(async()=>{preview=await cancellationPreview(f.db,access,['seller2']);});
  assert.equal(preview.next.discount,500);
  await cancelSelectedParcels(f.db,access,{sellerIds:['seller2'],fingerprint:preview.fingerprint,requestId:'cancel-promo',note:'Cancel the second fictional parcel.',now:200});
  const receipt=await getOrderReceipt(f.db,o.orderNumber,null,'customer');
  assert.equal((receipt as unknown as {promoDiscountPaisa:number})?.promoDiscountPaisa,500);
  assert.equal(receipt?.referralDiscountPaisa,0);
  assert.equal(receipt?.grandTotalPaisa,10000);
  const retained=(await f.db.prepare("SELECT id FROM order_items WHERE order_id=? AND seller_id='seller'").bind(row.id).first<{id:string}>())!;
  const snapshot=await currentReceiptSnapshot(f.db,row.id,{promoDiscountPaisa:1000,referralDiscountPaisa:0});
  assert.equal(snapshot.promoDiscountPaisa,500);
  await deliver(f.db,row.id);
  await assert.rejects(approve(f.db,o.orderNumber,retained.id,10000,750),'cancellation must remove cancelled delivery refund capacity');
  const pendingCase=await f.db.prepare("SELECT id FROM return_requests WHERE order_item_id=? AND status='requested'").bind(retained.id).first<{id:string}>();
  assert.ok(pendingCase);
  const r=await approve(f.db,o.orderNumber,retained.id,10000,500,pendingCase.id);
  const detail=await getCustomerReturnDetail(f.db,r,o.orderNumber,null,'customer');
  assert.equal((detail as unknown as {refundPromoPaisa:number})?.refundPromoPaisa,500);
  await pay(f.db,r);
  const final=await getOrderReceipt(f.db,o.orderNumber,null,'customer');
  assert.equal(final?.paymentStatus,'refunded');
  assert.equal(final?.grandTotalPaisa,0);
  const originals=(await f.db.prepare('SELECT promo_discount_paisa AS original,current_promo_discount_paisa AS current,refunded_promo_discount_paisa AS refunded,fulfillment_status AS status FROM order_items WHERE order_id=? ORDER BY seller_id').bind(row.id).all()).results;
  assert.deepEqual(originals.map(i=>[i.original,i.current,i.refunded]),[[500,0,500],[500,0,0]]);
  const campaign=await f.db.prepare('SELECT used_count AS uses,spent_paisa AS spent FROM promo_campaigns WHERE id=?').bind(f.campaignId).first();
  assert.deepEqual(campaign,{uses:1,spent:1000});
 } finally {await f.dispose();}
});
void test('full refund retains promo consumption and restores only wallet spend',async()=>{
 const f=await fixture({delivery:0});
 try {
  await funding(f.db);
  const o=await place(f.db);
  const before=await f.db.prepare('SELECT used_count AS usedCount,spent_paisa AS spentPaisa FROM promo_campaigns WHERE id=?').bind(f.campaignId).first();
  const initialSplit=await splitCreditRefund(f.db,o.id,10000);
  assert.equal(initialSplit.discountPaisa,0,'promo must never become a referral offset');
  await deliver(f.db,o.id);
  const r=await approve(f.db,o.orderNumber,o.items[0].id,10000);
  const pending=await getCustomerReturnDetail(f.db,r,o.orderNumber,null,'customer');
  assert.equal(pending?.refundDiscountPaisa,0);
  assert.equal((pending as unknown as {refundPromoPaisa:number})?.refundPromoPaisa,1000);
  await pay(f.db,r);
  const detail=await getCustomerReturnDetail(f.db,r,o.orderNumber,null,'customer');
  const walletRestoredPaisa=(await f.db.prepare("SELECT SUM(amount_paisa) AS amount FROM wallet_entries WHERE order_id=? AND kind='refund'").bind(o.id).first<{amount:number}>())!.amount;
  const cashRefundPaisa=(detail as unknown as {refundCashPaisa:number})!.refundCashPaisa;
  const paidCashPaisa=o.cash;
  assert.ok(detail);
  const views=await refundViews(f.db,r,detail);
  assert.match(views.customer.replace(/<[^>]*>/g,''),/Cash refund: NPR\s*70\.00/);
  assert.match(views.customer,/Promo savings/);
  assert.match(views.admin.replace(/<[^>]*>/g,''),/Cash to refundNPR\s*70\.00/);
  assert.match(views.admin,/Promo savings \(not refundable\)/);
  const after=await f.db.prepare('SELECT used_count AS usedCount,spent_paisa AS spentPaisa FROM promo_campaigns WHERE id=?').bind(f.campaignId).first();
  assert.equal(walletRestoredPaisa,2000);
  assert.equal(cashRefundPaisa,paidCashPaisa);
  assert.equal(after!.spentPaisa,before!.spentPaisa);
  assert.deepEqual(after,before);
  const receipt=await getOrderReceipt(f.db,o.orderNumber,null,'customer');
  assert.equal(receipt?.paymentStatus,'refunded');
  assert.equal(receipt?.grandTotalPaisa,0);
  const counters=await f.db.prepare('SELECT current_promo_discount_paisa AS current,refunded_promo_discount_paisa AS refunded FROM orders WHERE id=?').bind(o.id).first();
  assert.deepEqual(counters,{current:0,refunded:1000});
 }finally{await f.dispose();}
});
void test('three paid partial refunds conserve line promo rounding and historical expired documents',async()=>{
 const f=await fixture({price:3334,delivery:0});
 try {
  await funding(f.db);
  const o=await place(f.db,3);
  const original=await getOrderReceipt(f.db,o.orderNumber,null,'customer');
  const document=await getOrderDocument(f.db,o.orderNumber,original!.documents[0].id,null,'customer');
  await f.db.prepare('UPDATE promo_campaigns SET paused=1 WHERE id=?').bind(f.campaignId).run();
  await deliver(f.db,o.id);
  const initialSplit=await splitCreditRefund(f.db,o.id,3334);
  assert.equal(initialSplit.discountPaisa,0,'partial promo is a distinct immutable line offset');
  const expected=[334,333,333];
  for(let i=0;i<3;i++){
   const r=await approve(f.db,o.orderNumber,o.items[0].id,3334);
   const detail=await getCustomerReturnDetail(f.db,r,o.orderNumber,null,'customer');
   assert.equal((detail as unknown as {refundPromoPaisa:number})?.refundPromoPaisa,expected[i]);
   const pending=await f.db.prepare('SELECT refunded_promo_discount_paisa AS refunded FROM orders WHERE id=?').bind(o.id).first();
   assert.equal(pending!.refunded,i===0?0:i===1?334:667);
   await pay(f.db,r);
   const current=await getOrderReceipt(f.db,o.orderNumber,null,'customer');
   assert.equal(current?.paymentStatus,i===2?'refunded':'part_refunded');
   assert.equal((current as unknown as {promoDiscountPaisa:number})?.promoDiscountPaisa,1000-expected.slice(0,i+1).reduce((a,b)=>a+b,0));
  }
  const totals=await f.db.prepare("SELECT SUM(promo_discount_paisa) AS promo,SUM(wallet_credit_paisa) AS wallet,SUM(amount_paisa-wallet_credit_paisa-referral_discount_paisa-promo_discount_paisa) AS cash FROM refunds WHERE order_id=? AND status='paid'").bind(o.id).first();
  assert.deepEqual(totals,{promo:1000,wallet:2000,cash:7002});
  await assert.rejects(quotePromo(f.db,{userId:'customer',code:'SAVE10',subtotalPaisa:10002,now:100001}));
  const saved=await getOrderDocument(f.db,o.orderNumber,document!.id,null,'customer');
  assert.deepEqual(saved,document);
  assert.equal(saved?.snapshot.promo?.label,'Save ten');
  assert.equal(saved?.snapshot.promo?.revision,1);
  const line=await f.db.prepare('SELECT promo_discount_paisa AS original,current_promo_discount_paisa AS current,refunded_promo_discount_paisa AS refunded FROM order_items WHERE id=?').bind(o.items[0].id).first();
  assert.deepEqual(line,{original:1000,current:0,refunded:1000});
 }finally{await f.dispose();}
});
void test('historical referral refund split and promo email labels remain distinct',async()=>{
 const f=await fixture();
 try {
  await incentiveOrder(f.db,'legacy',1000,0).run();
  assert.deepEqual(await splitCreditRefund(f.db,'legacy',3333),{basePaisa:0,walletPaisa:0,discountPaisa:333});
  const email=buildOrderEmail({orderNumber:'FIX',eventStatus:'confirmed',currentStatus:'confirmed',email:'customer@example.test',cashPaisa:9000,walletPaisa:0,discountPaisa:0,promoPaisa:1000,trackingCode:null,occurredAt:1} as never,'https://example.test');
  assert.match(email.text,/Promo savings/);
  assert.doesNotMatch(email.text,/Referral discount/);
 }finally{await f.dispose();}
});

void test('fully discounted three-part merchandise never invents cash in a partial refund',async()=>{
 const f=await fixture({price:334,delivery:0});
 try {
  await f.db.prepare("INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('gift','hash',2,'super','gift',1,'customer',1,'redeem')").run();
  await f.db.prepare("INSERT INTO wallet_entries(id,user_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('gift-credit','customer','gift',2,-2,'gift_card',1)").run();
  const o=await place(f.db,3);
  assert.equal(o.cash,0);
  await deliver(f.db,o.id);
  for(let i=0;i<3;i++){
   const r=await approve(f.db,o.orderNumber,o.items[0].id,334);
   const detail=await getCustomerReturnDetail(f.db,r,o.orderNumber,null,'customer');
   assert.equal(detail?.refundCashPaisa,0,'an order paid entirely by promo and wallet has no refundable cash');
   await pay(f.db,r);
  }
  const offsets=await f.db.prepare("SELECT SUM(wallet_credit_paisa) AS wallet,SUM(promo_discount_paisa) AS promo FROM refunds WHERE order_id=? AND status='paid'").bind(o.id).first();
  assert.deepEqual(offsets,{wallet:2,promo:1000});
 }finally{await f.dispose();}
});

void test('unsafe gross item plus delivery refund rejects before its financial batch',async()=>{
 const f=await fixture({price:Number.MAX_SAFE_INTEGER,delivery:500});
 try {
  const o=await place(f.db);
  await confirmFirstCodReview(f.db,{orderId:o.id,actorId:'super',reason:'Fictional high-value COD order contact confirmed for this refund test.',requestId:crypto.randomUUID(),now:150});
  await deliver(f.db,o.id);
  const r=await createCustomerReturnRequest(f.db,{orderNumber:o.orderNumber,receiptTokenHash:null,customerId:'customer',orderItemId:o.items[0].id,quantity:1,reason:'defective',requestedResolution:'refund',detail:'The fictional product has a documented defect.',locale:'en-NP',idempotencyKey:crypto.randomUUID(),evidence:[],now:300});
  let enteredBatch=false;
  const checkedDb={prepare:(sql:string)=>f.db.prepare(sql),batch:(statements:D1PreparedStatement[])=>{enteredBatch=true;return f.db.batch(statements);}} as D1Database;
  await assert.rejects(reviewReturnAsAdmin(checkedDb,{returnRequestId:r.id,actorId:'super',actorRole:'super_admin',action:'approve',note:'Documented product defect approved for refund.',publicMessageEn:'Refund approved.',publicMessageNe:'Refund approved.',responsibility:'seller',outcome:'refund',itemRefundPaisa:Number.MAX_SAFE_INTEGER,deliveryRefundPaisa:500,requestId:crypto.randomUUID(),now:300}));
  assert.equal(enteredBatch,false,'unsafe gross totals must not enter a financial batch');
  const count=await f.db.prepare('SELECT COUNT(*) AS count FROM refunds WHERE order_id=?').bind(o.id).first();
  assert.equal(count!.count,0);
 }finally{await f.dispose();}
});

void test('interleaved zero-cash zero-promo-offset payments reject stale aggregate overwrite',async()=>{
 const f=await fixture({price:1,delivery:0,fixed:1});
 try {
  for(const id of ['product2','product3'])await f.db.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at) SELECT ?,seller_id,category_id,?,?,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at FROM products WHERE id='product'").bind(id,id,id).run();
  await f.db.prepare("INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id) VALUES ('gift','hash',2,'super','gift',1,'customer',1,'redeem')").run();
  await f.db.prepare("INSERT INTO wallet_entries(id,user_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES ('gift-credit','customer','gift',2,-2,'gift_card',1)").run();
  const o=await place(f.db,1,['product2','product3']);
  await deliver(f.db,o.id);
  const zeros=o.items.filter(item=>item.promo===0);
  assert.equal(zeros.length,2);
  const cases=[] as string[];
  for(const item of zeros)cases.push(await approve(f.db,o.orderNumber,item.id,1));
  const base={actorId:'super',actorRole:'super_admin' as const,note:'Verified fictional cash refund accounting.',publicMessageEn:'Refund paid.',publicMessageNe:'Refund paid.',now:400};
  for(const returnRequestId of cases)await advanceReturnAsAdmin(f.db,{...base,returnRequestId,action:'start_refund',requestId:crypto.randomUUID()});
  let arrivals=0;let release!:()=>void;const ready=new Promise<void>(resolve=>{release=resolve});
  const interleaved={prepare:(sql:string)=>f.db.prepare(sql),async batch(statements:D1PreparedStatement[]){if(++arrivals===2)release();await ready;return f.db.batch(statements);}} as D1Database;
  const completions=cases.map(returnRequestId=>({...base,returnRequestId,action:'complete_refund' as const,requestId:crypto.randomUUID(),reference:'FICTIONAL-TRANSFER'}));
  const outcomes=await Promise.allSettled(completions.map(options=>advanceReturnAsAdmin(interleaved,options)));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1,'same cash/promo totals cannot authorize a stale merchandise/wallet overwrite');
  const failed=outcomes.findIndex(result=>result.status==='rejected');
  await advanceReturnAsAdmin(f.db,completions[failed]);
  const current=await f.db.prepare('SELECT current_subtotal_paisa AS subtotal,current_wallet_paisa AS wallet,current_total_paisa AS cash,current_promo_discount_paisa AS promo,refunded_promo_discount_paisa AS refunded FROM orders WHERE id=?').bind(o.id).first();
  assert.deepEqual(current,{subtotal:1,wallet:0,cash:0,promo:1,refunded:0});
  const restored=await f.db.prepare("SELECT SUM(amount_paisa) AS amount FROM wallet_entries WHERE order_id=? AND kind='refund'").bind(o.id).first();
  assert.equal(restored!.amount,2);
 }finally{await f.dispose();}
});

for (const priorCancellation of [false,true]) void test(`delivery-only approval reserves retained capacity atomically${priorCancellation?' after prior cancellation':''}`,async()=>{
 const f=await fixture({delivery:500});
 try {
  await f.db.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at) SELECT 'product2',seller_id,category_id,'product2','SKU2',name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at FROM products WHERE id='product'").run();
  if(priorCancellation){
   await seedIncentiveCustomer(f.db,'seller-owner2');
   await f.db.prepare("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at,seller_agreement_version) SELECT 'seller2','seller-owner2',legal_name,'Second Shop',registration_authority,'REG2',tax_mode,'PAN2',representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at,seller_agreement_version FROM seller_profiles WHERE id='seller'").run();
   await f.db.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at) SELECT 'product3','seller2',category_id,'product3','SKU3',name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at FROM products WHERE id='product'").run();
  }
  const o=await place(f.db,1,priorCancellation?['product2','product3']:['product2']);
  if(priorCancellation){
   await f.db.prepare("UPDATE orders SET status='confirmed' WHERE id=?").bind(o.id).run();
   await f.db.prepare("UPDATE order_items SET fulfillment_status='confirmed',made_to_order_snapshot=0 WHERE order_id=?").bind(o.id).run();
   const access={orderNumber:o.orderNumber,customerId:'customer'};
   const preview=await cancellationPreview(f.db,access,['seller2']);
   assert.equal(preview.previous.delivery,750);assert.equal(preview.next.delivery,500);
   await cancelSelectedParcels(f.db,access,{sellerIds:['seller2'],fingerprint:preview.fingerprint,requestId:'cancel-before-delivery-race',note:'Cancel the second fictional parcel.',now:200});
  }
  await deliver(f.db,o.id);
  const lines=o.items.filter(item=>item.seller==='seller');
  const cases=[] as string[];
  for(const item of lines){
   const r=await createCustomerReturnRequest(f.db,{orderNumber:o.orderNumber,receiptTokenHash:null,customerId:'customer',orderItemId:item.id,quantity:1,reason:'defective',requestedResolution:'refund',detail:'The fictional product has a documented defect.',locale:'en-NP',idempotencyKey:crypto.randomUUID(),evidence:[],now:300});cases.push(r.id);
  }
  async function caseState(id:string){
   return {row:await f.db.prepare('SELECT * FROM return_requests WHERE id=?').bind(id).first(),events:(await f.db.prepare('SELECT * FROM return_request_events WHERE return_request_id=? ORDER BY id').bind(id).all()).results,audits:(await f.db.prepare("SELECT * FROM audit_logs WHERE subject_id=? ORDER BY id").bind(id).all()).results};
  }
  const before=await Promise.all(cases.map(caseState));
  let arrivals=0;let release!:()=>void;const ready=new Promise<void>(resolve=>{release=resolve});
  const interleaved={prepare:(sql:string)=>f.db.prepare(sql),async batch(statements:D1PreparedStatement[]){if(++arrivals===2)release();await ready;return f.db.batch(statements);}} as D1Database;
  const outcomes=await Promise.allSettled(cases.map((id,i)=>approve(interleaved,o.orderNumber,lines[i].id,0,500,id).catch(error=>{release();throw error})));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1,'only one approval may promise the retained delivery cash');
  const winner=outcomes.findIndex(result=>result.status==='fulfilled'),loser=outcomes.findIndex(result=>result.status==='rejected');
  const reserved=await f.db.prepare("SELECT COUNT(*) AS refunds,SUM(item_amount_paisa) AS merchandise,SUM(delivery_amount_paisa) AS delivery,SUM(amount_paisa-wallet_credit_paisa-referral_discount_paisa-promo_discount_paisa) AS cash FROM refunds WHERE order_id=? AND status<>'rejected'").bind(o.id).first();
  assert.deepEqual(reserved,{refunds:1,merchandise:0,delivery:500,cash:500});
  assert.deepEqual(await caseState(cases[loser]),before[loser],'losing batch leaves the request, events and audit unchanged');
  const loserDetail=await getCustomerReturnDetail(f.db,cases[loser],o.orderNumber,null,'customer');
  assert.equal(loserDetail!.status,'requested');assert.equal(loserDetail!.refundId,null);assert.equal(loserDetail!.refundCashPaisa,null);
  const liabilities=await f.db.prepare('SELECT COUNT(*) AS count,SUM(amount_paisa) AS amount FROM refund_liability_entries WHERE refund_id IN (SELECT id FROM refunds WHERE order_id=?)').bind(o.id).first();
  assert.deepEqual(liabilities,{count:1,amount:500});
  const advance={returnRequestId:cases[winner],actorId:'super',actorRole:'super_admin' as const,note:'Fictional payout attempt and retry.',publicMessageEn:'Refund processing update.',publicMessageNe:'Refund processing update.',now:400};
  await advanceReturnAsAdmin(f.db,{...advance,action:'start_refund',requestId:crypto.randomUUID()});
  await advanceReturnAsAdmin(f.db,{...advance,action:'fail_refund',requestId:crypto.randomUUID()});
  await assert.rejects(approve(f.db,o.orderNumber,lines[loser].id,0,500,cases[loser]),/remaining delivery charge/,'failed promo payout keeps its reservation for retry');
  assert.deepEqual(await caseState(cases[loser]),before[loser]);
  await pay(f.db,cases[winner]);
  const paid=await f.db.prepare("SELECT COUNT(*) AS refunds,SUM(delivery_amount_paisa) AS delivery,SUM(amount_paisa-wallet_credit_paisa-referral_discount_paisa-promo_discount_paisa) AS cash FROM refunds WHERE order_id=? AND status='paid'").bind(o.id).first();
  assert.deepEqual(paid,{refunds:1,delivery:500,cash:500});
  const receipt=await getOrderReceipt(f.db,o.orderNumber,null,'customer');assert.equal(receipt!.deliveryChargePaisa,0);
 }finally{await f.dispose();}
});
