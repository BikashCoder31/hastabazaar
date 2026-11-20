import type {Route as BrowserRoute,Response as BrowserResponse} from 'playwright-core';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {assistedRecoveryIntentFixture} from './helpers/assisted-recovery-intent-fixture';
import {stubFixtureLink} from './helpers/browser-fixture-link';

const state={db:null as D1Database|null,key:'',sent:0};
(globalThis as typeof globalThis&{assistedScopeBrowser:typeof state}).assistedScopeBrowser=state;
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return{url:'data:text/javascript,'+encodeURIComponent('export const env={get DB(){return globalThis.assistedScopeBrowser.db},get HASTABAZAAR_SECURITY_KEY(){return globalThis.assistedScopeBrowser.key},SECURITY_POLICY:{async read(){return true},async mark(){}},APP_ORIGIN:"https://security-assistance.test",HASTABAZAAR_RUNTIME_ENV:"test",EMAIL:{configured:true,async send(){globalThis.assistedScopeBrowser.sent++}}};'),shortCircuit:true};return next(specifier,context);}});
declare global{interface Window{renderAssistance:(value:{actorId:string;targetId:string})=>void;assistanceRefreshes:number}}

void test('assisted recovery uses displayed actor intent and isolates target drafts and delayed native responses',async t=>{
 const f=await assistedRecoveryIntentFixture();state.db=f.db;state.key=f.key;state.sent=0;
 const{POST}=await import('../app/api/security/assisted-recovery/route');
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{AccountRecoveryAssistance}from'./components/admin/account-recovery-assistance';function Host(){const[scope,setScope]=useState({actorId:'assist-a',targetId:'target-a'});window.renderAssistance=setScope;return <main className="mx-auto max-w-xl p-4"><AccountRecoveryAssistance actorId={scope.actorId} targetId={scope.targetId} displayName={'Fictional '+scope.targetId} email={scope.targetId+'@local.hastabazaar.test'} targetRole="seller"/></main>}window.assistanceRefreshes=0;createRoot(document.getElementById('root')).render(<Host/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'assisted-navigation',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'assisted-nav'}));b.onLoad({filter:/.*/,namespace:'assisted-nav'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.assistanceRefreshes++}}}'}));}}]});
 const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/admin';\n@source '../components/ui';"),{from:'app/globals.css'})).css;
 const runtime=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';const{chromium}=await import(runtime);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 let hold=false,release=()=>{},committed=()=>{};let committedPromise=new Promise<void>(resolve=>{committed=resolve});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  await page.route('**/*',async(route:BrowserRoute)=>{
   const incoming=route.request(),url=new URL(incoming.url());if(url.origin!=='https://security-assistance.test')return route.abort();
   if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div></body></html>'});
   if(url.pathname!=='/api/security/assisted-recovery')return route.abort();
   const response=await POST(new Request(incoming.url(),{method:incoming.method(),headers:await incoming.allHeaders(),body:incoming.postData()!}));
   if(hold&&response.ok){const waiting=new Promise<void>(resolve=>{release=resolve});committed();await waiting;}
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  const cookie=(actor:string)=>context.addCookies([{name:'hastabazaar_session',value:f.token(actor),url:'https://security-assistance.test',secure:true,sameSite:'Lax' as const}]);
  const expand=async()=>{if(await page.locator('details').getAttribute('open')===null)await page.locator('summary').click();};
  const open=async()=>{await cookie('assist-a');await page.goto('https://security-assistance.test');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('summary').waitFor();await expand();};
  const fill=async(prefix:string)=>{await page.locator('[name="supportReference"]').fill(`SUP-${prefix}`);await page.locator('[name="verificationReference"]').fill(`SELLER-${prefix}`);await page.locator('[name="ownershipVerified"]').check();await page.locator('[name="confirmedTarget"]').check();};
  await t.test('old displayed A cannot issue recovery under equally fresh-MFA B',async()=>{
   await open();await fill('PRIVATE-A');await cookie('assist-b');
   const response=page.waitForResponse((value:BrowserResponse)=>value.url().endsWith('/api/security/assisted-recovery'));await page.getByRole('button',{name:'Send password reset',exact:true}).click();
   const result=await response;console.log(JSON.stringify({case:'assisted-old-actor',status:result.status(),issuedActor:f.sqlite.prepare("SELECT actor_id FROM audit_logs WHERE subject_id='target-a' ORDER BY created_at DESC LIMIT 1").get()?.actor_id??null}));assert.equal(result.status(),403);
   assert.equal(await page.locator('[name="supportReference"]').count(),0);assert.equal(state.sent,0);
   await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/assisted-recovery-denied-mobile.png',fullPage:true});
  });
  await t.test('target changes clear private references and confirmations',async()=>{
   await open();await fill('PRIVATE-SOURCE-A');await page.locator('select').selectOption('mfa');
   await page.evaluate(()=>window.renderAssistance({actorId:'assist-a',targetId:'target-b'}));await page.getByText('Account recovery for Fictional target-b',{exact:true}).waitFor();await expand();
   assert.equal(await page.locator('[name="supportReference"]').inputValue(),'');assert.equal(await page.locator('[name="verificationReference"]').inputValue(),'');assert.equal(await page.locator('[name="confirmedTarget"]').isChecked(),false);assert.equal(await page.locator('select').inputValue(),'password');
  });
  await t.test('retired committed response cannot reset a different target draft or show its success',async()=>{
   await open();await fill('PRIVATE-HELD-A');hold=true;committedPromise=new Promise<void>(resolve=>{committed=resolve});
   await page.getByRole('button',{name:'Send password reset',exact:true}).click();await committedPromise;
   await page.evaluate(()=>window.renderAssistance({actorId:'assist-a',targetId:'target-b'}));await page.getByText('Account recovery for Fictional target-b',{exact:true}).waitFor();await expand();
   try{
    assert.equal(await page.locator('[name="supportReference"]').isDisabled(),false);await page.locator('[name="supportReference"]').fill('SUP-PRIVATE-CURRENT-B');
    const response=page.waitForResponse((value:BrowserResponse)=>value.url().endsWith('/api/security/assisted-recovery'));release();await response;
    assert.equal(await page.locator('[name="supportReference"]').inputValue(),'SUP-PRIVATE-CURRENT-B');assert.equal(await page.getByRole('status').count(),0);assert.equal(await page.evaluate(()=>window.assistanceRefreshes),0);
   }finally{hold=false;release();}
  });
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{release();await browser.close();state.db=null;state.key='';f.dispose();}
});
