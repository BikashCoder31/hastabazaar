import type {Route as BrowserRoute} from 'playwright-core';
/** Actual mounted controls/routes; Browser plugin unavailable, intercepted installed Chrome only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {getManualPaymentWorkspace} from '../lib/payments/manual-payment-workspace';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import {stubFixtureLink} from './helpers/browser-fixture-link';
declare global{var financeScopeDb:D1Database;var financeScopeActor:string;var financeScopeAuthority:(permission:string)=>Promise<{id:string;role:string}>;}
registerHooks({resolve(specifier,context,next){
 // This staff-only actor-intent fixture must reject before invoking a customer/provider identity path.
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){throw Error("Unexpected provider identity read in staff-only intent fixture")}',shortCircuit:true};
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.financeScopeDb},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://finance-scope.test",HASTABAZAAR_RELEASE_ID:"fictional-scope"}',shortCircuit:true};
 if(specifier==='../auth/customer')return{url:'data:text/javascript,export class CustomerAuthorizationError extends Error{};export async function requireExistingCustomerApi(){throw new CustomerAuthorizationError("No customer session in this staff-only fixture.")}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff'||specifier==='../auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(permission){try{return await globalThis.financeScopeAuthority(permission)}catch{throw new StaffAuthorizationError("Current staff permission is required.")}}',shortCircuit:true};
 return next(specifier,context);
}});
void test('mounted Finance controls separate actor/source drafts and fence late committed responses',{timeout:45000},async()=>{
 const f=await manualOrderFixture();const releases:Array<()=>void>=[];
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.prepare("INSERT INTO users(id,auth_subject,display_name,email,status,created_at,updated_at) VALUES('finance-b','finance-b','Fictional Finance B','finance-b@local.hastabazaar.test','active',?,?)").run(f.now,f.now);
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('finance-b','super_admin',?)").run(f.now);
  globalThis.financeScopeDb=f.db;globalThis.financeScopeActor='reviewer';globalThis.financeScopeAuthority=async permission=>{const proof=await staffMutationGuard(f.db,globalThis.financeScopeActor,permission as never,Error);return{id:globalThis.financeScopeActor,role:proof.role};};
  const receipts:Array<Awaited<ReturnType<typeof recordBankReceipt>>>=[];for(let i=0;i<4;i++)receipts.push(await recordBankReceipt(f.db,{actorId:'reviewer',requestId:'scope-original-credit-'+i,expectedRevision:null,now:Date.now()},{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-SCOPE-ORIGINAL-'+i,bankAt:f.now,amountMinor:5000,currency:'NPR',payerReference:'Independent fictional original payer',payerUserId:'customer',evidenceReference:'FICTIONAL-SCOPE-CREDIT-'+i,completedCreditConfirmed:true,conflictUserIds:[],reason:'Actual fictional unused company credit, distinct from all later outcomes.'}));
  const paymentApi=await import('../lib/payments/payment-http'),refundApi=await import('../app/api/admin/refunds/route');
  const origin='https://finance-scope.test';let source=receipts[0].id;
  const boot=async()=>({actorId:globalThis.financeScopeActor,workspace:await getManualPaymentWorkspace(f.db,globalThis.financeScopeActor),source,probeSource:source===receipts[0].id?receipts[2].id:receipts[3].id});
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{ManualPaymentReview}from'./components/admin/manual-payment-review';import{FinancialAction}from'./components/admin/refund-funding-review';import{useCaseCommand}from'./components/admin/use-case-command';function App(){const[p,setP]=useState(window.__FINANCE_BOOT__);const command=useCaseCommand('system.refund-finance',p.actorId,'open',p.probeSource,'/api/admin/refunds',{created:true});useEffect(()=>{const refresh=async()=>{const r=await fetch('/fixture-workspace');if(r.ok)setP(await r.json())};window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return <main className="mx-auto max-w-6xl p-5"><output className="break-all" data-testid="actor">{p.actorId}:{p.source}</output><div data-testid="incoming"><ManualPaymentReview workspace={p.workspace} actorId={p.actorId} superAdmin={true}/></div><div data-testid="financial"><FinancialAction actorId={p.actorId} scope={p.source} action="open" label="Open exact original unused credit" revision={null} input={{kind:'receipt_return',sourceId:p.source}} fields={[{name:'reason',label:'Private Finance review reason',type:'textarea'}]}/></div><div data-testid='probe'><output className='break-all' data-testid='probe-state'>{JSON.stringify({busy:command.busy,saved:command.saved,canRetry:command.canRetry,message:command.message})}</output><button disabled={command.busy||command.saved} onClick={()=>command.submit({sourceFormId:'system.refund-finance',action:'open',expectedRevision:null,input:{kind:'receipt_return',sourceId:p.probeSource,reason:'Independently review this original unused receipt and its verified payer.'}})}>Probe actual original obligation</button></div></main>}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-boundaries',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)}"}));}}]})).outputFiles[0].text;
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/admin/manual-payment-review.tsx';\n@source '../components/admin/cod-reconciliation.tsx';\n@source '../components/admin/refund-funding-review.tsx';\n@source inline('mx-auto max-w-6xl p-5');"),{from:resolve('app/globals.css')})).css;
  await mkdir('.test-artifacts/t31',{recursive:true});
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const failures:string[]=[],errors:string[]=[],bodies:Array<{actor:string;path:string;body:string}>=[];
   const check=(condition:boolean,message:string)=>{if(!condition)failures.push(message);};
   let holdPath='',committed:()=>void=()=>{},gate=Promise.resolve();
   const arm=(path:string)=>{holdPath=path;const ready=new Promise<void>(resolve=>{committed=resolve;});gate=new Promise<void>(resolve=>{releases.push(resolve);});return ready;};
   const context=await browser.newContext({viewport:{width:1200,height:900}});
   await context.route('**/*',async(route:BrowserRoute)=>{
    const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:code});
    if(url.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});
    if(url.pathname==='/admin/payments')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__FINANCE_BOOT__='+JSON.stringify(await boot()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    if(url.pathname==='/fixture-workspace')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await boot())});
    if(!['/api/admin/payments','/api/admin/refunds'].includes(url.pathname))return route.abort();
    const actual=new Request(url,{method:request.method(),headers:{origin,'Content-Type':'application/json'},...(request.method()==='POST'?{body:request.postData()}:{} )});
    if(request.method()==='POST')bodies.push({actor:globalThis.financeScopeActor,path:url.pathname,body:request.postData()!});
    const response=url.pathname==='/api/admin/payments'?(request.method()==='POST'?await paymentApi.financePaymentCommand(actual):await paymentApi.financePaymentsRead(actual)):(request.method()==='POST'?await refundApi.POST(actual):await refundApi.GET(actual));
    const text=await response.text();
    if(url.pathname===holdPath&&request.method()==='POST'){assert.equal(response.status,200,text);holdPath='';const wait=gate;committed();await wait;}
    await route.fulfill({status:response.status,contentType:'application/json',body:text});
   });
   const page=await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));await page.goto(origin+'/admin/payments');
   const incoming=page.getByTestId('incoming'),cod=incoming.locator('section').filter({has:page.getByRole('heading',{name:'COD company receipt and reconciliation',exact:true})}),financial=page.getByTestId('financial');
   const switchScope=async(actor:string,nextSource=source)=>{globalThis.financeScopeActor=actor;source=nextSource;await page.evaluate(()=>window.dispatchEvent(new Event('fixture-refresh')));await page.getByTestId('actor').filter({hasText:actor+':'+nextSource}).waitFor();if(!await financial.locator('details').evaluate((element:HTMLElement)=>(element as HTMLDetailsElement).open))await financial.locator('summary').click();};
   await incoming.getByText('Record an actual company bank credit',{exact:true}).click();await cod.getByText('Record authorized company cash actually handed over',{exact:true}).click();await financial.locator('summary').filter({hasText:'Open exact original unused credit'}).click();
   await incoming.getByLabel('Restricted completed-credit evidence reference',{exact:true}).fill('FICTIONAL-PRIVATE-A-BANK');await cod.getByLabel('Independent authorized handover evidence',{exact:true}).fill('FICTIONAL-PRIVATE-A-CASH');await financial.getByLabel('Private Finance review reason',{exact:true}).fill('FICTIONAL-PRIVATE-A-REASON original confidential review.');
   await switchScope('finance-b');
   check(await incoming.getByLabel('Restricted completed-credit evidence reference',{exact:true}).inputValue()==='','incoming retained former actor private bank evidence');
   check(await cod.getByLabel('Independent authorized handover evidence',{exact:true}).inputValue()==='','COD retained former actor private handover evidence');
   check(await financial.getByLabel('Private Finance review reason',{exact:true}).inputValue()==='','uncontrolled financial form retained former actor private reason');
   check(!(await page.evaluate(()=>sessionStorage.getItem('hastabazaar:finance-payments:finance-b')??'')).includes('FICTIONAL-PRIVATE-A'),'incoming copied former actor private state into next actor storage');
   check(!(await page.evaluate(()=>sessionStorage.getItem('hastabazaar:cod-reconciliation:finance-b')??'')).includes('FICTIONAL-PRIVATE-A'),'COD copied former actor private state into next actor storage');
   await switchScope('reviewer');check(await incoming.getByLabel('Restricted completed-credit evidence reference',{exact:true}).inputValue()==='FICTIONAL-PRIVATE-A-BANK','original actor draft was not recoverable on return');
   // A real native opening commits; its response arrives only after another actor/source mounts.
   await financial.getByLabel('Private Finance review reason',{exact:true}).fill('FICTIONAL-PRIVATE-A-REASON newly reviewed original source.');
   const ready=arm('/api/admin/refunds');await financial.getByRole('button',{name:'Open exact original unused credit',exact:true}).click();await ready;
   const formerBody=JSON.parse(bodies.at(-1)!.body);await switchScope('finance-b',receipts[1].id);
   check(await financial.getByLabel('Private Finance review reason',{exact:true}).inputValue()==='','new source retained old source private fields');
   check(await financial.getByLabel('Private Finance review reason',{exact:true}).isEnabled(),'former request kept next actor/source busy');
   check(await financial.getByRole('button',{name:'Retry unchanged action',exact:true}).count()===0,'former actor/source pending payload was offered as next source retry');
   const nextEnabled=await financial.getByLabel('Private Finance review reason',{exact:true}).isEnabled();
   if(nextEnabled){
    await financial.getByLabel('Private Finance review reason',{exact:true}).fill('FICTIONAL-PRIVATE-B-REASON independently reviewed current source.');
    const nextReady=arm('/api/admin/refunds');await financial.getByRole('button',{name:'Open exact original unused credit',exact:true}).click();await nextReady;
    const nextBody=JSON.parse(bodies.at(-1)!.body);check(nextBody.requestId!==formerBody.requestId&&nextBody.input.sourceId===receipts[1].id&&nextBody.input.reason.includes('PRIVATE-B'),'new actor/source reused former private command or request reference');
    releases[0]();await page.waitForTimeout(100);check(await financial.getByLabel('Private Finance review reason',{exact:true}).isDisabled(),'late former response cleared the current pending action');
    releases[1]();await financial.getByText('Action recorded. The current case has been refreshed.',{exact:true}).waitFor();
   }else releases[0]();
   // Exercise the shared hook in a persistent component as well as the keyed private form.
   await switchScope('reviewer',receipts[0].id);const probe=page.getByTestId('probe'),firstProbeReady=arm('/api/admin/refunds');
   await probe.getByRole('button').click();await firstProbeReady;const firstProbeBody=JSON.parse(bodies.at(-1)!.body),firstRelease=releases.at(-1)!;
   await switchScope('finance-b',receipts[1].id);const nextState=JSON.parse(await page.getByTestId('probe-state').innerText());
   check(!nextState.busy&&!nextState.saved&&!nextState.canRetry,'shared hook retained former actor/source pending state');
   if(!nextState.busy&&!nextState.saved){
    const secondProbeReady=arm('/api/admin/refunds');await probe.getByRole('button').click();await secondProbeReady;const secondProbeBody=JSON.parse(bodies.at(-1)!.body),secondRelease=releases.at(-1)!;
    check(secondProbeBody.requestId!==firstProbeBody.requestId&&secondProbeBody.input.sourceId===receipts[3].id,'shared hook posted former source payload under the next actor');
    firstRelease();await page.waitForTimeout(100);const stillPending=JSON.parse(await page.getByTestId('probe-state').innerText());check(stillPending.busy&&stillPending.saved&&stillPending.canRetry,'late former hook response cleared the next source command');
    secondRelease();await probe.getByText(/Action recorded/).waitFor();
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM refund_obligations WHERE source_kind='receipt_return'").get()!.n,4);
   }else firstRelease();
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.test-artifacts/t31/finance-current-scope-mobile.png',fullPage:true});
   const mobileWidth=await page.evaluate(()=>document.documentElement.scrollWidth);check(mobileWidth<=390,'actual Finance controls overflow mobile viewport: '+mobileWidth);
   assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  }finally{for(const release of releases)release();await browser.close();}
 }finally{f.dispose();}
});
