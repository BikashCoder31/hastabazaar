import type {Route as BrowserRoute,Response as BrowserResponse} from 'playwright-core';
/** Actual protected page props + mounted work/navigation components; memory DB and intercepted Chrome only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import React,{type ReactElement} from 'react';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {ensureReviewTask} from '../lib/workflows/review-tasks';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';

declare global{var overviewBrowserDb:D1Database;var overviewBrowserActor:string;var overviewBrowserStaff:(permission:string)=>Promise<unknown>;var overviewBrowserElement:typeof React.createElement;}
globalThis.overviewBrowserElement=React.createElement;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.overviewBrowserDb},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://overview.fixture.test"};',
 'next/navigation':'export function redirect(path){throw Error("Unexpected redirect: "+path)};export function notFound(){throw Error("Native record unavailable")};export function usePathname(){return "/admin"};export function useSearchParams(){return new URLSearchParams()};export function useRouter(){return{refresh(){}}}',
 'next/link':'export default function Link({children,scroll,prefetch,...props}){return globalThis.overviewBrowserElement("a",props,children)}',
 'next/image':'export default function Image({fill,priority,unoptimized,...props}){return globalThis.overviewBrowserElement("img",props)}',
 '@/lib/auth/staff':'export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffPage(path,permission="account.self.manage"){return globalThis.overviewBrowserStaff(permission)};export async function requireStaffApi(permission){try{return await globalThis.overviewBrowserStaff(permission)}catch{throw new StaffAuthorizationError("Current staff access required",403)}}',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
function propsOf(node:unknown,name:string):Record<string,unknown>|null{
 if(Array.isArray(node)){for(const child of node){const found=propsOf(child,name);if(found)return found;}return null;}
 if(!React.isValidElement(node))return null;const element=node as ReactElement<Record<string,unknown>>,type=element.type;
 if(typeof type==='function'&&type.name===name)return element.props;
 return propsOf(element.props.children,name);
}

void test('Today shows its tasks and owners across widths, and preserves authorized links and exact assignment retries',async()=>{
 const f=await productPublicationFixture('',Date.now());try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  globalThis.overviewBrowserDb=f.db;globalThis.overviewBrowserActor='reviewer';
  globalThis.overviewBrowserStaff=async permission=>{const actor=globalThis.overviewBrowserActor,reader=await staffMutationGuard(f.db,actor,permission as Parameters<typeof staffMutationGuard>[2],Error);await f.db.batch(reader.statements);return{id:actor,displayName:'Fictional '+actor,role:reader.role,permissions:reader.permissions};};
  f.sqlite.exec("UPDATE seller_participation_profiles SET application_stage='submitted' WHERE seller_id='maker'");await ensureReviewTask(f.db,{sourceType:'seller_application',sourceId:'maker',now:f.now});
  // Fictional source records create enough actual permitted native tasks for pagination.
  for(let index=0;index<22;index++){
   const id='overview-applicant-'+index,owner='overview-owner-'+index;
   f.sqlite.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)").run(owner,owner+'@local.hastabazaar.test','Fictional owner '+index,f.now-index*1000,f.now);
   f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'seller',?)").run(owner,f.now);
   f.sqlite.prepare("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) SELECT ?,?,'Fictional applicant',?,'Local',?,'PAN',?,'Fictional representative',support_phone,?,province,district,municipality,locality,'submitted',?,? FROM seller_profiles WHERE id='registered'").run(id,owner,'Fictional queue shop '+index,'FIX-OVERVIEW-'+index,'FIX-TAX-'+index,owner+'@local.hastabazaar.test',f.now-index*1000,f.now);
   await ensureReviewTask(f.db,{sourceType:'seller_application',sourceId:id,now:f.now});
  }
  const overview=await import('../app/admin/page'),assignment=await import('../app/api/admin/review-tasks/route'),continuation=await import('../app/api/admin/review-continuation/route');
  async function view(href:string){
   const url=new URL(href,origin),params=Promise.resolve(Object.fromEntries(url.searchParams));
   if(url.pathname==='/admin'){
    const page=await overview.default({searchParams:params}),today=propsOf(page,'TodayOverview');
    if(today){
     const {metrics,sidebar,...board}=today;
     return{kind:'today',actorId:globalThis.overviewBrowserActor,board,metrics:propsOf(metrics,'TodayWorkSummaries'),orders:propsOf(sidebar,'OverviewOrdersByStage'),health:propsOf(sidebar,'OverviewHealth'),decisions:propsOf(sidebar,'OverviewRecentDecisions')};
    }
    const queue=propsOf(page,'SharedReviewQueue');assert.ok(queue);
    return{kind:'queue',actorId:globalThis.overviewBrowserActor,queue};
   }
   const seller=/^\/admin\/sellers\/([^/]+)$/.exec(url.pathname),intake=/^\/admin\/products\/intakes\/([^/]+)$/.exec(url.pathname);
   let page:unknown;if(seller)page=await(await import('../app/admin/sellers/[id]/page')).default({params:Promise.resolve({id:decodeURIComponent(seller[1])}),searchParams:params});
   else if(intake)page=await(await import('../app/admin/products/intakes/[id]/page')).default({params:Promise.resolve({id:decodeURIComponent(intake[1])}),searchParams:params});
   else throw Error('Unexpected original destination '+url.pathname);
   const back=propsOf(page,'ReviewBackLink');assert.ok(back,'Actual native page must consume return context.');
   return{kind:'detail',actorId:globalThis.overviewBrowserActor,back,path:url.pathname};
  }
  const origin='https://overview.fixture.test',entry=`
   import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';
   import{SharedReviewQueue}from'./components/admin/shared-review-queue';import{OverviewOrdersByStage,TodayWorkSummaries}from'./components/admin/overview-work-summaries';import{OverviewHealth,OverviewHealthProvider}from'./components/admin/overview-health';import{OverviewRecentDecisions}from'./components/admin/overview-recent-decisions';import{ReviewBackLink}from'./components/admin/review-back-link';import{TodayOverview}from'./components/admin/overview-today';
   function App(){const[model,setModel]=useState(null),[error,setError]=useState('');async function load(href=location.href){setModel(null);try{const response=await fetch('/fixture/view?href='+encodeURIComponent(href));const body=await response.json();if(!response.ok)throw Error(body.error);setModel(body)}catch(error){setError(String(error))}}
    useEffect(()=>{window.fixtureRefresh=()=>load();window.fixtureNavigate=href=>{history.pushState(null,'',href);return load(href)};void load()},[]);
    return <main className='mx-auto max-w-6xl space-y-5 p-4'><button onClick={async()=>{await fetch('/fixture/actor',{method:'POST'});await load()}}>Switch fixture actor</button>{error?<p role='alert'>{error}</p>:null}{model?<div key={model.actorId} className='space-y-5'><p>Current fixture actor: {model.actorId}</p>{model.kind==='today'?<OverviewHealthProvider actorId={model.actorId} initial={model.health?.checks}><TodayOverview {...model.board} metrics={<TodayWorkSummaries {...model.metrics}/>} sidebar={<aside><OverviewOrdersByStage {...model.orders}/><OverviewHealth {...model.health}/><OverviewRecentDecisions {...model.decisions}/></aside>}/></OverviewHealthProvider>:model.kind==='queue'?<><h1>Review tasks</h1><SharedReviewQueue {...model.queue}/></>:<><h1>Original authorized record</h1><p>{model.path}</p><ReviewBackLink {...model.back}/></>}</div>:<p>Loading original authorized source…</p>}</main>
   }createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-fixture',setup(builder){
   builder.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'overview-framework'}));builder.onLoad({filter:/.*/,namespace:'overview-framework'},args=>({loader:'tsx',resolveDir:process.cwd(),contents:args.path==='next/navigation'?'export function usePathname(){return location.pathname};export function useSearchParams(){return new URLSearchParams(location.search)};export function useRouter(){return{refresh(){window.fixtureRefreshCount=(window.fixtureRefreshCount??0)+1;window.fixtureRefresh()},push(href){window.fixtureNavigate(href)}}}':"import React from'react';export default function Link({children,onClick,scroll,prefetch,...props}){return <a {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();window.fixtureNavigate(props.href)}}}>{children}</a>}"}));
  }}]});
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/admin/shared-review-queue.tsx';\n@source '../components/admin/overview-today.tsx';\n@source '../components/ui/dialog.tsx';\n@source '../components/ui/popover.tsx';\n@source '../components/ui/field.tsx';\n@source '../components/admin/recorded-date-range-fields.tsx';\n@source '../components/admin/overview-work-summaries.tsx';\n@source '../components/admin/overview-health.tsx';\n@source '../components/admin/overview-recent-decisions.tsx';\n@source '../components/admin/next-review-task.tsx';\n@source inline('mx-auto max-w-6xl space-y-5 p-4');"),{from:resolve('app/globals.css')})).css;
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
   const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),bodies:Record<string,unknown>[]=[],errors:string[]=[];let mode:'lost'|'normal'|'held'|'conflict'|'malformed'='lost',release:(()=>void)|undefined,committed:(()=>void)|undefined,views=0;
   page.on('pageerror',(error:Error)=>errors.push(error.message));
   await context.route('**/*',async(route:BrowserRoute)=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css+'\n'+await readFile('app/admin/workspace.css','utf8')});
    if(url.pathname==='/fixture/actor'){globalThis.overviewBrowserActor='delegate';return route.fulfill({contentType:'application/json',body:'{}'});}
    if(url.pathname==='/fixture/view'){views++;try{return route.fulfill({contentType:'application/json',body:JSON.stringify(await view(url.searchParams.get('href')!))});}catch(error){return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:String(error)})});}}
    if(url.pathname==='/api/admin/review-continuation'){const response=await continuation.GET(new Request(url,{headers:request.headers()}));return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
    if(url.pathname==='/api/admin/review-tasks'){
     bodies.push(request.postDataJSON());const response=await assignment.POST(new Request(url,{method:'POST',headers:{...request.headers(),origin,'Content-Type':'application/json'},body:request.postData()})),body=await response.text();if(response.status!==200){assert.equal(response.status,403,body);return route.fulfill({status:response.status,contentType:'application/json',body});}
     if(mode==='conflict'){mode='normal';return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Fictional conflicting reply after the original committed acknowledgement was lost.'})});}
     if(mode==='malformed'){mode='normal';return route.fulfill({status:200,contentType:'application/json',body:'{}'});}
     if(mode==='held'){committed?.();await new Promise<void>(done=>{release=done;});}
     if(mode==='lost'){mode='normal';return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional lost committed acknowledgement. Retry the same request."}'});}
     return route.fulfill({status:response.status,contentType:'application/json',body});
    }
    if(url.pathname==='/admin')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'});return route.abort();
   });
   await page.goto(origin+'/admin?period=month&reviewView=all');await page.getByRole('heading',{name:'Shared review queue',exact:true}).waitFor();await page.getByRole('button',{name:'Next',exact:true}).click();
   assert.equal(new URL(page.url()).searchParams.get('reviewPage'),'2');const open=page.locator('[data-review-open]').first(),id=await open.locator('..').getAttribute('id');await open.scrollIntoViewIfNeeded();const y=await page.evaluate(()=>scrollY),target=await open.getAttribute('href');await open.click();await page.getByRole('heading',{name:'Original authorized record',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,new URL(target!,origin).pathname);const savedPosition=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('hb.review-position:reviewer:/admin')??'null'));
   await page.evaluate(()=>{const original=window.scrollTo;(window as unknown as {scrollDebug:Array<{args:unknown[];y:number;height:number;behavior:string}>}).scrollDebug=[];window.scrollTo=((...args:unknown[])=>{Reflect.apply(original,window,args);(window as unknown as {scrollDebug:Array<{args:unknown[];y:number;height:number;behavior:string}>}).scrollDebug.push({args,y:scrollY,height:document.documentElement.scrollHeight,behavior:getComputedStyle(document.documentElement).scrollBehavior});})as typeof window.scrollTo;});await page.getByRole('link',{name:'Back to results',exact:true}).click();await page.getByRole('heading',{name:'Shared review queue',exact:true}).waitFor();await page.waitForFunction((rowId:string)=>document.activeElement?.closest('li')?.id===rowId,id);assert.equal(new URL(page.url()).searchParams.get('period'),'month');assert.equal(new URL(page.url()).searchParams.get('reviewPage'),'2');assert.ok(Math.abs((await page.evaluate(()=>scrollY))-y)<4,JSON.stringify({before:y,saved:savedPosition,returned:await page.evaluate(()=>({y:scrollY,height:document.documentElement.scrollHeight,viewport:innerHeight,hash:location.hash,calls:(window as unknown as {scrollDebug:Array<{args:unknown[];y:number;height:number;behavior:string}>}).scrollDebug}))}));
   await page.getByLabel('Find a seller, order, record or review type',{exact:true}).fill('maker');const card=page.locator('#seller-review-queue li').filter({has:page.getByRole('heading',{name:/Application/})}).first();await card.getByText('Manage ownership',{exact:true}).click();await card.getByLabel('Assignment reason',{exact:true}).fill('Take responsibility for this original fictional submitted application.');await card.getByRole('button',{name:'Take ownership',exact:true}).click();await card.getByRole('button',{name:'Retry the same assignment',exact:true}).waitFor();mode='conflict';await card.getByRole('button',{name:'Retry the same assignment',exact:true}).click();await card.getByText('Fictional conflicting reply after the original committed acknowledgement was lost.',{exact:true}).waitFor();assert.equal(await card.getByRole('button',{name:'Retry the same assignment',exact:true}).count(),1,'A later409 must keep the original uncertain assignment.');mode='malformed';const malformed=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/admin/review-tasks')&&response.status()===200);await card.getByRole('button',{name:'Retry the same assignment',exact:true}).click();await malformed;await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));assert.equal(await card.getByRole('button',{name:'Retry the same assignment',exact:true}).count(),1,'A malformed200 must not confirm the original assignment.');await card.getByRole('button',{name:'Retry the same assignment',exact:true}).click();await page.getByText('Assigned to you',{exact:true}).waitFor();assert.equal(bodies.length,4);for(const body of bodies.slice(1))assert.deepEqual(body,bodies[0]);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='review_task.assigned' AND request_id=?").get(String(bodies[0].requestId))!.n,1);
   await page.getByLabel('Find a seller, order, record or review type',{exact:true}).fill(f.sent.caseId);const product=page.locator('#seller-review-queue li').first();await product.getByText('Manage ownership',{exact:true}).click();await product.getByLabel('Assignment reason',{exact:true}).fill('OLD-ACTOR-PRIVATE assignment reason that must not cross identities.');mode='held';const saved=new Promise<void>(done=>{committed=done;});await product.getByRole('button',{name:'Take ownership',exact:true}).click();await saved;
   await page.getByRole('button',{name:'Switch fixture actor',exact:true}).click();await page.getByText('Current fixture actor: delegate',{exact:true}).waitFor();assert.equal(await page.locator('input').evaluateAll((elements:HTMLInputElement[])=>elements.some(element=>element.value.includes('OLD-ACTOR-PRIVATE'))),false);
   const newCard=page.locator('#seller-review-queue li').first();await newCard.getByText('Manage ownership',{exact:true}).click();await newCard.getByLabel('Assignment reason',{exact:true}).fill('NEW-ACTOR-PRIVATE continuing note');const beforeViews=views,beforeRefresh=await page.evaluate(()=>(window as Window&{fixtureRefreshCount?:number}).fixtureRefreshCount??0),acknowledgement=page.waitForResponse((response:{url():string;status():number})=>response.url().endsWith('/api/admin/review-tasks')&&response.status()===200);release!();mode='normal';await acknowledgement;await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));assert.equal(await page.evaluate(()=>(window as Window&{fixtureRefreshCount?:number}).fixtureRefreshCount??0),beforeRefresh);assert.equal(views,beforeViews,'Late previous-actor response must not refresh the new workspace.');assert.equal(await newCard.getByLabel('Assignment reason',{exact:true}).inputValue(),'NEW-ACTOR-PRIVATE continuing note');
   await page.setViewportSize({width:390,height:844});await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/overview-mobile.png',fullPage:true});const savedAssignments=f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='review_task.assigned'" ).get()!.n;globalThis.overviewBrowserActor='reviewer';await newCard.getByRole('button',{name:'Take ownership',exact:true}).click();await page.getByText('Current fixture actor: reviewer',{exact:true}).waitFor();assert.equal(await page.locator('input').evaluateAll((elements:HTMLInputElement[])=>elements.some(element=>element.value.includes('NEW-ACTOR-PRIVATE'))),false);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='review_task.assigned'" ).get()!.n,savedAssignments);

   await page.setViewportSize({width:1440,height:900});
   await page.goto(origin+'/admin');
   await page.getByRole('heading',{name:'Good morning, Fictional',exact:true}).waitFor();
   for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({width,height:844});
    const layout=await page.evaluate(()=>{
     const metrics=document.querySelector('.today-metrics')!;
     const columns=getComputedStyle(metrics).gridTemplateColumns.split(' ').length;
     const firstTask=document.querySelector('.today-task h3')!.getBoundingClientRect();
     const ownerPills=Array.from(document.querySelectorAll('.today-task .today-owner-pill'));
     return {columns,firstTaskBottom:firstTask.bottom,hasOverflow:document.documentElement.scrollWidth>innerWidth,
      ownersVisible:ownerPills.length===document.querySelectorAll('.today-task').length && ownerPills.every(pill=>pill.getBoundingClientRect().height>0)};
    });
    assert.equal(layout.hasOverflow,false,`Today fits at ${width}px`);
    assert.equal(layout.columns,width<640?2:4,`Metric columns at ${width}px`);
    assert.equal(layout.ownersVisible,true,`Every task shows an owner pill at ${width}px`);
    if(width===390)assert.ok(layout.firstTaskBottom<844,'First task is readable on the opening phone screen');
   }
   const nextToAssign=page.locator('.today-task').filter({has:page.locator('input:enabled')}).first();
   await nextToAssign.getByText('Unassigned',{exact:true}).waitFor({state:'visible'});
   const oldest=page.getByRole('button',{name:'Take the oldest task',exact:true});
   await oldest.click();
   const oldestDialog=page.getByRole('dialog',{name:'Take the oldest task',exact:true});
   await oldestDialog.getByRole('button',{name:'Cancel',exact:true}).click();

   await page.setViewportSize({width:390,height:844});
   await page.getByRole('button',{name:'Filters',exact:true}).click();
   const filters=page.getByRole('dialog',{name:'Filter tasks',exact:true});
   await filters.waitFor({state:'visible',timeout:5000});
   await filters.getByLabel('Department',{exact:true}).selectOption('Sellers');
   await filters.getByLabel('Date calendar',{exact:true}).selectOption('bs');
   assert.equal(await filters.getByText(/Opened from/).count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await filters.getByRole('button',{name:'Apply filters',exact:true}).click();
   assert.equal(new URL(page.url()).searchParams.get('todaySection'),'Sellers');
   assert.equal(await page.getByRole('button',{name:/Done today/}).count(),0);

   const eligible=page.locator('.today-task input:enabled');
   await eligible.nth(0).check();await eligible.nth(1).check();
   const bulk=page.locator('.today-selection');
   assert.match(await bulk.innerText(),/2 selected/);
   await bulk.getByRole('button',{name:'Assign to me',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Assign to me',exact:true});
   await dialog.getByLabel('Assignment reason').fill('Take responsibility for both original fictional tasks.');
   const start=bodies.length;mode='lost';
   await dialog.getByRole('button',{name:'Assign to me',exact:true}).click();
   await dialog.getByRole('button',{name:'Retry the same assignment',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
   await page.getByRole('heading',{name:'Good morning, Fictional',exact:true}).waitFor();
   assert.equal(bodies.length,start+3);
   assert.deepEqual(bodies[start],bodies[start+2]);
   assert.notEqual(bodies[start].taskId,bodies[start+1].taskId);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='review_task.assigned'").get()!.n,Number(savedAssignments)+2);
   await page.getByRole('button',{name:/^Mine /}).click();
   const assignedOwners=page.locator('.today-task .today-owner-pill');
   await assignedOwners.first().waitFor({state:'visible'});
   assert.ok((await assignedOwners.allTextContents()).every((owner:string)=>owner.endsWith('You')));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
 }finally{f.dispose();}
});
