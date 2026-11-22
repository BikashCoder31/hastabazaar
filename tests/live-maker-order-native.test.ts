import assert from 'node:assert/strict';
import test from 'node:test';
import {activatedLiveMakerFixture} from './helpers/activated-live-maker-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {seedCheckoutBuyer} from './helpers/checkout-contact';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {addOfferCartLine} from '../lib/cart/offer-cart';
import {createCodOrder,getOrderReceipt} from '../lib/db/repositories/orders';
import {getLiveManagedInvoiceDocument} from '../lib/db/repositories/live-managed-documents';

/** EXPLAIN diagnoses a failed fixture statement without executing a second mutation. */
function diagnosed(db:D1Database,failures:string[]):D1Database{
 const sources=new WeakMap<object,{sql:string;values:unknown[]}>();
 const wrap=(statement:D1PreparedStatement,sql:string,values:unknown[]=[]):D1PreparedStatement=>{
  const proxy=new Proxy(statement,{get(target,key){
   if(key==='bind')return(...next:unknown[])=>wrap(target.bind(...next),sql,next);
   const value=Reflect.get(target,key);if(typeof value!=='function')return value;
   return async(...args:unknown[])=>{try{return await Reflect.apply(value,target,args);}catch(error){failures.push(String(error)+'\nFixture SQL: '+sql);throw error;}};
  }});sources.set(proxy,{sql,values});return proxy;
 };
 return new Proxy(db,{get(target,key){
  if(key==='prepare')return(sql:string)=>wrap(target.prepare(sql),sql);
  if(key==='batch')return async(statements:D1PreparedStatement[])=>{try{return await target.batch(statements);}catch(error){
   if(String(error).includes('Expression tree'))for(let index=0;index<statements.length;index++){const source=sources.get(statements[index]);if(source)try{await target.prepare('EXPLAIN '+source.sql).bind(...source.values).all();}catch(cause){failures.push(`Fixture batch statement ${index}: ${source.sql}\n${String(cause)}`);break;}}
   throw error;
  }};
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
}

void test('native D1 actual public checkout races retain one order, invoice, number and reservation',async()=>{
 const f=await activatedLiveMakerFixture('native-actual-order');let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  const buyerId='native-live-buyer',cartToken='native-live-cart',input={customerAuthSubject:buyerId,customerEmail:buyerId+'@local.hastabazaar.test',customerPhone:'9811111111',locale:'en-NP' as const,termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Fictional native buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional native destination'}};
  await seedCheckoutBuyer(f.db,buyerId,input.customerEmail,input.customerPhone);
  native=await nativeFinanceClone(f.sqlite);const failures:string[]=[],db=diagnosed(native.db,failures);
  const offers=await getPublicOfferSet(db,f.productId);assert.ok(offers?.orderable);
  await addOfferCartLine(db,cartToken,{productId:f.productId,offerId:f.offerId,versionId:offers.versionId,publicVersionId:offers.publicVersionId,pricePaisa:80000,quantity:1,requestId:'native-live-cart-add'},Date.now());
  const attempts=await Promise.allSettled([1,2].map(()=>createCodOrder(db,cartToken,'native-live-receipt',input,Date.now(),buyerId)));
  assert.ok(attempts.every(result=>result.status==='fulfilled'),JSON.stringify({outcomes:attempts.map(result=>result.status==='rejected'?String(result.reason):result.value),failures}));
  const first=attempts[0];assert.equal(first.status,'fulfilled');
  assert.deepEqual(attempts[1],first);
  for(const table of ['orders','managed_commercial_snapshots','managed_invoice_groups','managed_live_invoice_numbers','offer_stock_reservations'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table).first<{n:number}>())!.n,1,table);
  const commercial=await db.prepare('SELECT record_kind kind,simulation_label label,live_activation_decision_id decision,live_customer_id customer FROM managed_commercial_snapshots').first<{kind:string;label:string|null;decision:string;customer:string}>();assert.deepEqual(commercial,{kind:'live',label:null,decision:f.activation.id,customer:buyerId});
  const receipt=await getOrderReceipt(db,first.value.orderNumber,null,buyerId),invoice=receipt!.documents.find(document=>document.kind==='commercial_invoice');assert.ok(invoice);
  assert.ok(await getLiveManagedInvoiceDocument(db,{orderNumber:first.value.orderNumber,invoiceId:invoice.id,receiptTokenHash:null,customerId:buyerId}));
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{if(native)await native.dispose();f.dispose();}
});

