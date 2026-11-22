import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {resolve} from 'node:path';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {stubFixtureLink} from './helpers/browser-fixture-link';
import type {Route} from 'playwright-core';

const state={db:null as D1Database|null,actor:'reviewer',mail:0};
(globalThis as typeof globalThis&{invitationBrowserFixture:typeof state}).invitationBrowserFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.invitationBrowserFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const actor=globalThis.invitationBrowserFixture.actor;return{userId:actor,email:actor+"@local.hastabazaar.test",fullName:"Fictional staff",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 '@/lib/email/staff-invitation':'export async function sendStaffInvitationEmail(){globalThis.invitationBrowserFixture.mail++;}',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('actual invitation UI preserves original actor, exact uncertain command and read-only reload recovery',{timeout:90_000},async()=>{
 const f=await completeVersionFixture(Date.now()-60_000);state.db=f.db;state.actor='reviewer';state.mail=0;
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',?)").run(f.now);
 f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
 VALUES('invite-browser-form','staff.staff-invitation',1,'published',?,'Fictional retained publication','reviewer',1,'reviewer',1,'reviewer',?,'invite-browser-form')`).run(JSON.stringify({formId:'staff.staff-invitation',fields:[]}),f.now);
 try{
  const api=await import('../app/api/admin/staff-invitations/route'),item=await import('../app/api/admin/staff-invitations/[id]/route'),forms=await import('../app/api/forms/[formId]/route');
  const origin='http://localhost:3018',boot=()=>({actorId:state.actor,pendingInvitations:f.sqlite.prepare("SELECT id,email FROM staff_invitations WHERE status='pending'").all()});
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{StaffInvitationManager}from'./components/admin/staff-invitation-manager';import{TeamScopeBoundary}from'./components/admin/team-scope-boundary';function App(){const[props,setProps]=useState(window.__INVITE_BOOT__);useEffect(()=>{const refresh=async()=>{const r=await fetch('/fixture-props');setProps(await r.json())};window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return <TeamScopeBoundary key={props.actorId}><p>Private invitation workspace</p><StaffInvitationManager {...props}/></TeamScopeBoundary>}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}"}));}}]})).outputFiles[0].text;
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../app';\n@source '../components';\n@source '../hooks';\n@source '../lib';"),{from:resolve('app/globals.css')})).css;
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const context=await browser.newContext(),bodies:string[]=[],actors:(string|undefined)[]=[],errors:string[]=[];let distorted=0,gets=0,hold=false,releaseLate=()=>{},markCommitted=()=>{},loseRevoke=false;const deletes:string[]=[];
   const committed=new Promise<void>(resolve=>{markCommitted=resolve;});
   await context.route('**/*',async(route:Route)=>{
    const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});
    if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:code});
    if(url.pathname==='/admin/team')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><title>Fictional invitation</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__INVITE_BOOT__='+JSON.stringify(boot()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    if(url.pathname==='/fixture-props')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(boot())});
    if(url.pathname==='/api/forms/staff.staff-invitation'){const response=await forms.GET(new Request(url,{headers:request.headers()}),{params:Promise.resolve({formId:'staff.staff-invitation'})});return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
    if(!url.pathname.startsWith('/api/admin/staff-invitations'))return route.abort();
    const method=request.method(),body=request.postData()??'',headers:Record<string,string>={...request.headers(),origin,'sec-fetch-site':'same-origin'};
    if(method==='DELETE')deletes.push(url.pathname.split('/').at(-1)!);if(method==='POST'){bodies.push(body);actors.push(headers['x-hastabazaar-actor']);}if(method==='GET')gets++;
    const native=new Request(url,{method,headers,...(method==='POST'?{body}:{})});
    const response=method==='GET'?(url.pathname==='/api/admin/staff-invitations'?await api.GET(native):await item.GET(native,{params:Promise.resolve({id:url.pathname.split('/').at(-1)!})})):method==='POST'?await api.POST(native):await item.DELETE(native,{params:Promise.resolve({id:url.pathname.split('/').at(-1)!})});
    const result=await response.text();
    if(method==='POST'&&distorted<3){assert.ok(response.ok,result);const index=distorted++;return route.fulfill({status:[503,409,200][index],contentType:'application/json',body:['{"error":"Fictional saved response lost."}','{"error":"Fictional later validation rejection.","phase":"rejected_before_write"}','{}'][index]});}
    if(method==='DELETE'&&loseRevoke&&response.ok){loseRevoke=false;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional saved revocation reply lost."}'});}
    if(method==='POST'&&hold&&response.ok){hold=false;markCommitted();await new Promise<void>(resolve=>{releaseLate=resolve;});}
    return route.fulfill({status:response.status,contentType:'application/json',body:result});
   });
   const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
   const review=async(email:string)=>{try{await page.getByLabel('Staff email').fill(email);await page.getByRole('button',{name:'Review invitation',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();}catch(error){console.log(JSON.stringify({stage:'fictional-invitation-review',errors,text:await page.locator('body').innerText()}));throw error;}};
   await page.goto(origin+'/admin/team');await review('first-private@local.hastabazaar.test');await page.getByText('Fictional saved response lost.',{exact:true}).first().waitFor();
   assert.deepEqual(actors,['reviewer'],'Displayed internal actor must accompany the original native command.');
   assert.equal(state.mail,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM staff_invitations').get()!.n,1);
   assert.equal(await page.evaluate(()=>Object.values(sessionStorage).some(value=>value.includes('first-private@'))),false);
   await page.getByRole('button',{name:'Retry exact invitation',exact:true}).click();await page.getByText('Fictional later validation rejection.',{exact:true}).first().waitFor();
   await page.getByRole('button',{name:'Retry exact invitation',exact:true}).click();await page.getByText('The original invitation is unconfirmed. Check its saved outcome or retry the retained exact request.',{exact:true}).first().waitFor();
   assert.equal(bodies.length,3);assert.equal(bodies[0],bodies[1]);assert.equal(bodies[1],bodies[2]);assert.equal(state.mail,1);
   await page.reload();assert.equal(await page.getByLabel('Staff email').inputValue(),'');await page.getByRole('button',{name:'Check original invitation',exact:true}).click();await page.getByRole('status').waitFor();assert.equal(bodies.length,3);assert.equal(gets,1);assert.equal(state.mail,1);
   await page.getByLabel('Staff email').fill('unsent-private@local.hastabazaar.test');state.actor='foreign';await page.evaluate(()=>window.dispatchEvent(new Event('fixture-refresh')));await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('#staff-email')?.value==='');assert.equal(bodies.length,3);
   state.actor='reviewer';await page.goto(origin+'/admin/team');state.actor='foreign';await review('wrong-actor@local.hastabazaar.test');await page.getByText('Team access changed. Private workspace details and inputs are hidden.',{exact:true}).waitFor();assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM staff_invitations').get()!.n,1);assert.equal(await page.getByText('Private invitation workspace',{exact:true}).count(),0);
   state.actor='reviewer';await page.goto(origin+'/admin/team');hold=true;await review('late-private@local.hastabazaar.test');await committed;state.actor='foreign';await page.evaluate(()=>window.dispatchEvent(new Event('fixture-refresh')));await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('#staff-email')?.value==='');await page.getByLabel('Staff email').fill('new-actor-private@local.hastabazaar.test');releaseLate();await page.waitForLoadState('networkidle');assert.equal(await page.getByRole('textbox',{name:'Staff email'}).inputValue(),'new-actor-private@local.hastabazaar.test');assert.equal(await page.getByRole('status').count(),0);
   state.actor='reviewer';await page.goto(origin+'/admin/team');await page.getByRole('button',{name:'Check original invitation',exact:true}).click();await page.getByRole('status').waitFor();assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM staff_invitations').get()!.n,2);assert.equal(state.mail,2);
   state.actor='foreign';await page.getByRole('button',{name:'Revoke invitation for first-private@local.hastabazaar.test',exact:true}).click();await page.getByRole('button',{name:'Revoke invitation',exact:true}).click();await page.getByText('Team access changed. Private workspace details and inputs are hidden.',{exact:true}).waitFor();assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM staff_invitations WHERE status='pending'").get()!.n,2);assert.deepEqual(errors,[]);
   // The prior denied DELETE kept its original immutable target reference.
   // Recheck it under its original actor, retry only that target, then lose a
   // genuinely committed revocation reply and resolve solely by current status.
   state.actor='reviewer';await page.goto(origin+'/admin/team');await page.getByRole('button',{name:'Check original revocation target',exact:true}).click();await page.getByRole('status').filter({hasText:'The original target is still pending'}).waitFor();const beforeDelete=deletes.length;loseRevoke=true;await page.getByRole('button',{name:'Retry original revocation',exact:true}).click();await page.getByText('Fictional saved revocation reply lost.',{exact:true}).waitFor();const heldRevoke=await page.evaluate(()=>Object.values(sessionStorage));assert.equal(heldRevoke.length,1);assert.ok(heldRevoke.every((value:string)=>!value.includes('@')&&!value.includes('permissions')));assert.equal(deletes.length,beforeDelete+1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='staff.invitation.revoked'").get()!.n,1);await page.reload();await page.getByRole('button',{name:'Check original revocation target',exact:true}).click();await page.getByRole('status').filter({hasText:'Current invitation status: revoked.'}).waitFor();assert.equal(deletes.length,beforeDelete+1,'Reload status check repeated a revocation');assert.equal(state.mail,2);assert.equal(await page.evaluate(()=>sessionStorage.length),0);
   // A retained old actorless UUID is a readonly probe, never an invitation body
   // or automatic adoption by another current actor.
   const firstReference=JSON.parse(bodies[0]) as {requestId:string},legacyKey='hastabazaar:profile-attempt:staff.staff-invitation:new',beforeLegacyPosts=bodies.length;await page.evaluate(({key,reference}:{key:string;reference:string})=>sessionStorage.setItem(key,reference),{key:legacyKey,reference:firstReference.requestId});state.actor='foreign';await page.goto(origin+'/admin/team');assert.equal(await page.getByRole('button',{name:'Retry exact invitation',exact:true}).count(),0);await page.getByRole('button',{name:'Check original invitation',exact:true}).click();await page.getByText('The original invitation outcome is unconfirmed.',{exact:false}).waitFor();assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),legacyKey),firstReference.requestId);assert.equal(bodies.length,beforeLegacyPosts);state.actor='reviewer';await page.goto(origin+'/admin/team');await page.getByRole('button',{name:'Check original invitation',exact:true}).click();await page.getByRole('status').filter({hasText:'The original invitation creation is recorded.'}).waitFor();assert.equal(await page.evaluate(()=>sessionStorage.length),0);assert.equal(bodies.length,beforeLegacyPosts);assert.equal(state.mail,2);assert.deepEqual(errors,[]);
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve('.test-artifacts/t31/staff-invitation-mobile.png'),fullPage:true});
   await context.close();
  }finally{await browser.close();}
 }finally{f.dispose();state.db=null;}
});

