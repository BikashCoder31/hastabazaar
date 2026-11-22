import type {Route as BrowserRoute} from 'playwright-core';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {deliveredLiveFinancialFixture,refundActualLiveOrder} from './helpers/live-financial-lifecycle-fixture';

declare global {var liveInvoiceBrowserDb:D1Database;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.liveInvoiceBrowserDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{status=403};export async function requireStaffApi(){return {id:"reviewer"}}',shortCircuit:true};
 return next(specifier,context);
}});
void test('actual credit controls remain recoverable after committed source disappears and browser reloads',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const paid=await refundActualLiveOrder(f,'invoice-browser-refund');globalThis.liveInvoiceBrowserDb=f.db;
  const invoice=f.sqlite.prepare("SELECT id,snapshot_json FROM managed_invoice_groups WHERE order_id=? AND record_kind='live'").get(f.orderId)!;
  const api=await import('../app/api/admin/invoices/[id]/live-adjustments/route'),params={params:Promise.resolve({id:String(invoice.id)})};
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{LiveInvoiceAdjustmentForm}from'./components/admin/live-invoice-adjustment-form';createRoot(document.getElementById('root')).render(<LiveInvoiceAdjustmentForm actorId="reviewer" invoiceId="${String(invoice.id)}"/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'invoice-browser-router',setup(builder){builder.onResolve({filter:/^next\/navigation$/},args=>({path:args.path,namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export function useRouter(){return{refresh(){}}}",loader:'js'}));}}]})).outputFiles[0].text;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
   const context=await browser.newContext({viewport:{width:1100,height:850}}),origin='https://invoice.local.hastabazaar.test',endpoint='/api/admin/invoices/'+invoice.id+'/live-adjustments';let posts=0;const runtimeErrors:string[]=[];
   await context.route('**/*',async(route:BrowserRoute)=>{const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();if(url.pathname==='/invoice-review')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><link rel="icon" href="data:,"><title>Actual original invoice review</title></head><body><main id="root"></main></body></html>'});if(url.pathname!==endpoint)return route.abort();const method=incoming.method(),request=new Request(url,{method,headers:{...incoming.headers(),origin},...(method==='POST'?{body:incoming.postData()}: {})}),response=method==='POST'?await api.POST(request,params):await api.GET(request,params);if(method==='POST'){posts++;assert.equal(response.status,200,await response.clone().text());return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fictional lost credit acknowledgement'})});}return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',(error:Error)=>runtimeErrors.push(error.message));
   const mount=async()=>{await page.goto(origin+'/invoice-review');await page.addScriptTag({content:code});await page.getByRole('heading',{name:'Actual invoice credit',exact:true}).waitFor();};await mount();
   await page.getByLabel('Completed source',{exact:true}).selectOption('refund:'+paid.refundId);await page.getByLabel('Review reason',{exact:true}).fill('Private original source review confirms the completed actual customer refund and immutable commercial credit.');await page.getByRole('button',{name:'Issue actual credit',exact:true}).click();await page.getByText('Fictional lost credit acknowledgement',{exact:true}).waitFor();
   const stored=await page.evaluate(()=>({local:Object.entries(localStorage),session:Object.entries(sessionStorage)}));assert.deepEqual(stored.local,[]);assert.equal(stored.session.length,1);assert.match(stored.session[0][1],/^[0-9a-f-]{36}$/);assert.ok(!JSON.stringify(stored).includes('Private original source'));
   await mount();await page.getByText('No uncredited completed refund or cancellation is currently eligible.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Issue actual credit',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Check saved outcome',exact:true}).click();await page.getByText('The original action was recorded. Current case facts have been refreshed.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>sessionStorage.length),0);
   assert.equal(posts,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_adjustments WHERE invoice_group_id=?').get(invoice.id)!.n,1);assert.equal(f.sqlite.prepare('SELECT snapshot_json FROM managed_invoice_groups WHERE id=?').get(invoice.id)!.snapshot_json,invoice.snapshot_json);assert.deepEqual(runtimeErrors,[]);
   const directory=join(process.cwd(),'.test-artifacts','t28');await mkdir(directory,{recursive:true});await page.screenshot({path:join(directory,'actual-invoice-credit-recovered.png'),fullPage:true});
  }finally{await browser.close();}
 }finally{f.dispose();}
});
