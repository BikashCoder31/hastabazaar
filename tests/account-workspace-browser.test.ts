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
import {stubFixtureLink} from './helpers/browser-fixture-link';
declare global {interface Window {renderAccountActor:(actor:string)=>void;fixtureAccountActor?:string}}
const fixture={db:null as D1Database|null,actorId:'customer'};
(globalThis as typeof globalThis&{accountBrowserFixture:typeof fixture}).accountBrowserFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.accountBrowserFixture.db}};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const id=globalThis.accountBrowserFixture.actorId;return{userId:"external-"+id,email:id+"@local.hastabazaar.test",fullName:"Fictional current customer"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('mounted account forms reject old-tab writes, hide sibling private drafts and recover the original native receipt',async()=>{
 const f=await completeVersionFixture();fixture.db=f.db;fixture.actorId='customer';
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.exec("UPDATE users SET auth_subject='external-'||id WHERE id IN ('customer','foreign')");
 await publishAccountForms(f,['account.profile','account.address','account.privacy-request']);
 const profiles=await import('../app/api/account/profile/route'),forms=await import('../app/api/forms/[formId]/route'),contacts=await import('../app/api/account/contact-verification/route'),privacy=await import('../app/api/account/privacy/route');
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React,{useState}from'react';import{createRoot}from'react-dom/client';
  import{ProfileForm}from'./components/account/profile-form';import{PrivacyRequestForm}from'./components/account/privacy-request-form';import{ContactVerificationPanel}from'./components/account/contact-verification';
  function Host(){const[actor,setActor]=useState(window.fixtureAccountActor??'customer');window.renderAccountActor=setActor;return <main data-account-actor={actor} className="mx-auto max-w-xl space-y-6 p-5"><h1>Fictional account workspace</h1><div id="profile"><ProfileForm actorId={actor} displayName={actor==='customer'?'PRIVATE-A-SAVED-NAME':'PRIVATE-B-SAVED-NAME'} phone={null}/></div><div id="privacy"><PrivacyRequestForm actorId={actor}/></div><ContactVerificationPanel ownerKey={actor}/></main>}
  window.refreshCount=0;createRoot(document.getElementById('root')).render(<Host/>);
 `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'account-navigation',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'account-nav'}));b.onLoad({filter:/.*/,namespace:'account-nav'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.refreshCount++}}}'}));}}]});
 const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/account';\n@source '../components/forms';\n@source '../components/ui';"),{from:'app/globals.css'})).css;
 const path=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
 const {chromium}=await import(path);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const writes:{actor:string;intent:string|null;body:string;status:number}[]=[];
 let hold=false,malformed=false,release=()=>{},committed=()=>{};const committedPromise=new Promise<void>(resolve=>{committed=resolve});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',async(route:BrowserRoute)=>{
   const incoming=route.request(),url=new URL(incoming.url());if(url.origin!=='https://account.test')return route.abort();
   if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div></body></html>'});
   const body=incoming.postData(),request=new Request(incoming.url(),{method:incoming.method(),headers:incoming.headers(),...(body===null?{}:{body})});let response:Response;
   if(url.pathname.startsWith('/api/forms/'))response=await forms.GET(request,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});
   else if(url.pathname==='/api/account/contact-verification')response=await contacts.GET(request);
   else if(url.pathname==='/api/account/profile'){
    const actor=fixture.actorId;response=await profiles.PATCH(request);writes.push({actor,intent:request.headers.get('X-Hastabazaar-Actor'),body:body!,status:response.status});
    if(response.ok&&malformed){malformed=false;return route.fulfill({status:200,contentType:'application/json',body:'null'});}
    if(response.ok&&hold){const waiting=new Promise<void>(resolve=>{release=resolve});committed();await waiting;}
   }else if(url.pathname==='/api/account/privacy')response=await privacy.POST(request);
   else if(url.pathname==='/api/account/command-outcomes'){const outcomes=await import('../app/api/account/command-outcomes/route');response=await outcomes.GET(request);}
   else return route.abort();
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  await page.goto('https://account.test');await page.addScriptTag({content:bundle.outputFiles[0].text});
  const save=()=>page.getByRole('button',{name:'Save changes',exact:true});await save().waitFor();await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#profile button[type="submit"]')?.disabled);
  await page.locator('#privacy textarea[name="detail"]').fill('PRIVATE-A-PRIVACY-DRAFT that must never transfer to another account.');
  await page.locator('#profile input[name="displayName"]').fill('PRIVATE-A-UNSAVED-NAME');fixture.actorId='foreign';
  const before=f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='account.profile.updated'").get()!.n;
  const denied=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/account/profile'));await save().click();assert.equal((await denied).status(),403,'Old A content cannot update authenticated B.');
  await page.getByText(/account.*changed|access.*changed/i).first().waitFor();assert.equal(await page.locator('#profile input').count(),0);assert.equal(await page.locator('#privacy textarea').count(),0);assert.equal(await page.getByText('customer@local.hastabazaar.test',{exact:true}).count(),0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='account.profile.updated'").get()!.n,before);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('hb:account-command:')).length),0,'A first definitive403 must not strand a rejected action as an unknown opaque attempt.');
  fixture.actorId='customer';await page.evaluate(()=>window.renderAccountActor('customer'));await page.reload();await page.addScriptTag({content:bundle.outputFiles[0].text});await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#profile button[type="submit"]')?.disabled);
  await page.locator('#profile input[name="displayName"]').fill('A original committed profile');hold=true;await save().click();await committedPromise;
  fixture.actorId='foreign';
  await page.evaluate(()=>window.renderAccountActor('foreign'));
  const foreignProfile=page.locator('main[data-account-actor="foreign"] #profile input[name="displayName"]');
  await foreignProfile.waitFor();
  assert.equal(await foreignProfile.inputValue(),'PRIVATE-B-SAVED-NAME');
  await page.locator('#privacy textarea').fill('PRIVATE-B-PENDING-DRAFT must survive the old actor callback.');await page.locator('#profile input[name="displayName"]').fill('B fresh profile draft');release();hold=false;
  await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('#profile input[name="displayName"]')?.value==='B fresh profile draft');assert.match(await page.locator('#privacy textarea').inputValue(),/PRIVATE-B-PENDING-DRAFT/);
  malformed=true;const badAck=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/account/profile'));await save().click();assert.equal((await badAck).status(),200);
  await page.waitForFunction(()=>!document.querySelector('#profile button[type="submit"]')?.textContent?.includes('Saving'));
  assert.equal(await page.getByText('Your profile is up to date.',{exact:true}).count(),0,'Malformed HTTP200 cannot confirm the submitted account action.');
  await page.getByRole('button',{name:/Check saved result/i}).waitFor();assert.equal(writes.at(-1)?.intent,'foreign');
  const snapshot=await page.evaluate(()=>Object.fromEntries(Object.keys(sessionStorage).map(key=>[key,sessionStorage.getItem(key)])));assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE-|fresh profile|pending-draft|displayName|phone/i);
  const committedCount=f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='account.profile.updated'").get()!.n;
  await page.reload();await page.evaluate(()=>{window.fixtureAccountActor='foreign';});await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('main[data-account-actor="foreign"]').waitFor();
  const checked=page.waitForResponse((response:BrowserResponse)=>response.url().includes('/api/account/command-outcomes?'));await page.getByRole('button',{name:/Check saved result/i}).click();const saved=await checked;assert.equal(saved.status(),200,await saved.text());assert.equal((await saved.json()).status,'recorded');
  await page.getByText(/profile is up to date|original.*recorded/i).first().waitFor();
  assert.equal(await page.getByText('The original account action is recorded.',{exact:true}).count(),0,'The profile already owns its specific historical-result notice.');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='account.profile.updated'").get()!.n,committedCount);assert.equal(writes.length,3,'Recovery reads the native receipt without another POST/PATCH.');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/account-mobile.png',fullPage:true});
 }finally{release();await browser.close();fixture.db=null;f.dispose();}
});
