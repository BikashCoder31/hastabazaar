import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {getPayoutFinanceWorkspace} from '../lib/payments/payout-workspace';
import {resolveRuntimeEnvironment} from '../lib/staging/environment';
import {registerHooks} from 'node:module';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
declare global{var payoutApiDb:D1Database;var payoutApiActor:string;var payoutApiAuthorize:(permission:string)=>Promise<{id:string;role:string}|null>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.payoutApiDb},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3018"}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{status=403};export async function requireStaffApi(permission){const actor=await globalThis.payoutApiAuthorize(permission);if(!actor)throw new StaffAuthorizationError("Current staff authority required.");return actor}',shortCircuit:true};
 return next(specifier,context);
}});

void test('Finance payout UI recovers a lost acknowledgement, then records one evidenced manual outcome with opaque browser storage',async()=>{
 assert.notEqual(process.env.HATSKALA_STAGING_NATIVE,'1','This test requires fresh memory-only fixtures.');
 const f=await payoutTransferFixture();try{
 globalThis.payoutApiDb=f.db;globalThis.payoutApiActor='reviewer';globalThis.payoutApiAuthorize=async(permission)=>{try{const authority=await staffMutationGuard(f.db,globalThis.payoutApiActor,permission as never,Error);return{id:globalThis.payoutApiActor,role:authority.role};}catch{return null;}};
 const environment=resolveRuntimeEnvironment({runtimeEnvironment:'local_staging',nodeEnvironment:'development',appOrigin:'http://localhost:3018'});
 const read=()=>getPayoutFinanceWorkspace(f.db,'reviewer',environment),initial=await read(),api=await import('../app/api/admin/payout-transfers/route');
 const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{PayoutTransferReview}from'./components/admin/payout-transfer-review';function App(){const[w,setW]=useState(${JSON.stringify(initial)});useEffect(()=>{const refresh=async()=>setW(await(await fetch('/workspace')).json());window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return <PayoutTransferReview workspace={w} actorId="reviewer"/>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'payout-browser-framework',setup(builder){
 builder.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));
 builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path.endsWith('navigation')?"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}":"import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}",loader:'js',resolveDir:process.cwd()}));
 }}]})).outputFiles[0].text;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const context=await browser.newContext(),origin='http://localhost:3018';let posts=0,savedBody:unknown;
 await context.route('**/*',async(route:{request():{url():string;postData():string|null;method():string};fulfill(value:unknown):Promise<void>;abort():Promise<void>})=>{
 const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
 if(url.pathname==='/fixture-payouts')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
 if(url.pathname==='/workspace')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await read())});
 if(url.pathname!=='/api/admin/payout-transfers')return route.abort();
 const request=new Request(url,{method:incoming.method(),headers:{Origin:origin,'Content-Type':'application/json'},...(incoming.method()==='POST'?{body:incoming.postData()!}:{})}),response=incoming.method()==='POST'?await api.POST(request):await api.GET(request);
 if(incoming.method()==='POST'){posts++;if(posts===1){assert.equal(response.status,200);savedBody=JSON.parse(incoming.postData()!);return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional lost payout acknowledgement"}'});}}
 return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 });
 const page=await context.newPage();await page.goto(origin+'/fixture-payouts');await page.addScriptTag({content:code});
 const open=async(label:string)=>{await page.locator('summary').filter({hasText:label}).click();return page.getByRole('form',{name:label,exact:true});};
 let form=await open('Prepare exact payout instruction');await form.getByLabel('Verified company source').selectOption(f.accountVersionId);await form.getByLabel('Decision and evidence-based reason').fill('Review exact original earned amount, verified beneficiary and actual funding.');await form.getByRole('button',{name:'Prepare exact payout instruction',exact:true}).click();
 await page.getByText('Fictional lost payout acknowledgement',{exact:true}).waitFor();
 const stored=await page.evaluate(()=>({session:Object.values(sessionStorage),local:Object.values(localStorage)}));assert.equal(stored.session.length,1);assert.match(stored.session[0],/^[0-9a-f-]{36}$/i);assert.deepEqual(stored.local,[]);
 await page.reload();await page.addScriptTag({content:code});await open('Prepare exact payout instruction');await page.getByRole('button',{name:'Check saved outcome',exact:true}).click();
 await page.locator('summary').filter({hasText:'Approve exact payout and source'}).waitFor();assert.equal(posts,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_transfer_packets').get()!.n,1);
 for(const label of ['Approve exact payout and source','Begin one manual payout instruction']){form=await open(label);await form.getByLabel('Decision and evidence-based reason').fill('Independently review original sources and record exactly one manual instruction.');await form.getByRole('button',{name:label,exact:true}).click();await form.waitFor({state:'detached'});}
 form=await open('Record an uncertain payout outcome');await form.getByLabel('Restricted evidence reference').fill('FICTIONAL-BROWSER-UNCERTAIN-BANK');await form.getByLabel('Decision and evidence-based reason').fill('The original fictional bank instruction has not yet been independently resolved.');await form.getByRole('button',{name:'Record an uncertain payout outcome',exact:true}).click();await page.getByText('Instruction began',{exact:false}).waitFor();
 // Wait for the committed packet refresh before reviewing the next revision.
 await page.waitForFunction(()=>document.body.textContent?.includes('· uncertain ·'));
 form=await open('Confirm actual completed payout');await form.getByLabel('Actual independent bank transaction identity').fill('FICTIONAL-BROWSER-PAYOUT-DEBIT');
 const nepalTime=new Date(Date.now()-60000+345*60000).toISOString().slice(0,16);await form.getByLabel('Actual bank transaction time (Nepal)').fill(nepalTime);
 await form.getByLabel('I independently confirmed the completed debit for the exact displayed amount.').check();await form.getByLabel('I matched the actual transfer to this retained beneficiary.').check();await form.getByLabel('Restricted evidence reference').fill('FICTIONAL-BROWSER-ACTUAL-ORIGINAL-DEBIT');await form.getByLabel('Decision and evidence-based reason').fill('Independently verified the fictional actual completed original bank debit and beneficiary.');await form.getByRole('button',{name:'Confirm actual completed payout',exact:true}).click();await form.waitFor({state:'detached'});
 assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.payoutId)!.status,'paid');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities WHERE packet_kind=\'payout\'').get()!.n,1);
 assert.equal(posts,5);const replay=await api.POST(new Request(origin+'/api/admin/payout-transfers',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(savedBody)}));assert.equal(replay.status,200);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_transfer_packets').get()!.n,1);
 assert.deepEqual(await page.evaluate(()=>Object.values(localStorage)),[]);
 }finally{await browser.close();}
 }finally{f.dispose();}
});
