import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {readPreparationWorkspace} from '../lib/orders/response-workspace';
import {handlePreparationCommand} from '../lib/orders/response-http';

void test('browser resumes an exact scoped delay report after a lost acknowledgement and reload',async()=>{
 const f=await actionableOrderFixture({secondOffer:true});try{
  const workspace=await readPreparationWorkspace(f.db,'registered-owner',f.orderId,'seller');assert.ok(workspace);
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{OrderPreparationWorkspace}from'./components/commerce/order-preparation-workspace';function App(){const[w,setW]=useState(${JSON.stringify(workspace)});useEffect(()=>{const refresh=async()=>setW(await(await fetch('/workspace')).json());window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return <OrderPreparationWorkspace workspace={w}/>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-navigation',setup(builder){builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}",loader:'js'}));}}]})).outputFiles[0].text;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const context=await browser.newContext(),bodies:string[]=[];let lost=true;const origin='https://preparation-browser.test';
   await context.route('**/*',async(route:{request():{url():string;postData():string|null;method():string;headers():Record<string,string>};fulfill(value:unknown):Promise<void>;abort():Promise<void>})=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/seller/preparation')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
    if(url.pathname==='/workspace')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await readPreparationWorkspace(f.db,'registered-owner',f.orderId,'seller'))});
    if(url.pathname!=='/api/seller/order-responses')return route.abort();
    if(incoming.method()==='POST')bodies.push(incoming.postData()!);const response=await handlePreparationCommand(new Request(url,{method:incoming.method(),headers:{...incoming.headers(),origin,'content-type':'application/json'},...(incoming.postData()?{body:incoming.postData()!}:{})}),f.db,'registered-owner','seller');
    if(lost&&response.ok){lost=false;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Fictional lost acknowledgement"}'});}
    return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   });
   const page=await context.newPage();await page.goto(origin+'/seller/preparation');await page.addScriptTag({content:code});
   await page.getByRole('checkbox').nth(1).check();await page.getByLabel('Factual detail for staff',{exact:true}).fill('Fictional selected offer has a material preparation delay.');
   await page.getByRole('button',{name:'Send preparation issue',exact:true}).click();await page.getByText('Fictional lost acknowledgement',{exact:true}).waitFor();
   const stored=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))));assert.doesNotMatch(stored,/Fictional selected offer|expectedRevision|detail|input/);
   await page.reload();await page.addScriptTag({content:code});await page.getByRole('button',{name:'Check saved outcome',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Send preparation issue',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'Check saved outcome',exact:true}).click();await page.getByText('Saved. The current order and case history have been refreshed.',{exact:true}).waitFor();
   assert.equal(bodies.length,1,'Reload recovery reads the original native receipt without replaying private content.');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_response_cases').get()!.n,1);
   assert.deepEqual(JSON.parse(String(f.sqlite.prepare('SELECT scope_json FROM order_response_cases').get()!.scope_json)),[workspace.portions[0].items[1].id]);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_items WHERE order_id=? AND fulfillment_status='confirmed'").get(f.orderId)!.n,2);
  }finally{await browser.close();}
 }finally{f.dispose();}
});
