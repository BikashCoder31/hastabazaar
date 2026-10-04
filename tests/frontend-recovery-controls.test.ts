import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import type {FixtureBrowser,FixturePage} from './helpers/browser-fixture-types';
type EvidencePage=FixturePage & {screenshot(options:{path:string;fullPage?:boolean}):Promise<Uint8Array>;on(event:'pageerror',handler:(error:Error)=>void):void;};
const evidenceRoot=process.env.FRONTEND_RECOVERY_EVIDENCE_ROOT??'C:/Users/abinash/.codex/visualizations/2026/09/30/01a0f2dd-89c4-77c1-9b97-f0cf98fec1b0';
mkdirSync(evidenceRoot,{recursive:true});
const playwrightPath=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
async function mount(contents:string,carousel=false){
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';${contents}`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'recovery-fixtures',setup(b){
  b.onResolve({filter:/^next\/(link|navigation|image)$/},a=>({path:a.path,namespace:'next'}));
  b.onLoad({filter:/.*/,namespace:'next'},a=>({contents:a.path==='next/navigation'?'export function useRouter(){return {refresh(){window.refreshes=(window.refreshes||0)+1}}}':a.path==='next/image'?'import React from "react";export default function Image(p){return React.createElement("img",p)}':'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}',loader:'js',resolveDir:process.cwd()}));
  if(carousel){b.onResolve({filter:/^@\/components\/ui\/carousel$/},()=>({path:'carousel',namespace:'carousel'}));b.onLoad({filter:/.*/,namespace:'carousel'},()=>({loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useEffect} from 'react';let index=0;const handlers=new Set();const api={selectedScrollSnap(){return index},scrollNext(){window.advances++;index=(index+1)%3;handlers.forEach(fn=>fn())},scrollTo(i){index=i;handlers.forEach(fn=>fn())},on(event,fn){if(event==='select')handlers.add(fn)},off(event,fn){if(event==='select')handlers.delete(fn)}};export function Carousel({setApi,children,...props}){useEffect(()=>setApi(api),[setApi]);return <div {...props}>{children}</div>}export function CarouselContent({children,...props}){return <div {...props}>{children}</div>}export function CarouselItem({children,...props}){return <div {...props}>{children}</div>}`}));}
  // Read-only historical source simulation: this compiles baseline components
  // only in synthetic fixtures and never rewrites the app or running preview.
  if(carousel && process.env.FRONTEND_RECOVERY_BASELINE==='1')b.onLoad({filter:/homepage-(?:hero|occasion)-carousel\.tsx$/},args=>{
    const name=args.path.replaceAll('\\','/').split('/').at(-1)!;
    return {loader:'tsx',resolveDir:process.cwd(),contents:execFileSync('git',['show',`4513d3b3811e9467244ec131f91d22b838b74fd8:components/homepage/${name}`],{encoding:'utf8'})};
  });
 }}]});
 const {chromium}=await import(playwrightPath) as {chromium:{launch(options:object):Promise<FixtureBrowser>}};
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage() as EvidencePage;const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));return {browser,page,errors,script:bundle.outputFiles[0].text};
}
for(const mode of ['hero','occasion'] as const)void test(`${mode} retains dots, six-second rotation, twelve-second manual hold and interaction safeguards`,async()=>{
 const f=await mount(mode==='hero'?`import {HomepageHeroCarousel} from './components/homepage/homepage-hero-carousel';import {INITIAL_HOMEPAGE_HERO_SLIDES} from './lib/homepage/hero-slides';createRoot(document.getElementById('root')).render(<HomepageHeroCarousel slides={INITIAL_HOMEPAGE_HERO_SLIDES}/>);`:`import {HomepageOccasionCarousel} from './components/homepage/homepage-occasion-carousel';import {INITIAL_HOMEPAGE_OCCASION_SLIDES} from './lib/homepage/occasion-slides';createRoot(document.getElementById('root')).render(<HomepageOccasionCarousel slides={INITIAL_HOMEPAGE_OCCASION_SLIDES}/>);`,true);
 try{
  await f.page.route('https://recovery.test/**',async route=>route.fulfill({contentType:'text/html',body:'<title>Carousel recovery fixture</title><div id="root"></div><button id="outside">Outside carousel</button>'}));await f.page.goto('https://recovery.test/');
  await f.page.evaluate(()=>{const w=window as unknown as {advances:number;tick:(milliseconds?:number)=>void;motion:(value:boolean)=>void};w.advances=0;let now=Date.now();Date.now=()=>now;const timers=new Map<number,[number,()=>void]>();let serial=100000;const timeout=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window) as (id:number)=>void;window.setTimeout=((fn:TimerHandler,delay?:number,...args:unknown[])=>{if((delay===6000||delay===12000)&&typeof fn==='function'){const id=serial++;timers.set(id,[now+delay,()=>fn(...args)]);return id;}return timeout(fn,delay,...args);}) as typeof window.setTimeout;window.clearTimeout=(id)=>{if(typeof id==='number'){if(timers.has(id))timers.delete(id);else clear(id);}};w.tick=(milliseconds=6000)=>{now+=milliseconds;const pending=[...timers].filter(([,timer])=>timer[0]<=now);pending.forEach(([id,timer])=>{timers.delete(id);timer[1]();});};let reduced=false;const media=window.matchMedia('(prefers-reduced-motion: reduce)');Object.defineProperty(media,'matches',{get(){return reduced}});window.matchMedia=()=>media;w.motion=value=>{reduced=value;media.dispatchEvent(new Event('change'));};});
  await f.page.addScriptTag({content:f.script});await f.page.waitForFunction(()=>Boolean(document.querySelector('section')));
  const flush=()=>f.page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const tick=()=>f.page.evaluate(()=> (window as unknown as {tick:()=>void}).tick());
  const advances=()=>f.page.evaluate(()=> (window as unknown as {advances:number}).advances);
  await flush();assert.equal(await f.page.getByRole('button',{name:/Pause|Resume/}).count(),0,'story sliders expose only dots');
  await tick();await f.page.waitForFunction(()=> (window as unknown as {advances:number}).advances===1);
  await f.page.getByRole('button',{name:/Show slide 2:/}).click();await f.page.locator('#outside').click();await flush();
  await tick();assert.equal(await advances(),1,'manual browsing holds beyond the first six seconds');
  await tick();await f.page.waitForFunction(()=> (window as unknown as {advances:number}).advances===2);
  await f.page.locator('section').evaluate(element=>element.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'})));await flush();
  await tick();assert.equal(await advances(),2,'hover pauses story rotation');
  await f.page.locator('section').evaluate(element=>element.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.querySelector('#outside')})));await flush();
  await tick();await f.page.waitForFunction(()=> (window as unknown as {advances:number}).advances===3);
  await f.page.getByRole('button',{name:/Show slide 2:/}).evaluate(element=>{element.focus();element.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Tab'}));});await flush();
  await tick();assert.equal(await advances(),3,'keyboard focus pauses story rotation');
  await f.page.locator('#outside').click();await flush();await tick();await f.page.waitForFunction(()=> (window as unknown as {advances:number}).advances===4);
  await f.page.evaluate(()=> (window as unknown as {motion:(value:boolean)=>void}).motion(true));await flush();await tick();assert.equal(await advances(),4,'reduced motion pauses automatic stories');
  await f.page.evaluate(()=> (window as unknown as {motion:(value:boolean)=>void}).motion(false));await flush();await tick();await f.page.waitForFunction(()=> (window as unknown as {advances:number}).advances===5);
  await f.page.getByRole('button',{name:/Show slide 2:/}).evaluate(element=>element.scrollIntoView({block:'center'}));await f.page.screenshot({path:`${evidenceRoot}/frontend-${mode}-controls.png`});
  assert.deepEqual(f.errors,[],'carousel fixture must have no uncaught runtime errors');
 }finally{await f.page.close();await f.browser.close();}
});

void test('tracking retains the same-query successful result on outage, marks it stale and retries; query edits clear it',async()=>{
 const f=await mount(`import {OrderTracker} from './components/commerce/order-tracker';createRoot(document.getElementById('root')).render(<OrderTracker initialOrder="HK-FICTIONAL"/>);`);let attempts=0;
 try{
  await f.page.route('https://recovery.test/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/api/forms/'))return route.fulfill({status:503,contentType:'application/json',body:'{}'});if(path==='/api/orders/track'){attempts++;return route.fulfill({status:attempts===2?503:200,contentType:'application/json',body:JSON.stringify(attempts===2?{error:'Tracking temporarily unavailable'}:{tracking:{orderNumber:'HK-FICTIONAL',status:attempts===3?'delivered':'confirmed',events:[],updatedAt:1800000000000,estimatedMinDays:2,estimatedMaxDays:4,trackingCode:'TRACK-FICTIONAL'}})});}return route.fulfill({contentType:'text/html',body:'<title>Tracking recovery fixture</title><div id="root"></div>'});});
  await f.page.goto('https://recovery.test/');await f.page.addScriptTag({content:f.script});await f.page.locator('[name="email"]').fill('buyer@example.test');await f.page.getByRole('button',{name:'Track order',exact:true}).click();const progress=f.page.getByRole('region',{name:'Order progress'});await progress.waitFor();
  await f.page.getByRole('button',{name:'Refresh tracking',exact:true}).click();await f.page.getByRole('alert').getByText('Tracking temporarily unavailable').waitFor();assert.equal(await progress.count(),1,'transient failure must retain the last result');await f.page.getByText('Last successful tracking is shown. It may be out of date.').waitFor();
  await f.page.screenshot({path:`${evidenceRoot}/frontend-tracking-stale.png`});
  await f.page.getByRole('button',{name:'Retry tracking',exact:true}).click();await progress.getByRole('heading',{name:'Delivered',exact:true}).waitFor();assert.equal(await f.page.getByText('Last successful tracking is shown. It may be out of date.').count(),0);
  await f.page.locator('[name="email"]').fill('different@example.test');assert.equal(await progress.count(),0);assert.equal(attempts,3);
  assert.deepEqual(f.errors,[],'tracking fixture must have no uncaught runtime errors');
 }finally{await f.page.close();await f.browser.close();}
});
for(const kind of ['return','complaint'] as const)void test(`${kind} uncertain transport explains saved-case recovery and retries the original attempt`,async()=>{
 const f=await mount(`import {CustomerAftercare} from './components/commerce/customer-aftercare';createRoot(document.getElementById('root')).render(<CustomerAftercare orderNumber="HK-FICTIONAL" orderStatus="delivered" items={[{id:'item',productName:'Cup',sellerName:'Maker',quantity:1,returnEligible:true}]} returns={[]} complaints={[]}/>);`);const attempts:string[]=[];
 try{
  await f.page.route('https://recovery.test/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;if(path.startsWith('/api/forms/')){const formId=decodeURIComponent(path.split('/').at(-1)!);return route.fulfill({contentType:'application/json',body:JSON.stringify({config:{formId,version:1,publishedAt:1,fields:[]}})});}if(path.endsWith(kind==='return'?'/returns':'/complaints')){
   const payload=kind==='complaint'?JSON.parse(req.postData()??'{}') as {idempotencyKey:string}:null;
   if(payload)attempts.push(payload.idempotencyKey);else{const body=req.postData()!;const match=/name="idempotencyKey"\r\n\r\n([^\r]+)/.exec(body);assert.ok(match);attempts.push(match[1]);}
   if(attempts.length===1)return route.abort();return route.fulfill({contentType:'application/json',body:JSON.stringify({id:'case',referenceNumber:'CASE-FICTIONAL',duplicate:true,message:'Existing case confirmed.'})});
  }return route.fulfill({contentType:'text/html',body:'<title>Aftercare recovery fixture</title><div id="root"></div>'});});
  await f.page.goto('https://recovery.test/');await f.page.addScriptTag({content:f.script});await f.page.getByRole('button',{name:kind==='return'?/Return or replace an item/:/Get help or raise a complaint/}).click();const form=f.page.locator(`form[data-form-id="commerce.${kind==='return'?'return-request':'complaint'}"]`);if(kind==='complaint')await form.locator('[name="subject"]').fill('Damaged delivery');await form.locator('[name="detail"]').fill('The handmade cup arrived damaged and cannot be used.');
  const send=form.getByRole('button',{name:kind==='return'?'Send return request':'Send complaint'});await send.click();await form.getByRole('alert').waitFor();assert.match(await form.getByRole('alert').textContent()??'',/saved cases.*same.*answers/i);
  assert.equal(await form.locator('[name="detail"]').inputValue(),'The handmade cup arrived damaged and cannot be used.');await send.click();await form.getByText('Existing case confirmed.').waitFor();assert.equal(attempts.length,2);assert.equal(attempts[0],attempts[1]);
  assert.deepEqual(f.errors,[],'aftercare fixture must have no uncaught runtime errors');
 }finally{await f.page.close();await f.browser.close();}
});
void test('tracking authorization failure clears a previous successful private result',async()=>{
 const f=await mount(`import {OrderTracker} from './components/commerce/order-tracker';createRoot(document.getElementById('root')).render(<OrderTracker initialOrder="HK-FICTIONAL"/>);`);let attempts=0;
 try{
  await f.page.route('https://recovery.test/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/api/forms/'))return route.fulfill({status:503,contentType:'application/json',body:'{}'});if(path==='/api/orders/track')return route.fulfill({status:++attempts===1?200:403,contentType:'application/json',body:JSON.stringify(attempts===1?{tracking:{orderNumber:'HK-FICTIONAL',status:'confirmed',events:[],updatedAt:1800000000000,estimatedMinDays:2,estimatedMaxDays:4}}:{error:'Access denied'})});return route.fulfill({contentType:'text/html',body:'<title>Tracking authority fixture</title><div id="root"></div>'});});
  await f.page.goto('https://recovery.test/');await f.page.addScriptTag({content:f.script});await f.page.locator('[name="email"]').fill('buyer@example.test');await f.page.getByRole('button',{name:'Track order',exact:true}).click();await f.page.getByRole('region',{name:'Order progress'}).waitFor();await f.page.getByRole('button',{name:'Refresh tracking',exact:true}).click();await f.page.getByRole('alert').getByText('Access denied').waitFor();assert.equal(await f.page.getByRole('region',{name:'Order progress'}).count(),0);
 }finally{await f.page.close();await f.browser.close();}
});
