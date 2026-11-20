import type {Route as BrowserRoute} from 'playwright-core';
/** Installed Chrome, intercepted local memory fixtures: no preview, provider or remote requests. */
import './helpers/public-checkout-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {publicCheckoutFixture} from './helpers/public-checkout-fixture';
import {readCheckoutPaymentCapabilities} from '../lib/checkout/payment-capabilities';
import {getContactVerificationStatus} from '../lib/auth/contact-verification';
import {retireCompanyAccount} from '../lib/payments/company-accounts';
import {saveCustomerAddress,listCustomerAddresses} from '../lib/db/repositories/customers';
import {createOpaqueToken,hashOpaqueToken} from '../lib/cart/session';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {addOfferCartLine} from '../lib/cart/offer-cart';
import {seedVerifiedCheckoutContact} from './helpers/checkout-contact';
import {stubFixtureLink} from './helpers/browser-fixture-link';

void test('actual checkout form uses current methods, original bank request recovery and current customer authority',{timeout:60000},async()=>{
 const f=await publicCheckoutFixture({bank:true});const releases:Array<()=>void>=[];try{
  await saveCustomerAddress(f.db,{userId:'customer',input:{...f.body.address,label:'Fictional original address',isDefault:true},requestId:crypto.randomUUID(),now:Date.now()});let currentCartToken=f.token;
  globalThis.publicCheckoutDb=f.db;globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};
  const api=await import('../app/api/checkout/route'),cartApi=await import('../app/api/cart/route'),forms=await import('../app/api/forms/[formId]/route'),contacts=await import('../app/api/account/contact-verification/route');
  const boot=async()=>{const actor=globalThis.publicCheckoutActor!,user=f.sqlite.prepare('SELECT display_name,phone FROM users WHERE id=?').get(actor.userId)!;return{cartScope:await hashOpaqueToken(currentCartToken),paymentCapabilities:await readCheckoutPaymentCapabilities(f.db,{cartHash:await hashOpaqueToken(currentCartToken)}),policyContext:f.policyContext,serviceFee:f.serviceFee,deliveryRates:f.rates,customerId:actor.userId,customerEmail:actor.email,customerPhone:user.phone,customerDisplayName:user.display_name,contactStatus:await getContactVerificationStatus(f.db,actor),savedAddresses:await listCustomerAddresses(f.db,actor.userId)};};
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{CheckoutForm}from'./components/commerce/checkout-form';const root=createRoot(document.getElementById('root'));function render(props){root.render(<main className='shell py-8'><CheckoutForm {...props}/></main>)}window.refreshCheckout=async()=>render(await(await fetch('/fixture-boot')).json());render(window.__CHECKOUT_BOOT__);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-navigation-only',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){}}}'}));}}]})).outputFiles[0].text;
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/commerce/checkout-form.tsx';\n@source '../components/account/contact-verification.tsx';\n@source '../components/forms';\n@source inline('shell py-8');"),{from:resolve('app/globals.css')})).css;
  await mkdir('.test-artifacts/t31',{recursive:true});
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const context=await browser.newContext({viewport:{width:1200,height:900}}),origin='https://public-checkout.test',bodies:string[]=[],errors:string[]=[];let loseAcknowledgement=true,holdNext=false,release:()=>void=()=>{},committed:()=>void=()=>{};let ready=Promise.resolve(),held=Promise.resolve();
   await context.route('**/*',async(route:BrowserRoute)=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:code});
    if(url.pathname==='/fixture-boot')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await boot())});
    if(url.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});
    if(url.pathname==='/checkout')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__CHECKOUT_BOOT__='+JSON.stringify(await boot()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    if(url.pathname.startsWith('/orders/'))return route.fulfill({status:200,contentType:'text/html',body:'<main>Original order destination '+url.pathname.slice(8)+'</main>'});
    const actual=new Request(url,{method:req.method(),headers:{...req.headers(),origin,cookie:'hastabazaar_cart='+currentCartToken,'content-type':'application/json'},...(req.postData()?{body:req.postData()}: {})});let response:Response;
    if(url.pathname==='/api/cart')response=await cartApi.GET(actual);
    else if(url.pathname.startsWith('/api/forms/'))response=await forms.GET(actual,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});
    else if(url.pathname==='/api/account/contact-verification')response=await contacts.GET(actual);
    else if(url.pathname==='/api/checkout'){bodies.push(req.postData()!);response=await api.POST(actual);if(loseAcknowledgement&&response.status===201){loseAcknowledgement=false;return route.abort();}if(holdNext){holdNext=false;committed();await held;}}
    else return route.abort();
    return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   });
   const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));await page.goto(origin+'/checkout');
   await page.getByRole('radio',{name:/Manual bank transfer/}).check();await page.getByRole('checkbox').last().check();
   await page.getByText('Total by bank transfer',{exact:true}).waitFor();await page.screenshot({path:'.test-artifacts/t31/public-checkout-before-bank.png',fullPage:true});
   // The retry button can appear while the actual handler is still committing. Wait for its deliberately lost 201 reply.
   const lostBankReply=page.waitForEvent('requestfailed',(request:{method():string;url():string})=>request.method()==='POST'&&request.url()===origin+'/api/checkout');
   await page.getByRole('button',{name:'Place bank-transfer order',exact:true}).click({timeout:3000});
   await lostBankReply;
   await page.getByRole('button',{name:'Retry prior order attempt',exact:true}).waitFor();
   assert.equal(JSON.parse(bodies[0]).paymentMethod,'manual_bank');
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_payment_instructions').get()!.n,1);
   const revision=String(f.sqlite.prepare('SELECT revision FROM company_payment_account_versions WHERE id=?').get(f.accountVersionId)!.revision);await retireCompanyAccount(f.db,{actorId:'reviewer',requestId:'browser-bank-retired',expectedRevision:revision,now:Date.now()},{versionId:f.accountVersionId!,reason:'Stop future instructions while preserving the original uncertain browser request.'});
   await page.reload();await page.getByRole('button',{name:'Retry prior order attempt',exact:true}).waitFor();await page.getByRole('checkbox').last().check();assert.equal(await page.getByText('Total on delivery',{exact:true}).count(),0);assert.equal(await page.getByText('Total by bank transfer',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Place COD order',exact:true}).count(),0);await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.test-artifacts/t31/public-checkout-retained-bank-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=390);
   await page.getByRole('button',{name:'Retry prior order attempt',exact:true}).click();await page.waitForURL('**/orders/**');assert.equal(bodies.length,2);assert.deepEqual(JSON.parse(bodies[0]),JSON.parse(bodies[1]));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_payment_instructions').get()!.n,1);assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,1);assert.deepEqual(errors,[]);
   // Actual committed response is delayed while the same component changes owner/cart.
   const newCart=async()=>{const token=createOpaqueToken(),hash=await hashOpaqueToken(token),set=(await getPublicOfferSet(f.db,f.productId))!;await addOfferCartLine(f.db,hash,{productId:f.productId,offerId:'medium',versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:80000,quantity:1,requestId:crypto.randomUUID()},Date.now());return token;};
   currentCartToken=await newCart();await page.goto(origin+'/checkout');await page.getByRole('checkbox').last().check();
   ready=new Promise<void>(r=>{committed=r});held=new Promise<void>(r=>{release=r;releases.push(r)});holdNext=true;
   await page.getByRole('button',{name:'Place COD order',exact:true}).click();await ready;
   f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('public-b','public-b','public-b@local.hastabazaar.test','Fictional next customer','active',?,?)").run(Date.now(),Date.now());f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('public-b','customer',?)").run(Date.now());await seedVerifiedCheckoutContact(f.db,'public-b','9822222222',Date.now());
   const originalCartToken=currentCartToken;globalThis.publicCheckoutActor={userId:'public-b',authSubject:'public-b',email:'public-b@local.hastabazaar.test'};currentCartToken=await newCart();await page.evaluate(()=> (window as unknown as {refreshCheckout:()=>void}).refreshCheckout());await page.waitForTimeout(200);await page.getByLabel(/^Order email/).waitFor({timeout:2000});
   const scopeFailures:string[]=[];if(await page.getByLabel(/^Recipient name/).inputValue()!=='Fictional next customer')scopeFailures.push('Former private recipient survived the actual customer/cart switch.');if(await page.getByLabel(/^Street, tole or locality/).inputValue()!=='')scopeFailures.push('Former private locality survived the actual customer/cart switch.');if(await page.getByRole('button',{name:'Retry prior order attempt',exact:true}).count())scopeFailures.push('Former saved attempt was exposed to the next customer/cart.');
   release();await page.waitForTimeout(200);if(new URL(page.url()).pathname!=='/checkout')scopeFailures.push('Delayed former-customer response navigated the current customer to the old order.');assert.deepEqual(scopeFailures,[]);assert.deepEqual(errors,[]);
   assert.equal(await page.getByLabel(/^Order email/).inputValue(),'public-b@local.hastabazaar.test');assert.equal(await page.getByLabel(/^Contact phone/).inputValue(),'+9779822222222');
   // The old A view cannot submit its private address under B before new props arrive.
   globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};currentCartToken=await newCart();await page.goto(origin+'/checkout');await page.getByRole('checkbox').last().check();
   const beforeDenied=f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n;
   globalThis.publicCheckoutActor={userId:'public-b',authSubject:'public-b',email:'public-b@local.hastabazaar.test'};
   await page.getByRole('button',{name:'Place COD order',exact:true}).click();await page.getByRole('button',{name:'Reload current checkout',exact:true}).waitFor();
   assert.equal(await page.getByLabel(/^Street, tole or locality/).count(),0);assert.equal(await page.getByLabel(/^Recipient name/).count(),0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n,beforeDenied);
   await page.screenshot({path:'.test-artifacts/t31/public-checkout-actor-denied.png',fullPage:true});
   await page.goto(origin+'/checkout');
   // An old unbound browser reference is retained but never adopted by this account.
   const legacyId=JSON.parse(bodies[0]).idempotencyKey;await page.evaluate((id:string)=>sessionStorage.setItem('hastabazaar:profile-attempt:commerce.checkout:cart',id),legacyId);await page.evaluate(()=> (window as unknown as {refreshCheckout:()=>void}).refreshCheckout());await page.getByText(/could not be matched safely/).waitFor();assert.equal(await page.getByRole('button',{name:'Retry prior order attempt',exact:true}).count(),0);
   // Returning to the original owner/cart recovers its committed delayed request.
   globalThis.publicCheckoutActor={userId:'customer',authSubject:'customer',email:'customer@local.hastabazaar.test'};currentCartToken=originalCartToken;await page.evaluate(()=> (window as unknown as {refreshCheckout:()=>void}).refreshCheckout());await page.getByRole('button',{name:'Retry prior order attempt',exact:true}).waitFor();await page.getByRole('checkbox').last().check();await page.getByRole('button',{name:'Retry prior order attempt',exact:true}).click();await page.waitForURL('**/orders/**');assert.deepEqual(JSON.parse(bodies[2]),JSON.parse(bodies.at(-1)!));assert.equal(f.sqlite.prepare("SELECT reserved FROM offer_stock WHERE offer_id='medium'").get()!.reserved,2);assert.equal(await page.evaluate(()=>sessionStorage.getItem('hastabazaar:profile-attempt:commerce.checkout:cart')),legacyId);assert.deepEqual(errors,[]);


  }finally{await browser.close();}
 }finally{for(const release of releases)release();globalThis.publicCheckoutActor=null;f.dispose();}
});
