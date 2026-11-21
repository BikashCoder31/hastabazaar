import {openCheckoutAddress} from './helpers/checkout-step-navigation';
import type {Route as BrowserRoute} from 'playwright-core';
import './helpers/public-checkout-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {publicCheckoutFixture} from './helpers/public-checkout-fixture';
import {seedCheckoutBuyer} from './helpers/checkout-contact';
import {getContactVerificationStatus} from '../lib/auth/contact-verification';
import {readCheckoutPaymentCapabilities} from '../lib/checkout/payment-capabilities';
import {stubFixtureImage,stubFixtureLink} from './helpers/browser-fixture-link';

void test('actual Contact status403 hides the matching checkout private draft before new account props arrive',{timeout:45000},async()=>{
 const f=await publicCheckoutFixture();let release=()=>{};try{
  globalThis.publicCheckoutDb=f.db;globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};
  await seedCheckoutBuyer(f.db,'contact-b','contact-b@local.hastabazaar.test','9866666663',Date.now());
  const cart=await import('../app/api/cart/route'),forms=await import('../app/api/forms/[formId]/route'),contacts=await import('../app/api/account/contact-verification/route');
  const props={customerId:'customer',customerEmail:'customer@local.hastabazaar.test',customerPhone:'9811111111',customerDisplayName:'Fictional original buyer',contactStatus:await getContactVerificationStatus(f.db,globalThis.publicCheckoutActor),cartScope:f.cartHash,paymentCapabilities:await readCheckoutPaymentCapabilities(f.db,{cartHash:f.cartHash}),policyContext:f.policyContext,serviceFee:f.serviceFee,deliveryRates:f.rates};
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{CheckoutForm}from'./components/commerce/checkout-form';createRoot(document.getElementById('root')).render(<CheckoutForm {...window.__BOOT__}/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(b){stubFixtureLink(b);stubFixtureImage(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){}}}'}));}}]})).outputFiles[0].text;
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const context=await browser.newContext(),origin='https://public-checkout.test',errors:string[]=[],statuses:number[]=[];let waiting=()=>{},completed=()=>{};const pending=new Promise<void>(resolve=>{waiting=resolve}),gate=new Promise<void>(resolve=>{release=resolve}),done=new Promise<void>(resolve=>{completed=resolve});
   await context.route('**/*',async(route:BrowserRoute)=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:code});
    if(url.pathname==='/checkout')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(props).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    const request=new Request(url,{method:incoming.method(),headers:{...incoming.headers(),origin,cookie:'hastabazaar_cart='+f.token},...(incoming.postData()?{body:incoming.postData()}: {})});let response:Response;
    if(url.pathname==='/api/cart')response=await cart.GET(request);
    else if(url.pathname.startsWith('/api/forms/'))response=await forms.GET(request,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});
    else if(url.pathname==='/api/account/contact-verification'){waiting();await gate;response=await contacts.GET(request);statuses.push(response.status);completed();}
    else return route.abort();
    return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   });
   const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));await page.goto(origin+'/checkout');await pending;
   await page.getByLabel(/^Recipient name/).fill('PRIVATE ORIGINAL ACCOUNT RECIPIENT');await openCheckoutAddress(page);await page.getByLabel(/^Street, tole or locality/).fill('PRIVATE ORIGINAL ACCOUNT ADDRESS');
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hb:account-access-denied',{detail:{actorId:'contact-b'}})));assert.equal(await page.getByLabel(/^Street, tole or locality/).inputValue(),'PRIVATE ORIGINAL ACCOUNT ADDRESS','another actor event cannot clear this scope');
   globalThis.publicCheckoutActor={userId:'contact-b',authSubject:'contact-b',email:'contact-b@local.hastabazaar.test'};release();await done;assert.deepEqual(statuses,[403]);
   await page.waitForFunction(()=>!document.querySelector('input[name="locality"]'),null,{timeout:3000}).catch((error:unknown)=>{assert.deepEqual(errors,[],'actual browser script errors must not be hidden by a visibility timeout');throw error;});assert.equal(await page.getByLabel(/^Recipient name/).count(),0);await page.getByRole('button',{name:'Reload current checkout',exact:true}).waitFor();assert.deepEqual(errors,[]);
   await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/checkout-contact-denied.png',fullPage:true});
  }finally{release();await browser.close();}
 }finally{globalThis.publicCheckoutActor=null;f.dispose();}
});
