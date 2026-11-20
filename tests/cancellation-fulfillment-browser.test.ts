import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
// Server element inspection never executes these framework navigation components.
registerHooks({resolve(specifier,context,next){
 if(specifier==='next/link')return{url:'data:text/javascript,export default function Link(){throw Error("Server inspection must not render navigation")}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function useRouter(){throw Error("Server inspection must not invoke client hooks")};export function redirect(url){throw Error(url)}',shortCircuit:true};
 return next(specifier,context);
}});
import {build} from 'esbuild';
import {fixture,target,state,origin} from './helpers/cancellation-fulfillment-fixture';
import {mixedOrder} from './helpers/cancellation-settlement-fixture';
import type {FixtureBrowser} from './helpers/browser-fixture-types';
async function bundle(){return build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {CancellationReviewControl} from './components/admin/cancellation-review-control';
 import {SellerOrderFulfillmentActions} from './components/seller/order-fulfillment-actions';
 import {StaffReviewAccessBoundary} from './components/admin/staff-review-access-boundary';
 import {SellerAccessBoundary} from './components/seller/seller-access-boundary';
 const root=createRoot(document.getElementById('root'));
 window.mount=(actor=window.fixture?.actorId??'actor-a')=>root.render(<><StaffReviewAccessBoundary actorId={actor} sourceId="review-one"><p>Private cancellation sibling</p><CancellationReviewControl actorId={actor} reviewId={window.fixture?.reviewId??"review-one"} canDecide={!window.fixture?.closed}/></StaffReviewAccessBoundary><SellerAccessBoundary actorId={actor}><p>Private seller sibling</p><SellerOrderFulfillmentActions actorId={actor} orderId={window.fixture?.orderId??"order-one"} items={window.fixture?.items??[{id:'item-one',productName:'Fictional cup',quantity:1,fulfillmentStatus:'confirmed',offerSnapshot:null}]}/></SellerAccessBoundary></>);window.mount();
 `},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'navigation-only',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'stub'}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'link-stub'}));b.onLoad({filter:/.*/,namespace:'link-stub'},()=>({contents:"import React from 'react';export default function Link({prefetch,...props}){return React.createElement('a',props)}",loader:'js',resolveDir:process.cwd()}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'const router={refresh(){}};export function useRouter(){return router}',loader:'js'}));}}]});}
async function browser(){const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs') as {chromium:{launch(options:object):Promise<FixtureBrowser>}};return chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});}
for(const kind of ['cancellation','fulfillment'] as const)void test(`${kind} mounted HTML denial hides private parent before parsing`,async()=>{
 const app=await bundle(),chrome=await browser(),page=await chrome.newPage();try{
 await page.route('http://localhost:3018/**',route=>{const req=route.request(),url=new URL(req.url());
 if(req.method()==='POST')return route.fulfill({status:403,contentType:'text/html',body:'Forbidden'});
 if(url.pathname.includes('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'staff.cancellation-review',version:1,publishedAt:1,fields:[]}})});
 return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});});
 await page.goto('http://localhost:3018/');await page.addScriptTag({content:app.outputFiles[0].text});
 if(kind==='cancellation'){await page.getByLabel('Decision reason').fill('Original private cancellation reason.');await page.getByRole('button',{name:'Reject with reason',exact:true}).click();}
 else{await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start selected preparation',exact:true}).click();}
 await page.waitForTimeout(150);
 assert.equal(await page.getByText(kind==='cancellation'?'Private cancellation sibling':'Private seller sibling',{exact:true}).count(),0);
 }finally{await chrome.close();}
});

for(const kind of ['cancellation','fulfillment'] as const)void test(`${kind} mounted native lost response keeps exact RAM retry and GET-only reload`,async()=>{
 const f=await fixture(),x=await target(f,kind),app=await bundle(),chrome=await browser(),page=await chrome.newPage();let calls=0;const wires:string[]=[];let transform='lost';
 try{
 await page.route(origin+'/**',async route=>{const req=route.request(),url=new URL(req.url());
 if(url.pathname===x.path){
  const wire=req.postData(),native=new Request(req.url(),{method:req.method(),headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':(req as unknown as {headers():Record<string,string>}).headers()['x-hastabazaar-actor']??''},...(wire?{body:wire}:{})});
  if(req.method()==='POST'){
   calls++;wires.push(wire??'');
   if(transform==='late-conflict')return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({...JSON.parse(wire??'{}'),actorId:x.actorId,sourceId:x.sourceId,requestId:JSON.parse(wire??'{}')[kind==='cancellation'?'clientAttemptId':'requestId'],recorded:false,phase:'before_write'})});
   const response=await x.api.POST(native,x.context);assert.equal(response.status,200,await response.clone().text());
   if(transform==='malformed')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...(await response.json() as Record<string,unknown>),actorId:'foreign-actor'})});
   if(transform==='lost')return route.fulfill({status:503,contentType:'text/plain',body:'Fictional response lost after native commit'});
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  }
  const response=await x.api.GET(native,x.context);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 }
 if(url.pathname.includes('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'staff.cancellation-review',version:1,publishedAt:1,fields:[]}})});
 return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
 });
 const mount=async(closed=false)=>{await page.goto(origin);await page.evaluate((value:unknown)=>{(window as Window&{fixture?:unknown}).fixture=value;},{closed,actorId:x.actorId,reviewId:x.sourceId,orderId:x.sourceId,items:f.rows.map(row=>({id:String(row.id),productName:'Fictional cup',quantity:1,fulfillmentStatus:'confirmed',offerSnapshot:null}))});await page.addScriptTag({content:app.outputFiles[0].text});};
 await mount();
 if(kind==='cancellation'){await page.getByLabel('Decision reason').fill(String(x.body.note));await page.getByRole('button',{name:'Reject with reason',exact:true}).click();}else{await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start selected preparation',exact:true}).click();}
 await page.getByText('The original outcome is unconfirmed. Keep this reference and check again.').waitFor();
 const storage=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map(key=>[key,sessionStorage.getItem(key)]))));assert.doesNotMatch(storage,/itemIds|private|original paid|Started actual|selected items/i);
 const retry=page.getByRole('button',{name:kind==='cancellation'?'Retry the same saved decision':'Retry the same saved action',exact:true});
 transform='late-conflict';await retry.click();await page.waitForTimeout(100);assert.equal(wires.length,2);assert.equal(wires[1],wires[0]);assert.equal(await page.getByRole('button',{name:/for a new attempt/}).count(),0);
 transform='malformed';await retry.click();await page.waitForTimeout(100);assert.equal(wires[2],wires[0]);assert.equal(await page.getByText('Original action confirmed. This is its saved historical outcome.').count(),0);
 await mount(true);assert.equal(await page.getByRole('button',{name:/Retry the same saved/}).count(),0);await page.getByRole('button',{name:'Check original saved outcome',exact:true}).click();
 await page.getByText('Original action confirmed. This is its saved historical outcome.').waitFor();assert.equal(calls,3);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='order.native-action'").get()!.n,1);
 }finally{state.db=null;f.dispose();await chrome.close();}
});
for(const kind of ['cancellation','fulfillment'] as const)void test(`${kind} native role denial hides the whole mounted private parent`,async()=>{
 const f=await fixture(),x=await target(f,kind),app=await bundle(),chrome=await browser(),page=await chrome.newPage();let nativeStatus=0;
 try{
 await page.route(origin+'/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname===x.path&&req.method()==='POST'){
  f.sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(x.actorId);
  const response=await x.api.POST(new Request(req.url(),{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':(req as unknown as {headers():Record<string,string>}).headers()['x-hastabazaar-actor']??''},body:req.postData()??''}),x.context);nativeStatus=response.status;
  return route.fulfill({status:response.status,contentType:'text/html',body:'Fictional unreadable denial body'});
 }
 if(url.pathname.includes('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'staff.cancellation-review',version:1,publishedAt:1,fields:[]}})});
 return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});});
 await page.goto(origin);await page.evaluate((value:unknown)=>{(window as Window&{fixture?:unknown}).fixture=value;},{actorId:x.actorId,reviewId:x.sourceId,orderId:x.sourceId,items:f.rows.map(row=>({id:String(row.id),productName:'Fictional cup',quantity:1,fulfillmentStatus:'confirmed',offerSnapshot:null}))});await page.addScriptTag({content:app.outputFiles[0].text});
 if(kind==='cancellation'){await page.getByLabel('Decision reason').fill(String(x.body.note));await page.getByRole('button',{name:'Reject with reason',exact:true}).click();}else{await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start selected preparation',exact:true}).click();}
 await page.getByText(kind==='cancellation'?'Review access changed':'Seller workspace access changed. Reopen Seller Center to load the current details.',{exact:true}).waitFor();assert.equal(nativeStatus,403);
 assert.equal(await page.getByText(kind==='cancellation'?'Private cancellation sibling':'Private seller sibling',{exact:true}).count(),0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='order.native-action'").get()!.n,0);
 }finally{state.db=null;f.dispose();await chrome.close();}
});

void test('mounted action storage quota sends no command and legacy wire becomes reference only',async()=>{
 const app=await bundle(),chrome=await browser(),page=await chrome.newPage();let calls=0;
 try{await page.route(origin+'/**',route=>{const req=route.request();if(req.method()==='POST'){calls++;return route.fulfill({status:503,body:'offline'});}if(new URL(req.url()).pathname.includes('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'staff.cancellation-review',version:1,publishedAt:1,fields:[]}})});return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});});
 await page.goto(origin);await page.addScriptTag({content:app.outputFiles[0].text});await page.getByRole('checkbox').check();await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('fictional quota');};});await page.getByRole('button',{name:'Start selected preparation',exact:true}).click();await page.getByText('Browser storage is unavailable. No action was sent.').waitFor();assert.equal(calls,0);
 await page.goto(origin);await page.evaluate(()=>sessionStorage.setItem('hastabazaar:preparation:actor-a:order-one',JSON.stringify({selected:['private-item'],pending:{requestId:'11111111-1111-4111-8111-111111111111',action:'start_packing',itemIds:['private-item'],note:'Private legacy note'}})));await page.addScriptTag({content:app.outputFiles[0].text});await page.getByRole('button',{name:'Check original saved outcome',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Retry the same saved action',exact:true}).count(),0);
 const raw=await page.evaluate(()=>sessionStorage.getItem('hastabazaar:preparation:actor-a:order-one'));assert.deepEqual(JSON.parse(raw??''),{requestId:'11111111-1111-4111-8111-111111111111',action:'start_packing'});assert.equal(calls,0);
 }finally{await chrome.close();}
});

void test('native first stale-form rejection requires explicit review and retains the private note',async()=>{
 const f=await fixture(),x=await target(f,'cancellation'),app=await bundle(),chrome=await browser(),page=await chrome.newPage();let version=999;const sent:string[]=[];
 try{await page.route(origin+'/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname===x.path&&req.method()==='POST'){
  const body=req.postData()??'';sent.push(body);const response=await x.api.POST(new Request(req.url(),{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':x.actorId},body}),x.context);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 }if(url.pathname.includes('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'staff.cancellation-review',version,publishedAt:1,fields:[]}})});return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});});
 await page.goto(origin);await page.evaluate((value:unknown)=>{(window as Window&{fixture?:unknown}).fixture=value;},{actorId:x.actorId,reviewId:x.sourceId});await page.addScriptTag({content:app.outputFiles[0].text});
 await page.getByLabel('Decision reason').fill(String(x.body.note));await page.getByRole('button',{name:'Reject with reason',exact:true}).click();await page.getByRole('button',{name:'Review current form for a new attempt',exact:true}).waitFor();assert.equal(sent.length,1);assert.equal(await page.getByLabel('Decision reason').inputValue(),x.body.note);
 version=1;await page.getByRole('button',{name:'Review current form for a new attempt',exact:true}).click();await page.getByRole('button',{name:'Reject with reason',exact:true}).click();await page.getByText('Original action confirmed. This is its saved historical outcome.').waitFor();assert.equal(sent.length,2);assert.notEqual(JSON.parse(sent[0]).clientAttemptId,JSON.parse(sent[1]).clientAttemptId);assert.equal(JSON.parse(sent[0]).note,JSON.parse(sent[1]).note);
 }finally{state.db=null;f.dispose();await chrome.close();}
});
void test('late original fulfillment acknowledgement cannot clear or annotate another actor scope',async()=>{
 const f=await fixture(),x=await target(f,'fulfillment'),app=await bundle(),chrome=await browser(),page=await chrome.newPage();let release:()=>void=()=>{};let saw:()=>void=()=>{};const observed=new Promise<void>(resolve=>{saw=resolve;});let calls=0;
 try{await page.route(origin+'/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname===x.path&&req.method()==='POST'){
  calls++;const response=await x.api.POST(new Request(req.url(),{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':x.actorId},body:req.postData()??''}),x.context);assert.equal(response.status,200);const body=await response.text();await new Promise<void>(resolve=>{release=resolve;saw();});return route.fulfill({status:200,contentType:'application/json',body});
 }if(url.pathname.includes('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'staff.cancellation-review',version:1,publishedAt:1,fields:[]}})});return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});});
 await page.goto(origin);await page.evaluate((value:unknown)=>{(window as Window&{fixture?:unknown}).fixture=value;},{actorId:x.actorId,orderId:x.sourceId,items:f.rows.map(row=>({id:String(row.id),productName:'Fictional cup',quantity:1,fulfillmentStatus:'confirmed',offerSnapshot:null}))});await page.addScriptTag({content:app.outputFiles[0].text});await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Start selected preparation',exact:true}).evaluate(element=>{(element as HTMLButtonElement).click();(element as HTMLButtonElement).click();});await observed;assert.equal(calls,1);
 await page.evaluate(()=>{(window as Window&{mount?:(actor:string)=>void}).mount?.('new-actor');});await page.waitForTimeout(50);release();await page.waitForTimeout(100);assert.equal(await page.getByText('Original action confirmed. This is its saved historical outcome.').count(),0);
 const saved=await page.evaluate((key:string)=>sessionStorage.getItem(key),`hastabazaar:preparation:${x.actorId}:${x.sourceId}`);assert.ok(saved);assert.equal(await page.getByRole('checkbox').isChecked(),false);
 }finally{release();state.db=null;f.dispose();await chrome.close();}
});
void test('native confirmed success stays confirmed when browser reference cleanup fails',async()=>{
 const f=await fixture(),x=await target(f,'fulfillment'),app=await bundle(),chrome=await browser(),page=await chrome.newPage();
 try{await page.route(origin+'/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname===x.path&&req.method()==='POST'){
  const response=await x.api.POST(new Request(req.url(),{method:'POST',headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':x.actorId},body:req.postData()??''}),x.context);assert.equal(response.status,200);await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('fictional cleanup quota');};});return route.fulfill({status:200,contentType:'application/json',body:await response.text()});
 }if(url.pathname.includes('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'staff.cancellation-review',version:1,publishedAt:1,fields:[]}})});return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});});
 await page.goto(origin);await page.evaluate((value:unknown)=>{(window as Window&{fixture?:unknown}).fixture=value;},{actorId:x.actorId,orderId:x.sourceId,items:f.rows.map(row=>({id:String(row.id),productName:'Fictional cup',quantity:1,fulfillmentStatus:'confirmed',offerSnapshot:null}))});await page.addScriptTag({content:app.outputFiles[0].text});await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start selected preparation',exact:true}).click();await page.getByText(/Original action confirmed\.|The original outcome is unconfirmed\./).waitFor();
 assert.equal(await page.getByText('Original action confirmed. This is its saved historical outcome.').count(),1);
 assert.equal(await page.getByRole('button',{name:'Retry the same saved action',exact:true}).count(),0);
 assert.ok(await page.evaluate((key:string)=>sessionStorage.getItem(key),`hastabazaar:preparation:${x.actorId}:${x.sourceId}`));
 }finally{state.db=null;f.dispose();await chrome.close();}
});

void test('mounted recorded cancellation keeps accounting continuation through read-only reload',async()=>{
 const f=await mixedOrder(),app=await bundle(),chrome=await browser(),page=await chrome.newPage();const wires:string[]=[];let failed=false;
 try{
 const wrapped=Object.create(f.db) as D1Database;
 wrapped.batch=(async(statements:D1PreparedStatement[])=>{const result=await f.db.batch(statements);if(!failed&&f.sqlite.prepare('SELECT id FROM order_cancellation_events WHERE id=?').get('review:'+f.sourceId)){failed=true;throw Error('fictional_lost_commit_ack');}return result;}) as D1Database['batch'];state.db=wrapped;
 await page.route(origin+'/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname===f.path){const wire=req.postData();if(wire)wires.push(wire);
   const response=await f.api[req.method()==='POST'?'POST':'GET'](new Request(req.url(),{method:req.method(),headers:{origin,'content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},...(wire?{body:wire}:{})}));
   return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  }
  if(url.pathname.includes('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({config:{formId:'staff.cancellation-review',version:1,publishedAt:1,fields:[]}})});
  return route.fulfill({status:200,contentType:'text/html',body:'<div id="root"></div>'});
 });
 const mount=async()=>{
  // Derive the mounted control's permission from the real server section after
  // querying the actual review, including its approved/nonpending reload.
  const {CancellationReviewSection}=await import('../components/admin/cancellation-review-section');
  const section=await CancellationReviewSection({db:f.db,orderId:f.orderId,actorId:'reviewer'});
  const findControl=(node:unknown):{actorId:string;reviewId:string;canDecide:boolean}|null=>{
   if(Array.isArray(node)){for(const child of node){const found=findControl(child);if(found)return found;}return null;}
   if(!node||typeof node!=='object')return null;
   const element=node as {type?:{name?:string};props?:{children?:unknown;actorId:string;reviewId:string;canDecide:boolean}};
   if(element.type?.name==='CancellationReviewControl'&&element.props?.reviewId===f.sourceId)return element.props;
   return findControl(element.props?.children);
  };
  const control=findControl(section);assert.ok(control);
  const status=f.sqlite.prepare('SELECT status FROM order_cancellation_reviews WHERE id=?').get(f.sourceId)!.status;
  assert.equal(control.canDecide,status==='pending');
  await page.goto(origin);await page.evaluate((value:unknown)=>{(window as Window&{fixture?:unknown}).fixture=value;},{closed:!control.canDecide,actorId:control.actorId,reviewId:control.reviewId});await page.addScriptTag({content:app.outputFiles[0].text});
 };
 await mount();await page.getByLabel('Decision reason').fill(f.body.note);await page.getByRole('button',{name:'Review current cancellation amounts',exact:true}).click();await page.getByRole('button',{name:'Approve reviewed cancellation',exact:true}).click();
 await page.getByText(/original cancellation is recorded|original outcome is unconfirmed/i).waitFor();
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,0);
 assert.equal(await page.getByText(/original outcome is unconfirmed/i).count(),0,'recorded approval must not be described as unknown');
 assert.equal(await page.getByRole('button',{name:'Continue original settlement',exact:true}).count(),1);
 const original=wires[1],attempt=JSON.parse(original).clientAttemptId;
 const storage=()=>page.evaluate(()=>Object.values(sessionStorage).filter(Boolean));
 const refs=await storage();assert.ok(refs.some(value=>value===JSON.stringify({action:'approve',requestId:attempt})));assert.doesNotMatch(refs.join(''),/note|fingerprint|customAnswers|formVersion/);
 state.db=f.db;await mount();
 assert.equal(await page.getByRole('button',{name:'Continue original settlement',exact:true}).count(),0);
 const before=f.sqlite.prepare('SELECT total_changes() n').get()!.n;
 await page.getByRole('button',{name:'Check original saved outcome',exact:true}).click();await page.getByRole('button',{name:'Continue original settlement',exact:true}).waitFor();
 assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n,before);assert.equal(wires.length,2);
 assert.ok((await storage()).some(value=>value.includes(attempt)));
 await page.getByRole('button',{name:'Continue original settlement',exact:true}).click();
 await page.getByText('Original cancellation and settlement continuation confirmed.').waitFor();
 assert.deepEqual(JSON.parse(wires[2]),{reviewId:f.sourceId,action:'approve',clientAttemptId:attempt,continuation:true});
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM managed_settlement_entries WHERE type='earned'").get()!.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_cancellation_events').get()!.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='order.native-action'").get()!.n,1);
 assert.equal((await storage()).some(value=>value.includes(attempt)),false);
 }finally{state.db=null;f.dispose();await chrome.close();}
});

