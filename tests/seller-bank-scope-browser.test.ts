import type {Route as BrowserRoute,Response as BrowserResponse} from 'playwright-core';
import './helpers/seller-registration-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {sellerRegistrationScopeFixture,registrationScopeOrigin as origin} from './helpers/seller-registration-scope-fixture';
import {stubFixtureLink} from './helpers/browser-fixture-link';

void test('mounted bank intake owns private fields and pending receipts across internal actors and late status reads',{timeout:90000},async()=>{
 const f=await sellerRegistrationScopeFixture();let release=()=>{};try{
  const api=await import('../app/api/seller/bank-details/route'),{requireExistingCustomerApi}=await import('../lib/auth/customer'),{PDFDocument}=await import('pdf-lib');
  const pdf=await PDFDocument.create();pdf.addPage([300,400]).drawText('Synthetic bank intake proof');const bytes=await pdf.save({useObjectStreams:false});
  const props=async()=>({accountId:(await requireExistingCustomerApi()).userId});let holdA=false,held=()=>{},gate=Promise.resolve(),loseB=false,posts=0;
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{SellerBankDetailsForm}from'./components/seller/bank-details-form';const root=createRoot(document.getElementById('root'));function render(p){root.render(<main><output data-testid='owner'>{p.accountId}</output><SellerBankDetailsForm {...p}/></main>)}window.refreshOwner=async()=>render(await(await fetch('/fixture-props')).json());render(window.__BOOT__);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.__refreshes=(window.__refreshes||0)+1}}}'}));}}]})).outputFiles[0].text;
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const context=await browser.newContext(),failures:string[]=[],errors:string[]=[];
   await context.route('**/*',async(route:BrowserRoute)=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:code});
    if(url.pathname==='/fixture-props')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await props())});
    if(url.pathname==='/bank-fixture')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(await props()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    if(url.pathname!=='/api/seller/bank-details')return route.abort();
    const request=new Request(url,{method:incoming.method(),headers:{...incoming.headers(),origin},...(incoming.postDataBuffer()?{body:Uint8Array.from(incoming.postDataBuffer()??[]).buffer}: {})});const actor=globalThis.registrationScopeIdentity?.userId;
    const response=await api[request.method==='POST'?'POST':'GET'](request);
    if(request.method==='GET'&&holdA&&actor==='subject-registration-a'){holdA=false;held();await gate;}
    if(request.method==='POST'&&response.ok){posts++;if(loseB){loseB=false;return route.abort('failed');}}
    return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   });
   const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));const input=(name:string)=>page.locator('input[name="'+name+'"]');
   f.select('registration-a');await page.goto(origin+'/bank-fixture');await input('payoutBeneficiary').waitFor();await input('payoutBeneficiary').fill('PRIVATE UNSAVED BENEFICIARY A');await input('bankAccountNumber').fill('1122334455');
   f.select('registration-b');await page.evaluate(()=>(window as unknown as {refreshOwner:()=>void}).refreshOwner());await page.getByTestId('owner').getByText('registration-b',{exact:true}).waitFor();await input('payoutBeneficiary').waitFor();if(await input('payoutBeneficiary').inputValue())failures.push('new B bank props retain A private beneficiary');
   // Existing focus polling can clear the first counterexample, but must not be required.
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);
   await input('payoutBeneficiary').fill('Fictional registration-b');await input('bankName').fill('Fictional Bank');await input('bankBranch').fill('Fictional branch');await input('bankAccountNumber').fill('2233445566');await input('bankVerification').setInputFiles({name:'synthetic-bank.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
   loseB=true;await page.getByRole('button',{name:'Submit bank details for review',exact:true}).click();await page.getByRole('button',{name:'Retry the same submission',exact:true}).waitFor();
   await page.getByRole('button',{name:'Retry the same submission',exact:true}).click();await page.getByText('Bank details submitted for review. Payouts remain blocked until verification is complete.',{exact:true}).waitFor();assert.equal(posts,2);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_protected_change_cases WHERE seller_id=(SELECT id FROM seller_profiles WHERE user_id='registration-b')").get()!.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_beneficiary_versions WHERE seller_id=(SELECT id FROM seller_profiles WHERE user_id='registration-b')").get()!.n,0);
   // A valid earlier A status response must not be adopted after B is rendered.
   f.select('registration-a');const ready=new Promise<void>(resolve=>{held=resolve});gate=new Promise<void>(resolve=>{release=resolve});holdA=true;await page.goto(origin+'/bank-fixture');await ready;f.select('registration-b');await page.evaluate(()=>(window as unknown as {refreshOwner:()=>void}).refreshOwner());await page.getByTestId('owner').getByText('registration-b',{exact:true}).waitFor();release();await input('payoutBeneficiary').waitFor();await page.waitForTimeout(100);await input('payoutBeneficiary').fill('Fictional registration-b');await input('bankName').fill('Fictional Bank');await input('bankBranch').fill('Fictional branch');await input('bankAccountNumber').fill('2233445566');await input('bankVerification').setInputFiles({name:'synthetic-bank.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
   // Changing only the authenticated session must reject old intended-actor submission
   // and hide private inputs, rather than leaving another user's form visible.
   f.select('registration-a');const reply=page.waitForResponse((response:BrowserResponse)=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/seller/bank-details');await page.getByRole('button',{name:'Submit bank details for review',exact:true}).click();const last=await reply;if(last.status()!==403)failures.push('old intended B bank request ran under A instead of rejecting session change');await page.waitForTimeout(150);if(await input('bankAccountNumber').count())failures.push('known bank account change leaves private inputs visible');if(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_protected_change_cases WHERE seller_id=(SELECT id FROM seller_profiles WHERE user_id='registration-a')").get()!.n!==0)failures.push('late original A status allowed B private bank data into A native intake');
   await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/seller-bank-actor-denied.png',fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  }finally{release();await browser.close();}
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
});
