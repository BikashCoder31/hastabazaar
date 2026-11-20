import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {refundPacketFixture} from './helpers/refund-funding-fixture';
import {getCustomerRefundWorkspace} from '../lib/payments/refund-workspace';

declare global{var refundBrowserDb:D1Database;var refundBrowserActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.refundBrowserDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/customer')return {url:'data:text/javascript,export class CustomerAuthorizationError extends Error{};export async function requireExistingCustomerApi(){return {userId:globalThis.refundBrowserActor}}',shortCircuit:true};
 return next(specifier,context);
}});

void test('private refund instructions recover a committed route after lost acknowledgement without retaining bank details in browser storage',async()=>{
 const f=await refundPacketFixture();try{
  globalThis.refundBrowserDb=f.db;globalThis.refundBrowserActor='customer';
  const token='FICTIONAL-REFUND-BROWSER-TOKEN',hash=createHash('sha256').update(token).digest('hex');
  f.sqlite.prepare('UPDATE user_sessions SET token_hash=? WHERE token_hash=?').run(hash,'FICTIONAL-PACKET-SESSION');
  const initial=(await getCustomerRefundWorkspace(f.db,'customer'))[0],routeApi=await import('../app/api/account/refunds/route');
  assert.doesNotMatch(JSON.stringify(initial),/FICTIONAL-PRIVATE-BENEFICIARY-EVIDENCE|TEST-REFUND-001|FICTIONAL-ACTUAL-FREE-COMPANY-FUNDS/);
  assert.deepEqual(await getCustomerRefundWorkspace(f.db,'foreign'),[]);
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{RefundDestinationForm}from'./components/commerce/refund-destination-form';function App(){const[row,setRow]=useState(${JSON.stringify(initial)});useEffect(()=>{const refresh=async()=>setRow(await(await fetch('/workspace')).json());window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return <RefundDestinationForm row={row} actorId="customer"/>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'refund-browser-framework',setup(builder){
   builder.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));
   builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path.endsWith('navigation')?"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}":"import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}",loader:'js',resolveDir:process.cwd()}));
  }}]})).outputFiles[0].text;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
   const context=await browser.newContext(),origin='https://refund-instructions.test';let posts=0,savedRequest='';
   await context.route('**/*',async(route:{request():{url():string;postData():string|null;method():string};fulfill(value:unknown):Promise<void>;abort():Promise<void>})=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/refunds')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
    if(url.pathname==='/workspace')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify((await getCustomerRefundWorkspace(f.db,'customer'))[0])});
    if(url.pathname!=='/api/account/refunds')return route.abort();
    const request=new Request(url,{method:incoming.method(),headers:{origin,cookie:'hastabazaar_session='+token,'content-type':'application/json'},...(incoming.method()==='POST'?{body:incoming.postData()!}:{})});
    const response=incoming.method()==='POST'?await routeApi.POST(request):await routeApi.GET(request);
    if(incoming.method()==='POST'){posts++;savedRequest=incoming.postData()!;if(response.ok)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional lost refund acknowledgement"}'});}
    return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   });
   const page=await context.newPage();await page.goto(origin+'/refunds');await page.addScriptTag({content:code});
   await page.getByLabel('Exact account holder',{exact:true}).fill('Fictional Private Beneficiary');await page.getByLabel('Bank',{exact:true}).fill('Fictional Private Bank');await page.getByLabel('Branch',{exact:true}).fill('Fictional Private Branch');await page.getByLabel('Account number',{exact:true}).fill('TEST-SECRET-NEW-001');
   await page.getByLabel('Protected account-holder evidence reference',{exact:true}).fill('FICTIONAL-PRIVATE-NEW-EVIDENCE');await page.getByLabel('My explicit authorization naming this recipient and account',{exact:true}).fill('I authorize this original refund to my specifically identified private account.');await page.getByLabel('Reason and any nominated-recipient relationship',{exact:true}).fill('My own revised original account has independently verifiable ownership evidence.');
   await page.getByRole('button',{name:'Save private instructions for verification',exact:true}).click();await page.getByText('Fictional lost refund acknowledgement',{exact:true}).waitFor();
   const stored=await page.evaluate(()=>({session:Object.values(sessionStorage),local:Object.values(localStorage)}));assert.equal(stored.session.length,1);assert.match(stored.session[0],/^[0-9a-f-]{36}$/i);assert.deepEqual(stored.local,[]);
   await page.reload();await page.addScriptTag({content:code});await page.getByRole('button',{name:'Check saved instructions',exact:true}).click();await page.getByText('The original action was recorded. Current case facts have been refreshed.',{exact:true}).waitFor();
   assert.equal(posts,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM refund_destination_versions WHERE obligation_id=?').get(f.obligationId)!.n,2);
   assert.equal(await page.getByLabel('Account number',{exact:true}).inputValue(),'');
   assert.match(await page.getByRole('link',{name:'Sign in again if requested'}).getAttribute('href'),/reauth=1/);
   const body=JSON.parse(savedRequest),send=(payload:unknown)=>routeApi.POST(new Request(origin+'/api/account/refunds',{method:'POST',headers:{origin,cookie:'hastabazaar_session='+token,'content-type':'application/json'},body:JSON.stringify(payload)}));
   assert.equal((await send(body)).status,200);assert.notEqual((await send({...body,authorization:'Changed content cannot reuse the committed request.'})).status,200);
   globalThis.refundBrowserActor='foreign';assert.equal((await send({...body,requestId:crypto.randomUUID()})).status,403);
   const denied=await routeApi.GET(new Request(origin+'/api/account/refunds?obligation='+f.obligationId+'&attempt='+body.requestId));assert.deepEqual(await denied.json(),{outcome:null});
  }finally{await browser.close();}
 }finally{f.dispose();}
});
