import type {Page as BrowserPage,Route as BrowserRoute,Response as BrowserResponse} from 'playwright-core';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {publishAccountForms} from './helpers/account-workspace-fixture';
import {stubFixtureLink} from './helpers/browser-fixture-link';
declare global{interface Window{renderRejectionActor:(actor:string)=>void}}
const fixture={db:null as D1Database|null,actorId:'customer'};
(globalThis as typeof globalThis&{accountRejectionFixture:typeof fixture}).accountRejectionFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.accountRejectionFixture.db}};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const id=globalThis.accountRejectionFixture.actorId;return{userId:"external-"+id,email:id+"@local.hastabazaar.test",fullName:"Fictional current customer"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('actual account recovery distinguishes a later rejection from a rejected retired first request',async t=>{
 const f=await completeVersionFixture();fixture.db=f.db;fixture.actorId='customer';
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.exec("UPDATE users SET auth_subject='external-'||id WHERE id IN ('customer','foreign')");await publishAccountForms(f,['account.profile']);
 const profile=await import('../app/api/account/profile/route'),forms=await import('../app/api/forms/[formId]/route'),outcomes=await import('../app/api/account/command-outcomes/route');
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ProfileForm}from'./components/account/profile-form';function Host(){const[actor,setActor]=useState('customer');window.renderRejectionActor=setActor;return <main data-actor={actor}><ProfileForm actorId={actor} displayName={'Fictional '+actor} phone={null}/></main>}createRoot(document.getElementById('root')).render(<Host/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'account-rejection-boundary',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'account-rejection-nav'}));b.onLoad({filter:/.*/,namespace:'account-rejection-nav'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){}}}'}));}}]});
 const path=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';const{chromium}=await import(path);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const frames=(page:BrowserPage)=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const open=async(options:{errors?:number[];denied?:()=>Promise<void>}={})=>{
  fixture.actorId='customer';const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',async(route:BrowserRoute)=>{const incoming=route.request(),url=new URL(incoming.url());if(url.origin!=='https://account-rejection.test')return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});
   const body=incoming.postData(),request=new Request(incoming.url(),{method:incoming.method(),headers:incoming.headers(),...(body===null?{}:{body})});let response:Response;
   if(url.pathname.startsWith('/api/forms/'))response=await forms.GET(request,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});
   else if(url.pathname==='/api/account/profile'){response=await profile.PATCH(request);if(response.status===403&&options.denied)await options.denied();if(response.ok&&options.errors?.length){const status=options.errors.shift()!;return route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:'Fictional response gateway did not deliver the original saved result.'})});}}
   else if(url.pathname==='/api/account/command-outcomes')response=await outcomes.GET(request);else return route.abort();
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });await page.goto('https://account-rejection.test');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled);return page;
 };
 try{
  await t.test('later409 cannot discard the first committed-but-unconfirmed request',async()=>{
   const page=await open({errors:[503,409]});try{
    const before=Number(f.sqlite.prepare("SELECT COUNT(*)n FROM audit_logs WHERE action='account.profile.updated'").get()!.n);
    await page.locator('input[name="displayName"]').fill('Original unconfirmed native save');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('button',{name:'Retry original request',exact:true}).waitFor();
    const rejected=page.waitForResponse((r:BrowserResponse)=>r.url().endsWith('/api/account/profile'));await page.getByRole('button',{name:'Retry original request',exact:true}).click();assert.equal((await rejected).status(),409);await frames(page);
    assert.equal(await page.getByRole('button',{name:'Check saved result',exact:true}).count(),1,'A later rejection cannot disprove the earlier unconfirmed commit.');assert.equal(await page.locator('input[name="displayName"]').isDisabled(),true);
    await page.getByRole('button',{name:'Check saved result',exact:true}).click();await page.getByText('The original profile change was recorded. Refresh to see your current details.',{exact:true}).waitFor();
    assert.equal(f.sqlite.prepare("SELECT COUNT(*)n FROM audit_logs WHERE action='account.profile.updated'").get()!.n,before+1);
   }finally{await page.close();}
  });
  await t.test('first native pre-write403 retires only its original stored marker after a scope change',async()=>{
   let ready=()=>{},release=()=>{};const received=new Promise<void>(resolve=>{ready=resolve}),held=new Promise<void>(resolve=>{release=resolve});
   const page=await open({denied:async()=>{ready();await held;}});try{
    const before=Number(f.sqlite.prepare("SELECT COUNT(*)n FROM audit_logs WHERE action='account.profile.updated'").get()!.n);
    await page.locator('input[name="displayName"]').fill('Old A rejected value');fixture.actorId='foreign';await page.getByRole('button',{name:'Save changes',exact:true}).click();await received;
    await page.evaluate(()=>window.renderRejectionActor('foreign'));await page.locator('main[data-actor="foreign"]').waitFor();await page.locator('input[name="displayName"]').fill('New B private draft');
    const response=page.waitForResponse((r:BrowserResponse)=>r.url().endsWith('/api/account/profile'));release();assert.equal((await response).status(),403);await frames(page);
    assert.equal(await page.locator('input[name="displayName"]').inputValue(),'New B private draft');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('hb:account-command:v1:'+JSON.stringify(['customer','profile']))),null,'An explicitly rejected first request must not strand its retired original account.');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*)n FROM audit_logs WHERE action='account.profile.updated'").get()!.n,before);
    fixture.actorId='customer';await page.evaluate(()=>window.renderRejectionActor('customer'));await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled);
   }finally{release();await page.close();}
  });
 }finally{await browser.close();fixture.db=null;f.dispose();}
});
