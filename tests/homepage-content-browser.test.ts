/** All browser traffic is intercepted; real forms, staff authorization and native settings receipts use an inspected memory database. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {build} from 'esbuild';
import type {Browser,Route,Response as BrowserResponse} from 'playwright-core';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {saveFormDraft,publishFormDraft} from '../lib/db/repositories/form-catalog';
import {stubFixtureLink,stubFixtureImage} from './helpers/browser-fixture-link';
import {isolatedMediaBucket} from './helpers/isolated-media-bucket';
import sharpModule from 'sharp';
const sharp=sharpModule as (options:unknown)=>{png():{toBuffer():Promise<Buffer>}};
const fixture={db:null as D1Database|null,media:null as R2Bucket|null,actor:'reviewer' as string|null};
(globalThis as typeof globalThis&{homepageBrowserFixture:typeof fixture}).homepageBrowserFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.homepageBrowserFixture.db},get MEDIA(){return globalThis.homepageBrowserFixture.media},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const actor=globalThis.homepageBrowserFixture.actor;return actor?{userId:"external-home-"+actor,email:actor+"@local.hastabazaar.test",fullName:"Fictional editor"}:null};export const requireAuthenticatedUser=getAuthenticatedUser;export const signInPath=(path)=>"/login?return_to="+encodeURIComponent(path);',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
let cssPromise:Promise<string>|undefined;
function homepageCss(){return cssPromise??=(async()=>{const css=(await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';", "@import 'tailwindcss' source(none);\n@source '../components/admin/homepage-*.tsx';\n@source '../components/admin/use-homepage-*.tsx';\n@source '../components/admin/commercial-recovery.tsx';\n@source '../components/forms';\n@source '../components/ui';\n@source inline('min-w-0 p-4');");return(await postcss([tailwind()]).process(css,{from:resolve('app/globals.css')})).css;})();}
async function homepageBundle(){
  const bundle=(await build({stdin:{sourcefile:'homepage-content-fixture.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`
   import React from 'react';import {createRoot} from 'react-dom/client';import {notificationAccessDenied} from './lib/operations/notification-client-events';window.denyHomepageNotification=(accountId,workspace)=>notificationAccessDenied({accountId,workspace});
   import {HomepageAccessBoundary} from './components/admin/homepage-access-boundary';import {HomepageHeroManager} from './components/admin/homepage-hero-manager';import {HomepageOccasionManager} from './components/admin/homepage-occasion-manager';
   const root=createRoot(document.getElementById('root')),query=new URLSearchParams(location.search),initial=window.homepagePublicationFixture??{slides:[],history:[],media:[],asOf:1};window.renderActor=actorId=>root.render(<HomepageAccessBoundary actorId={actorId}>{query.get('mode')==='hero'?<HomepageHeroManager actorId={actorId} initialSlides={initial.slides} initialMedia={initial.media} history={initial.history} asOf={initial.asOf}/>:<HomepageOccasionManager actorId={actorId} initialSlides={initial.slides} history={initial.history} asOf={initial.asOf}/>} {query.has('paired')?<HomepageOccasionManager actorId={actorId} initialSlides={[]} history={[]} asOf={1}/>:null}</HomepageAccessBoundary>);window.renderActor('reviewer');
  `},bundle:true,write:false,loader:{'.module.css':'empty'},platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'homepage-fixture-navigation',setup(b){stubFixtureLink(b);stubFixtureImage(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'homepage-fixture'}));b.onLoad({filter:/.*/,namespace:'homepage-fixture'},()=>({contents:"export function useRouter(){return{refresh(){window.refreshes=(window.refreshes??0)+1}}}export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)}",loader:'js'}));}}]})).outputFiles[0].text;
 return bundle;
}
void test('actual homepage editors bind staff, retire callbacks and recover the original native draft without resubmission',{timeout:180_000},async t=>{
 const f=await completeVersionFixture();assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));f.sqlite.exec(await readFile('drizzle/0055_homepage_hero_carousel.sql','utf8'));fixture.db=f.db;
 f.sqlite.exec("UPDATE users SET auth_subject='external-home-reviewer' WHERE id='reviewer'; UPDATE users SET auth_subject='external-home-foreign' WHERE id='foreign'; INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',1)");
 let browser:Browser|undefined;const releases:Array<()=>void>=[];
 try{
  for(const formId of ['staff.homepage-hero-manager','staff.homepage-occasion-manager'] as const){const draft=await saveFormDraft(f.db,{formId,actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId,fields:[]},reason:'Actual homepage core form in an isolated memory fixture.',requestId:crypto.randomUUID(),now:Date.now()});await publishFormDraft(f.db,{formId,draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:0,reason:'Publish only the supported memory fixture form contract.',requestId:crypto.randomUUID(),now:Date.now()});}
  const settings=await import('../app/api/admin/business-settings/route'),forms=await import('../app/api/forms/[formId]/route'),outcomes=await import('../app/api/admin/commercial-outcomes/route');
  const bundle=await homepageBundle(),css=await homepageCss();
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  for(const mode of ['hero','occasion'])for(const scene of ['old actor','lost acknowledgement','retired callback','native commit acknowledgement lost'])await t.test(mode+' '+scene,async()=>{
   fixture.actor='reviewer';fixture.db=f.db;const context=await browser!.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),posts:Array<{wire:string;status:number;intent?:string}>=[];let documents=0,outcomeReads=0,notifyPosted:()=>void=()=>{};const posted=new Promise<void>(resolve=>notifyPosted=resolve);let release=()=>{};const gate=scene==='retired callback'?new Promise<void>(resolve=>{release=resolve;releases.push(resolve);}):Promise.resolve();
   try{
    await context.route('**/*',async(route:Route)=>{const incoming=route.request(),url=new URL(incoming.url());if(url.origin!=='http://localhost:3018')return route.abort();if(url.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:bundle});if(url.pathname==='/admin/homepage'){documents++;return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body class="min-w-0 p-4"><div id="root"></div><script src="/fixture.js"></script></body></html>'});}
     const method=incoming.method(),req=new Request(url,{method,headers:{...incoming.headers(),origin:url.origin},...(method==='POST'?{body:incoming.postData()}:{} )});let response:Response;
     if(url.pathname.startsWith('/api/forms/'))response=await forms.GET(req,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});
     else if(url.pathname==='/api/admin/business-settings'&&method==='POST'){response=await settings.POST(req);posts.push({wire:incoming.postData()??'',status:response.status,intent:incoming.headers()['x-hastabazaar-actor']});notifyPosted();await gate;if(scene==='lost acknowledgement'&&posts.length===1&&response.ok)response=Response.json({error:'Fictional acknowledgement unavailable.'},{status:503});}
     else if(url.pathname==='/api/admin/commercial-outcomes'){outcomeReads++;response=await outcomes.GET(req);}
     else return route.abort();return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    await page.goto('http://localhost:3018/admin/homepage?mode='+mode);const reason=page.getByLabel('Reason and expected impact'),save=page.getByRole('button',{name:'Save private draft',exact:true});await reason.fill('Fictional original private editorial reason.');await save.waitFor();
    if(scene==='native commit acknowledgement lost'){let lost=false;fixture.db={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){const before=f.sqlite.prepare('SELECT COUNT(*)n FROM business_setting_versions').get()!.n;const result=await f.db.batch(statements);if(!lost&&f.sqlite.prepare('SELECT COUNT(*)n FROM business_setting_versions').get()!.n!==before){lost=true;throw new Error('Fictional transport loss after the actual native commit.');}return result;}} as D1Database;}
    if(scene==='old actor')fixture.actor='foreign';const requestStarted=page.waitForRequest(request=>request.url().endsWith('/api/admin/business-settings')&&request.method()==='POST',{timeout:8000});await save.click();try{await requestStarted;await posted;}catch(error){await page.screenshot({path:'.test-artifacts/t31/homepage-command-post-diagnostic.png',fullPage:true});console.error('Homepage native POST did not start:',(await page.locator('body').innerText()).slice(0,2000));throw error;}
    const wire=JSON.parse(posts[0].wire);assert.match(wire.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,'The actual hook generates a valid original request nonce before POST');const count=()=>Number(f.sqlite.prepare('SELECT COUNT(*)n FROM audit_logs WHERE request_id=?').get(wire.requestId)!.n);
    if(scene==='old actor'){assert.equal(posts[0].status,403,'An old editor must not attribute its private draft to another eligible staff account.');assert.equal(count(),0);await page.waitForTimeout(120);assert.equal(await reason.count(),0,'A known denial conceals private editor fields.');}
    else if(scene==='lost acknowledgement'||scene==='native commit acknowledgement lost'){
     assert.equal(posts[0].status,scene==='lost acknowledgement'?201:409,'Observe the real native status after the original commit.');await page.getByText(scene==='lost acknowledgement'?'Fictional acknowledgement unavailable.':'The business setting draft conflicts with a concurrent change.',{exact:true}).waitFor();assert.equal(count(),1);const storage=await page.evaluate(()=>Object.entries(sessionStorage));assert.ok(storage.every(([,value]:[string,string])=>!value.includes('editorial reason')));assert.equal(await reason.isDisabled(),true,'Unknown original content cannot be changed into a new retry.');assert.equal(await page.getByRole('button',{name:'Start a new attempt',exact:true}).count(),0);
     await page.reload();const recovery=page.getByRole('button',{name:'Check original saved outcome',exact:true});await recovery.waitFor();const recovered=page.waitForResponse((response:BrowserResponse)=>response.url().includes('/api/admin/commercial-outcomes?'));await recovery.click();assert.equal((await recovered).status(),200);await page.waitForFunction((id:string)=>!Object.values(sessionStorage).includes(id),wire.requestId);assert.equal(outcomeReads,1);assert.equal(posts.length,1,'Reload recovery must use only the original native receipt GET.');assert.equal(count(),1);
    }else{
     assert.equal(posts[0].status,201);fixture.actor='foreign';await page.evaluate(()=>{(window as unknown as {renderActor:(id:string)=>void}).renderActor('foreign');});await reason.fill('Fictional new B editorial draft must survive.');const beforeDocuments=documents;const received=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/admin/business-settings'));release();await received;await page.waitForTimeout(160);assert.equal(documents,beforeDocuments,'A retired native success must not reload the new editor.');assert.equal(await reason.inputValue(),'Fictional new B editorial draft must survive.');assert.equal(count(),1);
    }
   }finally{release();await context.close();}
  });
 }finally{for(const release of releases)release();await browser?.close();fixture.db=null;f.dispose();}
});

