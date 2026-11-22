import type {Route as BrowserRoute} from 'playwright-core';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {stubFixtureLink} from './helpers/browser-fixture-link';

const state={db:null as D1Database|null,actor:'customer'};
(globalThis as typeof globalThis&{nativeAccountCoreBrowser:typeof state}).nativeAccountCoreBrowser=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.nativeAccountCoreBrowser.db}};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const id=globalThis.nativeAccountCoreBrowser.actor;return{userId:"external-"+id,email:id+"@local.hastabazaar.test",fullName:"Fictional customer"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
};return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('native privacy form without publication commits and recovers its original receipt without transferring old-tab content',async()=>{
 const f=await completeVersionFixture();state.db=f.db;state.actor='customer';
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.exec("UPDATE users SET auth_subject='external-'||id WHERE id IN ('customer','foreign')");
 const forms=await import('../app/api/forms/[formId]/route');
 const privacy=await import('../app/api/account/privacy/route');
 const outcomes=await import('../app/api/account/command-outcomes/route');
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from'react';import{createRoot}from'react-dom/client';import{PrivacyRequestForm}from'./components/account/privacy-request-form';
 createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-xl p-5"><PrivacyRequestForm actorId="customer"/></main>);
 `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'native-account-navigation',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'native-account-nav'}));b.onLoad({filter:/.*/,namespace:'native-account-nav'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){}}}'}));}}]});
 const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/account';\n@source '../components/forms';\n@source '../components/ui';"),{from:'app/globals.css'})).css;
 const runtime=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
 const {chromium}=await import(runtime);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 let loseAck=false;const posts:{status:number;body:string}[]=[];const formStatuses:number[]=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',async(route:BrowserRoute)=>{
   const incoming=route.request(),url=new URL(incoming.url());if(url.origin!=='https://native-account.test')return route.abort();
   if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div></body></html>'});
   const body=incoming.postData();const request=new Request(incoming.url(),{method:incoming.method(),headers:incoming.headers(),...(body===null?{}:{body})});let response:Response;
   if(url.pathname==='/api/forms/account.privacy-request'){response=await forms.GET(request,{params:Promise.resolve({formId:'account.privacy-request'})});formStatuses.push(response.status);}
   else if(url.pathname==='/api/account/privacy'){response=await privacy.POST(request);posts.push({status:response.status,body:body!});if(response.ok&&loseAck){loseAck=false;return route.abort('failed');}}
   else if(url.pathname==='/api/account/command-outcomes')response=await outcomes.GET(request);
   else return route.abort();
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  const open=async()=>{await page.goto('https://native-account.test');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.waitForFunction(()=>{const button=document.querySelector<HTMLButtonElement>('form button:not([type="button"])');return button&&!button.disabled;});};
  await open();assert.deepEqual(formStatuses,[200]);
  await page.getByLabel('Details').fill('PRIVATE-OLD-ACCOUNT details must not transfer to another signed-in actor.');state.actor='foreign';
  await page.getByRole('button',{name:'Submit request',exact:true}).click();await page.getByRole('alert').waitFor();
  assert.equal(posts[0].status,403);assert.equal(await page.locator('textarea').count(),0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM data_rights_requests').get()?.n,0);
  state.actor='customer';await open();const canary='PRIVATE-NATIVE-CORE privacy request details remain only in RAM and the authorized native record.';
  await page.getByLabel('Details').fill(canary);loseAck=true;await page.getByRole('button',{name:'Submit request',exact:true}).click();await page.getByRole('button',{name:'Check saved result',exact:true}).waitFor();
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM data_rights_requests').get()?.n,1);
  assert.equal(await page.evaluate((value:string)=>Object.values(sessionStorage).some(item=>item.includes(value)),canary),false);
  await page.reload();await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByRole('button',{name:'Check saved result',exact:true}).click();await page.getByText('Request submitted.',{exact:true}).waitFor();
  assert.equal(posts.length,2,'Reload recovery reads the original native result without submitting a replacement.');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id='account.privacy-request'").get()?.n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE form_id='account.privacy-request'").get()?.n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='form.core_answers' AND json_extract(next_json,'$.formId')='account.privacy-request'").get()?.n,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  await mkdir('.test-artifacts/t03-followup',{recursive:true});await page.screenshot({path:'.test-artifacts/t03-followup/native-account-core-mobile.png',fullPage:true});
 }finally{await browser.close();state.db=null;f.dispose();}
});
