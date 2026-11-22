import type {Route as BrowserRoute} from 'playwright-core';
/** Actual public orders, current receipt readers, public forms GET and customer receivers; intercepted traffic only. */
import './helpers/public-checkout-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {publicCheckoutFixture} from './helpers/public-checkout-fixture';
import {seedCheckoutBuyer} from './helpers/checkout-contact';
import {saveFormDraft,publishFormDraft} from '../lib/db/repositories/form-catalog';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {addOfferCartLine} from '../lib/cart/offer-cart';
import {getCart} from '../lib/db/repositories/cart';
import {hashOpaqueToken} from '../lib/cart/session';
import {getOrderReceipt} from '../lib/db/repositories/orders';
import {listReturnsForCustomerReceipt} from '../lib/db/repositories/returns';
import {listComplaintsForCustomerReceipt} from '../lib/db/repositories/complaints';
import {stubFixtureImage,stubFixtureLink} from './helpers/browser-fixture-link';

void test('actual customer complaint and cancellation drafts belong to the current actor and original order',{timeout:60000},async()=>{
 const f=await publicCheckoutFixture();try{
  globalThis.publicCheckoutDb=f.db;globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};
  const checkout=await import('../app/api/checkout/route'),forms=await import('../app/api/forms/[formId]/route'),cancel=await import('../app/orders/[orderNumber]/cancel/route'),complaint=await import('../app/orders/[orderNumber]/complaints/route');
  for(const formId of ['commerce.return-request','commerce.complaint','commerce.order-cancellation']){
   const draft=await saveFormDraft(f.db,{formId,actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId,fields:[]},reason:'Publish actual supported public care configuration in the isolated order fixture.',requestId:crypto.randomUUID(),now:Date.now()});
   await publishFormDraft(f.db,{formId,draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:0,reason:'Review the current customer care contract before its actual browser use.',requestId:crypto.randomUUID(),now:Date.now()});
  }
  const firstResponse=await checkout.POST(f.request());assert.equal(firstResponse.status,201,await firstResponse.clone().text());const first=(await firstResponse.json()as{orderNumber:string}).orderNumber;
  async function another(){
   const actor=globalThis.publicCheckoutActor!,token=crypto.randomUUID(),hash=await hashOpaqueToken(token),set=(await getPublicOfferSet(f.db,f.productId))!,offer=set.offers.find(row=>row.id==='medium')!;
   await addOfferCartLine(f.db,hash,{productId:f.productId,offerId:offer.id,versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:offer.pricePaisa,quantity:1,requestId:crypto.randomUUID()},Date.now());const cart=await getCart(f.db,hash),phone=actor.userId==='customer'?'9811111111':'9822222222';
   const body={...f.body,customerEmail:actor.email,customerPhone:phone,address:{...f.body.address,phone},idempotencyKey:crypto.randomUUID(),reviewedQuote:{...f.body.reviewedQuote,lines:cart.items.map(i=>({id:i.id,sellerId:i.sellerId,pricePaisa:i.pricePaisa!,quantity:i.quantity,offerId:i.offerId!,offerVersionId:i.offerVersionId!,publicVersionId:i.publicVersionId!,revision:i.revision!}))}};
   const response=await checkout.POST(new Request('https://public-checkout.test/api/checkout',{method:'POST',headers:{origin:'https://public-checkout.test','content-type':'application/json',cookie:'hastabazaar_cart='+token},body:JSON.stringify(body)}));assert.equal(response.status,201,await response.clone().text());return(await response.json()as{orderNumber:string}).orderNumber;
  }
  const second=await another();await seedCheckoutBuyer(f.db,'care-customer-b','care-customer-b@local.hastabazaar.test','9822222222',Date.now());globalThis.publicCheckoutActor={userId:'care-customer-b',authSubject:'care-customer-b',email:'care-customer-b@local.hastabazaar.test'};const third=await another();globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};
  let orderNumber=first;const boot=async()=>{
   const actor=globalThis.publicCheckoutActor!,receipt=await getOrderReceipt(f.db,orderNumber,null,actor.userId);if(!receipt)return{denied:true,actorId:actor.userId,orderNumber};
   return{actorId:actor.userId,viewerScope:JSON.stringify([actor.userId,'account']),orderNumber,orderStatus:receipt.status,items:receipt.items,returns:await listReturnsForCustomerReceipt(f.db,orderNumber,null,actor.userId),complaints:await listComplaintsForCustomerReceipt(f.db,orderNumber,null,actor.userId)};
  };
  const bundle=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{CustomerAftercare}from'./components/commerce/customer-aftercare';import{CustomerOrderCancellation}from'./components/commerce/customer-order-cancellation';const root=createRoot(document.getElementById('root'));function render(p){root.render(p.denied?<main role='alert'>Current order access changed. Original private fields are hidden.</main>:<main><output data-testid='scope'>{p.actorId+':'+p.orderNumber}</output><CustomerAftercare {...p}/><CustomerOrderCancellation {...p}/></main>)}window.refreshCare=async()=>render(await(await fetch('/fixture-boot')).json());render(window.__BOOT__);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(b){stubFixtureLink(b);stubFixtureImage(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.refreshCare()}}}'}));}}]})).outputFiles[0].text;
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const context=await browser.newContext(),origin='https://public-checkout.test',errors:string[]=[],statuses:number[]=[];
   await context.route('**/*',async(route:BrowserRoute)=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:bundle});
    if(url.pathname==='/fixture-boot')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await boot())});
    if(url.pathname==='/customer-care')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(await boot()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    const request=new Request(url,{method:incoming.method(),headers:{...incoming.headers(),origin},...(incoming.postData()?{body:incoming.postData()}: {})});let response:Response;
    if(url.pathname.startsWith('/api/forms/'))response=await forms.GET(request,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});
    else if(url.pathname.endsWith('/cancel'))response=await cancel[incoming.method()==='POST'?'POST':'GET'](request,{params:Promise.resolve({orderNumber})});
    else if(url.pathname.endsWith('/complaints')){response=await complaint.POST(request,{params:Promise.resolve({orderNumber})});statuses.push(response.status);}
    else return route.abort();
    return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   });
   const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));await page.goto(origin+'/customer-care');
   async function open(){await page.getByRole('button',{name:'Get help or raise a complaint',exact:true}).click();const form=page.locator('form[data-form-id="commerce.complaint"]');for(let step=1;step<4;step++)await form.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Cancel order or seller parcels',exact:true}).click();await page.locator('textarea[name="detail"]').waitFor();await page.locator('form[data-form-id="commerce.order-cancellation"]').getByLabel(/^Reason/).waitFor();}
   async function fill(marker:string){await page.getByLabel('Subject',{exact:true}).fill(marker+' private subject');await page.getByLabel('Details',{exact:true}).fill(marker+' private customer details that belong only to this account and order.');await page.locator('form[data-form-id="commerce.order-cancellation"]').getByLabel(/^Reason/).fill(marker+' private cancellation reason.');}
   await open();await fill('ORIGINAL A');orderNumber=second;await page.evaluate(()=> (window as unknown as {refreshCare:()=>void}).refreshCare());await page.getByTestId('scope').getByText('customer:'+second,{exact:true}).waitFor();await open();assert.equal(await page.getByLabel('Subject',{exact:true}).inputValue(),'');assert.equal(await page.locator('form[data-form-id="commerce.order-cancellation"]').getByLabel(/^Reason/).inputValue(),'');await fill('SECOND A');
   globalThis.publicCheckoutActor={userId:'care-customer-b',authSubject:'care-customer-b',email:'care-customer-b@local.hastabazaar.test'};orderNumber=third;await page.evaluate(()=> (window as unknown as {refreshCare:()=>void}).refreshCare());await page.getByTestId('scope').getByText('care-customer-b:'+third,{exact:true}).waitFor();await open();assert.equal(await page.getByLabel('Subject',{exact:true}).inputValue(),'');assert.equal(await page.locator('form[data-form-id="commerce.order-cancellation"]').getByLabel(/^Reason/).inputValue(),'');await fill('CURRENT B');
   // Session changes before the old B props arrive: no B private complaint becomes an A command.
   globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};await page.getByRole('button',{name:'Send complaint',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Details',{exact:true}).count(),0);await page.waitForFunction(()=>!document.querySelector('form[data-form-id="commerce.order-cancellation"]'),null,{timeout:3000});assert.deepEqual(statuses,[403]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM complaints').get()!.n,0);assert.deepEqual(errors,[]);
   await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/customer-care-actor-denied.png',fullPage:true});
  }finally{await browser.close();}
 }finally{globalThis.publicCheckoutActor=null;f.dispose();}
});