void test('actual Hero upload keeps its original nonce and private bytes scoped through denial, lost replies and a new editor',{timeout:150_000},async t=>{
 const f=await completeVersionFixture(),media=isolatedMediaBucket();assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));f.sqlite.exec(await readFile('drizzle/0055_homepage_hero_carousel.sql','utf8'));fixture.db=f.db;fixture.media=media.bucket;fixture.actor='reviewer';
 f.sqlite.exec("UPDATE users SET auth_subject='external-home-reviewer' WHERE id='reviewer'; UPDATE users SET auth_subject='external-home-foreign' WHERE id='foreign'; INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',1)");
 let browser:Browser|undefined;const releases:Array<()=>void>=[];
 try{
  for(const formId of ['staff.homepage-hero-manager','staff.homepage-occasion-manager'] as const){const draft=await saveFormDraft(f.db,{formId,actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId,fields:[]},reason:'Actual core form for an isolated uploaded-media journey.',requestId:crypto.randomUUID(),now:Date.now()});await publishFormDraft(f.db,{formId,draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:0,reason:'Publish only the actual memory fixture form contract.',requestId:crypto.randomUUID(),now:Date.now()});}
  const collection=await import('../app/api/admin/homepage/hero-media/route'),forms=await import('../app/api/forms/[formId]/route'),bundle=await homepageBundle(),css=await homepageCss(),png=await sharp({create:{width:960,height:540,channels:3,background:'#446655'}}).png().toBuffer();
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  for(const scene of ['old actor','lost acknowledgement','retired callback','signed out','notification scope'])await t.test(scene,async()=>{
   fixture.actor='reviewer';const context=await browser!.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),posts:Array<{status:number;uploadId?:string;intent?:string}>=[];let reads=0,notifyPosted:()=>void=()=>{},release=()=>{};const posted=new Promise<void>(resolve=>notifyPosted=resolve),gate=scene==='retired callback'?new Promise<void>(resolve=>{release=resolve;releases.push(resolve);}):Promise.resolve(),beforePuts=media.puts.length;
   try{
    await context.route('**/*',async(route:Route)=>{const incoming=route.request(),url=new URL(incoming.url());if(url.origin!=='http://localhost:3018')return route.abort();if(url.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:bundle});if(url.pathname==='/admin/homepage')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body class="min-w-0 p-4"><div id="root"></div><script src="/fixture.js"></script></body></html>'});
     const method=incoming.method(),req=new Request(url,{method,headers:{...incoming.headers(),origin:url.origin},...(method==='POST'?{body:Uint8Array.from(incoming.postDataBuffer()??[]).buffer}:{} )});let response:Response;
     if(url.pathname.startsWith('/api/forms/'))response=await forms.GET(req,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});
     else if(url.pathname==='/api/admin/homepage/hero-media'&&method==='POST'){response=await collection.POST(req);posts.push({status:response.status,uploadId:incoming.headers()['x-hastabazaar-upload-id'],intent:incoming.headers()['x-hastabazaar-actor']});notifyPosted();await gate;if(scene==='lost acknowledgement'&&response.ok)response=Response.json({error:'Fictional upload acknowledgement unavailable.'},{status:503});}
     else if(url.pathname==='/api/admin/homepage/hero-media'&&method==='GET'){reads++;response=await Reflect.apply(collection.GET,undefined,[req]);}
     else return route.abort();return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    await page.goto('http://localhost:3018/admin/homepage?mode=hero&paired=1');
    if(scene==='notification scope'){await page.getByLabel('Reason and expected impact').first().waitFor();for(const [accountId,workspace] of [['foreign','staff'],['reviewer','customer']]){await page.evaluate(({accountId,workspace}:{accountId:string;workspace:string})=>(window as unknown as {denyHomepageNotification:(id:string,workspace:string)=>void}).denyHomepageNotification(accountId,workspace),{accountId,workspace});assert.equal(await page.getByLabel('Reason and expected impact').count(),2,'A foreign account/workspace notification cannot curtain this editor.');}await page.evaluate(()=>(window as unknown as {denyHomepageNotification:(id:string,workspace:string)=>void}).denyHomepageNotification('reviewer','staff'));await page.waitForTimeout(80);assert.equal(await page.locator('textarea,input[type=file]').count(),0,'The actual matching staff denial event conceals both private editors.');assert.equal(posts.length,0);assert.equal(media.puts.length,beforePuts);return;}
const hero=page.locator('form[data-form-id="staff.homepage-hero-manager"]'),occasion=page.locator('form[data-form-id="staff.homepage-occasion-manager"]'),reason=hero.getByLabel('Reason and expected impact');await reason.fill('Fictional private original homepage draft.');await occasion.getByLabel('Reason and expected impact').fill('Fictional private sibling occasion draft.');
    if(scene==='old actor')fixture.actor='foreign';if(scene==='signed out')fixture.actor=null;
    await hero.locator('input[type=file]').setInputFiles({name:'private-original.png',mimeType:'image/png',buffer:png});await posted;
    if(scene==='old actor'||scene==='signed out'){
     assert.equal(posts[0].status,scene==='old actor'?403:401);assert.equal(media.puts.length,beforePuts);await page.waitForTimeout(120);assert.equal(await page.locator('textarea,input[type=file]').count(),0,'The native denial conceals both actual private editors.');await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/homepage-upload-'+scene.replaceAll(' ','-')+'-mobile.png',fullPage:true});
    }else if(scene==='lost acknowledgement'){
     assert.equal(posts[0].status,201);assert.match(posts[0].uploadId??'',/^[0-9a-f-]{36}$/i,'The client knows the upload nonce before a response can be lost.');const nonce=posts[0].uploadId!;await page.getByText('Fictional upload acknowledgement unavailable.',{exact:true}).waitFor();const stored=await page.evaluate(()=>Object.values(sessionStorage));assert.ok(stored.some((value:string)=>value.includes(nonce)));assert.ok(stored.every((value:string)=>!value.includes('private-original')&&!value.includes('homepage draft')));assert.equal(media.puts.length,beforePuts+1);
     await page.reload();const check=page.getByRole('button',{name:'Check original uploaded media',exact:true});await check.waitFor();await check.click();await page.waitForFunction((id:string)=>Object.values(sessionStorage).every(value=>!value.includes(id)),nonce);assert.equal(reads,1);assert.equal(posts.length,1);assert.equal(media.puts.length,beforePuts+1);assert.equal(await page.getByText('private-original.png',{exact:true}).count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/homepage-upload-recovered-mobile.png',fullPage:true});
    }else{
     assert.equal(posts[0].status,201);assert.match(posts[0].uploadId??'',/^[0-9a-f-]{36}$/i);fixture.actor='foreign';await page.evaluate(()=>{(window as unknown as {renderActor:(id:string)=>void}).renderActor('foreign');});await reason.fill('Fictional new B draft stays private and unchanged.');const received=page.waitForResponse((response:BrowserResponse)=>response.url().endsWith('/api/admin/homepage/hero-media'));release();await received;await page.waitForTimeout(150);assert.equal(await reason.inputValue(),'Fictional new B draft stays private and unchanged.');assert.equal(await page.getByText('private-original.png',{exact:true}).count(),0);assert.ok(await page.evaluate((id:string)=>Object.values(sessionStorage).some(value=>value.includes(id)),posts[0].uploadId!));
    }
   }finally{release();await context.close();}
  });
 }finally{for(const release of releases)release();await browser?.close();fixture.db=null;fixture.media=null;f.dispose();}
});

