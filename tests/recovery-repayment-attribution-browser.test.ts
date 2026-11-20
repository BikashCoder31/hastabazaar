/** Uses only in-process fictional data; all browser requests are intercepted. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {registerHooks} from 'node:module';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {getSellerRecoveryReview} from '../lib/payments/seller-recovery';
import {getRecoveryRepaymentAttributionView,readOwnedRecoveryRepaymentAttributions} from '../lib/payments/recovery-repayment-attribution';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
declare global{var repaymentUiDb:D1Database;var repaymentUiActor:string;var repaymentUiAuthority:(permission:string)=>Promise<{id:string;role:string}|null>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.repaymentUiDb},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3018"}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{status=403};export async function requireStaffApi(permission){const actor=await globalThis.repaymentUiAuthority(permission);if(!actor)throw new StaffAuthorizationError("Current staff authority required.");return actor}',shortCircuit:true};
 return next(specifier,context);
}});
void test('browser retains one third-party attribution after a lost acknowledgement and shows only the public seller explanation',async()=>{
 assert.notEqual(process.env.HATSKALA_STAGING_NATIVE,'1');const f=await approvedSellerRecoveryFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const credit=await recordBankReceipt(f.db,f.ctx('browser-attribution-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-BROWSER-ATTRIBUTION-CREDIT',bankAt:Date.now()-1000,amountMinor:f.originalPaidPaisa+1000,currency:'NPR',payerReference:'FICTIONAL-PRIVATE-FACTUAL-PAYER',payerUserId:'customer',completedCreditConfirmed:true,conflictUserIds:[],evidenceReference:'FICTIONAL-PRIVATE-ACTUAL-CREDIT',reason:'Independently verify this fictional actual third-party bank credit before its case-specific attribution.'});
 globalThis.repaymentUiDb=f.db;globalThis.repaymentUiActor='reviewer';globalThis.repaymentUiAuthority=async(permission)=>{try{const a=await staffMutationGuard(f.db,globalThis.repaymentUiActor,permission as never,Error);return {id:globalThis.repaymentUiActor,role:a.role};}catch{return null;}};
 const staffApi=await import('../app/api/admin/recoveries/route');
 const styleSource=(await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/commerce/recovery-action.tsx';\n@source '../components/commerce/recovery-repayment-attribution.tsx';\n@source '../components/admin/refund-funding-review.tsx';");
 const styles=(await postcss([tailwind()]).process(styleSource,{from:resolve('app/globals.css')})).css;
 const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{FinanceRecoveryRepaymentAttribution,SellerRecoveryRepaymentAttributions}from'./components/commerce/recovery-repayment-attribution';function App(){const[w,setW]=useState(null),seller=location.pathname.endsWith('seller');useEffect(()=>{const refresh=async()=>setW(await(await fetch(seller?'/workspace/seller':'/workspace/staff')).json());refresh();window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return w?seller?<SellerRecoveryRepaymentAttributions attributions={w}/>:<FinanceRecoveryRepaymentAttribution {...w} actorId="reviewer"/>:null}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-framework',setup(builder){builder.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path.endsWith('navigation')?"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}":"import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}",loader:'js',resolveDir:process.cwd()}));}}]})).outputFiles[0].text;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const context=await browser.newContext(),origin='http://localhost:3018';let posts=0;
 await context.route('**/*',async(route:{request():{url():string;postData():string|null;method():string};fulfill(value:unknown):Promise<void>;abort():Promise<void>})=>{const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
 if(url.pathname.startsWith('/fixture-attribution-'))return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
 if(url.pathname==='/workspace/staff'){const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),view=await getRecoveryRepaymentAttributionView(f.db,'reviewer',f.recoveryId);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({caseId:f.recoveryId,caseRevision:review.case.revision,reviewDigest:review.reviewDigest,receipts:view.receipts.filter(r=>r.id===credit.id)})});}
 if(url.pathname==='/workspace/seller')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await readOwnedRecoveryRepaymentAttributions(f.db,'registered-owner',f.recoveryId))});
 if(url.pathname!=='/api/admin/recoveries')return route.abort();const request=new Request(url,{method:incoming.method(),headers:{Origin:origin,'Content-Type':'application/json'},...(incoming.method()==='POST'?{body:incoming.postData()!}:{})}),response=incoming.method()==='POST'?await staffApi.POST(request):await staffApi.GET(request);assert.equal(response.status,200,await response.clone().text());
 if(incoming.method()==='POST'&&++posts===1)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional lost attribution acknowledgement"}'});
 return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});});
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));
 await page.goto(origin+'/fixture-attribution-staff');await page.addStyleTag({content:styles});await page.addScriptTag({content:code});await page.getByRole('heading',{name:'Actual repayment payer attribution and excess'}).waitFor();
 await page.locator('summary').filter({hasText:'Approve evidence for this case'}).click();const form=page.getByRole('form',{name:'Approve evidence for this case',exact:true});
 await form.getByLabel('Maximum amount attributable to this recovery (NPR)').fill((f.originalPaidPaisa/100).toFixed(2));await form.getByLabel('Actual payer and case-specific evidence reference').fill('FICTIONAL-PRIVATE-CASE-ATTRIBUTION');await form.getByLabel('Private attribution decision and reason').fill('FICTIONAL-PRIVATE-ATTRIBUTION-REASON: retain actual payer evidence for this exact original recovery only.');await form.getByLabel('Explanation for the seller').fill('Actual money is reviewed for this case. Only separately approved allocations reduce your balance.');await form.getByRole('button',{name:'Approve evidence for this case',exact:true}).click();
 await page.getByRole('button',{name:'Check saved outcome',exact:true}).waitFor();assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_repayment_attributions').get()!.n,1);await page.getByRole('button',{name:'Check saved outcome',exact:true}).click();await form.waitFor({state:'detached'});assert.equal(posts,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_allocations').get()!.n,0);
 await page.screenshot({path:'C:/Users/abinash/.codex/visualizations/2026/11/01/01a19508-ad18-73f3-b022-509338dfbde9/repayment-attribution-finance.png',fullPage:true});
 await page.goto(origin+'/fixture-attribution-seller');await page.addStyleTag({content:styles});await page.addScriptTag({content:code});await page.getByRole('heading',{name:'Reviewed repayment attribution'}).waitFor();await page.setViewportSize({width:390,height:900});await page.getByText('Actual money is reviewed for this case. Only separately approved allocations reduce your balance.',{exact:true}).waitFor();assert.equal(await page.getByText('FICTIONAL-PRIVATE-',{exact:false}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.screenshot({path:'C:/Users/abinash/.codex/visualizations/2026/11/01/01a19508-ad18-73f3-b022-509338dfbde9/repayment-attribution-seller-mobile.png',fullPage:true});
 await context.close();
 }finally{await browser.close();}
 }finally{f.dispose();}
});
