import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {readPreparationWorkspace} from '../lib/orders/response-workspace';
import {reportPreparationIssue,recordPreparationFollowup} from '../lib/orders/response-cases';
import {handlePreparationCommand} from '../lib/orders/response-http';

const origin='http://localhost:3018';
async function scene(run:(s:Awaited<ReturnType<typeof mount>>)=>Promise<void>){const s=await mount();try{await run(s);}finally{await s.close();}}
async function mount(){
 const f=await actionableOrderFixture();let browser:Awaited<ReturnType<(typeof import('playwright'))['chromium']['launch']>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const item=f.rows[0],reported=await reportPreparationIssue(f.db,{actorId:'registered-owner',requestId:crypto.randomUUID(),expectedRevision:null,now:f.releasedAt},{portionId:String(item.portionId),itemIds:[String(item.id)],kind:'delay',detail:'PRIVATE fictional supplier detail is only for the current preparation team.',proposedReadyAt:null});
  const workspace=await readPreparationWorkspace(f.db,'reviewer',f.orderId,'staff');assert.ok(workspace);
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{OrderPreparationWorkspace}from'./components/commerce/order-preparation-workspace';import{StaffReviewAccessBoundary}from'./components/admin/staff-review-access-boundary';function App(){const[w,setW]=useState(${JSON.stringify(workspace)});useEffect(()=>{const change=e=>setW(e.detail);window.addEventListener('fixture-view',change);return()=>window.removeEventListener('fixture-view',change)},[]);return <StaffReviewAccessBoundary actorId={w.actorId} sourceId={w.orderId}><aside>PRIVATE preparation sibling</aside><OrderPreparationWorkspace workspace={w}/></StaffReviewAccessBoundary>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(b){b.onResolve({filter:/^next\/(navigation|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('link')?"import React from'react';export default function Link({children,...p}){return React.createElement('a',p,children)}":"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refreshed'))}}}",loader:'js'}));}}]})).outputFiles[0].text;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  assert.ok(browser);
  const context=await browser.newContext({timezoneId:'UTC'}),page=await context.newPage();page.setDefaultTimeout(3500);
  const control={mode:'normal',bodies:[] as string[],actor:'reviewer',release:null as null|(()=>void),postCount:0};
  await context.addInitScript(()=>{window.addEventListener('fixture-refreshed',()=>{void(async()=>{const response=await fetch('/workspace');if(response.ok)window.dispatchEvent(new CustomEvent('fixture-view',{detail:await response.json()}));})();});});
  await context.route('**/*',async route=>{
   const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/preparation')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script src="/fixture.js"></script></body></html>'});
   if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:code});
   if(url.pathname==='/workspace'){try{const current=await readPreparationWorkspace(f.db,control.mode==='html-denial'?'registered-owner':control.actor,f.orderId,'staff');return route.fulfill({status:current?200:403,contentType:'application/json',body:JSON.stringify(current??{error:'Current workspace is not available.'})});}catch{return route.fulfill({status:403,contentType:'application/json',body:'{"error":"Current preparation access changed."}'});}}
   if(url.pathname!=='/api/admin/order-responses')return route.abort();
   const wire=incoming.postData();if(incoming.method()==='POST'){control.bodies.push(wire!);control.postCount++;if(control.mode==='uncommitted')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional unresolved transport"}'});}
   const response=await handlePreparationCommand(new Request(url,{method:incoming.method(),headers:{...incoming.headers(),origin,'content-type':'application/json'},...(wire?{body:wire}:{})}),f.db,control.mode==='html-denial'?'registered-owner':control.actor,'staff');
   if(control.mode==='html-denial'){assert.equal(response.status,403);return route.fulfill({status:403,contentType:'text/html',body:'<!doctype html><h1>Access denied</h1>'});}
   if(incoming.method()==='POST'&&control.mode==='wire'){
    assert.equal(response.status,200,await response.clone().text());
    if(control.postCount===1)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional lost original acknowledgement"}'});
    if(control.postCount===2)return route.fulfill({status:409,contentType:'application/json',body:'{"error":"Fictional later conflict"}'});
    return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"result":{"id":"another-source","revision":1}}'});
   }
   if(incoming.method()==='POST'&&control.mode==='late')await new Promise<void>(resolve=>{control.release=resolve;});
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  await page.goto(origin+'/preparation');await page.getByLabel('Private follow-up note',{exact:true}).waitFor();
  async function fill(note='PRIVATE retained preparation follow-up note.'){
   await page.getByRole('combobox',{name:/^Owner/}).selectOption('reviewer');await page.getByLabel('Private follow-up note',{exact:true}).fill(note);
   await page.getByRole('combobox',{name:/^Backup/}).selectOption('');
   await page.getByLabel('Customer-facing factual update',{exact:true}).fill('The preparation team is reviewing the recorded supplier issue.');
   await page.getByLabel('Next update within 24 hours',{exact:false}).fill(new Date(f.releasedAt+3600000).toISOString().slice(0,16));
  }
  return{f,page,control,workspace,reported,fill,async close(){control.release?.();await context.close();await browser?.close();f.dispose();}};
 }catch(error){await browser?.close();f.dispose();throw error;}
}