void test('publishing each homepage editor changes the corresponding public story at its effective time', {timeout:90_000}, async () => {
  const f = await completeVersionFixture();
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
  f.sqlite.exec(await readFile('drizzle/0055_homepage_hero_carousel.sql', 'utf8'));
  f.sqlite.exec("UPDATE users SET auth_subject='external-home-reviewer' WHERE id='reviewer'");
  fixture.db = f.db;
  fixture.actor = 'reviewer';
  let browser: Browser | undefined;
  const actualTime = Date.now;
  try {
    const forms = await import('../app/api/forms/[formId]/route');
    const save = await import('../app/api/admin/business-settings/route');
    const change = await import('../app/api/admin/business-settings/changes/[id]/route');
    const { getEffectiveBusinessSetting, listBusinessSettingHistory } = await import('../lib/db/repositories/business-settings');
    const { listHomepageHeroMediaForAdmin } = await import('../lib/db/repositories/homepage-hero');
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const pageModules: Record<string, string> = {
      'next/link': 'export default function Link({children,...props}){return globalThis.homepageTestElement("a",props,children)}',
      'next/image': 'export default function Image({fill,unoptimized,...props}){return globalThis.homepageTestElement("img",props)}',
      'next/navigation': 'export function useRouter(){return {refresh(){}}} export function redirect(path){throw Error(path)}',
      '@/components/layout/site-header': 'export function SiteHeader(){return null}',
      '@/components/layout/site-footer': 'export function SiteFooter(){return null}',
      '@/lib/auth/customer': 'export async function getCustomerReadContext(){return {customer:null,authenticated:false}}',
    };
    (globalThis as typeof globalThis & {homepageTestElement: typeof createElement}).homepageTestElement = createElement;
    const hooks = registerHooks({resolve(specifier, context, next){
      const stub = specifier.endsWith('.module.css') ? 'export default {}' : pageModules[specifier];
      return stub ? {url:'data:text/javascript,'+encodeURIComponent(stub),shortCircuit:true} : next(specifier, context);
    }});
    try {
      const { default: Home } = await import('../app/page');
      const bundle = await homepageBundle();
      const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
      browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
      for (const mode of ['hero', 'occasion'] as const) {
        const formId = mode === 'hero' ? 'staff.homepage-hero-manager' : 'staff.homepage-occasion-manager';
        const key = mode === 'hero' ? 'homepage_hero_slides' : 'homepage_occasion_slides';
        const config = await saveFormDraft(f.db, {formId, actorId:'reviewer', actorRole:'super_admin', expectedPublishedVersion:0, config:{formId,fields:[]},
          reason:'Configure the isolated homepage publication test.', requestId:crypto.randomUUID(),now:actualTime()});
        await publishFormDraft(f.db, {formId, draftId:config.id, actorId:'reviewer', actorRole:'super_admin', expectedDraftRevision:config.revision,
          expectedPublishedVersion:0,reason:'Publish the isolated editor form.',requestId:crypto.randomUUID(),now:actualTime()});
        const context = await browser!.newContext({viewport:{width:1440,height:900},timezoneId:'UTC'});
        try {
          const page = await context.newPage();
          const changedHeading = 'Fictional published ' + mode + ' story';
          const effectiveAt = Math.ceil((actualTime()+60_000)/60_000)*60_000;
          let asOf: number | undefined;
          await context.route('**/*', async (route: Route) => {
            const incoming = route.request();
            const url = new URL(incoming.url());
            if (url.origin !== 'http://localhost:3018') return route.abort();
            if (url.pathname === '/fixture.js') return route.fulfill({contentType:'text/javascript',body:bundle});
            if (url.pathname === '/admin/homepage') {
              const observed = actualTime();
              const [setting, history, media] = await Promise.all([
                getEffectiveBusinessSetting(f.db,key,observed),
                listBusinessSettingHistory(f.db,key),
                listHomepageHeroMediaForAdmin(f.db),
              ]);
              const payload = JSON.stringify({slides:setting.value,history,media,asOf:observed}).replaceAll('<','\\u003c');
              return route.fulfill({contentType:'text/html',body:`<div id="root"></div><script>window.homepagePublicationFixture=${payload}</script><script src="/fixture.js"></script>`});
            }
            if (url.pathname === '/') {
              Date.now = () => asOf ?? actualTime();
              try {
                return await route.fulfill({contentType:'text/html',body:renderToStaticMarkup(await Home())});
              } finally { Date.now = actualTime; }
            }
            const request = new Request(url, {method:incoming.method(), headers:{...incoming.headers(),origin:url.origin},body:incoming.postData() ?? undefined});
            let response: Response;
            if (url.pathname.startsWith('/api/forms/')) {
              response = await forms.GET(request,{params:Promise.resolve({formId})});
            } else if (url.pathname === '/api/admin/business-settings') {
              response = await save.POST(request);
            } else if (url.pathname.startsWith('/api/admin/business-settings/changes/')) {
              response = await change.POST(request,{params:Promise.resolve({id:url.pathname.split('/').at(-1)!})});
            } else {
              return route.abort();
            }
            return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
          });
          await page.goto('http://localhost:3018/admin/homepage?mode=' + mode);
          await page.getByLabel('Heading lead',{exact:true}).first().fill(changedHeading);
          await page.getByLabel('Reason and expected impact').fill('Verify this fictional change reaches the public story.');
          const saved = page.waitForResponse(response=>response.url().endsWith('/api/admin/business-settings') && response.request().method()==='POST');
          await page.getByRole('button',{name:'Save private draft',exact:true}).click();
          const savedResponse = await saved;
          assert.equal(savedResponse.status(),201);

          await page.getByRole('button',{name:'Publish / schedule',exact:true}).waitFor();
          await page.getByLabel('Publication effective date').fill(new Date(effectiveAt).toISOString().slice(0,16));
          await page.getByLabel('Reason and expected impact').fill('Publish the fictional story through its existing staff workflow.');
          const published = page.waitForResponse(response=>response.url().includes('/api/admin/business-settings/changes/') && response.request().method()==='POST');
          await page.getByRole('button',{name:'Publish / schedule',exact:true}).click();
          const publishedResponse = await published;
          assert.equal(publishedResponse.status(),200);

          // The editor can reload itself after publishing while the storefront opens.
          const storefront = await context.newPage();
          asOf = effectiveAt - 1;
          await storefront.goto('http://localhost:3018/');
          const publishedHeading = storefront.getByRole('heading',{name:new RegExp(changedHeading)});
          assert.equal(await publishedHeading.count(),0);
          asOf = effectiveAt;
          await storefront.reload();
          await publishedHeading.waitFor();
        } finally {
          await context.close();
        }
      }
    } finally { hooks.deregister(); }
  } finally {
    Date.now = actualTime;
    await browser?.close();
    fixture.db = null;
    f.dispose();
  }
});
