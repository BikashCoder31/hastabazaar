import type {Route as BrowserRoute} from 'playwright-core';
import './helpers/seller-registration-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {sellerRegistrationScopeFixture,registrationScopeOrigin as origin,type RegistrationScopeResponse} from './helpers/seller-registration-scope-fixture';
import {readSellerDraft} from '../lib/sellers/draft-store';
import {draftFieldNames} from '../lib/sellers/draft-contract';
import {getManagedMakerApplicationTerms} from '../lib/db/repositories/managed-maker-details';
import {getRegisteredSellerTerms} from '../lib/db/repositories/marketplace-settings';
import {MANAGED_SUPPLIER_AGREEMENT_VERSION} from '../lib/sellers/managed-identity';
import {stubFixtureLink} from './helpers/browser-fixture-link';
import {verifySellerDocument} from '../lib/sellers/document-review';

void test('actual retained registration details and fresh drafts cannot adopt another account identity evidence',{timeout:180000},async()=>{
 await checkRegistrationInBrowser('account');
});

void test('new seller submission requires both terms in the browser',{timeout:180000},async()=>{
 await checkRegistrationInBrowser('terms');
});

void test('seller document upload explains a rejected PDF and lets the seller replace it for review',{timeout:30000},async()=>{
 await checkRegistrationInBrowser('documents');
});

