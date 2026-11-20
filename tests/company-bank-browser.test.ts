import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {companyDetails} from '../lib/content/company-details';
import {getCompanyAccountWorkspace} from '../lib/payments/company-accounts';
import {FORM_REGISTRY} from '../lib/forms/registry';
declare global{var companyBrowserDb:D1Database;var companyBrowserActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.companyBrowserDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){return{id:globalThis.companyBrowserActor,role:"super_admin"}}',shortCircuit:true};
 return next(specifier,context);
}});
const origin='https://company-accounts.test';
void test('restricted account management preserves exact requests after lost acknowledgement and requires separate ownership verification and publication',async()=>{
 const f=await completeVersionFixture();try{
  globalThis.companyBrowserDb=f.db;globalThis.companyBrowserActor='reviewer';
  const api=await import('../app/api/admin/company-bank-accounts/route');
  const request=(body:unknown,from=origin)=>new Request(origin+'/api/admin/company-bank-accounts',{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await api.POST(request({},'https://foreign.test'))).status,403);
  globalThis.companyBrowserActor='delegate';assert.equal((await api.GET()).status,403);globalThis.companyBrowserActor='reviewer';
  assert.equal((await api.POST(request({actorId:'reviewer'}))).status,400);
  assert.equal(FORM_REGISTRY['system.company-bank-account'].capabilities.answerBehavior,'none');
  assert.ok(FORM_REGISTRY['system.company-bank-account'].baseFields.every(field=>field.capability==='protected'));
  const workspace=await getCompanyAccountWorkspace(f.db,'reviewer');
  const bundle=await build({stdin:{sourcefile:'company-browser.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import{CompanyBankAccounts}from'./components/admin/company-bank-accounts';function App(){const[workspace,setWorkspace]=useState(${JSON.stringify(workspace)});useEffect(()=>{const reload=async()=>{const response=await fetch('/api/admin/company-bank-accounts');if(response.ok)setWorkspace(await response.json())};window.addEventListener('fixture-refresh',reload);return()=>window.removeEventListener('fixture-refresh',reload)},[]);return <CompanyBankAccounts workspace={workspace}/>};createRoot(document.getElementById('root')!).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-navigation',setup(builder){builder.onResolve({filter:/^next\/navigation$/},args=>({path:args.path,namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function useRouter(){return{refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}`,loader:'js'}));}}]});
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{const page=await browser.newPage(),bodies:string[]=[];
   await page.route('**/*',async(route:{request():{url():string;postData():string|null;method():string};fulfill(response:unknown):Promise<void>;abort():Promise<void>})=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/admin/business-settings')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
    if(url.pathname==='/api/admin/company-bank-accounts'){
     if(incoming.method()==='GET'){const result=await api.GET();return route.fulfill({status:result.status,contentType:'application/json',body:await result.text()});}
     bodies.push(incoming.postData()!);const result=await api.POST(request(JSON.parse(incoming.postData()!)));
     return route.fulfill({status:bodies.length===1?503:result.status,contentType:'application/json',body:bodies.length===1?'{"error":"Fictional lost account acknowledgement"}':await result.text()});
    }return route.abort();
   });
   await page.goto(origin+'/admin/business-settings');await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.getByText('Add a company account',{exact:true}).click();const draft=page.locator('form').first();
   for(const [label,value]of [['Account holder',companyDetails.legalName],['Bank','Fictional Browser Bank'],['Branch','Fictional Branch'],['Account number','TEST-BROWSER-0001'],['Private ownership evidence reference','FICTIONAL-PRIVATE-BROWSER-PROOF'],['Reason','Prepare this fictional browser receiving account for review']])await draft.getByLabel(label,{exact:label!=='Private ownership evidence reference'}).fill(value);
   await draft.getByRole('button',{name:'Save private account draft',exact:true}).click();await page.getByText('Fictional lost account acknowledgement',{exact:true}).waitFor();
   assert.equal(await draft.getByLabel('Account number',{exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'Retry the same account action',exact:true}).click();await page.locator('article').waitFor();assert.equal(bodies[0],bodies[1]);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_payment_accounts').get()?.n,1);
   const account=page.locator('article');await account.getByText('Open restricted details and decision',{exact:true}).click();
   await account.getByLabel('Decision reason',{exact:true}).fill('Submit the exact fictional browser account for ownership review');await account.getByRole('button',{name:'Submit for ownership review',exact:true}).click();
   await account.getByLabel('Verification reference',{exact:true}).waitFor();assert.equal(f.sqlite.prepare('SELECT version_id FROM company_payment_account_current').get()?.version_id,null);
   await account.getByLabel('Verification reference',{exact:true}).fill('FICTIONAL-BROWSER-VERIFIED');await account.getByLabel('I checked the evidence and confirmed company ownership of this exact account.',{exact:true}).check();await account.getByLabel('I confirmed that this account supports the recorded NPR purpose.',{exact:true}).check();
   await account.getByLabel('Decision reason',{exact:true}).fill('Verify this fictional ownership evidence as the eligible preparing admin');await account.getByRole('button',{name:'Record ownership verification',exact:true}).click();
   await account.getByRole('button',{name:'Enable for new receiving instructions',exact:true}).waitFor();assert.equal(f.sqlite.prepare('SELECT version_id FROM company_payment_account_current').get()?.version_id,null);
   await account.getByLabel('Decision reason',{exact:true}).fill('Enable the verified fictional account for new order instructions');await account.getByRole('button',{name:'Enable for new receiving instructions',exact:true}).click();await account.getByText(/Enabled for receiving/).waitFor();
   await account.getByLabel('Decision reason',{exact:true}).fill('Retire the fictional account while keeping exact historical records');await account.getByRole('button',{name:'Retire this account version',exact:true}).click();await account.getByText('This version is inactive. Its history and issued instructions are retained.',{exact:true}).waitFor();
   assert.equal(f.sqlite.prepare('SELECT version_id FROM company_payment_account_current').get()?.version_id,null);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_payment_account_events').get()?.n,5);
  }finally{await browser.close();}
 }finally{f.dispose();}
});
