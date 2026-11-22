import type {Route as BrowserRoute,ConsoleMessage as BrowserConsoleMessage,Response as BrowserResponse} from 'playwright-core';
/** Browser plugin unavailable: actual Playwright, actual components/routes, all requests intercepted. */
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
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import {getTeamWorkspace} from '../lib/operations/team-governance';
declare global{var teamBrowserDb:D1Database;var teamBrowserActor:string;var teamBrowserAuthority:(permission:string)=>Promise<{id:string;role:string;authSubject:string}>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.teamBrowserDb},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://team-browser.test",HASTABAZAAR_RELEASE_ID:"fixture-team"}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(permission){try{return await globalThis.teamBrowserAuthority(permission)}catch{throw new StaffAuthorizationError("Current staff permission is required.")}}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return{userId:globalThis.teamBrowserActor}}',shortCircuit:true};
 if(specifier==='@/lib/auth/seller-commercial-access')return{url:'data:text/javascript,export async function getSellerTermsViewer(){return null}',shortCircuit:true};
 return next(specifier,context);
}});
void test('actual Team controls preserve exact lost-response retry, handoff authority, five tabs and private scope denial',async()=>{
 const f=await completeVersionFixture(Date.now()-60000);
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES('team-browser-form','staff.team-governance',1,'published',?,'Fictional compatible Team controls','reviewer',?,'reviewer',?,'reviewer',?,'team-browser-form-publish')").run(JSON.stringify({formId:'staff.team-governance',fields:[]}),f.now,f.now,f.now);
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',?)").run(f.now);
  globalThis.teamBrowserDb=f.db;globalThis.teamBrowserActor='reviewer';globalThis.teamBrowserAuthority=async permission=>{const proof=await staffMutationGuard(f.db,globalThis.teamBrowserActor,permission as never,Error);return{id:globalThis.teamBrowserActor,role:proof.role,authSubject:globalThis.teamBrowserActor};};
  const api=await import('../app/api/admin/team/governance/route'),forms=await import('../app/api/forms/[formId]/route');
  const origin='https://team-browser.test',boot=async(tab='coverage')=>({actorId:globalThis.teamBrowserActor,model:await getTeamWorkspace(f.db,globalThis.teamBrowserActor),tab});
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:"import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{TeamWorkspace}from'./components/admin/team-workspace';function App(){const[props,setProps]=useState(window.__TEAM_BOOT__);useEffect(()=>{const refresh=async()=>{const r=await fetch('/fixture-workspace'+location.search);if(r.ok)setProps(await r.json())};window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return <main className='mx-auto max-w-6xl p-5'><TeamWorkspace {...props}/></main>}createRoot(document.getElementById('root')).render(<App/>);"},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-boundaries',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))},push(url){location.assign(url)}}}"}));}}]})).outputFiles[0].text;
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/admin/team-workspace.tsx';\n@source '../components/admin/team-action.tsx';\n@source '../components/admin/team-policy-tasks.tsx';\n@source '../components/admin/team-checkpoints.tsx';\n@source '../components/forms/configured-fields.tsx';\n@source inline('mx-auto max-w-6xl p-5');\n@source '../components/ui/button.tsx';"),{from:resolve('app/globals.css')})).css;
  await mkdir('.test-artifacts/t30',{recursive:true});
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const context=await browser.newContext({viewport:{width:1200,height:900}}),bodies:string[]=[],statuses:number[]=[],errors:string[]=[];let rosterAttempt=0,holdLate=false;let releaseLate=()=>{},markLateCommitted=()=>{};const lateCommitted=new Promise<void>(resolve=>{markLateCommitted=resolve;});
   await context.route('**/*',async(route:BrowserRoute)=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture-team.js')return route.fulfill({status:200,contentType:'text/javascript',body:code});
    if(url.pathname==='/fixture-team.css')return route.fulfill({status:200,contentType:'text/css',body:css});
    if(url.pathname==='/admin/team')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional Team fixture</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture-team.css"></head><body><div id="root"></div><script>window.__TEAM_BOOT__='+JSON.stringify(await boot(url.searchParams.get('tab')??'coverage')).replaceAll('<','\\u003c')+'</script><script src="/fixture-team.js"></script></body></html>'});
    if(url.pathname==='/fixture-workspace')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await boot(url.searchParams.get('tab')??'coverage'))});
    if(url.pathname==='/api/forms/staff.team-governance'){const response=await forms.GET(new Request(url),{params:Promise.resolve({formId:'staff.team-governance'})});return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
    if(url.pathname!=='/api/admin/team/governance')return route.abort();
    const method=incoming.method(),body=incoming.postData()??'';if(method==='POST')bodies.push(body);
    const response=method==='GET'?await api.GET(new Request(url,{headers:incoming.headers()})):await api.POST(new Request(url,{method:'POST',headers:{...incoming.headers(),origin,'content-type':'application/json','sec-fetch-site':'same-origin'},body}));if(method==='POST')statuses.push(response.status);const result=await response.text();
    if(method==='POST'&&JSON.parse(body).action==='save_duty'&&rosterAttempt<3){assert.equal(incoming.headers()['x-hastabazaar-actor'],'reviewer');assert.equal(response.status,200,result);const attempt=rosterAttempt++;return route.fulfill({status:[503,409,200][attempt],contentType:'application/json',body:['{"error":"Fictional committed response was lost. Retry unchanged."}','{"error":"Fictional later rejection cannot erase the original uncertainty.","phase":"rejected_before_write"}','{}'][attempt]});}
    if(method==='POST'&&JSON.parse(body).action==='save_duty'&&holdLate){holdLate=false;assert.equal(response.status,200,result);markLateCommitted();await new Promise<void>(resolve=>{releaseLate=resolve;});}
    return route.fulfill({status:response.status,contentType:'application/json',body:result});
   });
   const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));page.on('console',(message:BrowserConsoleMessage)=>{if(['error','warning'].includes(message.type())&&!/Failed to load resource:.*(?:503|403|409)/.test(message.text()))errors.push(message.text());});
   const open=async(tab:string)=>{await page.goto(origin+'/admin/team?tab='+tab);await page.getByRole('heading',{name:'Team & business policies',exact:true}).waitFor();};
   await open('coverage');assert.equal(await page.title(),'Fictional Team fixture');assert.equal(await page.locator('nextjs-portal,vite-error-overlay').count(),0);
   const duty=page.locator('#duty-products');await duty.getByText('Edit primary and ordered cover',{exact:true}).click();let roster=duty.locator('form').first();await roster.getByLabel('Accountable primary').selectOption('reviewer');await roster.getByLabel('Add Ordered eligible backups').selectOption('delegate');await roster.getByLabel('Reason *',{exact:true}).fill('Assign the real eligible product duty and a distinct available backup.');
   await roster.getByRole('button',{name:'Save this exact roster',exact:true}).click();await roster.getByText('Fictional committed response was lost. Retry unchanged.',{exact:true}).waitFor({timeout:6000}).catch(async (error:unknown)=>{console.log(JSON.stringify({stage:'first-save',bodies,statuses,errors,form:await roster.innerText()}));await page.screenshot({path:'.test-artifacts/t30/team-first-save-red.png',fullPage:false});throw error;});assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_events WHERE action='save_duty'").get()!.n,1);
   assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>sessionStorage.getItem(key)?.includes('Assign the real eligible product duty and a distinct available backup.'))),false,'Private Team fields and submitted bodies must remain in memory, never browser storage.');
   await roster.getByRole('button',{name:'Retry exact Team action',exact:true}).click();await roster.getByText('Fictional later rejection cannot erase the original uncertainty.',{exact:true}).waitFor();
   await roster.getByRole('button',{name:'Retry exact Team action',exact:true}).click();await roster.getByText('The original Team action is unconfirmed. Check its saved outcome or retry the retained exact request.',{exact:true}).waitFor();
   assert.equal(bodies.length,3);assert.equal(bodies[0],bodies[1]);assert.equal(bodies[1],bodies[2]);assert.deepEqual(statuses,[200,200,200]);
   const attemptKey='hastabazaar:profile-attempt:staff.team-governance:reviewer:save_duty:products';
   await page.evaluate(({key,body}:{key:string;body:string})=>sessionStorage.setItem(key+':payload',JSON.stringify({fields:{reason:'Retired private payload must never be restored.'},submitted:JSON.parse(body)})),{key:attemptKey,body:bodies[0]});
   await page.reload();await duty.getByText('Edit primary and ordered cover',{exact:true}).click();roster=duty.locator('form').first();
   assert.equal(await roster.getByLabel('Reason *',{exact:true}).inputValue(),'');assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key+':payload'),attemptKey),null);
   await roster.getByRole('button',{name:'Check saved outcome',exact:true}).click();await roster.getByRole('status').waitFor();assert.equal(bodies.length,3,'Reload recovery must issue only the original native GET, never reconstruct a POST.');
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_events WHERE action='save_duty'").get()!.n,1);
   await page.screenshot({path:'.test-artifacts/t30/team-roster-desktop.png',fullPage:false});
   await duty.getByText('Propose a planned handoff',{exact:true}).click();const handoff=duty.locator('form').nth(1);await handoff.getByLabel('Eligible substitute').selectOption('delegate');const nepal=(at:number)=>new Date(at+20700000).toISOString().slice(0,16);await handoff.getByLabel('Starts (Nepal time)').fill(nepal(Date.now()-60000));await handoff.getByLabel('Ends (Nepal time)').fill(nepal(Date.now()+3600000));await handoff.getByLabel('Reason *',{exact:true}).fill('The eligible substitute must confirm receipt before taking this coverage.');await handoff.getByRole('button',{name:'Propose handoff for receipt',exact:true}).click();await handoff.getByRole('status').waitFor();assert.equal(f.sqlite.prepare("SELECT state FROM team_handoffs WHERE duty_id='products'").get()!.state,'pending');
   for(const[,label,heading]of [['people','People & access','Invitation authority and acceptance'],['calendar','Service calendar','Continuous coverage — temporary'],['identity','Business identity','Recorded company identity'],['policies','Policy register & procedures','Canonical policy register']]){await page.getByRole('link',{name:label,exact:true}).click();await page.getByRole('heading',{name:heading,exact:true}).waitFor();}
   globalThis.teamBrowserActor='delegate';await page.goto(origin+'/admin/team');await page.getByRole('heading',{name:'My responsibilities',exact:true}).waitFor();assert.equal(await page.getByRole('navigation',{name:'Team workspace tabs',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Save this exact roster',exact:true}).count(),0);
   const confirmReceipt = page.getByRole('button', {name:'Confirm receipt of this duty', exact:true});
   const accept = page.locator('form').filter({has:confirmReceipt});
   await accept.getByLabel('Reason *', {exact:true}).fill('I received this original duty and will preserve its existing clocks.');
   const acceptance = page.waitForResponse((response: BrowserResponse) =>
    response.url() === origin + '/api/admin/team/governance' && response.request().method() === 'POST'
    && response.request().postDataJSON().action === 'accept_handoff');
   await confirmReceipt.click();
   assert.equal((await acceptance).status(), 200);
   await page.getByText(/^products · accepted · /).waitFor();
   assert.equal(await confirmReceipt.count(), 0);
   assert.equal(f.sqlite.prepare("SELECT state FROM team_handoffs WHERE duty_id='products'").get()!.state, 'accepted');
   const forbidden=await page.evaluate(async (payload:Record<string,unknown>)=>{const r=await fetch('/api/admin/team/governance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});return r.status;},{...JSON.parse(bodies[0]),action:'save_duty',sourceId:'products',expectedRevision:'0',requestId:'assignment-is-not-access',reason:'Assignment never grants staff access mutation powers.',primaryId:'delegate',backupIds:[]});assert.equal(forbidden,409);assert.equal(f.sqlite.prepare("SELECT primary_user_id FROM team_duties WHERE id='products'").get()!.primary_user_id,'reviewer');
   await page.setViewportSize({width:390,height:844});await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'BODY');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.test-artifacts/t30/team-own-mobile.png',fullPage:false});
   globalThis.teamBrowserActor='reviewer';await open('coverage');await duty.getByText('Edit primary and ordered cover',{exact:true}).click();roster=duty.locator('form').first();
   await roster.getByLabel('Reason *',{exact:true}).fill('Private unsent A input must not survive a mounted account switch.');const postsBeforeSwitch=bodies.length;
   globalThis.teamBrowserActor='foreign';await page.evaluate(()=>window.dispatchEvent(new Event('fixture-refresh')));
   await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>('#duty-products form textarea')?.value==='');
   await duty.getByText('Edit primary and ordered cover',{exact:true}).click();roster=duty.locator('form').first();assert.equal(await roster.getByLabel('Reason *',{exact:true}).inputValue(),'');assert.equal(bodies.length,postsBeforeSwitch);
   assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>sessionStorage.getItem(key)?.includes('Private unsent A input'))),false);
   globalThis.teamBrowserActor='reviewer';await open('coverage');await duty.getByText('Edit primary and ordered cover',{exact:true}).click();roster=duty.locator('form').first();
   await roster.getByLabel('Reason *',{exact:true}).fill('A displayed intent must never write as equally eligible B.');globalThis.teamBrowserActor='foreign';await roster.getByRole('button',{name:'Save this exact roster',exact:true}).click();
   await page.getByText('Team access changed. Private workspace details and inputs are hidden.',{exact:true}).waitFor();assert.equal(statuses.at(-1),403);assert.equal(await page.locator('input,textarea,select').count(),0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_events WHERE action='save_duty'").get()!.n,1);
   globalThis.teamBrowserActor='reviewer';await open('coverage');await duty.getByText('Edit primary and ordered cover',{exact:true}).click();roster=duty.locator('form').first();
   await roster.getByLabel('Reason *',{exact:true}).fill('Original A command commits before its delayed response reaches another scope.');holdLate=true;await roster.getByRole('button',{name:'Save this exact roster',exact:true}).click();await lateCommitted;
   const lateRequestId=(JSON.parse(bodies.at(-1)!) as {requestId:string}).requestId;
   globalThis.teamBrowserActor='foreign';await page.evaluate(()=>window.dispatchEvent(new Event('fixture-refresh')));await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>('#duty-products form textarea')?.value==='');
   await duty.getByText('Edit primary and ordered cover',{exact:true}).click();roster=duty.locator('form').first();await roster.getByLabel('Reason *',{exact:true}).fill('Current B private input must survive the retired A callback.');
   const lateReply=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/admin/team/governance')&&response.request().method()==='POST');releaseLate();await lateReply;
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   assert.equal(await roster.getByRole('textbox',{name:'Reason *',exact:true}).inputValue({timeout:5000}).catch(async(error:unknown)=>{console.log(JSON.stringify({stage:'late-actor-response',url:page.url(),errors,statuses,text:(await page.locator('body').innerText()).slice(0,6000)}));await page.screenshot({path:'.test-artifacts/t31/team-late-scope-diagnostic.png',fullPage:false});throw error;}),'Current B private input must survive the retired A callback.');assert.equal(await roster.getByRole('status').count(),0);assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),attemptKey),lateRequestId);
   globalThis.teamBrowserActor='reviewer';await open('coverage');await duty.getByText('Edit primary and ordered cover',{exact:true}).click();roster=duty.locator('form').first();const postsBeforeReadback=bodies.length;await roster.getByRole('button',{name:'Check saved outcome',exact:true}).click();await roster.getByRole('status').waitFor();assert.equal(bodies.length,postsBeforeReadback);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_events WHERE action='save_duty'").get()!.n,2);
   globalThis.teamBrowserActor='reviewer';await open('coverage');await duty.getByText('Edit primary and ordered cover',{exact:true}).click();roster=duty.locator('form').first();const retained='Preserve this unsent private reason after the old staff tab loses authority.';await roster.getByLabel('Reason *',{exact:true}).fill(retained);f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();await roster.getByRole('button',{name:'Save this exact roster',exact:true}).click();await page.getByText('Team access changed. Private workspace details and inputs are hidden.',{exact:true}).waitFor();assert.equal(await page.locator('input,textarea,select').count(),0);assert.equal(await page.getByText(retained,{exact:true}).count(),0);assert.equal(statuses.at(-1),403);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_governance_events WHERE action='save_duty'").get()!.n,2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.test-artifacts/t30/team-revoked-mobile.png',fullPage:false});assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
 }finally{f.dispose();}
});








