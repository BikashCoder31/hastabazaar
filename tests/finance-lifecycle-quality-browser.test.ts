import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {stubFixtureLink} from './helpers/browser-fixture-link';
import type {Route,Response as BrowserResponse} from 'playwright-core';

// Component ownership only. All transport is intercepted; no application or database is launched.
void test('Finance component state belongs to its mounted actor and source',async t=>{
 const bundle=await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
 import React,{useState} from 'react';import{createRoot}from'react-dom/client';
 import{LiveInvoiceAdjustmentForm}from'./components/admin/live-invoice-adjustment-form';
 import{ManualPaymentClaim}from'./components/commerce/manual-payment-claim';
 import{PaidOrderRelease}from'./components/admin/paid-order-release';
 const payment=id=>({orderId:id,orderNumber:id,state:'awaiting_payment',receivedPaisa:0,duePaisa:10000,remainingPaisa:10000,deadlineAt:100000,cutoffAt:100000,claim:null,instruction:{amountPaisa:10000,reference:id,account:{holder:'Fictional company',bank:'Fictional bank',branch:'Test',accountNumber:'TEST-ACCOUNT'}}});
 function App(){const[id,setId]=useState('a');const mode=location.hash.slice(1);return <><button onClick={()=>setId('b')}>Replace source</button>{mode==='invoice'?<LiveInvoiceAdjustmentForm actorId={id} invoiceId={id}/>:mode==='claim'?<ManualPaymentClaim actorId={id} payment={payment(id)}/>:<PaidOrderRelease actorId={id} review={{orderId:id,orderNumber:id,revision:1,paid:true,closed:false,released:false,holds:[]}}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(builder){stubFixtureLink(builder);builder.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export const useRouter=()=>({refresh(){window.dispatchEvent(new Event("fixture-refresh"))}})'}));}}]});
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  await t.test('a late invoice read cannot replace the new source',async()=>{
   const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(5000);
   let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let started:()=>void=()=>{};const requested=new Promise<void>(resolve=>{started=resolve;});
   try{
    await page.route('**/*',async(route:Route)=>{const url=new URL(route.request().url());if(url.pathname==='/editor')return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});if(url.pathname.includes('/live-adjustments')){const id=url.pathname.split('/')[4];if(id==='a'){started();await gate;}return route.fulfill({contentType:'application/json',body:JSON.stringify({review:{adjustments:[{id,number:'Invoice '+id,amountPaisa:100}],sources:[],needsReconciliation:false}})});}return route.abort();});
    await page.goto('https://finance-lifecycle.test/editor#invoice');await page.addScriptTag({content:bundle.outputFiles[0].text});await requested;await page.getByRole('button',{name:'Replace source'}).click();await page.getByText('Invoice b · NPR 1.00',{exact:true}).waitFor();release();await page.waitForResponse((response:BrowserResponse)=>response.url().includes('/invoices/a/'));
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));assert.equal(await page.getByText(/Invoice a/).count(),0,'Retired invoice response must not replace the current source');assert.equal(await page.getByText(/Invoice b/).count(),1);
   }finally{release();await context.close();}
  });
  for(const mode of ['claim','release'])await t.test(mode+' private input is retired on actor/source replacement',async()=>{
   const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(5000);
   try{await page.route('**/*',async(route:Route)=>route.request().url().includes('/editor')?route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}):route.abort());await page.goto('https://finance-lifecycle.test/editor#'+mode);await page.addScriptTag({content:bundle.outputFiles[0].text});const input=page.locator('textarea');await input.fill('PRIVATE ORIGINAL SOURCE');await page.getByRole('button',{name:'Replace source'}).click();await page.getByRole('heading',{name:mode==='claim'?'Payment for b':'Paid-order release · b',exact:true}).waitFor();assert.equal(await input.inputValue(),'','New actor/source must not inherit the previous private draft');
   }finally{await context.close();}
  });
 }finally{await browser.close();}
});