async function checkRegistrationInBrowser(check: 'account' | 'terms' | 'documents') {
 const f=await sellerRegistrationScopeFixture();let release=()=>{};try{
  const {requireExistingCustomerApi}=await import('../lib/auth/customer');
  const forms=await import('../app/api/forms/[formId]/route'),drafts=await import('../app/api/seller-applications/draft/route');
  let mode:'details'|'new'='details',holdA=false,loseBUpdate=false,updates=0,held=()=>{};let gate=Promise.resolve();
  const managedTerms=await getManagedMakerApplicationTerms(f.db,Date.now(),MANAGED_SUPPLIER_AGREEMENT_VERSION);
  const {context:termsContext,percent}=await getRegisteredSellerTerms(f.db);
  const props=async()=>{const owner=await requireExistingCustomerApi();return{accountId:owner.userId,accountEmail:owner.email,mode,...(mode==='new'?{managedTerms,registeredTerms:{context:termsContext,percent}}:{})};};
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{createRoot}from'react-dom/client';import{SellerRegistrationDetails,SellerRegistrationIntakeForm}from'./components/seller/seller-registration-intake-form';const root=createRoot(document.getElementById('root'));function render(p){root.render(<main><output data-testid='owner'>{p.accountId}</output>{p.mode==='new'?<SellerRegistrationIntakeForm {...p}/>:<SellerRegistrationDetails {...p}/>}</main>)}window.refreshOwner=async()=>render(await(await fetch('/fixture-props')).json());render(window.__BOOT__);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-only',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export function useRouter(){return{refresh(){window.__refreshes=(window.__refreshes||0)+1},push(){window.__pushes=(window.__pushes||0)+1}}}'}));}}]})).outputFiles[0].text;
  const{chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const context=await browser.newContext(),errors:string[]=[],failures:string[]=[];
   await context.route('**/*',async(route:BrowserRoute)=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'text/javascript',body:code});
    if(url.pathname==='/fixture-props')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await props())});
    if(url.pathname==='/registration-fixture')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><style>[data-slot="checkbox"] { display: inline-flex; inline-size: 16px; block-size: 16px; }</style><link rel="icon" href="data:,"></head><body><div id="root"></div><script>window.__BOOT__='+JSON.stringify(await props()).replaceAll('<','\\u003c')+'</script><script src="/fixture.js"></script></body></html>'});
    const request=new Request(url,{method:incoming.method(),headers:{...incoming.headers(),origin},...(incoming.postDataBuffer()?{body:Uint8Array.from(incoming.postDataBuffer()??[]).buffer}: {})});let response:Response;
    if(url.pathname.startsWith('/api/forms/'))response=await forms.GET(request,{params:Promise.resolve({formId:decodeURIComponent(url.pathname.slice('/api/forms/'.length))})});
    else if(url.pathname==='/api/seller-registrations'){
     if(request.method==='GET'){const own=globalThis.registrationScopeIdentity?.userId;response=await f.api.GET(request);if(holdA&&own==='subject-registration-a'){holdA=false;held();await gate;}}
     else { response=await f.api[request.method==='PUT'?'PUT':'POST'](request); if(request.method==='PUT'&&response.ok){updates++;if(loseBUpdate){loseBUpdate=false;return route.abort('failed');}} }
    }else if(url.pathname==='/api/seller-applications/draft')response=await drafts[request.method==='PUT'?'PUT':request.method==='DELETE'?'DELETE':'GET'](request);
    else return route.abort();
    return route.fulfill({status:response.status,contentType:response.headers.get('content-type')??'application/json',body:await response.text()});
   });
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',(error:Error)=>errors.push(error.message));
   const reference=()=>page.locator('input[name="governmentIdDescription"]');
   if(check==='documents'){
    f.select('registration-a');
    const sellerId = String(f.sqlite.prepare("SELECT id FROM seller_profiles WHERE user_id='registration-a'").get()!.id);
    f.sqlite.prepare("UPDATE seller_profiles SET status='under_review' WHERE id=?").run(sellerId);
    f.sqlite.prepare("UPDATE seller_participation_profiles SET application_stage='approved_for_activation' WHERE seller_id=?").run(sellerId);
    await page.goto(origin+'/registration-fixture');
    await page.getByText('Progress saves automatically to your account.',{exact:true}).waitFor();
    const submit = page.getByRole('button',{name:'Submit updated details for review',exact:true});
    const identity = page.locator('input[name="representativeIdentity"]');
    await identity.setInputFiles({name:'broken-test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nInvalid fixture')});
    await submit.click();
    await page.getByRole('alert').filter({hasText:'Government-issued identity document: Use a valid, unencrypted PDF'}).waitFor();
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_documents WHERE seller_id=?').get(sellerId)?.n,0);

    const sample = async (name: string, text: string) => {
     const pdf = await PDFDocument.create();
     pdf.addPage([300,400]).drawText(text);
     return {name,mimeType:'application/pdf',buffer:Buffer.from(await pdf.save({useObjectStreams:false}))};
    };
    await identity.setInputFiles(await sample('test-identity.pdf','SAMPLE IDENTITY FOR TESTING'));
    await page.locator('input[name="personalPanCertificate"]').setInputFiles(await sample('test-pan.pdf','SAMPLE PAN FOR TESTING'));
    await submit.click();
    await page.getByRole('heading',{name:'Registration details saved',exact:true}).waitFor();

    const documents = f.sqlite.prepare('SELECT id,kind,status FROM seller_documents WHERE seller_id=? ORDER BY kind').all(sellerId);
    assert.deepEqual(documents.map(row=>[row.kind,row.status]),[['pan_certificate','pending'],['representative_identity','pending']]);
    for(const document of documents) {
     await verifySellerDocument(f.db,{sellerId,documentId:String(document.id),actorId:'reviewer',
      reason:'Review the exact fictional document for the local fixture.',now:Date.now()});
    }
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_documents WHERE seller_id=? AND status='verified'").get(sellerId)?.n,2);
    assert.equal(f.sqlite.prepare('SELECT application_stage FROM seller_participation_profiles WHERE seller_id=?').get(sellerId)?.application_stage,'approved_for_activation');
    assert.equal(await readSellerDraft(f.db,'registration-a'),null);
    assert.deepEqual(errors,[]);
    return;
   }
   if(check==='terms'){
    f.select('registration-c');
    mode='new';
    await page.goto(origin+'/registration-fixture');
    await page.getByText('Progress saves automatically to your account.',{exact:true}).waitFor();
    const submit=page.getByRole('button',{name:'Submit application',exact:true});
    const routeChoice=page.getByLabel('How you want to sell');
    const acknowledgment=page.locator('input[name="applicationAcknowledgement"]');
    const save=page.getByRole('button',{name:'Save progress now',exact:true});
    assert.equal(await submit.isDisabled(),true);
    assert.equal(await save.isEnabled(),true);
    await reference().fill('FICTIONAL-UNSUBMITTED-CITIZENSHIP');
    await save.click();
    await page.getByText('Progress saved to your account.',{exact:true}).waitFor();
    const savedDraft=await readSellerDraft(f.db,'registration-c');
    assert.equal(savedDraft?.answers.governmentIdDescription?.[0],'FICTIONAL-UNSUBMITTED-CITIZENSHIP');
    assert.equal(savedDraft?.answers.applicationAcknowledgement,undefined);
    assert.equal(await submit.isDisabled(),true);
    await page.getByRole('checkbox',{name:/I have read and explicitly accept/}).click();
    assert.equal(await submit.isDisabled(),true);
    await acknowledgment.check();
    assert.equal(await submit.isEnabled(),true);
    await routeChoice.selectOption('yes');
    assert.equal(await submit.isDisabled(),true);
    await acknowledgment.check();
    assert.equal(await submit.isDisabled(),true);
    assert.equal(await page.getByRole('link',{name:'Prohibited & Restricted Products Policy'}).getAttribute('href'),'/prohibited-products');
    const marketplaceAgreement=page.locator('input[name="acceptedTerms"]');
    await marketplaceAgreement.check();
    assert.equal(await submit.isEnabled(),true);
    await marketplaceAgreement.uncheck();
    assert.equal(await submit.isDisabled(),true);
    await routeChoice.selectOption('no');
    assert.equal(await acknowledgment.isChecked(),false);
    assert.equal(await submit.isDisabled(),true);
    assert.deepEqual(errors,[]);
    return;
   }
   f.select('registration-a');await page.goto(origin+'/registration-fixture');await reference().waitFor();assert.equal(await reference().inputValue(),'PRIVATE-ORIGINAL-PASSPORT-A');
   f.select('registration-b');await page.evaluate(()=> (window as unknown as {refreshOwner:()=>void}).refreshOwner());await page.getByTestId('owner').getByText('registration-b',{exact:true}).waitFor();await reference().waitFor();
   if(await reference().inputValue()!=='PRIVATE-ORIGINAL-NATIONAL-ID-B')failures.push('new B props adopted A private registration evidence');
   await page.getByRole('button',{name:'Save progress now',exact:true}).click();await page.getByText('Progress saved to your account.',{exact:true}).waitFor();
   const b=await readSellerDraft(f.db,'registration-b');if(b?.answers.governmentIdDescription?.[0]!=='PRIVATE-ORIGINAL-NATIONAL-ID-B')failures.push('a first B draft legitimately accepted leaked A defaults under B identity');
   assert.ok(b);const cleared=await drafts.DELETE(new Request(origin+'/api/seller-applications/draft',{method:'DELETE',headers:{origin,'X-Draft-Account':'registration-b','If-Match':b.revision}}));assert.equal(cleared.status,200,await cleared.text());
   // A real older owned draft uses passport while the current registration uses national ID.
   // Hidden route state must restore that exact type, and a lost successful native receipt
   // must replay the same update instead of creating another revision.
   const historical=new FormData();historical.set('payload',JSON.stringify({revision:null,changeId:crypto.randomUUID(),attemptId:'registration_v1_'+crypto.randomUUID(),formVersion:1,answers:{...b.answers,governmentIdType:['passport'],governmentIdDescription:['PRIVATE-LEGACY-DRAFT-PASSPORT-B']},files:{}}));
   const legacy=await drafts.PUT(new Request(origin+'/api/seller-applications/draft',{method:'PUT',headers:{origin,'X-Draft-Account':'registration-b'},body:historical}));assert.equal(legacy.status,200,await legacy.text());
   await page.reload();await page.getByText(/Saved progress restored/).waitFor();assert.equal(await page.locator('[name="governmentIdType"]').inputValue(),'passport');assert.equal(await reference().inputValue(),'PRIVATE-LEGACY-DRAFT-PASSPORT-B');await page.getByText('Recorded passport number',{exact:true}).waitFor();
   loseBUpdate=true;await page.getByRole('button',{name:'Submit updated details for review',exact:true}).click();await page.getByRole('alert').filter({hasText:/fetch|confirm|retry/i}).waitFor();
   const readB=async()=>{const response=await f.api.GET(new Request(origin+'/api/seller-registrations',{headers:{'X-Hastabazaar-Actor':'registration-b'}}));assert.equal(response.status,200);return(await response.json() as RegistrationScopeResponse).registration;};
   const committed=await readB();assert.equal(committed.version,2);assert.equal(committed.answers.governmentIdType[0],'passport');assert.equal(committed.answers.governmentIdDescription[0],'PRIVATE-LEGACY-DRAFT-PASSPORT-B');
   await page.getByRole('button',{name:'Submit updated details for review',exact:true}).click();await page.getByRole('heading',{name:'Registration details saved',exact:true}).waitFor();assert.equal(updates,2);assert.equal((await readB()).version,2,'exact successful receipt replay does not write a second revision');
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='registration-b' AND role='seller'").get()!.n,0,'saved optional details do not activate selling');
   // A permitted native A read can arrive late; it must never become B's current details.
   f.select('registration-a');const ready=new Promise<void>(resolve=>{held=resolve});gate=new Promise<void>(resolve=>{release=resolve});holdA=true;await page.goto(origin+'/registration-fixture');await ready;
   f.select('registration-b');await page.evaluate(()=> (window as unknown as {refreshOwner:()=>void}).refreshOwner());await page.getByTestId('owner').getByText('registration-b',{exact:true}).waitFor();release();await reference().waitFor();await page.waitForTimeout(100);
   if(await reference().inputValue()==='PRIVATE-ORIGINAL-PASSPORT-A')failures.push('late native A read became B private form data');
   const draftAnswers=Object.fromEntries(Object.entries(committed.answers).filter(([key])=>draftFieldNames.has(key)));
   const unspecified=new FormData();unspecified.set('payload',JSON.stringify({revision:null,changeId:crypto.randomUUID(),attemptId:'registration_v2_'+crypto.randomUUID(),formVersion:1,answers:{...draftAnswers,governmentIdType:[''],governmentIdDescription:['PRIVATE-UNSPECIFIED-HISTORICAL-REFERENCE-B']},files:{}}));
   const unspecifiedSaved=await drafts.PUT(new Request(origin+'/api/seller-applications/draft',{method:'PUT',headers:{origin,'X-Draft-Account':'registration-b'},body:unspecified}));assert.equal(unspecifiedSaved.status,200,await unspecifiedSaved.clone().text());const unknownReceipt=await readSellerDraft(f.db,'registration-b');assert.ok(unknownReceipt);
   await page.reload();await page.getByText(/Saved progress restored/).waitFor();assert.equal(await page.locator('[name="governmentIdType"]').inputValue(),'');assert.equal(await reference().inputValue(),'PRIVATE-UNSPECIFIED-HISTORICAL-REFERENCE-B');await page.getByText('Recorded identity number',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Use citizenship number instead',exact:true}).click();assert.equal(await reference().inputValue(),'');assert.equal(await page.locator('[name="governmentIdType"]').inputValue(),'citizenship');
   f.select('registration-c');mode='new';await page.evaluate(()=> (window as unknown as {refreshOwner:()=>void}).refreshOwner());await page.getByTestId('owner').getByText('registration-c',{exact:true}).waitFor();await reference().waitFor();
   if(await page.locator('select[name="governmentIdType"]').count())failures.push('new intake still asks a generic government identity type');
   const type=await page.locator('[name="governmentIdType"]').inputValue();if(type!=='citizenship')failures.push('new citizenship intake does not retain explicit citizenship type');
   // Even before new props arrive, the native first-write guard rejects the old account.
   await page.getByText('Progress saves automatically to your account.',{exact:true}).waitFor();
   await reference().fill('PRIVATE-UNSAVED-C');f.select('registration-b');await page.getByRole('button',{name:'Save progress now',exact:true}).click();await page.getByRole('alert').filter({hasText:/account access changed/i}).waitFor();assert.equal(await reference().count(),0);assert.equal(await readSellerDraft(f.db,'registration-c'),null);assert.equal((await readSellerDraft(f.db,'registration-b'))?.revision,unknownReceipt.revision,'denied C write cannot alter B retained draft');
   await mkdir('.test-artifacts/t31',{recursive:true});await page.screenshot({path:'.test-artifacts/t31/seller-registration-current-scope.png',fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  }finally{release();await browser.close();}
 }finally{globalThis.registrationScopeIdentity=null;f.dispose();}
}
