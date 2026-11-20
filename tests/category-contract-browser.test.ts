import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {getCategoryContractWorkspace,getProductIntakeDraft} from '../lib/products/category-contracts';
declare global{var categoryBrowserDb:D1Database;var categoryBrowserActor:string;var categoryOwnerActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.categoryBrowserDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){return{id:globalThis.categoryBrowserActor,role:"super_admin"}}',shortCircuit:true};
 if(specifier==='@/lib/auth/seller-center')return{url:'data:text/javascript,export class SellerCenterAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireSellerCenterApi(){return{userId:globalThis.categoryOwnerActor,sellerId:"registered"}}',shortCircuit:true};
 return next(specifier,context);
}});
const origin='https://category-fixture.test';
void test('category policy exact retry and discoverable optional detail groups preserve incomplete private intake through actual APIs',async()=>{
 const f=await completeVersionFixture();try{
  globalThis.categoryBrowserDb=f.db;globalThis.categoryBrowserActor='reviewer';globalThis.categoryOwnerActor='registered-owner';
  const policyApi=await import('../app/api/admin/category-contracts/route'),draftApi=await import('../app/api/seller/product-intakes/route'),categoryId=f.sqlite.prepare('SELECT id FROM categories LIMIT 1').get()?.id as string;
  const request=(path:string,body:unknown,from=origin)=>new Request(origin+path,{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)}),policyPath='/api/admin/category-contracts',draftPath='/api/seller/product-intakes';
  assert.equal((await policyApi.POST(request(policyPath,{},'https://foreign.test'))).status,403);
  const policyBody={categoryId,contract:{recommendedGroups:[],publicationRules:[],orderingRules:[],eligibilityRequirements:[],labels:{}},reason:'Review the exact fictional category contract',requestId:'forbidden-policy',expectedRevision:null};
  globalThis.categoryBrowserActor='delegate';assert.equal((await policyApi.POST(request(policyPath,policyBody))).status,403);globalThis.categoryBrowserActor='reviewer';
  const draftBody={draftId:null,categoryId,answers:{},requestId:'private-empty-intake',expectedRevision:null};
  const savedResponse=await draftApi.POST(request(draftPath,draftBody));assert.equal(savedResponse.status,200);const saved=await savedResponse.json() as {id:string;revision:number};
  globalThis.categoryOwnerActor='foreign';assert.equal((await draftApi.GET(new Request(origin+draftPath+'?draftId='+saved.id))).status,403);globalThis.categoryOwnerActor='registered-owner';
  assert.equal((await draftApi.POST(request(draftPath,{...draftBody,actorId:'reviewer'}))).status,400);
  const workspace=await getCategoryContractWorkspace(f.db,categoryId);
  const bundle=await build({stdin:{sourcefile:'category-browser.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CategoryPolicyManager}from'./components/admin/category-policy-manager';import{CategoryDetailGroups}from'./components/seller/category-detail-groups';function App(){const[answers,setAnswers]=useState({}),[message,setMessage]=useState('');return <><CategoryPolicyManager categories={[{id:${JSON.stringify(categoryId)},nameEn:'Fictional Category'}]} initial={${JSON.stringify(workspace)}}/><form aria-label="Private intake fixture" onSubmit={async event=>{event.preventDefault();const response=await fetch('${draftPath}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draftId:${JSON.stringify(saved.id)},categoryId:${JSON.stringify(categoryId)},answers,requestId:'browser-intake-save',expectedRevision:'0'})});setMessage(response.ok?'Private draft saved':(await response.json()).error)}}><CategoryDetailGroups model={${JSON.stringify(workspace.model)}} answers={answers} onChange={(field,value)=>setAnswers(previous=>({...previous,[field]:value}))} onHelp={()=>setMessage('Product help context selected')}/><button>Save incomplete private details</button><p role="status">{message}</p></form></>};createRoot(document.getElementById('root')!).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{const page=await browser.newPage(),bodies:string[]=[];
   await page.route('**/*',async(route:{request():{url():string;postData():string|null;method():string};fulfill(response:unknown):Promise<void>;abort():Promise<void>})=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/admin/catalog')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
    if(url.pathname===policyPath){if(incoming.method()==='GET'){const result=await policyApi.GET(new Request(incoming.url()));return route.fulfill({status:result.status,contentType:'application/json',body:await result.text()});}bodies.push(incoming.postData()!);const result=await policyApi.POST(request(policyPath,JSON.parse(incoming.postData()!)));return route.fulfill({status:bodies.length===1?503:result.status,contentType:'application/json',body:bodies.length===1?'{"error":"Fictional lost policy acknowledgement"}':await result.text()});}
    if(url.pathname===draftPath){const result=await draftApi.POST(request(draftPath,JSON.parse(incoming.postData()!)));return route.fulfill({status:result.status,contentType:'application/json',body:await result.text()});}return route.abort();
   });
   await page.goto(origin+'/admin/catalog');await page.addScriptTag({content:bundle.outputFiles[0].text});
   const policy=page.locator('#category-policy');await policy.getByRole('checkbox',{name:'Materials and origin',exact:true}).check();await policy.getByLabel('Policy review reason',{exact:true}).fill('Publish the reviewed fictional category while keeping seller intake optional');
   await policy.getByRole('button',{name:'Publish reviewed category requirements',exact:true}).click();await policy.getByText('Fictional lost policy acknowledgement',{exact:true}).waitFor();assert.equal(await policy.getByLabel('Policy review reason',{exact:true}).count(),1,JSON.stringify(await policy.locator('label').allTextContents()));assert.equal(await policy.getByLabel('Policy review reason',{exact:true}).isDisabled(),true);
   await policy.getByRole('button',{name:'Retry the same policy publication',exact:true}).click();await policy.getByText('Reviewed category requirements published. Existing answers and product history are retained.',{exact:true}).waitFor();assert.equal(bodies[0],bodies[1]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM category_template_versions WHERE category_id=?').get(categoryId)?.n,1);
   const intake=page.getByRole('form',{name:'Private intake fixture'});await intake.getByText('Materials and origin',{exact:true}).click();await intake.getByLabel('Materials',{exact:true}).fill('Cotton');await intake.getByLabel('Find a product detail').fill('warranty');assert.equal(await intake.getByLabel('Is a warranty offered?',{exact:true}).inputValue(),'');
   await intake.getByLabel('Find a product detail').fill('no-such-detail');await intake.getByText('No supported detail matches this search. Your saved entries remain intact.',{exact:true}).waitFor();await intake.getByLabel('Find a product detail').fill('');
   await intake.getByText('Price and draft availability',{exact:true}).click();await intake.getByLabel('Selling price (NPR)',{exact:true}).fill('12.');
   assert.equal(await intake.locator('[required]').count(),0);await intake.getByRole('button',{name:'Save incomplete private details',exact:true}).click();await intake.getByText('Private draft saved',{exact:true}).waitFor();
   const read=await getProductIntakeDraft(f.db,'registered-owner',saved.id);assert.equal(read.answers.materials,'Cotton');assert.equal(read.answers.price,'12.');assert.equal(read.guidance.publicationReady,false);assert.equal(read.answers.inventoryQuantity,undefined);
   assert.equal(await intake.getByRole('textbox',{name:'Product photos',exact:true}).count(),0);
   await intake.getByRole('button',{name:'Get help with this product',exact:true}).click();await intake.getByText('Product help context selected',{exact:true}).waitFor();
  }finally{await browser.close();}
 }finally{f.dispose();}
});
