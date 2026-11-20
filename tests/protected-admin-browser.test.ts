import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {protectedTarget,state} from './helpers/protected-admin-fixture';
import {sessionAttemptKey} from '../lib/forms/client-attempt';
import {stubFixtureLink} from './helpers/browser-fixture-link';
import type {Route,Response as BrowserResponse} from 'playwright-core';
const origin='http://localhost:3018';
declare global{interface Window{refreshProtectedFixture:()=>Promise<void>;restoreProtectedStorage?:()=>void;__protectedRefreshes:number;}}
for(const scenario of ['empty_scopes','missing_bank_confirmation','first_native_validation','unknown_native_validation'] as const)void test('actual protected disposition validation recovery: '+scenario,{timeout:90_000},async()=>{
 const f=await protectedTarget('disposition');
 const {withdrawProtectedChange}=await import('../lib/sellers/protected-change-disposition');
 await withdrawProtectedChange(f.db,{caseId:f.caseId,actorId:'maker-user',expectedVersion:0,reason:'Withdraw this fictional correction before separate readiness review.',requestId:crypto.randomUUID(),now:Date.now()});
 const props={actorId:'reviewer',caseId:f.caseId,version:1,identityRevision:f.body.identityRevision,bankRevision:f.body.bankRevision,kind:'identity',status:'withdrawn',hasProposal:false,capabilities:['new_orders','payouts'],packets:[]};
 const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{ProtectedChangeDisposition}from'./components/admin/protected-change-disposition';createRoot(document.getElementById('root')).render(<ProtectedChangeDisposition {...window.__BOOT__}/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){}}}'}));}}]})).outputFiles[0].text;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),posts:{status:number;wire:string}[]=[],errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));
  await page.route(origin+'/**',async(route:Route)=>{const request=route.request(),url=new URL(request.url());
   if(url.pathname==='/disposition-validation')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(props)+'</script><script src="/validation.js"></script></body></html>'});
   if(url.pathname==='/validation.js')return route.fulfill({contentType:'application/javascript',body:code});
   if(url.pathname===f.path){
    const native=request.method()==='POST'?await f.api.POST(new Request(request.url(),{method:'POST',headers:{...request.headers(),origin},body:request.postData()}),f.context):await f.api.GET(new Request(request.url(),{headers:request.headers()}),f.context);
    if(request.method()==='POST')posts.push({status:native.status,wire:request.postData()??''});
    if(scenario==='unknown_native_validation'&&request.method()==='POST'&&posts.length===1)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional lost response: original outcome unknown"}'});
    return route.fulfill({status:native.status,contentType:'application/json',body:await native.text()});}
   return route.fulfill({status:404,body:'Isolated route unavailable'});
  });
  await page.goto(origin+'/disposition-validation');const form=page.locator('form'),note=form.locator('[name="reason"]');
  await form.locator('select').first().selectOption(scenario==='empty_scopes'?'retain_holds':'release_holds');
  if(scenario==='missing_bank_confirmation'){await form.locator('[name="capability"][value="payouts"]').check();await form.locator('[name="valid"]').check();}
  if(scenario==='first_native_validation'||scenario==='unknown_native_validation'){await form.locator('[name="capability"][value="new_orders"]').check();await form.locator('[name="valid"]').check();}
  await form.locator('[name="reference"]').fill('PRIVATE-FICTIONAL-REFERENCE');await note.fill('PRIVATE retained explanation of the current evidence.');
  const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
  await form.locator('button[type="submit"]').click();await page.locator('output').waitFor();
  if(scenario==='first_native_validation'||scenario==='unknown_native_validation'){
   assert.equal(posts.length,1);assert.equal(posts[0].status,400);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
   const original=JSON.parse(posts[0].wire) as {commandId:string},key=sessionAttemptKey('staff.protected.disposition',JSON.stringify(['reviewer',f.caseId]));
   if(scenario==='unknown_native_validation'){
    const response=page.waitForResponse((r:BrowserResponse)=>new URL(r.url()).pathname===f.path&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Retry exact original decision',exact:true}).click();const rejected=await response;assert.equal(rejected.status(),400);assert.equal((await rejected.json()).phase,'before_write');assert.equal(posts[1].wire,posts[0].wire);
    await page.getByRole('button',{name:'Check original saved outcome',exact:true}).click();await page.getByText('The original decision is not confirmed.',{exact:false}).waitFor();
    assert.equal(await page.evaluate((k:string)=>sessionStorage.getItem(k),key),original.commandId);assert.equal(await note.isEnabled(),false);assert.equal(await note.inputValue(),'PRIVATE retained explanation of the current evidence.');assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);assert.deepEqual(errors,[]);return;
   }
   await page.waitForFunction((k:string)=>sessionStorage.getItem(k)===null,key);assert.match(await page.locator('output').innerText(),/account ownership/i);
   await page.getByRole('button',{name:'Use reviewed current evidence',exact:true}).click();assert.equal(await note.isEnabled(),true);assert.equal(await note.inputValue(),'PRIVATE retained explanation of the current evidence.');
   await form.locator('select').first().selectOption('retain_holds');await form.locator('[name="capability"][value="new_orders"]').check();await form.locator('button[type="submit"]').click();await page.getByText('The original decision is recorded.',{exact:false}).waitFor();
   assert.equal(posts.length,2);assert.equal(posts[1].status,200);assert.notEqual((JSON.parse(posts[1].wire) as {commandId:string}).commandId,original.commandId);assert.deepEqual(await page.evaluate(()=>Object.entries(sessionStorage)),[]);assert.deepEqual(errors,[]);return;
  }
  assert.equal(posts.length,0,'Invalid fields must be correctable before a request reference or native call exists.');assert.equal(await note.isEnabled(),true);assert.equal(await note.inputValue(),'PRIVATE retained explanation of the current evidence.');assert.deepEqual(await page.evaluate(()=>Object.entries(sessionStorage)),[]);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);
  assert.match(await page.locator('output').innerText(),scenario==='empty_scopes'?/hold scope/i:/bank.*ownership|account ownership/i);
  // Correct the missing scope, or choose retention while bank ownership remains unconfirmed.
  if(scenario==='empty_scopes')await form.locator('[name="capability"][value="payouts"]').check();else await form.locator('select').first().selectOption('retain_holds');
  await form.locator('button[type="submit"]').click();await page.getByText('The original decision is recorded.',{exact:false}).waitFor();
  assert.equal(posts.length,1);assert.equal(posts[0].status,200);assert.deepEqual(await page.evaluate(()=>Object.entries(sessionStorage)),[]);assert.deepEqual(errors,[]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_capability_holds WHERE case_id=? AND released_at IS NULL').get(f.caseId)!.n,2);
 }finally{await browser.close();f.dispose();state.db=null;}
});
for(const kind of ['permission','verify-identity','disposition','bank-details'] as const)for(const scenario of ['actor','recovery','first-conflict','unknown-conflict','late'] as const){
 if(['first-conflict','unknown-conflict','late'].includes(scenario)&&kind!=='permission')continue;
 void test(`actual protected ${kind} UI ${scenario}`,{timeout:90_000},async()=>{
  const f=await protectedTarget(kind);let displayActor='reviewer',canDecide=true,version=f.body.version??0;
  const boot=()=>({actorId:displayActor,caseId:f.caseId,sellerId:'maker',version,identityRevision:f.body.identityRevision??0,bankRevision:f.body.bankRevision??0,revision:f.body.revision??'fixture-bank',kind:'identity',status:'open',hasProposal:true,capabilities:['new_orders','payouts'],packets:[],canDecide});
  const components={permission:'ProtectedChangePermissionForm','verify-identity':'ProtectedIdentityReview',disposition:'ProtectedChangeDisposition','bank-details':'SellerBankReview'};
  const files={permission:'protected-change-permission-form','verify-identity':'protected-identity-review',disposition:'protected-change-disposition','bank-details':'seller-bank-review'};
  const component=components[kind];
  const bundle=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{${component}}from'./components/admin/${files[kind]}';import{StaffReviewAccessBoundary}from'./components/admin/staff-review-access-boundary';const root=createRoot(document.getElementById('root'));const render=p=>root.render(<StaffReviewAccessBoundary actorId={p.actorId} sourceId={p.caseId}><p>PRIVATE BANK IDENTITY PARENT</p><input aria-label="Private sibling note" defaultValue="PRIVATE UNSENT SIBLING"/><${component} {...p}/></StaffReviewAccessBoundary>);window.refreshProtectedFixture=async()=>render(await(await fetch('/props')).json());render(window.__BOOT__);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.__protectedRefreshes=(window.__protectedRefreshes||0)+1}}}'}));}}]})).outputFiles[0].text;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const posts:{wire:string;status:number;actor:string|undefined}[]=[],reads:number[]=[],transport:number[]=[],errors:string[]=[];
  let release=()=>{},started=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;}),held=new Promise<void>(resolve=>{started=resolve;});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',(error:Error)=>errors.push(error.message));
   await page.route(origin+'/**',async(route:Route)=>{const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/fixture.js')return route.fulfill({contentType:'application/javascript',body:bundle});
    if(url.pathname==='/props')return route.fulfill({contentType:'application/json',body:JSON.stringify(boot())});
    if(url.pathname==='/admin/protected-fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(boot()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    if(url.pathname===f.path){
     const native=request.method()==='POST'?await f.api.POST(new Request(request.url(),{method:'POST',headers:{...request.headers(),origin},body:request.postData()}),f.context):await (f.api as unknown as {GET:(r:Request,c:typeof f.context)=>Promise<Response>}).GET(new Request(request.url(),{headers:request.headers()}),f.context);
     if(request.method()==='POST')posts.push({wire:request.postData()??'',status:native.status,actor:request.headers()['x-hastabazaar-actor']});else reads.push(native.status);
     if(scenario==='late'&&request.method()==='POST'){started();await gate;}
     const override=request.method()==='POST'?transport.shift():undefined;
     if(override!==undefined)return route.fulfill({status:override,contentType:'application/json',body:override===200?'{}':'{"error":"Fictional transport outcome unknown"}'});
     if(native.status===403&&(kind==='permission'||kind==='bank-details'))return route.fulfill({status:403,contentType:'text/html',body:'<p>Body unavailable</p>'});
     return route.fulfill({status:native.status,contentType:'application/json',body:await native.text()});
    }
    return route.fulfill({status:404,body:'Isolated fixture route unavailable'});
   });
   await page.goto(origin+'/admin/protected-fixture');
   const form=page.locator('form');
   if(kind==='permission')await form.locator('select[name="decision"]').selectOption('permit');
   if(kind==='disposition'){await form.locator('select').first().selectOption('retain_holds');await form.locator('input[name="capability"]').first().check();}
   if(kind==='bank-details'){await form.locator('select[name="ownershipBasis"]').selectOption('same_person');await form.locator('select[name="holdDisposition"]').selectOption('keep');await form.locator('input[type="checkbox"]').check();}
   if(kind==='verify-identity')await form.locator('input[type="checkbox"]').check();
   if(kind!=='permission')await form.locator('input[name="reference"]').fill('PRIVATE-ORIGINAL-REFERENCE');
   await form.locator('[name="reason"]').fill('PRIVATE original reviewer inspected the exact fictional evidence.');
   const submit=()=>form.locator('button[type="submit"]').click();
   const waitPost=()=>page.waitForResponse((r:BrowserResponse)=>new URL(r.url()).pathname===f.path&&r.request().method()==='POST');
   const before=Number(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL').get()!.n);
   if(scenario==='actor'){
    state.actor='foreign';const response=waitPost();await submit();await response;
    assert.equal(posts[0].status,403,'Displayed reviewer identity must reject signed-in replacement before commit.');assert.equal(posts[0].actor,'reviewer');
    await page.getByRole('alert').waitFor();assert.equal(await page.getByText('PRIVATE BANK IDENTITY PARENT',{exact:true}).count(),0);assert.equal(await page.getByLabel('Private sibling note').count(),0);
    assert.equal(Number(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL').get()!.n),before);
   }else if(scenario==='recovery'){
    await page.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem')!;const original=descriptor.value as (this:Storage,key:string,value:string)=>void;Storage.prototype.setItem=function(key,value){if(key.includes('staff.protected.'))throw Error('Fictional storage unavailable');original.call(this,key,value);};window.restoreProtectedStorage=()=>Object.defineProperty(Storage.prototype,'setItem',descriptor);});
    await submit();await page.getByText('Fictional storage unavailable',{exact:true}).waitFor();assert.equal(posts.length,0);await page.evaluate(()=>window.restoreProtectedStorage?.());
    transport.push(503,409,200);let response=waitPost();await submit();await response;
    for(let i=0;i<2;i++){response=waitPost();await page.getByRole('button',{name:'Retry exact original decision',exact:true}).click();await response;}
    assert.ok(posts.every(post=>post.status===200&&post.actor==='reviewer'&&post.wire===posts[0].wire));assert.equal(posts.length,3);
    assert.equal(Number(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL').get()!.n),before+1);
    const command=JSON.parse(posts[0].wire) as {commandId:string},key=sessionAttemptKey('staff.protected.'+kind,JSON.stringify(['reviewer',f.sourceId]));
    const stored=await page.evaluate(()=>Object.entries(sessionStorage));assert.deepEqual(stored,[[key,command.commandId]]);assert.doesNotMatch(JSON.stringify(stored),/PRIVATE/);
    canDecide=false;await page.reload();assert.equal(await page.locator('form').count(),0);assert.equal(await page.getByRole('button',{name:'Retry exact original decision'}).count(),0);
    await page.getByRole('button',{name:'Check original saved outcome',exact:true}).click();await page.getByText('The original decision is recorded.',{exact:false}).waitFor();assert.equal(reads.at(-1),200);assert.equal(posts.length,3);
    assert.equal(await page.evaluate((k:string)=>sessionStorage.getItem(k),key),null);
   }else if(scenario==='late'){
    const response=waitPost();await submit();await held;displayActor='foreign';state.actor='foreign';version=1;await page.evaluate(()=>window.refreshProtectedFixture());
    const note=page.locator('form [name="reason"]');await note.waitFor();assert.equal(await note.inputValue(),'');await note.fill('PRIVATE note from the new displayed reviewer.');
    release();await(await response).finished();await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>done())));
    assert.equal(await note.inputValue(),'PRIVATE note from the new displayed reviewer.');assert.equal(await page.evaluate(()=>window.__protectedRefreshes??0),0);
    const original=JSON.parse(posts[0].wire) as {commandId:string},key=sessionAttemptKey('staff.protected.'+kind,JSON.stringify(['reviewer',f.sourceId]));assert.equal(await page.evaluate((k:string)=>sessionStorage.getItem(k),key),original.commandId);
   }else{
    if(scenario==='unknown-conflict'){f.setBeforeBatch(()=>{throw Error('Fictional uncertain write acknowledgement');});const first=waitPost();await submit();await first;assert.equal(posts[0].status,503);}
    const {reviewProtectedChangePermission}=await import('../lib/sellers/protected-change-requests');
    await reviewProtectedChangePermission(f.db,{caseId:f.caseId,actorId:'foreign',expectedVersion:0,expectedIdentityRevision:f.body.identityRevision as number,expectedBankRevision:f.body.bankRevision as number,decision:'clarify',reason:'Another eligible reviewer requests clarification of this scope.',requestId:crypto.randomUUID(),now:f.now+20});
    const response=waitPost();if(scenario==='first-conflict')await submit();else await page.getByRole('button',{name:'Retry exact original decision',exact:true}).click();
    const conflict=await(await response).json() as {phase:string;requestId:string};assert.equal(conflict.phase,'before_write');
    const key=sessionAttemptKey('staff.protected.'+kind,JSON.stringify(['reviewer',f.sourceId]));
    assert.equal(await form.locator('[name="reason"]').inputValue(),'PRIVATE original reviewer inspected the exact fictional evidence.');
    if(scenario==='first-conflict'){
     await page.waitForFunction((k:string)=>sessionStorage.getItem(k)===null,key);version=1;await page.evaluate(()=>window.refreshProtectedFixture());
     await page.getByRole('button',{name:'Use reviewed current evidence',exact:true}).click();
     assert.equal(await form.locator('[name="reason"]').inputValue(),'PRIVATE original reviewer inspected the exact fictional evidence.');
    }else{
     await page.getByRole('button',{name:'Check original saved outcome',exact:true}).click();await page.getByText('The original decision is not confirmed.',{exact:false}).waitFor();assert.equal(reads.at(-1),404);assert.equal(await page.evaluate((k:string)=>sessionStorage.getItem(k),key),conflict.requestId);
    }
   }
   assert.deepEqual(errors,[]);
  }finally{release();await browser.close();f.dispose();state.db=null;}
 });
}
void test('actual protected full parent curtains bank identity history and sibling controls on native HTML denial',{timeout:90_000},async()=>{
 const f=await protectedTarget('bank-details');try{
  const {protectedChangeWorkspace}=await import('../lib/sellers/protected-change-workspace'),workspace=await protectedChangeWorkspace(f.db,f.caseId,'reviewer','staff');
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{ProtectedChangeReviewWorkspace}from'./components/admin/protected-change-review-workspace';createRoot(document.getElementById('root')).render(<ProtectedChangeReviewWorkspace workspace={window.__BOOT__} actorId="reviewer"/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){}}}'}));}}]})).outputFiles[0].text;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844}});let status=0;
   await page.route(origin+'/**',async(route:Route)=>{const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/full-parent')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(workspace).replaceAll('<','\\u003c')+'</script><script src="/parent.js"></script></body></html>'});
    if(url.pathname==='/parent.js')return route.fulfill({contentType:'application/javascript',body:code});
    if(url.pathname===f.path){const native=await f.api.POST(new Request(request.url(),{method:'POST',headers:{...request.headers(),origin},body:request.postData()}),f.context);status=native.status;return route.fulfill({status,contentType:'text/html',body:'<p>Private response body unavailable</p>'});}
    return route.fulfill({status:404,body:'Fixture route unavailable'});
   });
   await page.goto(origin+'/full-parent');assert.equal(await page.getByText('123456789',{exact:true}).count(),1);assert.ok(await page.locator('a[href*="/api/admin/seller-documents/"]').count()>0);
   const permission=page.locator('[data-protected-action="permission"]');await permission.locator('[name="reason"]').fill('PRIVATE sibling reason which must disappear with the bank review.');
   const bank=page.locator('[data-protected-action="bank-details"]');await bank.locator('[name="ownershipBasis"]').selectOption('same_person');await bank.locator('input[type="checkbox"]').check();await bank.locator('[name="reference"]').fill('PRIVATE-BANK-REVIEW');await bank.locator('[name="reason"]').fill('The actual fictional bank evidence was inspected.');await bank.locator('[name="holdDisposition"]').selectOption('keep');
   state.actor='foreign';await bank.locator('button[type="submit"]').click();await page.getByRole('alert').waitFor();assert.equal(status,403);
   assert.equal(await page.getByText('123456789',{exact:true}).count(),0);assert.equal(await page.locator('form').count(),0);assert.equal(await page.locator('a[href*="/api/admin/seller-documents/"]').count(),0);assert.equal(await page.getByText('Private beneficiary comparison',{exact:true}).count(),0);
  }finally{await browser.close();}
 }finally{f.dispose();state.db=null;}
});
