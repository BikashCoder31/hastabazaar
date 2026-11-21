import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {stubFixtureLink} from './helpers/browser-fixture-link';
import type {Route} from 'playwright-core';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {fixtureWithOverrides} from './helpers/fixture-delegation';
import {getCustomerManualPayment,ManualPaymentError} from '../lib/payments/manual-receipts';
const state={db:null as D1Database|null};
(globalThis as typeof globalThis&{claimAuthorityBrowser:typeof state}).claimAuthorityBrowser=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.claimAuthorityBrowser.db},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://claim-authority-browser.test"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:"customer",email:"customer@local.hastabazaar.test",fullName:"Fictional customer",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;'
};return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
void test('native denial curtains private claim fields and native unknown commit keeps its exact recovery reference',async t=>{
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const mode of ['role-denied','unknown-commit'])await t.test(mode,async()=>{
  const f=await manualOrderFixture(),context=await browser.newContext();try{
   assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);state.db=f.db;
   const payment=await getCustomerManualPayment(f.db,'customer',f.orderId),{customerPaymentClaim}=await import('../lib/payments/payment-http');
   const built=await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{ManualPaymentClaim}from'./components/commerce/manual-payment-claim';createRoot(document.getElementById('root')).render(<ManualPaymentClaim actorId="customer" payment={${JSON.stringify(payment)}}/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework',setup(builder){stubFixtureLink(builder);builder.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export const useRouter=()=>({refresh(){}})'}));}}]});
   let interrupted=false;state.db=fixtureWithOverrides(f.db,{async batch<T>(statements:D1PreparedStatement[]){if(mode==='role-denied'&&!interrupted){interrupted=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='customer' AND role='customer'").run();}const result=await f.db.batch<T>(statements);if(mode==='unknown-commit'&&!interrupted){interrupted=true;throw new ManualPaymentError('Native commit acknowledgement unavailable.',400);}return result;},prepare(sql:string){if(mode==='unknown-commit'&&interrupted&&sql.startsWith('SELECT command_digest AS digest'))throw new ManualPaymentError('Native receipt readback unavailable.',400);return f.db.prepare(sql);}});
   const posts:string[]=[];let gets=0;const page=await context.newPage();page.setDefaultTimeout(5000);
   await page.route('**/*',async(route:Route)=>{const request=route.request();if(new URL(request.url()).pathname==='/editor')return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});if(request.method()==='POST')posts.push(request.postData()!);else gets++;const native=new Request(request.url(),{method:request.method(),headers:{...request.headers(),origin:'https://claim-authority-browser.test'},...request.method()==='POST'?{body:request.postData()!}:{}});const response=await customerPaymentClaim(native,f.orderId);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});});
   await page.goto('https://claim-authority-browser.test/editor');await page.addScriptTag({content:built.outputFiles[0].text});await page.getByLabel('Amount paid (NPR)',{exact:true}).fill('100');await page.getByLabel('Date paid',{exact:true}).fill(new Date().toISOString().slice(0,10));await page.getByLabel('Bank reference (optional)',{exact:true}).fill('PRIVATE-NATIVE-BANK');await page.locator('textarea').fill('PRIVATE-NATIVE-NOTE');await page.getByRole('button',{name:"I've paid",exact:true}).click();
   const key=`hastabazaar:payment-claim:customer:${f.orderId}`;
   if(mode==='role-denied'){
    await page.getByText(/Current payment access changed/).waitFor();assert.equal(await page.locator('textarea').count(),0);assert.equal(await page.getByRole('button',{name:'Copy account number',exact:true}).count(),0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_claims').get()!.n,0);
    const retained=await page.evaluate((key:string)=>sessionStorage.getItem(key),key);assert.ok(retained);f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('customer','customer',?)").run(Date.now());state.db=f.db;
    await page.getByRole('button',{name:'Check original claim outcome',exact:true}).click();await page.getByText(/original outcome remains unconfirmed/i).waitFor();assert.equal(await page.locator('textarea').inputValue(),'PRIVATE-NATIVE-NOTE');assert.equal(await page.locator('textarea').isDisabled(),true);assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),key),retained);
    await page.getByRole('button',{name:'Retry the same claim',exact:true}).click();await page.getByText('Claim saved for review. This does not confirm receipt of payment.',{exact:true}).waitFor();assert.equal(posts.length,2);assert.equal(posts[0],posts[1]);
   }else{
    await page.getByText('Native receipt readback unavailable.',{exact:true}).waitFor();assert.equal(await page.locator('textarea').isDisabled(),true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_claims').get()!.n,1);assert.ok(await page.evaluate((key:string)=>sessionStorage.getItem(key),key));state.db=f.db;
    await page.reload();await page.addScriptTag({content:built.outputFiles[0].text});await page.getByRole('button',{name:'Check original claim outcome',exact:true}).click();await page.getByText('Original claim recorded. Review the refreshed saved state before another action.',{exact:true}).waitFor();assert.equal(posts.length,1);
   }
   assert.ok(gets>=1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_claims').get()!.n,1);assert.doesNotMatch(await page.evaluate(()=>JSON.stringify(Object.keys(sessionStorage).map(key=>[key,sessionStorage.getItem(key)]))),/PRIVATE-NATIVE/);assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),key),null);
  }finally{state.db=null;await context.close();f.dispose();}
 });}finally{await browser.close();}
});

