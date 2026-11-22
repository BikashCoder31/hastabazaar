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

const state={db:null as D1Database|null,actor:'reviewer'};
(globalThis as typeof globalThis&{nativeExtensionBrowser:typeof state}).nativeExtensionBrowser=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.nativeExtensionBrowser.db}};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const id=globalThis.nativeExtensionBrowser.actor;return{userId:id,email:id+"@local.hastabazaar.test"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
};return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('controlled native question review preserves historical identity, retries its original draft and rejects a different current reviewer',async()=>{
 const f=await completeVersionFixture();state.db=f.db;state.actor='reviewer';
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.exec(`UPDATE user_roles SET role='super_admin' WHERE user_id='delegate' AND role='admin';
 UPDATE staff_permission_profiles SET permissions_json='["business_settings.manage"]',version=version+1 WHERE user_id='delegate'`);
 assert.ok(f.sqlite.prepare("SELECT 1 FROM user_roles WHERE user_id='delegate' AND role='super_admin'").get());
 const formId='staff.payout-request-action';
 const original=JSON.stringify({formId,fields:[{id:'legacy_context',key:'legacy_context',label:'Original review context',type:'single_choice',required:true,status:'active',order:1,choices:[{value:'retained_original_a',label:'Original A'},{value:'retained_original_b',label:'Original B'}]}]});
 f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
 VALUES('extension-browser-original',?,1,1,'published',?,'Retained historical fixture','reviewer',1,'reviewer',1,'reviewer',1,'extension-browser-original')`).run(formId,original);
 const detail=await import('../app/api/admin/forms/[formId]/route');
 const draft=await import('../app/api/admin/forms/[formId]/draft/route');
 const publish=await import('../app/api/admin/forms/[formId]/publish/route');
 const context={params:Promise.resolve({formId})};
 const initial=await detail.GET(new Request(`https://extension.test/api/admin/forms/${formId}`),context);assert.equal(initial.status,200);
 const props=await initial.json() as Record<string,unknown>;
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from'react';import{createRoot}from'react-dom/client';import{FormCatalogEditor}from'./components/admin/form-catalog-editor';
 const model=${JSON.stringify(props)};createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-4"><FormCatalogEditor form={model.form} versions={model.versions} actorId="reviewer" retainedOnly/></main>);
 `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'extension-links',setup(b){stubFixtureLink(b);}}]});
 const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/admin';\n@source '../components/forms';\n@source '../components/ui';"),{from:'app/globals.css'})).css;
 const runtime=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
 const {chromium}=await import(runtime);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 let loseAck=true;const writes:{body:string;status:number;path:string}[]=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',async(route:BrowserRoute)=>{
   const incoming=route.request(),url=new URL(incoming.url());if(url.origin!=='https://extension.test')return route.abort();
   if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div></body></html>'});
   const body=incoming.postData();const request=new Request(incoming.url(),{method:incoming.method(),headers:incoming.headers(),...(body===null?{}:{body})});let response:Response;
   if(url.pathname.endsWith('/draft'))response=await draft.POST(request,context);
   else if(url.pathname.endsWith('/publish'))response=await publish.POST(request,context);
   else if(url.pathname===`/api/admin/forms/${formId}`)response=await detail.GET(request,context);
   else return route.abort();
   if(body!==null){writes.push({body,status:response.status,path:url.pathname});if(response.ok&&loseAck){loseAck=false;return route.abort('failed');}}
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  await page.goto('https://extension.test');await page.addScriptTag({content:bundle.outputFiles[0].text});
  assert.equal(await page.getByRole('button',{name:'Add question',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Add field',exact:true}).count(),0);
  const retainedChoices=page.getByRole('group',{name:'Choices for Original review context',exact:true});
  assert.equal(await retainedChoices.getByLabel('Choice 1',{exact:true}).isEditable(),false);
  assert.equal(await retainedChoices.getByRole('button',{name:'Add choice',exact:true}).count(),0);
  await page.locator('#legacy_context-label').fill('Clearer retained review context');
  await page.locator('#retained-question-purpose').fill('Independent staff need the original context when reviewing the native payout request.');
  await page.getByRole('checkbox',{name:'I will maintain these retained questions',exact:true}).check();
  await page.getByLabel('Reason for change').fill('Clarify existing context without changing native payout controls.');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForFunction(()=>document.body.innerText.includes('outcome is unknown'));
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForFunction(()=>document.body.innerText.includes('Draft saved'));
  assert.equal(writes.length,2);assert.equal(writes[0].body,writes[1].body);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id=? AND status='draft'").get(formId)?.n,1);
  await page.getByLabel('Reason for change').fill('Publish the reviewed original question wording without financial changes.');
  await page.getByRole('button',{name:'Publish draft',exact:true}).click();await page.getByRole('button',{name:'Confirm publish',exact:true}).click();await page.getByText('Form published.',{exact:true}).waitFor();
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id=? AND status='published'").get(formId)?.n,2);
  assert.equal(f.sqlite.prepare("SELECT config_json FROM form_config_versions WHERE id='extension-browser-original'").get()?.config_json,original);
  await page.getByLabel('Reason for change').fill('PRIVATE-RETIRED-REVIEWER reason must not transfer to another reviewer.');
  await page.locator('#legacy_context-label').fill('PRIVATE-RETIRED-REVIEWER-DRAFT');state.actor='delegate';
  assert.equal((await detail.GET(new Request(`https://extension.test/api/admin/forms/${formId}`),context)).status,200,'The new current reviewer independently has native catalog authority.');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#legacy_context-label'));
  assert.equal(writes.at(-1)?.status,403);assert.equal(await page.getByText('PRIVATE-RETIRED-REVIEWER-DRAFT',{exact:true}).count(),0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions WHERE form_id=?').get(formId)?.n,2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mkdir('.test-artifacts/t03-followup',{recursive:true});await page.screenshot({path:'.test-artifacts/t03-followup/native-extension-mobile.png',fullPage:true});
 }finally{await browser.close();state.db=null;f.dispose();}
});
