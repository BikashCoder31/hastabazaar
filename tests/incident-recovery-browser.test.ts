import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import type {Route,Response as BrowserResponse} from 'playwright-core';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {stubFixtureLink} from './helpers/browser-fixture-link';
import {captureDatabaseHealthScope} from '../lib/db/health-context';

const origin='http://localhost:3018',path='/api/admin/system-health/incidents',state={db:null as D1Database|null,actor:'reviewer'};
(globalThis as typeof globalThis&{incidentRecoveryBrowserFixture:typeof state}).incidentRecoveryBrowserFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.incidentRecoveryBrowserFixture.db},HASTABAZAAR_RUNTIME_ENV:"test",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018",HASTABAZAAR_RELEASE_ID:"fictional-incident-release"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const actor=globalThis.incidentRecoveryBrowserFixture.actor;return{userId:actor,email:actor+"@local.hastabazaar.test",fullName:"Fictional incident responder",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

declare global{interface Window{refreshIncidentFixture:()=>Promise<void>;restoreIncidentStorage?:()=>void;}}
for(const scenario of ['actor','recovery','recovery-new','form-json','form-html','first-form','unknown-form','authority-commit','late','first-conflict','unknown-conflict','quota','validation'] as const)void test(`actual incident UI ${scenario} preserves original authority and recovery`,{timeout:90_000},async()=>{
 const f=await completeVersionFixture(Date.now()-60_000);state.db=f.db;state.actor='reviewer';
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',?)").run(f.now);
  f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES('incident-recovery-browser-form','staff.incident-review',1,'published',?,'Fictional incident controls','reviewer',?,'reviewer',?,'reviewer',?,'incident-recovery-browser-publication')").run(JSON.stringify({formId:'staff.incident-review',fields:[]}),f.now,f.now,f.now);
  captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:origin,HASTABAZAAR_RELEASE_ID:'fictional-incident-release',NODE_ENV:'development'});
  const api=await import('../app/api/admin/system-health/incidents/route'),forms=await import('../app/api/forms/[formId]/route'),domain=await import('../lib/operations/incident-review');
  const create=await api.POST(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify({action:'create',requestId:crypto.randomUUID(),expectedRevision:null,formVersion:1,customAnswers:[],serviceKey:'fictional.incident',failureSignature:'fictional-browser-failure',title:'Fictional protected incident',impactSummary:'PRIVATE-INCIDENT-IMPACT-QA-ONLY',impactClass:'ordinary',severity:'routine'})}));
  assert.equal(create.status,200,await create.clone().text());const created=await create.json() as {incidentId:string;version:string};
  const assign=await api.POST(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify({action:'assign',incidentId:created.incidentId,ownerId:'reviewer',backupId:null,reason:'Assign the fictional original responder before testing acknowledgment.',requestId:crypto.randomUUID(),expectedRevision:created.version,formVersion:1,customAnswers:[]})}));
  assert.equal(assign.status,200,await assign.clone().text());
  let displayActor='reviewer',displayIncident=created.incidentId;
  const props=async()=>({actorId:displayActor,rows:await domain.listIncidents(f.db,displayActor,'test',Date.now()),detail:scenario==='recovery-new'?null:await domain.readIncident(f.db,displayActor,displayIncident,'test',Date.now()),legacy:[],responders:[{id:'reviewer',name:'Fictional reviewer'}],manage:true,canAct:true,superAdmin:true});
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{IncidentWorkspace}from'./components/admin/incident-workspace';import{StaffReviewAccessBoundary}from'./components/admin/staff-review-access-boundary';const root=createRoot(document.getElementById('root'));const render=props=>root.render(<StaffReviewAccessBoundary key={props.actorId} actorId={props.actorId} sourceId="parent"><p>PRIVATE-PARENT-INCIDENT-QA-ONLY</p><IncidentWorkspace {...props}/></StaffReviewAccessBoundary>);window.refreshIncidentFixture=async()=>render(await(await fetch('/fixture-props')).json());render(window.__BOOT__);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.__refreshes=(window.__refreshes||0)+1},push(){window.__pushes=(window.__pushes||0)+1}}}'}));}}]})).outputFiles[0].text;
  const cssSource=(await readFile('app/globals.css','utf8')).replace(/@import\s+(['"])tailwindcss\1;/,'@import "tailwindcss" source(none);\n@source "../app";\n@source "../components";\n@source "../hooks";\n@source "../lib";');
  const css=(await postcss([tailwind()]).process(cssSource,{from:resolve('app/globals.css')})).css;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  let release=()=>{};
  try{
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors:string[]=[],posts:{status:number;wire:string}[]=[],reads:number[]=[],transport:number[]=[];
   let hold=false,started=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;}),held=new Promise<void>(resolve=>{started=resolve;});
   page.on('pageerror',(error:Error)=>errors.push(error.message));
   await page.route('**/*',async(route:Route)=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/fixture-props')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await props())});
    if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'application/javascript',body:code});
    if(url.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});
    if(url.pathname==='/admin/incident-fixture')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(await props()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    if(url.pathname==='/api/forms/staff.incident-review'){
     if(scenario==='form-json'||scenario==='form-html'){started();await gate;}
     const response=await forms.GET(new Request(request.url(),{headers:request.headers()}),{params:Promise.resolve({formId:'staff.incident-review'})});
     if(scenario==='form-html'&&response.status===403)return route.fulfill({status:response.status,contentType:'text/html',body:'<p>Native access response body unavailable</p>'});
     return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
    }
    if(url.pathname===path&&request.method()==='POST'){
     const response=await api.POST(new Request(request.url(),{method:'POST',headers:{...request.headers(),origin},body:request.postData()}));posts.push({status:response.status,wire:request.postData()??''});if(hold){hold=false;started();await gate;}
     const override=transport.shift();if(override!==undefined)return route.fulfill({status:override,contentType:'application/json',body:override===200?'{}':JSON.stringify({error:'Original outcome remains uncertain.'})});
     return route.fulfill({status:response.status,contentType:response.status===403?'text/html':'application/json',body:response.status===403?'<p>Message body unavailable</p>':await response.text()});
    }
    if(url.pathname===path&&request.method()==='GET'){const response=await api.GET(new Request(request.url(),{headers:request.headers()}));reads.push(response.status);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
    errors.push('Unexpected isolated request: '+url.pathname);return route.fulfill({status:404,body:'Unavailable fixture route'});
   });
   await page.goto(origin+'/admin/incident-fixture');
   if(scenario==='form-json'||scenario==='form-html'){
    await held;await page.getByRole('textbox',{name:/^Reason or substantive update/}).fill('PRIVATE-UNSENT-INCIDENT-QA-ONLY');
    assert.equal(await page.getByText('PRIVATE-PARENT-INCIDENT-QA-ONLY',{exact:true}).count(),1);
    f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");
    const deniedResponse=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/forms/staff.incident-review'));release();
    assert.equal((await deniedResponse).status(),403,'The mounted form read must opt into native Incident actor authorization.');
    await page.getByRole('alert').waitFor();assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE-(?:PARENT-INCIDENT|INCIDENT-IMPACT|UNSENT-INCIDENT)-QA-ONLY/);
    assert.equal(await page.getByRole('textbox').count(),0);assert.equal(posts.length,0);
    f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('reviewer','super_admin',1)");
    const reopened=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/forms/staff.incident-review'));await page.getByRole('button',{name:'Reopen this review with current access',exact:true}).click();assert.equal((await reopened).status(),200);
    await page.getByRole('combobox',{name:/^Action/}).selectOption('acknowledge');const reason=page.getByRole('textbox',{name:/^Reason or substantive update/});assert.equal(await reason.inputValue(),'','Private drafts must not reappear after a denied review is reopened.');await reason.fill('The current authorized responder reviews this incident after reopening access.');
    await Promise.all([page.waitForResponse((response:BrowserResponse)=>response.url().endsWith(path)&&response.request().method()==='POST'),page.getByRole('button',{name:'Save incident action',exact:true}).click()]);assert.equal(posts[0].status,200);assert.doesNotMatch(JSON.stringify(await page.evaluate(()=>Object.entries(sessionStorage))),/PRIVATE-UNSENT-INCIDENT/);
    assert.deepEqual(errors,[]);await context.close();return;
   }
   if (scenario === 'actor') {
    const list = page.getByRole('region', {name: 'Current incidents and retained episodes'});
    assert.ok(await list.evaluate((region: HTMLElement) => region.scrollWidth <= region.clientWidth), 'Incident records should fit the 390px viewport.');
    const incident = list.getByRole('link').first();
    await incident.focus();
    assert.equal(await incident.evaluate((link: HTMLElement) => document.activeElement === link), true, 'The incident link remains keyboard-focusable.');
   }
   if(scenario==='recovery-new'){
    await page.getByText('Record a new failure or map a retained legacy incident',{exact:true}).click();
    await page.getByRole('textbox',{name:'Incident title',exact:true}).fill('Fictional additional incident');await page.getByRole('textbox',{name:'Monitored service or workflow key',exact:true}).fill('fictional.additional');await page.getByRole('textbox',{name:'Failure signature',exact:true}).fill('fictional-additional-failure');await page.getByRole('textbox',{name:'Actual affected actions and impact',exact:true}).fill('The additional fictional workflow needs an independent response.');
   }else{await page.getByRole('combobox',{name:/^Action/}).selectOption('acknowledge');await page.getByRole('textbox',{name:/^Reason or substantive update/}).fill('The original displayed responder acknowledges this fictional incident.');}
   const save=page.getByRole('button',{name:scenario==='recovery-new'?'Record incident':'Save incident action',exact:true});
   await page.waitForFunction((label:string)=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent===label&&!button.disabled),scenario==='recovery-new'?'Record incident':'Save incident action');
   if(scenario!=='recovery-new')assert.ok(await page.getByText('PRIVATE-INCIDENT-IMPACT-QA-ONLY',{exact:false}).count()>0);
   const send=()=>Promise.all([page.waitForResponse((response:BrowserResponse)=>response.url().endsWith(path)&&response.request().method()==='POST'),save.click()]);
   if(scenario==='actor'){
    state.actor='foreign';await send();assert.deepEqual(posts.map(value=>value.status),[403]);
    await page.getByText('PRIVATE-INCIDENT-IMPACT-QA-ONLY',{exact:false}).first().waitFor({state:'hidden'});
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_incident_events WHERE action=?').get('acknowledged')!.n,0);
   }else if(scenario==='recovery'||scenario==='recovery-new'){
    transport.push(503,409,200);await send();assert.equal(posts[0].status,200);
    assert.equal(await page.getByRole('textbox',{name:scenario==='recovery-new'?'Incident title':/^Reason or substantive update/}).isEnabled(),false,'An unknown save must retain its exact draft and operation.');
    for(let index=0;index<2;index++)await Promise.all([page.waitForResponse((response:BrowserResponse)=>response.url().endsWith(path)&&response.request().method()==='POST'),page.getByRole('button',{name:'Retry original incident action',exact:true}).click()]);
    assert.equal(posts.length,3);assert.ok(posts.every(value=>value.status===200&&value.wire===posts[0].wire));
    await page.screenshot({path:scenario==='recovery-new'?'.test-artifacts/t31/incident-recovery-new-current.png':'.test-artifacts/t31/incident-recovery-current.png',fullPage:true});
    const references=await page.evaluate(()=>Object.entries(sessionStorage));assert.ok(references.length>0);assert.doesNotMatch(JSON.stringify(references),/original displayed responder|PRIVATE-INCIDENT-IMPACT/);
    await page.reload();await page.getByRole('button',{name:'Check original incident outcome',exact:true}).click();
    await page.getByText('The original incident action is recorded.',{exact:false}).waitFor();
    assert.deepEqual(reads,[200]);assert.equal(posts.length,3,'Reload recovery must never repeat the mutation.');
    assert.equal((await page.evaluate(()=>Object.entries(sessionStorage))).length,0);
    assert.equal(await page.getByRole('button',{name:'Review current incident evidence',exact:true}).count(),1,'A recovered historical result must offer explicit review even when its initial displayed version did not change.');
    await page.getByRole('button',{name:'Review current incident evidence',exact:true}).click();
    if(scenario==='recovery-new'){
     await page.getByText('Record a new failure or map a retained legacy incident',{exact:true}).click();await page.getByRole('textbox',{name:'Incident title',exact:true}).fill('Fictional next incident');await page.getByRole('textbox',{name:'Monitored service or workflow key',exact:true}).fill('fictional.next');await page.getByRole('textbox',{name:'Failure signature',exact:true}).fill('fictional-next-failure');await page.getByRole('textbox',{name:'Actual affected actions and impact',exact:true}).fill('The next fictional workflow needs a distinct authorized response.');
    }else{await page.getByRole('combobox',{name:/^Action/}).selectOption('update');await page.getByRole('textbox',{name:'Next safe action',exact:true}).fill('Continue the fictional recovery investigation.');await page.getByRole('textbox',{name:/^Reason or substantive update/}).fill('Record a new update after explicitly reviewing the current incident evidence.');}
    await send();assert.equal(posts[3].status,200);assert.notEqual((JSON.parse(posts[3].wire) as {requestId:string}).requestId,(JSON.parse(posts[0].wire) as {requestId:string}).requestId);
   }
   if(scenario==='first-form'||scenario==='unknown-form'){
    if(scenario==='unknown-form'){f.setBeforeBatch(()=>{throw Error('Fictional uncertain operation before publication change.');});await send();assert.equal(posts[0].status,503);}
    f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) SELECT 'incident-browser-form-v2',form_id,2,'published',config_json,'Current fictional incident controls',created_by,created_at+1,updated_by,updated_at+1,published_by,published_at+1,'incident-browser-publication-v2' FROM form_config_versions WHERE id='incident-recovery-browser-form'").run();
    if(scenario==='first-form')await send();else await Promise.all([page.waitForResponse((response:BrowserResponse)=>response.url().endsWith(path)&&response.request().method()==='POST'),page.getByRole('button',{name:'Retry original incident action',exact:true}).click()]);
    assert.equal(posts.at(-1)!.status,409);
    if(scenario==='first-form'){
     assert.equal((await page.evaluate(()=>Object.entries(sessionStorage))).length,0,'Only a first attested form rejection may release its unused reference.');assert.equal(await page.getByRole('textbox',{name:/^Reason or substantive update/}).inputValue(),'The original displayed responder acknowledges this fictional incident.');
     await Promise.all([page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/forms/staff.incident-review')),page.getByRole('button',{name:'Refresh incident form controls',exact:true}).click()]);await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Save incident action'&&!button.disabled));await send();assert.equal(posts[1].status,200);assert.equal((JSON.parse(posts[1].wire) as {formVersion:number}).formVersion,2);assert.notEqual((JSON.parse(posts[1].wire) as {requestId:string}).requestId,(JSON.parse(posts[0].wire) as {requestId:string}).requestId);
    }else{assert.equal(posts[0].wire,posts[1].wire);assert.equal((await page.evaluate(()=>Object.entries(sessionStorage))).length,1);assert.equal(await save.isEnabled(),false);await page.getByRole('button',{name:'Check original incident outcome',exact:true}).click();await page.getByText('The original outcome is not confirmed.',{exact:false}).waitFor();assert.deepEqual(reads,[404]);assert.equal((await page.evaluate(()=>Object.entries(sessionStorage))).length,1);}
   }
   if(scenario==='authority-commit'){
    f.setBeforeBatch(()=>{f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");});await send();assert.equal(posts[0].status,403);await page.getByRole('alert').waitFor();assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE-(?:PARENT-INCIDENT|INCIDENT-IMPACT)-QA-ONLY/);assert.equal((await page.evaluate(()=>Object.entries(sessionStorage))).length,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM service_incident_events WHERE action=?').get('acknowledged')!.n,0);
   }
   if(scenario==='first-conflict'||scenario==='unknown-conflict'){
    if(scenario==='unknown-conflict'){f.setBeforeBatch(()=>{throw Error('Fictional uncertain transport before native commit.');});await send();assert.equal(posts[0].status,503);}
    const current=await domain.readIncident(f.db,'foreign',created.incidentId,'test');state.actor='foreign';
    const other=await api.POST(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':'foreign'},body:JSON.stringify({action:'assign',incidentId:created.incidentId,ownerId:'foreign',backupId:null,reason:'Another eligible responder changes the current incident assignment.',requestId:crypto.randomUUID(),expectedRevision:current.version,formVersion:1,customAnswers:[]})}));assert.equal(other.status,200,await other.clone().text());state.actor='reviewer';
    if(scenario==='first-conflict')await send();else await Promise.all([page.waitForResponse((response:BrowserResponse)=>response.url().endsWith(path)&&response.request().method()==='POST'),page.getByRole('button',{name:'Retry original incident action',exact:true}).click()]);
    assert.equal(posts.at(-1)!.status,409);const originalBody=JSON.parse(posts[0].wire) as {requestId:string};
    await page.evaluate(()=>window.refreshIncidentFixture());
    if(scenario==='first-conflict'){
     assert.equal((await page.evaluate(()=>Object.entries(sessionStorage))).length,0);assert.equal(await page.getByRole('textbox',{name:/^Reason or substantive update/}).inputValue(),'The original displayed responder acknowledges this fictional incident.');
     await page.getByRole('button',{name:'Review current incident evidence',exact:true}).click();await send();assert.equal(posts.at(-1)!.status,200);assert.notEqual((JSON.parse(posts.at(-1)!.wire) as {requestId:string}).requestId,originalBody.requestId);
    }else{
     assert.equal(posts.length,2);assert.equal(posts[0].wire,posts[1].wire);await page.getByRole('button',{name:'Check original incident outcome',exact:true}).click();await page.getByText('The original outcome is not confirmed.',{exact:false}).waitFor();assert.deepEqual(reads,[404]);assert.equal((await page.evaluate(()=>Object.entries(sessionStorage))).length,1);assert.equal(await save.isEnabled(),false);
    }
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=?').get(originalBody.requestId)!.n,0);
   }
   if(scenario==='validation'){
    const reason=page.getByRole('textbox',{name:/^Reason or substantive update/});await reason.fill('A fictional.user@local.hastabazaar.test address was accidentally pasted.');await send();assert.equal(posts[0].status,409);assert.equal(await reason.isEnabled(),true);assert.equal((await page.evaluate(()=>Object.entries(sessionStorage))).length,0);
    await reason.fill('A corrected safe technical acknowledgment preserves the original business evidence.');await send();assert.equal(posts[1].status,200);assert.notEqual((JSON.parse(posts[0].wire) as {requestId:string}).requestId,(JSON.parse(posts[1].wire) as {requestId:string}).requestId);
   }
   if(scenario==='quota'){
    await page.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem')!;window.restoreIncidentStorage=()=>{Object.defineProperty(Storage.prototype,'setItem',descriptor);};Object.defineProperty(Storage.prototype,'setItem',{...descriptor,value(){throw new DOMException('Fictional incident storage full','QuotaExceededError');}});});
    await save.click();await page.getByText('Fictional incident storage full',{exact:true}).waitFor();assert.equal(posts.length,0);assert.equal(await page.getByRole('textbox',{name:/^Reason or substantive update/}).inputValue(),'The original displayed responder acknowledges this fictional incident.');
    await page.evaluate(()=>window.restoreIncidentStorage?.());await send();assert.equal(posts[0].status,200);
   }
   if(scenario==='late'){
    const second=await api.POST(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify({action:'create',requestId:crypto.randomUUID(),expectedRevision:null,formVersion:1,customAnswers:[],serviceKey:'fictional.second',failureSignature:'fictional-second-failure',title:'Fictional second incident',impactSummary:'PRIVATE-SECOND-INCIDENT-QA-ONLY',impactClass:'ordinary',severity:'routine'})}));assert.equal(second.status,200);const secondResult=await second.json() as {incidentId:string};
    const oldResponse=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith(path)&&response.request().method()==='POST');hold=true;await save.click();await held;assert.equal(posts[0].status,200);state.actor='foreign';displayActor='foreign';displayIncident=secondResult.incidentId;await page.evaluate(()=>window.refreshIncidentFixture());
    await page.getByRole('combobox',{name:/^Action/}).selectOption('acknowledge');const reason=page.getByRole('textbox',{name:/^Reason or substantive update/});await reason.fill('The new actor keeps this separate unsent incident draft.');release();await oldResponse;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Save incident action'&&!button.disabled));
    assert.equal(await reason.inputValue(),'The new actor keeps this separate unsent incident draft.');assert.equal(posts.length,1);assert.equal(await page.evaluate(()=>Reflect.get(window,'__pushes')??0),0);assert.equal((await page.evaluate(()=>Object.entries(sessionStorage))).length,1);assert.equal(await page.getByText('The original incident action is recorded.',{exact:false}).count(),0);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'The mobile workspace must not overflow horizontally.');
   assert.deepEqual(errors,[]);await context.close();
  }finally{release();await browser.close();}
 }finally{f.dispose();state.db=null;}
});
