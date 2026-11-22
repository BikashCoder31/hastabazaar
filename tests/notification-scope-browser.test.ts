import type {Route as BrowserRoute,Response as BrowserResponse} from 'playwright-core';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {stubFixtureLink} from './helpers/browser-fixture-link';
import {publishAccountForms} from './helpers/account-workspace-fixture';
const fixture={db:null as D1Database|null,actorId:'customer'};
(globalThis as typeof globalThis&{notificationBrowserFixture:typeof fixture}).notificationBrowserFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.notificationBrowserFixture.db}};',
 'next/navigation':'export function redirect(url){throw Error(url)}',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:globalThis.notificationBrowserFixture.actorId}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 '@/lib/auth/staff':'export class StaffAuthorizationError extends Error{};export async function requireStaffApi(){throw Error("Not a staff fixture")}',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('actual shared notification components fence old-tab reads and late committed acknowledgements across accounts',async()=>{
 const f=await completeVersionFixture();fixture.db=f.db;fixture.actorId='customer';
 await publishAccountForms(f,['account.profile']);
 const {GET}=await import('../app/api/notifications/route'),{POST}=await import('../app/api/notifications/[id]/read/route');
 const forms=await import('../app/api/forms/[formId]/route'),profile=await import('../app/api/account/profile/route');
 for(const [id,actor,body]of [['notice-a','customer','PRIVATE-ACCOUNT-A-MESSAGE'],['notice-b','foreign','PRIVATE-ACCOUNT-B-MESSAGE']]as const)f.sqlite.prepare("INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,status,request_id,created_at) VALUES(?,?,'customer','in_app','fixture.notice','Fictional update','Fictional update',?,?,'sent',?,1)").run(id,actor,body,body,id);
 const initial=await (await GET(new Request('https://notification.test/api/notifications?audience=customer'))).json()as {items:unknown[]};
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React,{useState}from'react';import{createRoot}from'react-dom/client';
  import{NotificationBell}from'./components/account/notification-bell';import{NotificationList}from'./components/account/notification-list';
  import{ProfileForm}from'./components/account/profile-form';import{AccountAccessBoundary}from'./components/account/account-access-boundary';
  function Host(){const[actor,setActor]=useState('customer'),[items,setItems]=useState(${JSON.stringify(initial.items)});
   window.renderNotificationActor=async(id)=>{const response=await fetch('/api/notifications?audience=customer',{headers:{'X-Hastabazaar-Actor':id}});if(!response.ok)throw Error('Fixture render denied');const data=await response.json();setItems(data.items);setActor(id)};
   return <><p>Rendered account: {actor}</p><NotificationBell workspace="customer" accountId={actor}/><div id="inbox"><NotificationList workspace="customer" accountId={actor} initial={items}/></div><AccountAccessBoundary actorId={actor}><p>PRIVATE-ACCOUNT-HISTORY-{actor}</p><div id="profile"><ProfileForm actorId={actor} displayName={'PRIVATE-PROFILE-'+actor} phone={null}/></div></AccountAccessBoundary></>;
  }window.readEvents=[];window.addEventListener('hastabazaar:notification-read',e=>window.readEvents.push(e.detail));createRoot(document.getElementById('root')).render(<Host/>);
 `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'notification-fixture-link',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'notification-nav'}));b.onLoad({filter:/.*/,namespace:'notification-nav'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){}}}'}));}}]});
 const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/account';\n@source '../components/forms';\n@source '../components/ui';"),{from:'app/globals.css'})).css;
 const path=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
 const {chromium}=await import(path);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 let hold=false,release=()=>{},committed=()=>{};let committedPromise=new Promise<void>(resolve=>{committed=resolve});
 const posts:{actor:string;intent:string|null;status:number}[]=[],reads:{actor:string;intent:string|null;status:number}[]=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',async(route:BrowserRoute)=>{
   const incoming=route.request(),url=new URL(incoming.url());if(url.origin!=='https://notification.test')return route.abort();
   if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css});
   if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div></body></html>'});
   const headers=incoming.headers(),body=incoming.postData(),request=new Request(incoming.url(),{method:incoming.method(),headers,...(body===null?{}:{body})});
   if(url.pathname.startsWith('/api/forms/')){const response=await forms.GET(request,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
   if(url.pathname==='/api/account/profile'){const response=await profile.PATCH(request);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
   if(url.pathname==='/api/notifications'){const actor=fixture.actorId,response=await GET(request);reads.push({actor,intent:request.headers.get('X-Hastabazaar-Actor'),status:response.status});return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
   const match=url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
   if(match){const actor=fixture.actorId,response=await POST(request,{params:Promise.resolve({id:match[1]})}),body=await response.text();posts.push({actor,intent:request.headers.get('X-Hastabazaar-Actor'),status:response.status});if(hold&&response.ok){const waiting=new Promise<void>(resolve=>{release=resolve});committed();await waiting;}return route.fulfill({status:response.status,contentType:'application/json',body});}
   return route.abort();
  });
  await page.goto('https://notification.test');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole('button',{name:'Notifications: 1 unread',exact:true}).waitFor();
  fixture.actorId='foreign';const first=page.waitForResponse((response:BrowserResponse)=>response.url().includes('/api/notifications?'));
  await page.getByRole('button',{name:'Notifications: 1 unread',exact:true}).click();assert.equal((await first).status(),403,'An old account view must not adopt the newly authenticated account inbox.');
  await page.getByText(/signed-in account changed|notification access changed/i).first().waitFor();
  assert.equal(await page.getByText('PRIVATE-ACCOUNT-A-MESSAGE',{exact:true}).count(),0);assert.equal(await page.getByText('PRIVATE-ACCOUNT-B-MESSAGE',{exact:true}).count(),0);
  assert.equal(reads.at(-1)?.status,403);assert.equal(reads.at(-1)?.intent,'customer');
  assert.equal(await page.locator('#profile input').count(),0,'A native customer notification denial must hide sibling private account forms.');
  assert.equal(await page.getByText('PRIVATE-ACCOUNT-HISTORY-customer',{exact:true}).count(),0,'The actual account layout boundary must also hide private history.');
  // A fresh native render resets the denied scope without adopting the previous account's state.
  fixture.actorId='customer';await page.reload();await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByRole('button',{name:'Notifications: 1 unread',exact:true}).waitFor();
  hold=true;committedPromise=new Promise<void>(resolve=>{committed=resolve});
  await page.locator('#inbox').getByRole('button',{name:'Mark as read',exact:true}).click();await committedPromise;
  assert.notEqual(f.sqlite.prepare("SELECT read_at FROM notification_messages WHERE id='notice-a'").get()!.read_at,null);
  fixture.actorId='foreign';await page.evaluate(()=> (window as unknown as {renderNotificationActor:(actorId:string)=>void}).renderNotificationActor('foreign'));
  await page.getByText('Rendered account: foreign',{exact:true}).waitFor();await page.locator('#inbox').getByText('PRIVATE-ACCOUNT-B-MESSAGE',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Notifications: 1 unread',exact:true}).waitFor();const currentReads=reads.filter(row=>row.actor==='foreign').length;
  const acknowledgement=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/notice-a/read'));hold=false;release();await acknowledgement;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.deepEqual(await page.evaluate(()=>(window as unknown as {readEvents:unknown[]}).readEvents),[{id:'notice-a',accountId:'customer',workspace:'customer'}],'A saved read fact remains scoped to its actual recipient, including navigation before acknowledgement.');
  assert.equal(reads.filter(row=>row.actor==='foreign').length,currentReads,'The other account must ignore a former-account read event.');
  assert.equal(f.sqlite.prepare("SELECT read_at FROM notification_messages WHERE id='notice-b'").get()!.read_at,null);
  assert.equal(await page.getByText('PRIVATE-ACCOUNT-A-MESSAGE',{exact:true}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.locator('#inbox').getByRole('button',{name:'Mark as read',exact:true}).focus();assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Mark as read');
  await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/notification-mobile.png',fullPage:true});
  fixture.actorId='customer';const deniedRead=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/notice-b/read'));
  await page.locator('#inbox').getByRole('button',{name:'Mark as read',exact:true}).click();await deniedRead;
  await page.getByText(/signed-in account changed|notification access changed/i).first().waitFor();
  assert.equal(await page.getByText('PRIVATE-ACCOUNT-B-MESSAGE',{exact:true}).count(),0);assert.equal(posts.at(-1)?.status,403);assert.equal(posts.at(-1)?.intent,'foreign');
  assert.equal(f.sqlite.prepare("SELECT read_at FROM notification_messages WHERE id='notice-b'").get()!.read_at,null);
  fixture.actorId='customer';await page.reload();await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole('button',{name:'Notifications: 0 unread',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#profile button[type="submit"]')?.disabled);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hb:account-access-denied',{detail:{actorId:'foreign'}})));
  assert.equal(await page.locator('#profile input[name="displayName"]').count(),1);assert.equal(await page.getByRole('button',{name:'Notifications: 0 unread',exact:true}).count(),1);
  fixture.actorId='foreign';const profileDenied=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/account/profile'));
  await page.getByRole('button',{name:'Save changes',exact:true}).click();assert.equal((await profileDenied).status(),403);
  await page.getByText(/Account access changed/).first().waitFor();
  assert.equal(await page.getByRole('button',{name:'Notifications: loading or unavailable',exact:true}).count(),1,'A native account command denial must retire the sibling customer notification count.');
  assert.equal(await page.getByText('PRIVATE-ACCOUNT-A-MESSAGE',{exact:true}).count(),0,'A matching account denial must also hide the independent notification list.');
 }finally{release();await browser.close();fixture.db=null;f.dispose();}
});