void test('mounted preparation HTML403 curtains its private parent before response parsing',async()=>scene(async s=>{
 await s.fill();s.control.mode='html-denial';await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).click();
 await s.page.getByRole('heading',{name:'Review access changed',exact:true}).waitFor();
 assert.doesNotMatch(await s.page.locator('body').innerText(),/PRIVATE fictional|PRIVATE preparation sibling|PRIVATE retained/);
 assert.equal(s.f.sqlite.prepare('SELECT revision FROM order_response_cases WHERE id=?').get(s.reported.id)!.revision,0);
}));

void test('mounted preparation GET absence retains unknown reference and refuses a new action',async()=>scene(async s=>{
 await s.fill();s.control.mode='uncommitted';await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).click();await s.page.getByText('Fictional unresolved transport',{exact:true}).waitFor();
 const before=await s.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))));assert.doesNotMatch(before,/PRIVATE|privateNote|input|expectedRevision/);
 await s.page.getByRole('button',{name:'Check saved outcome',exact:true}).click();await s.page.getByText('No recorded outcome was found',{exact:false}).waitFor();
 assert.equal(await s.page.getByRole('button',{name:'Start a new action after review',exact:true}).count(),0,'GET absence cannot authorize deletion of an unknown request.');
 assert.equal(await s.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(sessionStorage)))),before);
 assert.equal(s.control.bodies.length,1);
}));

void test('mounted preparation preserves three exact uncertain wires and uses GET-only reload proof',async()=>scene(async s=>{
 await s.fill();s.control.mode='wire';await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).click();await s.page.getByText('Fictional lost original acknowledgement',{exact:true}).waitFor();
 await s.page.getByRole('button',{name:'Retry unchanged action',exact:true}).click();await s.page.getByText('Fictional later conflict',{exact:true}).waitFor();
 await s.page.getByRole('button',{name:'Retry unchanged action',exact:true}).click();
 await s.page.getByRole('button',{name:'Check saved outcome',exact:true}).waitFor();
 assert.equal(s.control.bodies.length,3);assert.equal(new Set(s.control.bodies).size,1);
 const stored=await s.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))));assert.doesNotMatch(stored,/PRIVATE|privateNote|input|expectedRevision/);assert.notEqual(stored,'{}');
 s.control.mode='normal';await s.page.reload();await s.page.getByRole('button',{name:'Check saved outcome',exact:true}).click();await s.page.getByText('Saved. The current order and case history have been refreshed.',{exact:true}).waitFor();assert.equal(s.control.bodies.length,3);
 assert.equal(s.f.sqlite.prepare('SELECT revision FROM order_response_cases WHERE id=?').get(s.reported.id)!.revision,1);
 await mkdir('.test-artifacts/t31',{recursive:true});await s.page.screenshot({path:'.test-artifacts/t31/order-preparation-recovery.png',fullPage:true});
}));

