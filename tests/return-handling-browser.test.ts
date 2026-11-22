import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {approvedReplacement} from './helpers/return-handling-fixture';
import {returnHandlingWorkspace} from '../lib/returns/handling';
import {resolvePublishedForm} from '../lib/forms/runtime';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
declare global{var returnBrowserDb:D1Database;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.returnBrowserDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{};export async function requireStaffApi(){return {id:"owner",role:"super_admin"}}',shortCircuit:true};
 return next(specifier,context);
}});
void test('physical handling browser recovers a committed action after lost acknowledgement and reload using only an opaque reference',async()=>{
 // Fresh :memory: commerce fixture. The route, catalog validation and transaction are real; only framework identity/bindings are doubled.
 const f=await approvedReplacement();try{
  globalThis.returnBrowserDb=f.database;const formId='staff.return-case-action';assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_config_versions WHERE form_id=?').get(formId)!.n,0);
  f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES(?,?,1,1,'published',?,'Isolated browser fixture','owner',1,'owner',1,'owner',1,?)").run('physical-browser-form',formId,JSON.stringify({formId,fields:[]}),'physical-browser-form-create');
  const config=await resolvePublishedForm(f.database,formId),initial=await returnHandlingWorkspace(f.database,f.caseId),routeApi=await import('../app/api/admin/returns/[id]/handling/route');
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{ReturnHandlingActions}from'./components/admin/return-handling-actions';function App(){const[w,setW]=useState(${JSON.stringify(initial)});useEffect(()=>{const refresh=async()=>setW(await(await fetch('/workspace')).json());window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return <ReturnHandlingActions workspace={w} actorId="owner" superAdmin={true}/>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'physical-browser-boundaries',setup(builder){
   builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));builder.onResolve({filter:/^@\/components\/forms\/form-config-client$/},()=>({path:'catalog',namespace:'fixture'}));
   builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='navigation'?"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}":`export function usePublishedFormConfig(){return{config:${JSON.stringify(config)},canSubmit:true,message:null,handleSubmissionResponse(){}}}`,loader:'js'}));
  }}]})).outputFiles[0].text;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
   const context=await browser.newContext(),origin='https://physical-return-browser.test';let posts=0;
   await context.route('**/*',async(route:{request():{url():string;postData():string|null;method():string};fulfill(value:unknown):Promise<void>;abort():Promise<void>})=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/case')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
    if(url.pathname==='/workspace')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await returnHandlingWorkspace(f.database,f.caseId))});
    if(url.pathname!==`/api/admin/returns/${f.caseId}/handling`)return route.abort();
    const request=new Request(url,{method:incoming.method(),headers:{origin,'content-type':'application/json'},...(incoming.method()==='POST'?{body:incoming.postData()!}:{})}),ctx={params:Promise.resolve({id:f.caseId})};
    const response=incoming.method()==='POST'?await routeApi.POST(request,ctx):await routeApi.GET(request,ctx);if(incoming.method()==='POST'){posts++;if(response.ok)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional lost acknowledgement"}'});}
    return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   });
   const page=await context.newPage();await page.goto(origin+'/case');await page.addScriptTag({content:code});
   await page.getByLabel('Exact approved receiving destination',{exact:true}).fill('Fictional approved Kathmandu receiving location');await page.getByLabel('Company-funded return method',{exact:true}).fill('Company-arranged collection');await page.getByLabel('Safe packaging and handling instructions',{exact:true}).fill('Keep the damaged goods wrapped safely for collection.');await page.getByRole('checkbox').check();
   await page.getByLabel('Retained evidence reference',{exact:true}).fill('FICTIONAL-PRIVATE-SOURCE');await page.getByLabel('Factual customer update',{exact:true}).fill('The company-funded return instructions are now available.');await page.getByLabel('Private staff evidence and reasoning',{exact:true}).fill('Private fictional warehouse confirmation; this must not enter browser storage.');
   await page.getByRole('button',{name:'Record this action',exact:true}).click();await page.getByText('Fictional lost acknowledgement',{exact:true}).waitFor();
   const stored=await page.evaluate(()=>Object.values(sessionStorage));assert.equal(stored.length,1);assert.match(stored[0],/^[0-9a-f-]{36}$/i);
   await page.reload();await page.addScriptTag({content:code});await page.getByRole('button',{name:'Check saved action outcome',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Record this action',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'Check saved action outcome',exact:true}).click();await page.getByText('The original action was recorded. Current case facts have been refreshed.',{exact:true}).waitFor();
   assert.equal(posts,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM return_handling_events WHERE case_id=?').get(f.caseId)!.n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_answer_sets WHERE subject_id=? AND form_id='staff.return-case-action'").get(f.caseId)!.n,1);
  }finally{await browser.close();}
 }finally{await f.dispose();}
});
void test('staff intake routes retain supported first receipt for both case types and reject altered or unauthorized retries',async()=>{
 const f=await commerceOrderFixture();try{
  globalThis.returnBrowserDb=f.database;await f.deliver();const now=Date.now(),first=now-3600000,itemId=String(f.sqlite.prepare('SELECT id FROM order_items').get()!.id);
  f.sqlite.prepare('UPDATE shipping_parcels SET delivered_at=?').run(now-2*86400000);
  for(const formId of ['commerce.return-request','commerce.complaint'])f.sqlite.prepare("INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES(?,?,1,1,'published',?,'Isolated API fixture','owner',1,'owner',1,'owner',1,?)").run('supported-'+formId,formId,JSON.stringify({formId,fields:[]}),'supported-'+formId);
  const route=await import('../app/api/admin/cases/intake/route'),origin='https://supported-intake.test';
  const send=(body:unknown)=>route.POST(new Request(origin+'/api/admin/cases/intake',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
  for(const sourceType of ['return_request','complaint']){
   const body={sourceType,orderNumber:f.access.orderNumber,orderItemId:itemId,detail:'The original supported customer request describes the actual defective item and required help.',locale:'en-NP',receivedAt:first,channel:'email',sourceReference:'FICTIONAL-RETAINED-FIRST-MESSAGE',requestId:crypto.randomUUID(),formVersion:1,customAnswers:[],...(sourceType==='return_request'?{quantity:1,reason:'defective',requestedResolution:'refund',originalSealIntact:false}:{category:'service',subject:'Original supported service concern'})};
   const response=await send(body),result=await response.json() as {id?:string;error?:string};assert.equal(response.status,200,result.error);assert.ok(result.id);
   const table=sourceType==='return_request'?'return_requests':'complaints',timeColumn=sourceType==='return_request'?'requested_at':'created_at',row=f.sqlite.prepare(`SELECT ${timeColumn} AS received,recorded_at,intake_recorded_by FROM ${table} WHERE id=?`).get(result.id)!;
   assert.equal(row.received,first);assert.ok(Number(row.recorded_at)>=now);assert.equal(row.intake_recorded_by,'owner');assert.equal((await send(body)).status,200);
   assert.equal((await send({...body,receivedAt:first-1000})).status,409);assert.equal((await send({...body,actorId:'foreign'})).status,400);
   const recovered=await route.GET(new Request(origin+`/api/admin/cases/intake?sourceType=${sourceType}&order=${encodeURIComponent(f.access.orderNumber)}&attempt=${body.requestId}`));assert.deepEqual(await recovered.json(),{outcome:{id:result.id}});
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM return_evidence').get()!.n,0);
  f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='owner'").run();
  const denied=await send({sourceType:'complaint',orderNumber:f.access.orderNumber,orderItemId:null,category:'service',subject:'Disallowed new request',detail:'An inactive operator must not record new customer facts.',locale:'en-NP',receivedAt:first,channel:'support',sourceReference:'FICTIONAL-INACTIVE-OPERATOR',requestId:crypto.randomUUID(),formVersion:1,customAnswers:[]});assert.notEqual(denied.status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM complaints').get()!.n,1);
 }finally{await f.dispose();}
});
