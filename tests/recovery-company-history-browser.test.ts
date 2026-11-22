import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {historicalRegisteredRecoveryFixture} from './helpers/historical-registered-recovery-fixture';
import {openSellerRecovery} from '../lib/payments/seller-recovery';

import {getSellerRecoveryStatement,getRecoveryFinanceWorkspace} from '../lib/payments/recovery-workspace';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
declare global{var recoveryUiDb:D1Database;var recoveryUiActor:string;var recoveryUiAuthority:(permission:string)=>Promise<{id:string;role:string}|null>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.recoveryUiDb},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3018"}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{status=403};export async function requireStaffApi(permission){const actor=await globalThis.recoveryUiAuthority(permission);if(!actor)throw new StaffAuthorizationError("Current staff authority required.");return actor}',shortCircuit:true};
 if(specifier==='@/lib/auth/seller-center')return {url:'data:text/javascript,export class SellerCenterAuthorizationError extends Error{status=403};export async function requireSellerCenterApi(){return {userId:globalThis.recoveryUiActor}}',shortCircuit:true};
 return next(specifier,context);
}});
void test('Finance identifies company history, recovers a lost acknowledgement and keeps its correction separate',async()=>{
 assert.notEqual(process.env.HATSKALA_STAGING_NATIVE,'1','Requires fictional memory-only data, never a local staging database.');
 const f=await historicalRegisteredRecoveryFixture('platform');try{
 const opened=await openSellerRecovery(f.db,f.ctx('browser-history-open'),{kind:'refund',id:f.refundId,reason:'Review the actual historical source using the protected Finance and owner surfaces.'}),recoveryId=opened.id;
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 globalThis.recoveryUiDb=f.db;globalThis.recoveryUiActor='registered-owner';globalThis.recoveryUiAuthority=async(permission)=>{try{const authority=await staffMutationGuard(f.db,globalThis.recoveryUiActor,permission as never,Error);return {id:globalThis.recoveryUiActor,role:authority.role};}catch{return null;}};
 const sellerApi=await import('../app/api/seller/recoveries/route'),staffApi=await import('../app/api/admin/recoveries/route');
 await getSellerRecoveryStatement(f.db,'registered-owner',recoveryId);
 const styleSource=(await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/commerce/recovery-action.tsx';\n@source '../components/commerce/recovery-repayments.tsx';\n@source '../components/seller/recovery-statement.tsx';\n@source '../components/admin/seller-recovery-review.tsx';\n@source '../components/admin/recovery-history-review.tsx';");
 const styles=(await postcss([tailwind()]).process(styleSource,{from:resolve('app/globals.css')})).css;
 const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{RecoveryStatement}from'./components/seller/recovery-statement';import{SellerRecoveryReview}from'./components/admin/seller-recovery-review';function App(){const[w,setW]=useState(null),staff=location.pathname.includes('staff');useEffect(()=>{const refresh=async()=>setW(await(await fetch(staff?'/workspace/staff':'/workspace/seller')).json());refresh();window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return w?staff?<SellerRecoveryReview workspace={w} actorId="reviewer"/>:<RecoveryStatement statement={w} actorId="registered-owner"/>:null};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'recovery-fixture-framework',setup(builder){builder.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path.endsWith('navigation')?"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}":"import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}",loader:'js',resolveDir:process.cwd()}));}}]})).outputFiles[0].text;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const context=await browser.newContext(),origin='http://localhost:3018';let posts=0;
 // Every request is fulfilled in-process or aborted. No server is started and no network request reaches the canonical preview.
 await context.route('**/*',async(route:{request():{url():string;postData():string|null;method():string};fulfill(value:unknown):Promise<void>;abort():Promise<void>})=>{
  const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/fixture-recovery-'))return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
  if(url.pathname==='/workspace/seller'||url.pathname==='/workspace/staff')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('staff')?await getRecoveryFinanceWorkspace(f.db,'reviewer',recoveryId):await getSellerRecoveryStatement(f.db,'registered-owner',recoveryId))});
  const api=url.pathname==='/api/seller/recoveries'?sellerApi:url.pathname==='/api/admin/recoveries'?staffApi:null;if(!api)return route.abort();
  const request=new Request(url,{method:incoming.method(),headers:{Origin:origin,'Content-Type':'application/json'},...(incoming.method()==='POST'?{body:incoming.postData()!}:{})}),response=incoming.method()==='POST'?await api.POST(request):await api.GET(request);
  if(response.status>=400)console.error('Fictional recovery response',response.status,incoming.method()==='POST'?JSON.parse(incoming.postData()!).action:'recover',await response.clone().text());
  if(incoming.method()==='POST'){posts++;assert.equal(response.status,200);if(posts===1)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional lost historical acknowledgement"}'});}
  return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 });
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));
 const show=async(mode:'seller'|'staff')=>{globalThis.recoveryUiActor=mode==='seller'?'registered-owner':'reviewer';await page.goto(origin+'/fixture-recovery-'+mode);await page.addStyleTag({content:styles});await page.addScriptTag({content:code});await page.getByRole('heading',{name:mode==='seller'?'Your recovery statement':'Seller recovery',exact:true}).waitFor();};
 const open=async(label:string)=>{await page.locator('summary').filter({hasText:label}).click();return page.getByRole('form',{name:label,exact:true});};
 await show('staff');
 const form=await open('Identify original company-cost deduction');
 await form.getByLabel('Original company-cost deduction (NPR)').fill((f.originalPaidPaisa/100).toFixed(2));
 await form.getByLabel('Original deduction evidence reference').fill('FICTIONAL-PRIVATE-BROWSER-HISTORY-EVIDENCE');
 await form.getByLabel('Private historical attribution reason').fill('FICTIONAL-PRIVATE-BROWSER-HISTORY-REASON: attribute only the actual original deduction with the native bank proof.');
 await form.getByLabel('Historical review explained to the seller').fill('The original company-owned deduction is identified. Its correction remains under Finance review.');
 await form.getByRole('button',{name:'Identify original company-cost deduction',exact:true}).click();
 await page.getByRole('button',{name:'Check saved outcome',exact:true}).waitFor();
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_company_deductions').get()!.n,1);
 await page.getByRole('button',{name:'Check saved outcome',exact:true}).click();await form.waitFor({state:'detached'});
 assert.equal(posts,1);assert.equal(f.sqlite.prepare('SELECT approved_cap_paisa FROM seller_recovery_cases WHERE id=?').get(recoveryId)!.approved_cap_paisa,0);
 assert.equal(await page.locator('summary').filter({hasText:'Correct original company-owned charge'}).count(),1);
 assert.equal(await page.locator('summary').filter({hasText:'Complete historical reconciliation'}).count(),0);
 await show('seller');await page.setViewportSize({width:390,height:1100});
 await page.getByText('Original payout deductions confirmed',{exact:true}).waitFor();
 assert.equal(await page.getByText('Eligible earnings applied',{exact:true}).count(),0);
 await page.locator('summary').filter({hasText:'Statement history'}).click();
 await page.getByText('The original company-owned deduction is identified. Its correction remains under Finance review.',{exact:true}).waitFor();
 assert.equal(await page.getByText('FICTIONAL-PRIVATE-BROWSER-HISTORY',{exact:false}).count(),0);
 assert.equal(await page.getByText('Propose a repayment arrangement',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await page.screenshot({path:'.test-artifacts/t27/recovery-company-history-owner-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 }finally{await browser.close();}
 }finally{f.dispose();}
});
