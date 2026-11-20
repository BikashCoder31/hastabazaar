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
import {sessionAttemptKey} from '../lib/forms/client-attempt';

const origin='http://localhost:3018',state={db:null as D1Database|null,actor:'reviewer'};
(globalThis as typeof globalThis&{documentAdminBrowserFixture:typeof state}).documentAdminBrowserFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.documentAdminBrowserFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const actor=globalThis.documentAdminBrowserFixture.actor;return{userId:actor,email:actor+"@local.hastabazaar.test",fullName:"Fictional reviewer",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

declare global{interface Window{refreshDocumentFixture:()=>Promise<void>;restoreDocumentStorage?:()=>void;__refreshes:number;}}
for(const kind of ['review','permission'] as const)for(const scenario of ['actor','recovery','late','first-conflict','unknown-conflict'] as const){
 if(kind==='permission'&&scenario!=='actor'&&scenario!=='recovery')continue;
 void test(`actual document ${kind} UI ${scenario} preserves original authority and recovery`,{timeout:90_000},async()=>{
 const f=await completeVersionFixture(Date.now()-60_000);state.db=f.db;state.actor='reviewer';
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',?)").run(f.now);
  const documentId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id);
  const domain=await import('../lib/sellers/document-review'),{sellerDocumentWorkspace}=await import('../lib/sellers/document-workspace');
  let requestId:string|undefined;
  if(kind==='permission'){
   await domain.verifySellerDocument(f.db,{sellerId:'maker',documentId,actorId:'reviewer',reason:'Inspect the original fictional identity evidence before its scoped replacement.',now:f.now});
   requestId=await domain.requestDocumentChange(f.db,{sellerId:'maker',documentId,actorId:'maker-user',reason:'A replacement is requested for this exact fictional identity evidence.',now:f.now+1});
  }
  let displayActor='reviewer',displayDocument=documentId,displayRequest=requestId;
  const props=async()=>({workspace:await sellerDocumentWorkspace(f.db,'maker',displayActor,'staff'),sellerId:'maker',documentId:displayDocument,requestId:displayRequest,viewerId:displayActor});
  const api=kind==='review'?await import('../app/api/admin/seller-documents/[id]/review/route'):await import('../app/api/admin/seller-document-change-requests/[id]/route');
  const sourceId=requestId??documentId,path=kind==='review'?`/api/admin/seller-documents/${sourceId}/review`:`/api/admin/seller-document-change-requests/${sourceId}`;
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{DocumentReviewWorkspace}from'./components/admin/document-review-workspace';const root=createRoot(document.getElementById('root'));const render=props=>root.render(<DocumentReviewWorkspace {...props}/>);window.refreshDocumentFixture=async()=>render(await(await fetch('/fixture-props')).json());render(window.__BOOT__);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.__refreshes=(window.__refreshes||0)+1}}}'}));}}]})).outputFiles[0].text;
  const cssSource=(await readFile('app/globals.css','utf8')).replace(/@import\s+(['"])tailwindcss\1;/,'@import "tailwindcss" source(none);\n@source "../app";\n@source "../components";\n@source "../hooks";\n@source "../lib";');
  const css=(await postcss([tailwind()]).process(cssSource,{from:resolve('app/globals.css')})).css;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  let release=()=>{};
  try{
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors:string[]=[],posts:{status:number;actor:string|undefined;wire:string}[]=[],reads:number[]=[];
   const transport:number[]=[];let hold=false,started=()=>{};
   const gate=new Promise<void>(resolve=>{release=resolve;}),held=new Promise<void>(resolve=>{started=resolve;});
   page.on('pageerror',(error:Error)=>errors.push(error.message));
   await page.route('**/*',async(route:Route)=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'application/javascript',body:code});
    if(url.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});
    if(url.pathname==='/fixture-props')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await props())});
    if(url.pathname==='/admin/document-fixture')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(await props()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    if(url.pathname===path&&request.method()==='POST'){
     const headers=request.headers(),response=await api.POST(new Request(request.url(),{method:'POST',headers:{...headers,origin},body:request.postData()}),{params:Promise.resolve({id:sourceId})});
     posts.push({status:response.status,actor:headers['x-hastabazaar-actor'],wire:request.postData()??''});
     if(hold){hold=false;started();await gate;}
     const override=transport.shift();
     if(override!==undefined)return route.fulfill({status:override,contentType:'application/json',body:override===200?'{}':JSON.stringify({error:'Original outcome remains uncertain in this fixture.'})});
     if(response.status===403&&kind==='permission')return route.fulfill({status:403,contentType:'text/html',body:'<p>Message body unavailable</p>'});
     return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
    }
    if(url.pathname===path&&request.method()==='GET'){
     const response=await api.GET(new Request(request.url(),{headers:request.headers()}),{params:Promise.resolve({id:sourceId})});reads.push(response.status);
     return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
    }
    errors.push('Unexpected isolated request: '+url.pathname);return route.fulfill({status:404,body:'Unavailable fixture route'});
   });
   await page.goto(origin+'/admin/document-fixture');
   await page.getByRole('textbox',{name:'Reason shown to the seller'}).fill('The original displayed reviewer inspected the exact fictional evidence.');
   assert.equal(await page.getByText('PRIVATE-GOVERNMENT-IDENTITY-QA-ONLY',{exact:false}).count(),1);
   const before=f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL').get()!.n;
   const waitPost=()=>page.waitForResponse((value:BrowserResponse)=>new URL(value.url()).pathname===path&&value.request().method()==='POST');
   if(scenario==='actor'){
    state.actor='foreign';const response=waitPost();await page.getByRole('button',{name:'Record decision',exact:true}).click();await response;
    assert.equal(posts.at(-1)?.status,403,'A decision from displayed A must not be applied as authenticated B.');assert.equal(posts.at(-1)?.actor,'reviewer');
    await page.getByRole('alert').waitFor();assert.equal(await page.getByText('PRIVATE-GOVERNMENT-IDENTITY-QA-ONLY',{exact:false}).count(),0);
    assert.equal(await page.getByRole('textbox',{name:'Reason shown to the seller'}).count(),0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL').get()!.n,before);
   }else if(scenario==='recovery'){
    await page.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem');if(!descriptor||typeof descriptor.value!=='function')throw new Error('Storage fixture unavailable');const original=descriptor.value as (this:Storage,key:string,value:string)=>void;Storage.prototype.setItem=function(key,value){if(key.includes('staff.document.'))throw new DOMException('Fictional storage unavailable','QuotaExceededError');original.call(this,key,value);};window.restoreDocumentStorage=()=>{Object.defineProperty(Storage.prototype,'setItem',descriptor);};});
    await page.getByRole('button',{name:'Record decision',exact:true}).click();await page.getByText('Fictional storage unavailable',{exact:true}).waitFor();assert.equal(posts.length,0);
    await page.evaluate(()=>window.restoreDocumentStorage?.());transport.push(503,409,200);
    let response=waitPost();await page.getByRole('button',{name:'Record decision',exact:true}).click();await response;
    for(let retry=0;retry<2;retry++){response=waitPost();await page.getByRole('button',{name:'Retry exact original decision',exact:true}).click();await response;}
    assert.equal(posts.length,3);assert.ok(posts.every(post=>post.status===200&&post.actor==='reviewer'&&post.wire===posts[0].wire));
    const command=JSON.parse(posts[0].wire) as {commandId:string},originalKey=sessionAttemptKey('staff.document.'+kind,JSON.stringify(['reviewer',sourceId]));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL').get()!.n,Number(before)+1);
    const stored=await page.evaluate(()=>Object.entries(sessionStorage));assert.equal(stored.length,1);assert.equal(stored[0][0],originalKey);assert.equal(stored[0][1],command.commandId);assert.doesNotMatch(JSON.stringify(stored),/PRIVATE-GOVERNMENT|original displayed reviewer|reason|decision/);
    if(kind==='permission'){
     state.actor='foreign';const current=f.sqlite.prepare('SELECT operation_request_id AS operationId FROM seller_document_change_requests WHERE id=?').get(sourceId)!;
     const later=await api.POST(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':'foreign'},body:JSON.stringify({decision:'reject',reason:'Another eligible reviewer records this later fictional rejection.',commandId:crypto.randomUUID(),expectedOperationId:current.operationId})}),{params:Promise.resolve({id:sourceId})});assert.equal(later.status,200,await later.text());
    }
    state.actor='foreign';displayActor='foreign';await page.reload();assert.equal(await page.getByRole('button',{name:'Check original saved outcome',exact:true}).count(),0);
    const foreignKey=sessionAttemptKey('staff.document.'+kind,JSON.stringify(['foreign',sourceId]));await page.evaluate(({key,id}:{key:string;id:string})=>sessionStorage.setItem(key,id),{key:foreignKey,id:command.commandId});await page.reload();
    await page.getByRole('button',{name:'Check original saved outcome',exact:true}).click();await page.getByText('The original decision is not confirmed.',{exact:false}).waitFor();assert.equal(reads.at(-1),404);assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),foreignKey),command.commandId);
    state.actor='reviewer';displayActor='reviewer';await page.reload();assert.equal(await page.getByRole('textbox',{name:'Reason shown to the seller'}).count(),0);
    await page.getByRole('button',{name:'Check original saved outcome',exact:true}).click();await page.getByText('The original decision is recorded.',{exact:false}).waitFor();assert.equal(reads.at(-1),200);assert.equal(posts.length,3);
    assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),originalKey),null);assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),foreignKey),command.commandId);
    if(kind==='permission')assert.equal(f.sqlite.prepare('SELECT status FROM seller_document_change_requests WHERE id=?').get(sourceId)!.status,'rejected');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }else if(scenario==='late'){
    hold=true;const response=waitPost();await page.getByRole('button',{name:'Record decision',exact:true}).click();await held;
    const nextDocument='fictional-next-pan';f.sqlite.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES(?,'maker','pan_certificate',?,'Fictional pending PAN.pdf','application/pdf',100,'pending',?)").run(nextDocument,'private/seller-documents/maker/'+nextDocument,f.now+100);
    state.actor='foreign';displayActor='foreign';displayDocument=nextDocument;displayRequest=undefined;await page.evaluate(()=>window.refreshDocumentFixture());
    const note=page.getByRole('textbox',{name:'Reason shown to the seller'});await note.waitFor();assert.equal(await note.inputValue(),'');await note.fill('PRIVATE new reviewer note for the separate pending PAN.');
    release();await(await response).finished();await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>done())));
    assert.equal(await note.inputValue(),'PRIVATE new reviewer note for the separate pending PAN.');assert.equal(await page.evaluate(()=>window.__refreshes??0),0);assert.equal(posts.length,1);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(nextDocument)!.status,'pending');
    assert.equal(await page.getByRole('button',{name:'Record decision',exact:true}).isEnabled(),true);
   }else{
    const reviewByB=async()=>{
     state.actor='foreign';const current=f.sqlite.prepare('SELECT review_request_id AS reviewId FROM seller_documents WHERE id=?').get(documentId)!;
     const changed=await api.POST(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':'foreign'},body:JSON.stringify({sellerId:'maker',decision:'request_correction',reason:'Another eligible reviewer requests correction of the exact fictional evidence.',commandId:crypto.randomUUID(),expectedReviewId:current.reviewId})}),{params:Promise.resolve({id:sourceId})});
     assert.equal(changed.status,200,await changed.text());state.actor='reviewer';
    };
    const originalNote=await page.getByRole('textbox',{name:'Reason shown to the seller'}).inputValue();
    if(scenario==='unknown-conflict'){
     f.setBeforeBatch(()=>{throw new Error('Fictional uncertain write response');});const first=waitPost();await page.getByRole('button',{name:'Record decision',exact:true}).click();await first;
     await page.getByRole('button',{name:'Retry exact original decision',exact:true}).waitFor();assert.equal(posts[0].status,503);
    }
    await reviewByB();
    const rejected=waitPost();await page.getByRole('button',{name:scenario==='first-conflict'?'Record decision':'Retry exact original decision',exact:true}).click();
    const conflict=await(await rejected).json() as {phase:string;requestId:string};assert.equal(conflict.phase,'before_write');
    await page.getByRole('button',{name:'Refresh current evidence and keep my note',exact:true}).waitFor({state:'visible'});
    const key=sessionAttemptKey('staff.document.review',JSON.stringify(['reviewer',sourceId]));
    assert.equal(await page.getByRole('textbox',{name:'Reason shown to the seller'}).inputValue(),originalNote);
    if(scenario==='first-conflict'){
     await page.waitForFunction((key:string)=>sessionStorage.getItem(key)===null,key);
     assert.equal(await page.getByRole('button',{name:'Retry exact original decision',exact:true}).count(),0);
     await page.evaluate(()=>window.refreshDocumentFixture());await page.getByRole('button',{name:'Use reviewed current evidence',exact:true}).waitFor();
     assert.equal(await page.getByRole('button',{name:'Record decision',exact:true}).isDisabled(),true);
     await page.getByRole('button',{name:'Use reviewed current evidence',exact:true}).click();
     const saved=waitPost();await page.getByRole('button',{name:'Record decision',exact:true}).click();assert.equal((await saved).status(),200);await page.getByText('The original decision is recorded.',{exact:false}).waitFor();
     const final=JSON.parse(posts.at(-1)!.wire) as {commandId:string};assert.notEqual(final.commandId,conflict.requestId);
     assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND command_key IS NOT NULL').get(conflict.requestId)!.n,0);
    }else{
     assert.equal(posts.length,2);assert.equal(posts[0].wire,posts[1].wire);assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),key),conflict.requestId);
     await page.getByRole('button',{name:'Check original saved outcome',exact:true}).click();await page.getByText('The original decision is not confirmed.',{exact:false}).waitFor();
     assert.equal(reads.at(-1),404);assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),key),conflict.requestId);
     assert.equal(await page.getByRole('button',{name:'Record decision',exact:true}).isDisabled(),true);assert.equal(posts.length,2);
    }
   }
   release();
   assert.deepEqual(errors,[]);await context.close();
  }finally{release();await browser.close();}
 }finally{f.dispose();state.db=null;}
});}
