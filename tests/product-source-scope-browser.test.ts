/** Actual mounted Product controls and native APIs; all network intercepted, :memory: only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {saveProductWorkspace,submitProductIntake} from '../lib/products/intake-workspace';
import {getProductPublicationReview} from '../lib/products/publication';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import {stubFixtureLink,stubFixtureImage} from './helpers/browser-fixture-link';

declare global {var productScopeDb:D1Database;var productScopeActor:string;var productScopeAuthority:(permission:string)=>Promise<{id:string;role:string}>;interface Window{__blockProductStorage:()=>void;__currentViewRefreshes:number;__restoreProductStorage:()=>void;__switchProduct:(value:{caseId:string;mode:string;initial:Awaited<ReturnType<typeof getProductPublicationReview>>})=>void;__productScopeRefreshes:string[];__completions:string[];}}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.productScopeDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(permission){try{return await globalThis.productScopeAuthority(permission)}catch(error){throw new StaffAuthorizationError(error.message)}}',shortCircuit:true};
 return next(specifier,context);
}});

type FixtureRoute={request():{url():string;method():string;headers():Record<string,string>;postData():string|null};fulfill(input:{status?:number;contentType?:string;body:string}):Promise<void>;abort(code?:string):Promise<void>};
void test('mounted Product source/actor switches and late native outcomes cannot reuse or persist another scope draft',{timeout:180000},async t=>{
 const f=await productPublicationFixture('',Date.now()-1000);
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  globalThis.productScopeDb=f.db;globalThis.productScopeActor='reviewer';globalThis.productScopeAuthority=async permission=>{const proof=await staffMutationGuard(f.db,globalThis.productScopeActor,permission as never,Error);return{id:globalThis.productScopeActor,role:proof.role};};
  const mediaIds:string[]=[];const input={...structuredClone(f.input),draftId:null,mediaIds};input.answers.nameEn='Fictional second cup';input.privateReview.note='PRIVATE-SECOND-SOURCE';input.offers.offers[0].id='second-cup';input.offers.offers[0].sku='SECOND-CUP';input.offers.offers[0].mediaId='second-photo';
  const created=await saveProductWorkspace(f.db,{actorId:'registered-owner',requestId:'scope-second-draft',expectedRevision:null,now:f.now+10},input);
  f.sqlite.prepare("INSERT INTO product_intake_media(id,draft_id,owner_id,request_id,object_key,mime_type,size_bytes,original_name,content_digest,state,created_at,completed_at) VALUES('second-photo',?,'registered-owner','scope-second-photo','private/second-cup.png','image/png',100,'second-cup.png','second-fixture-digest','ready',1,1)").run(created.id);
  const attached=await saveProductWorkspace(f.db,{actorId:'registered-owner',requestId:'scope-second-cover',expectedRevision:String(created.revision),now:f.now+11},{...input,draftId:created.id,mediaIds:['second-photo']});
  const second=await submitProductIntake(f.db,{actorId:'registered-owner',requestId:'scope-second-submit',expectedRevision:String(attached.revision),now:f.now+12},{draftId:created.id,versionId:attached.versionId,intent:'review',note:''});
  const thirdInput={...structuredClone(input),draftId:null,mediaIds:[] as string[]};thirdInput.answers.nameEn='Fictional third cup';thirdInput.offers.offers[0].id='third-cup';thirdInput.offers.offers[0].sku='THIRD-CUP';thirdInput.offers.offers[0].mediaId='third-photo';
  const thirdDraft=await saveProductWorkspace(f.db,{actorId:'registered-owner',requestId:'scope-third-draft',expectedRevision:null,now:f.now+20},thirdInput);
  f.sqlite.prepare("INSERT INTO product_intake_media(id,draft_id,owner_id,request_id,object_key,mime_type,size_bytes,original_name,content_digest,state,created_at,completed_at) VALUES('third-photo',?,'registered-owner','scope-third-photo','private/third-cup.png','image/png',100,'third-cup.png','third-fixture-digest','ready',1,1)").run(thirdDraft.id);
  const thirdAttached=await saveProductWorkspace(f.db,{actorId:'registered-owner',requestId:'scope-third-cover',expectedRevision:String(thirdDraft.revision),now:f.now+21},{...thirdInput,draftId:thirdDraft.id,mediaIds:['third-photo']});
  const third=await submitProductIntake(f.db,{actorId:'registered-owner',requestId:'scope-third-submit',expectedRevision:String(thirdAttached.revision),now:f.now+22},{draftId:thirdDraft.id,versionId:thirdAttached.versionId,intent:'review',note:''});
  const storageInput={...structuredClone(input),draftId:null,mediaIds:[] as string[]};storageInput.answers.nameEn='Fictional quota cup';storageInput.offers.offers[0].id='quota-cup';storageInput.offers.offers[0].sku='QUOTA-CUP';storageInput.offers.offers[0].mediaId='quota-photo';
  const storageDraft=await saveProductWorkspace(f.db,{actorId:'registered-owner',requestId:'scope-quota-draft',expectedRevision:null,now:f.now+30},storageInput);
  f.sqlite.prepare("INSERT INTO product_intake_media(id,draft_id,owner_id,request_id,object_key,mime_type,size_bytes,original_name,content_digest,state,created_at,completed_at) VALUES('quota-photo',?,'registered-owner','scope-quota-photo','private/quota-cup.png','image/png',100,'quota-cup.png','quota-fixture-digest','ready',1,1)").run(storageDraft.id);
  const storageAttached=await saveProductWorkspace(f.db,{actorId:'registered-owner',requestId:'scope-quota-cover',expectedRevision:String(storageDraft.revision),now:f.now+31},{...storageInput,draftId:storageDraft.id,mediaIds:['quota-photo']});
  const storageSource=await submitProductIntake(f.db,{actorId:'registered-owner',requestId:'scope-quota-submit',expectedRevision:String(storageAttached.revision),now:f.now+32},{draftId:storageDraft.id,versionId:storageAttached.versionId,intent:'review',note:''});
  const api=await import('../app/api/admin/product-publications/route');
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ProductPublicationReview}from'./components/admin/product-publication-review';import{usePublicationCommand}from'./components/products/use-publication-command';import{ProductScopeBoundary}from'./components/products/product-scope-boundary';
window.__blockProductStorage=()=>{const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem');if(!descriptor||typeof descriptor.value!=='function')throw new Error('Actual browser storage method missing');const original=descriptor.value;window.__restoreProductStorage=()=>{Object.defineProperty(Storage.prototype,'setItem',descriptor);};Object.defineProperty(Storage.prototype,'setItem',{...descriptor,value:function(this:Storage,key:string,value:string){if(key.startsWith('fixture-publication:'))throw new DOMException('Fictional browser recovery quota failure','QuotaExceededError');Reflect.apply(original,this,[key,value]);}});};function PrivateParent({scope}){const[evidence,setEvidence]=useState('');return <><label>Outer private Product evidence<textarea value={evidence} onChange={event=>setEvidence(event.target.value)}/></label><ProductPublicationReview caseId={scope.caseId} initial={scope.initial}/></>};function App(){const[scope,setScope]=useState(window.__BOOT__),[draft,setDraft]=useState('');window.__switchProduct=(next)=>{setScope(next);setDraft('')};window.__productScopeRefreshes??=[];window.__completions??=[];const command=usePublicationCommand('/api/admin/product-publications','fixture-publication:'+scope.initial.actorId+':'+scope.caseId,async()=>{await fetch('/api/admin/product-publications?caseId='+encodeURIComponent(scope.caseId));window.__productScopeRefreshes.push(scope.caseId);setDraft('')},{kind:'publication_review',sourceId:scope.caseId,actorId:scope.initial.actorId});return <main data-fixture-scope={JSON.stringify([scope.initial.actorId,scope.caseId])} className='mx-auto max-w-5xl p-5'>{scope.mode==='component'?<ProductScopeBoundary workspace="staff" key={scope.initial.actorId+':'+scope.caseId} actorId={scope.initial.actorId}><PrivateParent scope={scope}/></ProductScopeBoundary>:<section><label>Owned private draft<textarea aria-label='Owned private draft' value={draft} onChange={event=>setDraft(event.target.value)}/></label><button disabled={command.blocked} onClick={()=>void command.run({action:'request_changes',caseId:scope.caseId,versionId:scope.initial.candidate.versionId,expectedCaseRevision:String(scope.initial.caseRevision),expectedRevision:String(scope.initial.revision),checks:null,reason:draft,requestId:crypto.randomUUID()},'Original Product action recorded.').then(()=>window.__completions.push(scope.caseId))}>Send original scoped action</button>{command.pending&&<button onClick={()=>void command.retry()}>Recover original Product action</button>}<p role='status'>{command.status}</p></section>}</main>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-boundaries',setup(b){stubFixtureLink(b);stubFixtureImage(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.__currentViewRefreshes=(window.__currentViewRefreshes??0)+1},push(){}}}'}));}}]})).outputFiles[0].text;
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/admin/product-publication-review.tsx';\n@source '../components/admin/product-legacy-stock-mapping.tsx';\n@source '../components/products';\n@source inline('mx-auto max-w-5xl p-5');"),{from:resolve('app/globals.css')})).css;
  await mkdir('.test-artifacts/t31',{recursive:true});
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const origin='https://product-scope.test',boot=async(caseId:string,mode='component',actor='reviewer')=>({caseId,mode,initial:await getProductPublicationReview(f.db,actor,caseId)});
   async function harness(caseId:string,mode:string,hold=false,lose=false,holdFailure=false){
    const initial=await boot(caseId,mode),context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors:string[]=[];let release=()=>{},committed=false,rejectNext=false,nullNext=false,malformedDenial=false,posts=0;const statuses:number[]=[];const gate=new Promise<void>(resolve=>release=resolve);page.on('pageerror',(error:Error)=>errors.push(error.message));
    await context.route(origin+'/**',async(route:FixtureRoute)=>{const request=route.request(),url=new URL(request.url());
     if(url.pathname==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:code});
     if(url.pathname==='/api/admin/product-publications'){
      if(request.method()==='POST')posts++;
      const headers=new Headers(request.headers());headers.set('origin',origin);headers.set('content-type','application/json');const native=new Request(request.url(),{method:request.method(),headers,...(request.method()==='POST'?{body:request.postData()!}:{})}),response=await(request.method()==='POST'?api.POST(native):api.GET(native)),body=await response.text();
      statuses.push(response.status);if(malformedDenial&&[401,403].includes(response.status))return route.fulfill({status:response.status,contentType:'text/html',body:'<p>Native denial response interrupted</p>'});if(request.method()==='POST'){committed=response.ok;if(hold&&(response.ok||holdFailure))await gate;if(rejectNext){rejectNext=false;return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'A later response cannot disprove the original saved outcome.'})});}if(nullNext&&response.ok){nullNext=false;return route.fulfill({status:200,contentType:'application/json',body:'null'});}if(lose&&response.ok)return route.abort('failed');}
      return route.fulfill({status:response.status,contentType:'application/json',body});
     }
     if(url.pathname==='/api/admin/product-command-outcomes'){const endpoint=await import('../app/api/admin/product-command-outcomes/route');const response=await endpoint.GET(new Request(request.url(),{headers:request.headers()}));statuses.push(response.status);if(malformedDenial&&[401,403].includes(response.status))return route.fulfill({status:response.status,contentType:'text/html',body:'<p>Native outcome denial interrupted</p>'});return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
     if(url.pathname.startsWith('/api/'))return route.fulfill({status:404,contentType:'application/json',body:'{}'});
     return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>window.__BOOT__='+JSON.stringify(initial).replaceAll('<','\\u003c')+'</script><script src="/bundle.js"></script>'});
    });
    await page.goto(origin+'/fixture');
    return{page,context,errors,release,rejectOriginalRetry:()=>{rejectNext=true;},malformOriginalReply:()=>{nullNext=true;},malformDenial:()=>{malformedDenial=true;},isCommitted:()=>committed,posts:()=>posts,statuses:()=>[...statuses]};
   }
   await t.test('a failed opaque recovery write cannot send a private Product command without its durable reference',async()=>{
    const h=await harness(storageSource.caseId,'hook');try{
     await h.page.getByLabel('Owned private draft').fill('PRIVATE-UNSENT storage failure reason');
     await h.page.evaluate(()=>window.__blockProductStorage());
     await h.page.getByRole('button',{name:'Send original scoped action'}).click();await h.page.waitForFunction((id:string)=>window.__completions.includes(id),storageSource.caseId);
     assert.equal(h.posts(),0,'Private native Product command was sent without saving its opaque recovery reference');assert.equal(h.isCommitted(),false);assert.equal(await h.page.getByLabel('Owned private draft').inputValue(),'PRIVATE-UNSENT storage failure reason');assert.equal(await h.page.evaluate(()=>sessionStorage.length),0);assert.deepEqual(h.errors,[]);
    }finally{await h.page.evaluate(()=>window.__restoreProductStorage());h.release();await h.context.close();}
   });
   await t.test('a current-session denial clears the actual private Product form and requests protected outer-view reauthorization',async()=>{
    const h=await harness(storageSource.caseId,'component');try{
     await h.page.getByLabel('Outer private Product evidence').fill('PRIVATE-OUTER-SOURCE evidence must disappear offline');await h.page.getByLabel('Review note').fill('PRIVATE-OLD-SESSION reviewer rationale');globalThis.productScopeActor='delegate';
     await h.page.getByRole('button',{name:'Ask for changes',exact:true}).click();await h.page.getByRole('heading',{name:'Product workspace access changed'}).waitFor();
     assert.equal(await h.page.getByLabel('Review note').count(),0);assert.equal(await h.page.getByLabel('Outer private Product evidence').count(),0,'Unavailable refresh left private parent evidence mounted');assert.equal(await h.page.evaluate(()=>window.__currentViewRefreshes),1,'The outer protected Product view was not reauthorized');assert.equal(h.isCommitted(),false);assert.equal(await h.page.evaluate(()=>sessionStorage.length),0,'A definite first denial retained an unsent marker');assert.deepEqual(h.errors,[]);
    }finally{globalThis.productScopeActor='reviewer';h.release();await h.context.close();}
   });
   await t.test('a malformed native403 body still hides current private parent content and retains its opaque uncertain reference',async()=>{
    const h=await harness(storageSource.caseId,'component');try{
     await h.page.getByLabel('Outer private Product evidence').fill('PRIVATE-HTML-DENIAL outer evidence');await h.page.getByLabel('Review note').fill('PRIVATE-HTML-DENIAL intended rationale');h.malformDenial();globalThis.productScopeActor='delegate';await h.page.getByRole('button',{name:'Ask for changes',exact:true}).click();await assertEventually(()=>h.statuses().includes(403));assert.equal(h.isCommitted(),false);
     await h.page.getByRole('heading',{name:'Product workspace access changed'}).waitFor({timeout:5000});assert.equal(await h.page.getByLabel('Outer private Product evidence').count(),0);assert.equal(await h.page.getByLabel('Review note').count(),0);const marker=await h.page.evaluate(()=>Object.values(sessionStorage));assert.equal(marker.length,1,'Malformed denial is not proof that the original action had no effects');assert.doesNotMatch(marker[0],/PRIVATE-HTML-DENIAL|reason|checks/);assert.equal(await h.page.evaluate(()=>window.__currentViewRefreshes),1);assert.deepEqual(h.errors,[]);
    }finally{globalThis.productScopeActor='reviewer';h.release();await h.context.close();}
   });
   await t.test('a malformed current-view native403 body immediately retires its private parent without creating an action',async()=>{
    const h=await harness(storageSource.caseId,'component');try{
     await h.page.getByLabel('Outer private Product evidence').fill('PRIVATE-READ-DENIAL evidence');h.malformDenial();globalThis.productScopeActor='delegate';await h.page.getByRole('button',{name:'Compare current recorded version',exact:true}).click();await assertEventually(()=>h.statuses().includes(403));await h.page.getByRole('heading',{name:'Product workspace access changed'}).waitFor({timeout:5000});assert.equal(await h.page.getByLabel('Outer private Product evidence').count(),0);assert.equal(h.posts(),0);assert.equal(await h.page.evaluate(()=>sessionStorage.length),0);assert.deepEqual(h.errors,[]);
    }finally{globalThis.productScopeActor='reviewer';h.release();await h.context.close();}
   });
   await t.test('a retired prewrite403 cannot curtain or refresh the new actor and source parent',async()=>{
    const h=await harness(storageSource.caseId,'component',true,false,true);try{
     await h.page.getByLabel('Review note').fill('PRIVATE-OLD delayed denied request');globalThis.productScopeActor='delegate';await h.page.getByRole('button',{name:'Ask for changes',exact:true}).click();await assertEventually(()=>h.statuses().includes(403));assert.equal(await h.page.evaluate(()=>sessionStorage.length),1);
     await h.page.evaluate((next:Awaited<ReturnType<typeof boot>>)=>window.__switchProduct(next),await boot(second.caseId,'component','delegate'));await h.page.getByLabel('Outer private Product evidence').fill('PRIVATE-NEW-OWNER evidence remains');h.release();await h.page.waitForFunction(()=>sessionStorage.length===0);
     assert.equal(await h.page.getByLabel('Outer private Product evidence').inputValue(),'PRIVATE-NEW-OWNER evidence remains');assert.equal(await h.page.getByRole('heading',{name:'Product workspace access changed'}).count(),0);assert.equal(await h.page.evaluate(()=>window.__currentViewRefreshes??0),0,'The retired denial refreshed the new protected source');assert.deepEqual(h.errors,[]);
    }finally{globalThis.productScopeActor='reviewer';h.release();await h.context.close();}
   });
   await t.test('actual publication form clears private entries and exact candidate on actor/source prop changes',async()=>{
    const h=await harness(f.sent.caseId,'component');try{
     const rationale=h.page.getByLabel('Review note');await rationale.fill('PRIVATE-OLD-ACTOR review reason');
     await h.page.getByLabel('The details and offers describe the same product.').check();
     const switchScope=async(scope:Awaited<ReturnType<typeof boot>>)=>{
      await h.page.evaluate((next:Awaited<ReturnType<typeof boot>>)=>window.__switchProduct(next),scope);
      await h.page.waitForFunction((identity:string)=>document.querySelector('main')?.getAttribute('data-fixture-scope')===identity,JSON.stringify([scope.initial.actorId,scope.caseId]));
     };
     await switchScope(await boot(second.caseId));
     assert.equal(await rationale.inputValue(),'','Private entry followed a different native product source');
     assert.equal(await h.page.getByLabel('The details and offers describe the same product.').isChecked(),false);
     assert.ok((await h.page.locator('main').textContent())?.includes('Fictional second cup'));
     await rationale.fill('PRIVATE-REVIEWER second-source reason');globalThis.productScopeActor='delegate';
     await switchScope(await boot(second.caseId,'component','delegate'));
     assert.equal(await rationale.inputValue(),'','Another actor inherited the prior private entry');assert.deepEqual(h.errors,[]);
     await h.page.setViewportSize({width:390,height:844});await h.page.screenshot({path:'.test-artifacts/t31/product-scoped-controls-mobile.png',fullPage:true});assert.equal(await h.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }finally{globalThis.productScopeActor='reviewer';h.release();await h.context.close();}
   });
   await t.test('a committed old POST response never refreshes or clears the new scope draft',async()=>{
    const h=await harness(f.sent.caseId,'hook',true);try{
     await h.page.getByLabel('Owned private draft').fill('PRIVATE-ORIGINAL intended correction reason');await h.page.getByRole('button',{name:'Send original scoped action'}).click();await assertEventually(h.isCommitted);
     await h.page.evaluate((next:Awaited<ReturnType<typeof boot>>)=>window.__switchProduct(next),await boot(second.caseId,'hook'));await h.page.getByLabel('Owned private draft').fill('NEW-SOURCE privately retained draft');h.release();await h.page.waitForFunction((id:string)=>window.__completions.includes(id),f.sent.caseId);
     assert.deepEqual(await h.page.evaluate(()=>window.__productScopeRefreshes),[],'The old request called the new source callback');assert.equal(await h.page.getByLabel('Owned private draft').inputValue(),'NEW-SOURCE privately retained draft');assert.deepEqual(h.errors,[]);
    }finally{h.release();await h.context.close();}
   });
   await t.test('uncertain Product action stores only opaque outcome identity and reload checks the native receipt',async()=>{
    const h=await harness(second.caseId,'hook',true,true);try{
     await h.page.getByLabel('Owned private draft').fill('PRIVATE-NATIVE-REASON must never enter browser storage');await h.page.getByRole('button',{name:'Send original scoped action'}).click();await assertEventually(h.isCommitted);
     const stored=await h.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map(key=>[key,sessionStorage.getItem(key)]))));assert.doesNotMatch(stored,/PRIVATE-NATIVE-REASON|reason|checks|expectedCaseRevision/,'Private command content entered browser storage');
     h.release();await h.page.getByRole('status').filter({hasText:/fetch|network|uncertain|retry/i}).waitFor();h.rejectOriginalRetry();await h.page.getByRole('button',{name:'Recover original Product action'}).click();await h.page.getByRole('status').filter({hasText:'A later response cannot disprove'}).waitFor();assert.equal(await h.page.getByRole('button',{name:'Recover original Product action'}).count(),1,'A later409 discarded the original uncertain request');assert.equal(await h.page.evaluate(()=>sessionStorage.length),1,'A later409 discarded opaque recovery metadata');await h.page.reload();await h.page.getByRole('button',{name:'Recover original Product action'}).click();await h.page.getByRole('status').filter({hasText:/recorded/i}).waitFor();
     assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE actor_id='reviewer' AND action='product.publication.request_changes' AND subject_id=?").get((await boot(second.caseId)).initial.productId)!.n,1);assert.deepEqual(h.errors,[]);
    }finally{h.release();await h.context.close();}
   });
   await t.test('a null200 after an actual native commit cannot claim recorded or clear the private original input',async()=>{
    const h=await harness(third.caseId,'hook');try{
     h.malformOriginalReply();await h.page.getByLabel('Owned private draft').fill('PRIVATE-THIRD original malformed reply');await h.page.getByRole('button',{name:'Send original scoped action'}).click();await assertEventually(h.isCommitted);
     await h.page.waitForFunction((id:string)=>window.__completions.includes(id),third.caseId);assert.equal(await h.page.getByRole('button',{name:'Recover original Product action'}).count(),1,'A malformed200 discarded original recovery');assert.equal(await h.page.getByLabel('Owned private draft').inputValue(),'PRIVATE-THIRD original malformed reply');assert.deepEqual(await h.page.evaluate(()=>window.__productScopeRefreshes),[],'Malformed200 was treated as native confirmation');
     await h.page.reload();await h.page.getByRole('button',{name:'Recover original Product action'}).click();await h.page.getByRole('status').filter({hasText:/recorded/i}).waitFor();assert.deepEqual(h.errors,[]);
    }finally{h.release();await h.context.close();}
   });
   await t.test('malformed readonly denial after an actual lost commit keeps its original opaque reference and hides private parent',async()=>{
    const h=await harness(storageSource.caseId,'component',false,true);try{
     await h.page.getByLabel('Outer private Product evidence').fill('PRIVATE-GET-DENIAL evidence');await h.page.getByLabel('Review note').fill('PRIVATE-GET-DENIAL original native correction');await h.page.getByRole('button',{name:'Ask for changes',exact:true}).click();await assertEventually(h.isCommitted);await h.page.getByRole('button',{name:'Check original saved outcome',exact:true}).waitFor();const before=h.posts(),marker=await h.page.evaluate(()=>Object.values(sessionStorage));assert.equal(marker.length,1);h.malformDenial();globalThis.productScopeActor='delegate';await h.page.getByRole('button',{name:'Check original saved outcome',exact:true}).click();await assertEventually(()=>h.statuses().includes(403));await h.page.getByRole('heading',{name:'Product workspace access changed'}).waitFor({timeout:5000});assert.equal(h.posts(),before,'Readonly outcome denial resubmitted the action');assert.deepEqual(await h.page.evaluate(()=>Object.values(sessionStorage)),marker,'Denied outcome lookup cleared an actually committed original reference');assert.equal(await h.page.getByLabel('Outer private Product evidence').count(),0);assert.doesNotMatch(marker[0],/PRIVATE-GET-DENIAL|reason|checks/);assert.deepEqual(h.errors,[]);
    }finally{globalThis.productScopeActor='reviewer';h.release();await h.context.close();}
   });
  }finally{await browser.close();}
 }finally{f.dispose();}
});
async function assertEventually(check:()=>boolean){for(let count=0;count<100&&!check();count++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(check(),true,'Actual native action did not commit');}
