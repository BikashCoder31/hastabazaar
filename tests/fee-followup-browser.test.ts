import type {Browser as TestBrowser,Route as BrowserRoute} from 'playwright-core';
import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {historicalCommissionDatabase} from './helpers/commission-database';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import {getCommonFeeState,publishCommonFeePolicy} from '../lib/commission/coordinated-policy';
import {getFeeTermsWorkspace,reconcileSellerFeeCases} from '../lib/commission/terms-followup';
import {nepalDateTimeInput} from '../lib/commission/rates';
declare global{var feeBrowserDb:D1Database;var feeBrowserAuthority:()=>Promise<{id:string;authSubject:string;role:string}>;}
registerHooks({resolve(specifier,context,next){const code=specifier==='cloudflare:workers'?'export const env={get DB(){return globalThis.feeBrowserDb}}':specifier==='@/lib/auth/staff'?'export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export const requireStaffApi=()=>globalThis.feeBrowserAuthority()':null;return code?{url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true}:next(specifier,context);}});
void test('mounted native fee follow-up fences old actors and callbacks, preserving exact committed lost-response retry',{timeout:90000},async()=>{
 const f=await historicalCommissionDatabase(true),now=Date.now(),releases:Array<()=>void>=[];let browser!:TestBrowser;
 try{
  f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('fee-browser-b','fee-browser-b','fee-browser-b@local.hastabazaar.test','Fee B','active',?,?)").run(now,now);
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('fee-browser-b','super_admin',?)").run(now);
  const state=await getCommonFeeState(f.database,now);await publishCommonFeePolicy(f.database,{actorId:'owner',requestId:'fee-browser-policy',expectedRevision:null,now},{expectedContext:state.context,basisPoints:1200,effectiveAt:now+16*86400000,reason:'Publish a fictional native full-notice source for actual follow-up controls.',replacesId:null});await reconcileSellerFeeCases(f.database,'seller-a',now);await reconcileSellerFeeCases(f.database,'seller-b',now);
  let actorId='owner',mode:'normal'|'lost'|'delayed'|'malformed'='normal';let release:()=>void=()=>{};const requests:Array<{body:string;status:number;intent:string|null}>=[];globalThis.feeBrowserDb=f.database;globalThis.feeBrowserAuthority=async()=>{const proof=await staffMutationGuard(f.database,actorId,'seller.application.review',Error);return{id:actorId,authSubject:actorId,role:proof.role};};const api=await import('../app/api/admin/fee-terms-followup/route');
  const boot=async(sellerId='seller-a')=>({actorId,cases:(await getFeeTermsWorkspace(f.database,actorId,Date.now())).filter(c=>c.sellerId===sellerId)});
  const bundle=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{FeeTermsFollowup}from'./components/admin/fee-terms-followup';function App(){const[p,setP]=useState(window.__BOOT__);window.setFixtureProps=setP;return <main className="min-w-0 p-4"><output data-testid="actor">{p.actorId}</output><FeeTermsFollowup actorId={p.actorId} cases={p.cases} superAdmin={true}/></main>}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.refreshCount=(window.refreshCount||0)+1}}}'}));}}]})).outputFiles[0].text;
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/admin/fee-terms-followup.tsx';\n@source '../components/ui/button.tsx';"),{from:resolve('app/globals.css')})).css;await mkdir('.test-artifacts/t31',{recursive:true});const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});const context=await browser.newContext({viewport:{width:390,height:844}}),origin='https://fee-followup.test';
  await context.route('**/*',async(route:BrowserRoute)=>{const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();if(url.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:bundle});if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(await boot()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});if(url.pathname==='/api/admin/fee-terms-followup'&&incoming.method()==='POST'){
   const raw=incoming.postData()!,response=await api.POST(new Request(incoming.url(),{method:'POST',headers:{...await incoming.allHeaders(),origin},body:raw})),body=await response.text();requests.push({body:raw,status:response.status,intent:incoming.headers()['x-hastabazaar-actor']??null});if(mode==='delayed'){mode='normal';await new Promise<void>(resolve=>{release=resolve;releases.push(resolve);});}if(mode==='malformed'){mode='normal';return route.fulfill({status:200,contentType:'application/json',body:'{}'});}if(mode==='lost'){mode='normal';return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fictional transport acknowledgement was lost after commit.'})});}return route.fulfill({status:response.status,contentType:'application/json',body});}return route.abort();});
  const page=await context.newPage(),fill=async(note:string)=>{await page.getByLabel('Private staff note',{exact:true}).fill(note);await page.getByLabel('Concrete next action',{exact:true}).fill('Review the exact original seller case through an authorized channel.');await page.getByLabel('Next update · Nepal time',{exact:true}).fill(nepalDateTimeInput(Date.now()+3600000));},count=()=>Number(f.sqlite.prepare("SELECT COUNT(*) n FROM commission_terms_events WHERE kind='contact'").get()!.n);
  await page.goto(origin);await fill('PRIVATE A must not become B outreach');const before=count();actorId='fee-browser-b';await page.getByRole('button',{name:'Record follow-up',exact:true}).click();await page.getByRole('status').filter({hasText:'Current access is required'}).waitFor();assert.equal(requests.at(-1)?.status,403);assert.equal(requests.at(-1)?.intent,'owner');assert.equal(count(),before);assert.equal(await page.getByLabel('Private staff note',{exact:true}).count(),0);
  actorId='owner';await page.reload();await fill('PRIVATE A delayed original');mode='delayed';await page.getByRole('button',{name:'Record follow-up',exact:true}).click();await page.waitForFunction(()=>document.querySelector('button')?.textContent==='Confirming…');while(requests.length<2)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(requests.at(-1)?.status,200);actorId='fee-browser-b';await page.evaluate((props:unknown)=>(window as unknown as {setFixtureProps:(props:unknown)=>void}).setFixtureProps(props),await boot('seller-b'));await fill('PRIVATE B retained current draft');const refreshes=await page.evaluate(()=>(window as unknown as {refreshCount?:number}).refreshCount??0);release();await page.waitForTimeout(100);assert.equal(await page.getByLabel('Private staff note',{exact:true}).inputValue(),'PRIVATE B retained current draft');assert.equal(await page.getByText('Follow-up recorded. Seller consent and separate holds are unchanged.',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>(window as unknown as {refreshCount?:number}).refreshCount??0),refreshes);
  for (const acknowledgement of ['lost', 'malformed'] as const) {
   actorId = 'owner';
   await page.reload();
   await fill('PRIVATE original ' + acknowledgement + ' acknowledgement');
   mode = acknowledgement;
   const beforeLost = count(), requestIndex = requests.length;
   await page.getByRole('button', { name: 'Record follow-up', exact: true }).click();
   const message = acknowledgement === 'lost'
    ? 'Fictional transport acknowledgement was lost after commit.'
    : 'The original saved outcome could not be verified. Retry the same follow-up request.';
   await page.getByText(message, { exact: true }).waitFor();
   const retry = page.getByRole('button', { name: 'Retry the same follow-up', exact: true });
   assert.equal(await retry.count(), 1, acknowledgement + ' acknowledgement must retain the pending request');
   assert.equal(await page.getByText('Follow-up recorded. Seller consent and separate holds are unchanged.', { exact: true }).count(), 0);
   assert.equal(count(), beforeLost + 1, 'The original request must have committed before the uncertain acknowledgement');
   await retry.click();
   await page.getByText('Follow-up recorded. Seller consent and separate holds are unchanged.', { exact: true }).waitFor();
   assert.equal(count(), beforeLost + 1);
   assert.equal(requests[requestIndex].body, requests[requestIndex + 1].body);
   assert.ok(requests.slice(requestIndex).every(r => r.status === 200 && r.intent === 'owner'));
  }
  await page.screenshot({ path: '.test-artifacts/t31/fee-followup-current-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
 }finally{for(const release of releases)release();await browser?.close();await f.dispose();}
});