void test('mounted preparation requires explicit revision review and fences a retired actor acknowledgement',async()=>scene(async s=>{
 await s.fill('PRIVATE retained note before another current source revision.');
 await recordPreparationFollowup(s.f.db,{actorId:'reviewer',requestId:crypto.randomUUID(),expectedRevision:'0',now:Date.now()},{caseId:s.reported.id,ownerId:'reviewer',backupId:null,state:'waiting',nextUpdateAt:Date.now()+3600000,privateNote:'Another lawful current follow-up changed the original case revision.',customerMessage:'Current preparation review will provide its next factual update.'});
 const changed=await readPreparationWorkspace(s.f.db,'reviewer',s.f.orderId,'staff');assert.ok(changed);await s.page.evaluate(w=>window.dispatchEvent(new CustomEvent('fixture-view',{detail:w})),changed);
 await s.page.getByRole('button',{name:'Review current case and keep my note',exact:true}).waitFor();assert.equal(await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).isDisabled(),true);
 assert.equal(await s.page.getByLabel('Private follow-up note',{exact:true}).inputValue(),'PRIVATE retained note before another current source revision.');
 await s.page.getByRole('button',{name:'Review current case and keep my note',exact:true}).click();s.control.mode='late';await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).click();
 await s.page.waitForFunction(()=>Object.keys(sessionStorage).some(k=>k.startsWith('preparation:')));const deadline=Date.now()+5000;while(!s.control.release&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(s.control.release,'The actual original commit must reach its held response.');
 const oldKey='preparation:'+JSON.stringify(['staff','reviewer',s.f.orderId]),originalReference=await s.page.evaluate(k=>sessionStorage.getItem(k),oldKey);assert.ok(originalReference);
 s.f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('preparation-other','preparation-other','preparation-other@local.hastabazaar.test','Fictional second reviewer','active',1,1)").run();s.f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('preparation-other','super_admin',1)").run();
 const other=await readPreparationWorkspace(s.f.db,'preparation-other',s.f.orderId,'staff');assert.ok(other);s.control.actor='preparation-other';await s.page.evaluate(w=>window.dispatchEvent(new CustomEvent('fixture-view',{detail:w})),other);await s.page.getByLabel('Private follow-up note',{exact:true}).fill('PRIVATE new actor note must survive the retired response.');
 s.control.release();await s.page.waitForTimeout(100);
 assert.equal(await s.page.getByLabel('Private follow-up note',{exact:true}).inputValue(),'PRIVATE new actor note must survive the retired response.');
 assert.equal(await s.page.evaluate(k=>sessionStorage.getItem(k),oldKey),originalReference,'A retired acknowledgement cannot erase the original actor reference.');
 assert.equal(await s.page.getByText('Saved. The current order and case history have been refreshed.',{exact:true}).count(),0);
}));

void test('mounted preparation refuses a write when its opaque recovery reference cannot persist',async()=>scene(async s=>{
 await s.fill();await s.page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Fictional browser quota','QuotaExceededError');};});
 await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).click();
 await s.page.getByText('No action was sent',{exact:false}).waitFor();assert.equal(s.control.bodies.length,0);
 assert.equal(s.f.sqlite.prepare('SELECT revision FROM order_response_cases WHERE id=?').get(s.reported.id)!.revision,0);
 assert.equal(await s.page.getByLabel('Private follow-up note',{exact:true}).inputValue(),'PRIVATE retained preparation follow-up note.');
}));

