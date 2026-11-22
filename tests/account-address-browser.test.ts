import type {Route as BrowserRoute,Response as BrowserResponse} from 'playwright-core';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {publishAccountForms} from './helpers/account-workspace-fixture';
import {listCustomerAddresses,type CustomerAddressRow} from '../lib/db/repositories/customers';
import {resolvePublishedForm} from '../lib/forms/runtime';
import {stubFixtureLink} from './helpers/browser-fixture-link';
declare global {interface Window {renderAddressActor:(actor:string,addresses:readonly CustomerAddressRow[])=>void}}
const fixture={db:null as D1Database|null,actorId:'customer'};
(globalThis as typeof globalThis&{addressBrowserFixture:typeof fixture}).addressBrowserFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.addressBrowserFixture.db}};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const id=globalThis.addressBrowserFixture.actorId;return{userId:"external-"+id,email:id+"@local.hastabazaar.test",fullName:"Fictional account"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('actual address editor preserves owned sources, exact retries, late account callbacks and original deletion recovery',async()=>{
 const f=await completeVersionFixture();fixture.db=f.db;fixture.actorId='customer';assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.exec("UPDATE users SET auth_subject='external-'||id WHERE id IN ('customer','foreign')");await publishAccountForms(f,['account.address']);
 const addresses=await import('../app/api/account/addresses/route'),address=await import('../app/api/account/addresses/[id]/route'),forms=await import('../app/api/forms/[formId]/route'),outcomes=await import('../app/api/account/command-outcomes/route');
 const config=await resolvePublishedForm(f.db,'account.address'),seed={address:{label:'PRIVATE-A-HOME',recipientName:'PRIVATE-A-RECIPIENT',phone:'9812345678',province:'Koshi',district:'Morang',municipality:'Biratnagar',ward:'4',locality:'PRIVATE-A-LOCALITY',isDefault:false},idempotencyKey:crypto.randomUUID(),formVersion:config.version,customAnswers:[]};
 const created=await addresses.POST(new Request('https://address.test/api/account/addresses',{method:'POST',headers:{origin:'https://address.test','content-type':'application/json','X-Hastabazaar-Actor':'customer'},body:JSON.stringify(seed)}));assert.equal(created.status,201,await created.text());
 const initial=await listCustomerAddresses(f.db,'customer');
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from'react';import{createRoot}from'react-dom/client';import{AddressManager}from'./components/account/address-manager';
  const root=createRoot(document.getElementById('root'));window.renderAddressActor=(actor,addresses)=>root.render(<main data-actor={actor} className="mx-auto max-w-2xl p-5"><AddressManager actorId={actor} addresses={addresses}/></main>);window.renderAddressActor('customer',${JSON.stringify(initial)});
 `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'address-navigation',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'address-nav'}));b.onLoad({filter:/.*/,namespace:'address-nav'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){}}}'}));}}]});
 const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/account';\n@source '../components/forms';\n@source '../components/ui';\n@source '../components/delivery/location-picker.tsx';"),{from:'app/globals.css'})).css;
 const path=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';const{chromium}=await import(path),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const writes:{method:string;actor:string;intent:string|null;body:string;status:number}[]=[];let failCreate=true,failDelete=true,holdPatch=false,release=()=>{},committed=()=>{};const committedPromise=new Promise<void>(resolve=>{committed=resolve});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',async(route:BrowserRoute)=>{
   const incoming=route.request(),url=new URL(incoming.url());if(url.origin!=='https://address.test')return route.abort();
   if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div></body></html>'});
   const body=incoming.postData(),request=new Request(incoming.url(),{method:incoming.method(),headers:incoming.headers(),...(body===null?{}:{body})});let response:Response;
   if(url.pathname.startsWith('/api/forms/'))response=await forms.GET(request,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});
   else if(url.pathname==='/api/account/command-outcomes')response=await outcomes.GET(request);
   else if(url.pathname.startsWith('/api/account/addresses')){
    const id=decodeURIComponent(url.pathname.slice('/api/account/addresses/'.length)),method=incoming.method(),actor=fixture.actorId;
    response=method==='POST'?await addresses.POST(request):method==='PATCH'?await address.PATCH(request,{params:Promise.resolve({id})}):await address.DELETE(request,{params:Promise.resolve({id})});
    writes.push({method,actor,intent:request.headers.get('X-Hastabazaar-Actor'),body:body!,status:response.status});
    if(response.ok&&((method==='POST'&&failCreate)||(method==='DELETE'&&failDelete))){if(method==='POST')failCreate=false;else failDelete=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fictional response lost after native save.'})});}
    if(response.ok&&method==='PATCH'&&holdPatch){const waiting=new Promise<void>(resolve=>{release=resolve});committed();await waiting;}
   }else return route.abort();
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  await page.goto('https://address.test');await page.addScriptTag({content:bundle.outputFiles[0].text});
  const render=async(actor:string)=>{fixture.actorId=actor;const rows=await listCustomerAddresses(f.db,actor);await page.evaluate(({actor,rows}:{actor:string;rows:readonly CustomerAddressRow[]})=>window.renderAddressActor(actor,rows),{actor,rows});await page.locator(`main[data-actor="${actor}"]`).waitFor();};
  await page.getByRole('button',{name:/^Edit /}).click();await page.locator('input[name="recipientName"]').fill('PRIVATE-A-UNSAVED-RECIPIENT');fixture.actorId='foreign';
  const denied=page.waitForResponse((r:BrowserResponse)=>r.request().method()==='PATCH');await page.getByRole('button',{name:'Save address',exact:true}).click();assert.equal((await denied).status(),403);await page.getByText(/Account access changed/).waitFor();assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE-A-HOME|PRIVATE-A-LOCALITY|PRIVATE-A-RECIPIENT/);assert.equal(f.sqlite.prepare('SELECT recipient_name AS name FROM addresses WHERE id=?').get(initial[0].id)!.name,'PRIVATE-A-RECIPIENT');
  await render('foreign');await page.getByRole('button',{name:'Add address',exact:false}).click();
  for(const[name,value]of Object.entries({label:'B home',recipientName:'B recipient',phone:'9812345678',district:'Morang',municipality:'Biratnagar',ward:'4',locality:'B private locality'}))await page.locator(`input[name="${name}"]`).fill(value);
  await page.locator('select[name="province"]').selectOption('Koshi');await page.getByRole('button',{name:'Save address',exact:true}).click();await page.getByRole('button',{name:'Retry original request',exact:true}).waitFor();
  assert.equal(await page.locator('input[name="recipientName"]').isDisabled(),true);await page.getByRole('button',{name:'Retry original request',exact:true}).click();await page.locator('input[name="recipientName"]').waitFor({state:'detached'});
  const creates=writes.filter(row=>row.method==='POST');assert.equal(creates.length,2);assert.equal(creates[0].body,creates[1].body);assert.equal((await listCustomerAddresses(f.db,'foreign')).length,1);
  await render('foreign');await page.getByRole('button',{name:/^Edit /}).click();await page.locator('input[name="recipientName"]').fill('B updated recipient');holdPatch=true;await page.getByRole('button',{name:'Save address',exact:true}).click();await committedPromise;
  await render('customer');await page.getByRole('button',{name:'Add address',exact:false}).click();await page.locator('input[name="recipientName"]').fill('PRIVATE-A-NEW-DRAFT');release();holdPatch=false;await page.waitForTimeout(30);assert.equal(await page.locator('input[name="recipientName"]').inputValue(),'PRIVATE-A-NEW-DRAFT');
  await render('foreign');await page.getByRole('button',{name:'Check saved result',exact:true}).click();await page.getByText(/original account action is recorded/).first().waitFor();
  await page.getByRole('button',{name:'Add address',exact:false}).click();await page.locator('input[name="recipientName"]').fill('PRIVATE-B-UNSAVED-SECOND-ADDRESS');
  await page.getByRole('button',{name:'Delete B home',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Remove address',exact:true}).click();await page.getByRole('button',{name:'Check saved result',exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Check saved result',exact:true}).first().click();await page.getByText(/original account action is recorded/).first().waitFor();assert.equal(writes.filter(row=>row.method==='DELETE').length,1);assert.equal((await listCustomerAddresses(f.db,'foreign')).length,0);
  assert.equal(await page.locator('input[name="recipientName"]').count(),1,'Confirming deletion of one original address must not discard another unsaved editor.');
  assert.equal(await page.locator('input[name="recipientName"]').inputValue(),'PRIVATE-B-UNSAVED-SECOND-ADDRESS');
  assert.equal(await page.getByText('Fictional response lost after native save.',{exact:true}).count(),0,'Confirmed recovery must retire the old failure notice.');
  await render('foreign');assert.equal(await page.getByRole('button',{name:'Delete B home',exact:true}).count(),0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM address_answer_owner_tombstones WHERE user_id='foreign'").get()!.n,1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/address-mobile.png',fullPage:true});
 }finally{release();await browser.close();fixture.db=null;f.dispose();}
});
