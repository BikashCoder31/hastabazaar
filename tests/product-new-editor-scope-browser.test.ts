/** Actual optional editor, form definition and native workspace APIs; intercepted network only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {getCategoryDetailGroups} from '../lib/products/category-contracts';
import {stubFixtureLink,stubFixtureImage} from './helpers/browser-fixture-link';
declare global {var newEditorDb:D1Database;var newEditorActor:string;interface Window{__setProductOwner:(actor:string)=>void;}}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.newEditorDb},HASTABAZAAR_RUNTIME_ENV:"test",HASTABAZAAR_RELEASE_ID:"fictional-new-product"}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return{userId:globalThis.newEditorActor}};export async function requireAuthenticatedUser(){return{userId:globalThis.newEditorActor}}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(){throw new Error("Unexpected fixture redirect")}',shortCircuit:true};
 return next(specifier,context);
}});
type FixtureRoute={request():{url():string;method():string;headers():Record<string,string>;postData():string|null};fulfill(input:{status?:number;contentType?:string;body:string}):Promise<void>};

void test('actual new editor hides A private fields on old-tab B denial, then rechecks A and retries its original optional save once',{timeout:120000},async()=>{
 const f=await completeVersionFixture(Date.now()-1000);try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));globalThis.newEditorDb=f.db;globalThis.newEditorActor='registered-owner';
  const workspace=await import('../app/api/seller/product-intakes/workspace/route'),forms=await import('../app/api/forms/[formId]/route'),publications=await import('../app/api/seller/product-publications/route'),category=await getCategoryDetailGroups(f.db,null),before=f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_drafts').get()!.n;
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ProductIntakeWorkspace}from'./components/seller/product-intake-workspace';function App(){const[actor,setActor]=useState('registered-owner');window.__setProductOwner=setActor;return <main className='mx-auto max-w-5xl p-5'><ProductIntakeWorkspace actorId={actor} initial={null} categories={[]} occasions={[]} initialCategoryModel={${JSON.stringify(category)}}/></main>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-boundaries',setup(b){stubFixtureLink(b);stubFixtureImage(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){},push(){}}}'}));}}]})).outputFiles[0].text;
  const css=(await postcss([tailwind()]).process((await readFile('app/globals.css','utf8')).replace("@import 'tailwindcss';","@import 'tailwindcss' source(none);\n@source '../components/seller';\n@source '../components/forms';\n@source '../components/products';\n@source inline('mx-auto max-w-5xl p-5');"),{from:resolve('app/globals.css')})).css;
  await mkdir('.test-artifacts/t31',{recursive:true});const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors:string[]=[],bodies:string[]=[],statuses:number[]=[];let release=()=>{},started=false,first=true;const gate=new Promise<void>(resolve=>release=resolve),origin='https://new-product-scope.test';page.on('pageerror',(error:Error)=>errors.push(error.message));
   await context.route(origin+'/**',async(route:FixtureRoute)=>{const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:code});
    if(url.pathname.startsWith('/api/')){
     const headers=new Headers(request.headers());headers.set('origin',origin);const native=new Request(request.url(),{method:request.method(),headers,...(request.method()==='POST'?{body:request.postData()??''}:{})});let response:Response;
     if(url.pathname==='/api/seller/product-intakes/workspace'){
      if(request.method()==='POST'){bodies.push(request.postData()??'');if(first){first=false;started=true;await gate;}response=await workspace.POST(native);statuses.push(response.status);}else response=await workspace.GET(native);
     }else if(url.pathname==='/api/forms/seller.product-submission')response=await forms.GET(native,{params:Promise.resolve({formId:'seller.product-submission'})});
     else if(url.pathname==='/api/seller/product-publications')response=await publications.GET(native);
     else response=Response.json({error:'Fixture route unavailable.'},{status:404});
     return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
    }
    return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/bundle.js"></script>'});
   });
   try{
    await page.goto(origin+'/editor');await page.getByLabel('Product name',{exact:true}).first().fill('PRIVATE-A unsaved optional product facts');
    for(let count=0;count<200&&!started;count++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(started,true,'Actual native autosave did not start');
    globalThis.newEditorActor='maker-user';release();await page.getByRole('heading',{name:'Current Product access is unavailable'}).waitFor();assert.equal(await page.getByLabel('Product name',{exact:true}).count(),0);assert.doesNotMatch(await page.locator('main').innerText(),/PRIVATE-A/);assert.equal(statuses[0],403);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_drafts').get()!.n,before);
    globalThis.newEditorActor='registered-owner';await page.getByRole('button',{name:'Check current access and original outcome'}).click();assert.equal(await page.getByLabel('Product name',{exact:true}).first().inputValue(),'PRIVATE-A unsaved optional product facts');
    await page.getByRole('button',{name:'Retry same save',exact:true}).click();await page.getByRole('status').filter({hasText:/^Saved$/}).waitFor();assert.equal(bodies.length,2);assert.equal(bodies[1],bodies[0]);assert.deepEqual(statuses,[403,200]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_intake_drafts').get()!.n,Number(before)+1);
    globalThis.newEditorActor='maker-user';await page.evaluate(()=>window.__setProductOwner('maker-user'));assert.equal(await page.getByLabel('Product name',{exact:true}).first().inputValue(),'');await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.test-artifacts/t31/product-new-editor-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
   }finally{release();await context.close();}
  }finally{await browser.close();}
 }finally{f.dispose();}
});
