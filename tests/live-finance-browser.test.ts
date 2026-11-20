import type {Route as BrowserRoute} from 'playwright-core';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
declare global{var liveFinanceBrowserDb:D1Database;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.liveFinanceBrowserDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){return{id:"reviewer"}}',shortCircuit:true};
 return next(specifier,context);
}});
// Actual protected routes/components, fictional memory sources, every network request intercepted.
void test('actual finance recovers prepare and safe cancellation after lost acknowledgement without storing financial form contents',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  globalThis.liveFinanceBrowserDb=f.db;const api=await import('../app/api/admin/managed-makers/[id]/finance/route'),params={params:Promise.resolve({id:f.sellerId})};
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{LiveManagedFinanceControls}from'./components/admin/live-managed-finance-controls';createRoot(document.getElementById('root')).render(<LiveManagedFinanceControls actorId="reviewer" sellerId="${f.sellerId}"/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'finance-framework',setup(builder){builder.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useRouter(){return{refresh(){}}}',loader:'js'}));}}]})).outputFiles[0].text;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
   const context=await browser.newContext({viewport:{width:1280,height:900}}),origin='https://actual-live-finance.test',endpoint='/api/admin/managed-makers/'+f.sellerId+'/finance',lost=new Set<string>(),posts:string[]=[],errors:string[]=[];
   await context.route('**/*',async(route:BrowserRoute)=>{const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/finance')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><title>Fictional actual maker finance</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>'});
    if(url.pathname!==endpoint)return route.abort();const method=incoming.method(),request=new Request(url,{method,headers:{origin,'content-type':'application/json'},...(method==='POST'?{body:incoming.postData()}:{})}),response=method==='POST'?await api.POST(request,params):await api.GET(request,params);
    if(method==='POST'){const action=JSON.parse(incoming.postData()??'').action;posts.push(action);if(response.ok&&!lost.has(action)){lost.add(action);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fictional lost '+action+' acknowledgement'})});}}
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',(error:Error)=>errors.push(error.message));
   const mount=async(reload=false)=>{if(reload)await page.reload();else await page.goto(origin+'/finance');await page.addScriptTag({content:code});await page.getByRole('heading',{name:'Actual original live earnings',exact:true}).waitFor();await page.getByRole('link',{name:'Open protected bank execution and reconciliation',exact:true}).waitFor();};
   const area=(label:string)=>page.locator('form[aria-label="'+label+'"]').locator('..'),open=async(label:string)=>{const section=area(label);await section.locator('summary').click();return section;};
   const storage=async()=>{const result=await page.evaluate(()=>({session:Object.values(sessionStorage),local:Object.values(localStorage)}));assert.deepEqual(result.local,[]);for(const value of result.session)assert.match(value,/^[0-9a-f-]{36}$/i);assert.doesNotMatch(JSON.stringify(result),/TEST-|69000|FICTIONAL|source|review/);return result;};
   await mount();assert.equal(await page.title(),'Fictional actual maker finance');assert.equal(page.url(),origin+'/finance');
   const prepareLabel='Prepare actual payout reservation',prepare=await open(prepareLabel);await prepare.getByLabel('Reason for this actual payment review',{exact:true}).fill('Independently reviewed original source allocations and current verified beneficiary for actual protected execution.');await prepare.getByRole('button',{name:prepareLabel,exact:true}).click();await page.getByText('Fictional lost prepare acknowledgement',{exact:true}).waitFor();assert.equal((await storage()).session.length,1);
   await mount(true);const prepared=await open(prepareLabel);await prepared.getByRole('button',{name:'Check saved outcome',exact:true}).click();await prepared.getByText('The original action was recorded. Current case facts have been refreshed.',{exact:true}).waitFor();assert.equal((await storage()).session.length,0);
   const payout=f.sqlite.prepare("SELECT id,payout_number FROM managed_payouts WHERE record_kind='live'").get()!,cancelLabel='Retire unsent reservation '+payout.payout_number,cancel=await open(cancelLabel);await cancel.getByLabel('Reason for this actual payment review',{exact:true}).fill('Retire only this unchanged unsent reservation before any bank instruction or uncertain execution.');await cancel.getByRole('button',{name:cancelLabel,exact:true}).click();await page.getByText('Fictional lost cancel acknowledgement',{exact:true}).waitFor();assert.equal((await storage()).session.length,1);
   await mount(true);const cancelled=await open(cancelLabel);await cancelled.getByRole('button',{name:'Check saved outcome',exact:true}).click();await cancelled.getByText('The original action was recorded. Current case facts have been refreshed.',{exact:true}).waitFor();assert.equal((await storage()).session.length,0);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_payouts WHERE record_kind='live'").get()!.n,1);assert.equal(f.sqlite.prepare('SELECT status FROM managed_payouts WHERE id=?').get(payout.id)!.status,'rejected');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_transfer_packets').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,0);assert.deepEqual(posts,['prepare','cancel']);assert.deepEqual(errors,[]);
   assert.equal(await page.getByRole('button',{name:/mark paid|record.*payment|approve payment/i}).count(),0);assert.equal(await page.getByRole('link',{name:'Open protected bank execution and reconciliation',exact:true}).getAttribute('href'),'/admin/payments/payouts');
   const directory=join(process.cwd(),'.test-artifacts','t28');await mkdir(directory,{recursive:true});await page.screenshot({path:join(directory,'live-finance-recovery.png'),fullPage:true});
  }finally{await browser.close();}
 }finally{f.dispose();}
});
