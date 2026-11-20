import type {Route as BrowserRoute,Response as BrowserResponse} from 'playwright-core';
/** Browser plugin not available. Isolated actual Playwright/component/API, all network intercepted. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {stubFixtureLink} from './helpers/browser-fixture-link';
declare global{var sellerTasksBrowserDb:D1Database;var sellerTasksBrowserActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.sellerTasksBrowserDb}}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(){throw new Error("Unexpected fixture redirect")}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return{userId:globalThis.sellerTasksBrowserActor}};export async function requireAuthenticatedUser(){return{userId:globalThis.sellerTasksBrowserActor}}',shortCircuit:true};
 return next(specifier,context);
}});
void test('actual seller work component and API retain exact native links, current waiting/history and revoked access on mobile',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  globalThis.sellerTasksBrowserDb=f.db;globalThis.sellerTasksBrowserActor='registered-owner';
  const api=await import('../app/api/seller/workspace-tasks/route'),origin='https://seller-tasks.test';
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:"import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{SellerWorkspaceTaskList}from'./components/seller/workspace-task-list';function App(){const[model,setModel]=useState(null),[failed,setFailed]=useState(false);useEffect(()=>{fetch('/api/seller/workspace-tasks?view=all').then(async response=>{if(!response.ok){setFailed(true);return;}setModel(await response.json())}).catch(()=>setFailed(true))},[]);return <main className='mx-auto max-w-4xl p-5'><SellerWorkspaceTaskList model={model} unavailable={failed}/></main>}createRoot(document.getElementById('root')).render(<App/>);"},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-framework',setup:stubFixtureLink}]})).outputFiles[0].text;
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/seller/workspace-task-list.tsx';\n@source inline('mx-auto max-w-4xl p-5');"),{from:resolve('app/globals.css')})).css;
  await mkdir('.test-artifacts/t31',{recursive:true});
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
   const context=await browser.newContext({viewport:{width:1200,height:900}}),statuses:number[]=[],errors:string[]=[];
   await context.route('**/*',async(route:BrowserRoute)=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:code});if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css});if(url.pathname==='/api/seller/workspace-tasks'){const response=await api.GET(new Request(url));statuses.push(response.status);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}if(url.pathname==='/seller/requests')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional Seller work</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'});return route.abort();});
   const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
   await page.goto(origin+'/seller/requests');await page.getByRole('heading',{name:'Requests and help',exact:true}).waitFor();const payout=page.locator('#task-payout-legacy-payout');await payout.getByText('Waiting for Hastabazaar',{exact:false}).waitFor();assert.equal(await payout.getByRole('link',{name:'Open record →'}).getAttribute('href'),'/seller/finance#payout-request-legacy-payout');assert.equal(await page.getByText('Paid',{exact:true}).count(),0);assert.equal(await page.locator('nextjs-portal,vite-error-overlay').count(),0);
   await page.screenshot({path:'.test-artifacts/t31/seller-requests-desktop.png'});
   await page.setViewportSize({width:390,height:844});await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'BODY');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.test-artifacts/t31/seller-requests-mobile.png'});
   f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='registered-owner'").run();const denied=page.waitForResponse((response:BrowserResponse)=>response.url().includes('/api/seller/workspace-tasks')&&response.status()===403);await page.reload();await denied;await page.getByText('Your work could not be loaded.',{exact:false}).waitFor();assert.equal(await page.locator('#task-payout-legacy-payout').count(),0);assert.deepEqual(statuses,[200,403]);assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
 }finally{f.dispose();}
});