void test('mounted first before-write source conflict permits only explicit current review with the note retained',async()=>scene(async s=>{
 await s.fill('PRIVATE note survives an actual first source conflict.');
 await recordPreparationFollowup(s.f.db,{actorId:'reviewer',requestId:crypto.randomUUID(),expectedRevision:'0',now:s.f.releasedAt},{caseId:s.reported.id,ownerId:'reviewer',backupId:null,state:'waiting',nextUpdateAt:s.f.releasedAt+3600000,privateNote:'Another lawful reviewer changed this source before the old tab submitted.',customerMessage:'The actual preparation team has a current accountable follow-up.'});
 await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).click();
 await s.page.getByRole('button',{name:'Review current preparation and keep my note',exact:true}).click();
 await s.page.getByRole('button',{name:'Review current case and keep my note',exact:true}).click();
 assert.equal(await s.page.getByLabel('Private follow-up note',{exact:true}).inputValue(),'PRIVATE note survives an actual first source conflict.');
 await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).click();await s.page.getByText('Saved. The current order and case history have been refreshed.',{exact:true}).waitFor();
 assert.equal(s.control.bodies.length,2);assert.notEqual((JSON.parse(s.control.bodies[0]) as {requestId:string}).requestId,(JSON.parse(s.control.bodies[1]) as {requestId:string}).requestId);
 assert.equal(s.f.sqlite.prepare('SELECT revision FROM order_response_cases WHERE id=?').get(s.reported.id)!.revision,2);
}));

void test('mounted later before-write conflict and GET absence never erase an earlier unknown preparation',async()=>scene(async s=>{
 await s.fill();s.control.mode='uncommitted';await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).click();await s.page.getByText('Fictional unresolved transport',{exact:true}).waitFor();
 const before=await s.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))));
 await recordPreparationFollowup(s.f.db,{actorId:'reviewer',requestId:crypto.randomUUID(),expectedRevision:'0',now:s.f.releasedAt},{caseId:s.reported.id,ownerId:'reviewer',backupId:null,state:'waiting',nextUpdateAt:s.f.releasedAt+3600000,privateNote:'A current lawful source update follows the unknown earlier transport.',customerMessage:'The recorded preparation team will give its next factual update.'});
 s.control.mode='normal';await s.page.getByRole('button',{name:'Retry unchanged action',exact:true}).click();await s.page.getByText('Refresh the current case before recording its next action.',{exact:true}).waitFor();
 assert.equal(await s.page.getByRole('button',{name:'Review current preparation and keep my note',exact:true}).count(),0);
 await s.page.getByRole('button',{name:'Check saved outcome',exact:true}).click();await s.page.getByText('No recorded outcome was found',{exact:false}).waitFor();
 assert.equal(await s.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(sessionStorage)))),before);assert.equal(new Set(s.control.bodies).size,1);
 assert.equal(await s.page.getByRole('button',{name:'Review current preparation and keep my note',exact:true}).count(),0);
}));

void test('mounted preparation hides personally conflicted actions',async()=>scene(async s=>{
 s.f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)").run();
 const own=await readPreparationWorkspace(s.f.db,'registered-owner',s.f.orderId,'staff');assert.ok(own);await s.page.evaluate(w=>window.dispatchEvent(new CustomEvent('fixture-view',{detail:w})),own);
 await s.page.getByText('An independent eligible operator must handle this portion.',{exact:false}).waitFor();
 assert.equal(await s.page.getByRole('button',{name:'Save follow-up and customer update',exact:true}).count(),0);assert.equal(await s.page.getByRole('button',{name:'Send preparation issue',exact:true}).count(),0);
 assert.equal(s.control.bodies.length,0);
}));

void test('mounted preparation excludes already covered active issue items',async()=>scene(async s=>{
 assert.equal(await s.page.getByRole('button',{name:'Send preparation issue',exact:true}).count(),0,'The existing active delay already owns the exact purchased item scope.');
 assert.equal(s.control.bodies.length,0);
}));
