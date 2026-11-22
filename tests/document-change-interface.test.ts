import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { build } from 'esbuild';
import { PNG } from 'pngjs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { requestDocumentChange, verifySellerDocument } from '../lib/sellers/document-review';
import { sellerDocumentWorkspace } from '../lib/sellers/document-workspace';
import { getSellerDocumentForStaff } from '../lib/db/repositories/seller-applications';
import { listNotifications } from '../lib/db/repositories/operations';
import {privateBankWorkspace,sellerBankState,submitSellerBankDetails} from '../lib/sellers/bank-details';

declare global {var documentTestDb:D1Database;var documentTestIdentity:{userId:string}|null;var documentTestStaff:{id:string;role:string;authSubject?:string};var documentTestBucket:R2Bucket;var documentTestReact:typeof React;}
globalThis.documentTestReact=React;
registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.documentTestDb},get MEDIA(){return globalThis.documentTestBucket}}',shortCircuit:true};
  if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.documentTestIdentity};export async function requireAuthenticatedUser(){return globalThis.documentTestIdentity}',shortCircuit:true};
  if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(url){throw new Error(url)};export function useRouter(){return{refresh(){}}}',shortCircuit:true};
  if(specifier==='next/link')return{url:'data:text/javascript,export default function Link({children,...props}){return globalThis.documentTestReact.createElement("a",props,children)}',shortCircuit:true};
  if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){return globalThis.documentTestStaff}',shortCircuit:true};
  return next(specifier,context);
}});
const origin='https://documents.test';
const jsonRequest=(path:string,body:unknown,requestOrigin=origin)=>new Request(origin+path,{method:'POST',headers:{origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function fixture(){
  const f=await completeVersionFixture();f.sqlite.exec("UPDATE users SET auth_subject='maker-user' WHERE id='maker-user'");
  globalThis.documentTestDb=f.db;globalThis.documentTestIdentity={userId:'maker-user'};globalThis.documentTestStaff={id:'reviewer',role:'super_admin',authSubject:'reviewer'};
  const objects=new Map<string,ArrayBuffer>();
  globalThis.documentTestBucket={async put(key:string,bytes:ArrayBuffer){objects.set(key,bytes);return{};},async get(key:string){const bytes=objects.get(key);return bytes?{body:bytes,httpEtag:'fixture'}:null;}} as unknown as R2Bucket;
  const documentId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id);
  await verifySellerDocument(f.db,{sellerId:'maker',documentId,actorId:'reviewer',reason:'Original fictional evidence reviewed',now:f.now});
  return{...f,documentId,objects};
}

void test('actual document APIs retain one owned request, reject foreign access and return a private pending replacement',async()=>{
  const f=await fixture();
  try{
    const requestApi=await import('../app/api/seller-applications/document-change/route');
    const reviewApi=await import('../app/api/admin/seller-document-change-requests/[id]/route');
    const uploadApi=await import('../app/api/seller-applications/document-change/[id]/replacement/route');
    const privateApi=await import('../app/api/seller-applications/documents/[id]/route');
    const payload={documentId:f.documentId,reason:'Please allow a clearer fictional identity scan',commandId:'owned-document-request'};
    globalThis.documentTestIdentity=null;assert.equal((await requestApi.POST(jsonRequest('/api/seller-applications/document-change',payload))).status,401);
    globalThis.documentTestIdentity={userId:'maker-user'};
    assert.equal((await requestApi.POST(jsonRequest('/api/seller-applications/document-change',payload,'https://foreign.test'))).status,403);
    const first=await requestApi.POST(jsonRequest('/api/seller-applications/document-change',payload));assert.equal(first.status,200,await first.clone().text());
    const {requestId}=await first.json() as {requestId:string};
    assert.equal((await (await requestApi.POST(jsonRequest('/api/seller-applications/document-change',payload))).json() as {requestId:string}).requestId,requestId);
    globalThis.documentTestStaff={id:'delegate',role:'admin'};
    const decision={decision:'approve',reason:'The exact scan replacement is permitted',commandId:'owned-permission'};
    assert.equal((await reviewApi.POST(jsonRequest('/api/admin/seller-document-change-requests/'+requestId,decision),{params:Promise.resolve({id:requestId})})).status,403);
    globalThis.documentTestStaff={id:'reviewer',role:'super_admin',authSubject:'reviewer'};
    assert.equal((await reviewApi.POST(jsonRequest('/api/admin/seller-document-change-requests/'+requestId,decision),{params:Promise.resolve({id:requestId})})).status,200);
    const png=new PNG({width:2,height:2});png.data.fill(255);const image=new Uint8Array(PNG.sync.write(png)).buffer;
    const upload=()=>{const data=new FormData();data.set('commandId','owned-upload');data.set('permissionId',requestId);data.set('document',new File([image],'fictional.png',{type:'image/png'}));
      return uploadApi.POST(new Request(origin+'/api/seller-applications/document-change/'+requestId+'/replacement',{method:'POST',headers:{origin},body:data}),{params:Promise.resolve({id:requestId})});};
    globalThis.documentTestIdentity={userId:'registered-owner'};assert.equal((await upload()).status,404);
    globalThis.documentTestIdentity={userId:'maker-user'};
    const uploaded=await upload();assert.equal(uploaded.status,200,await uploaded.clone().text());const {documentId}=await uploaded.json() as {documentId:string};
    assert.equal((await upload()).status,200);assert.equal(f.objects.size,1);
    assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(documentId)?.status,'pending');
    const opened=await privateApi.GET(new Request(origin+'/private'),{params:Promise.resolve({id:documentId})});assert.equal(opened.status,200);assert.match(opened.headers.get('cache-control')!,/no-store/);
    globalThis.documentTestIdentity={userId:'registered-owner'};assert.equal((await privateApi.GET(new Request(origin+'/private'),{params:Promise.resolve({id:documentId})})).status,404);
    await assert.rejects(sellerDocumentWorkspace(f.db,'maker','registered-owner','seller'));
    const workspace=await sellerDocumentWorkspace(f.db,'maker','maker-user','seller');assert.equal(workspace.requests.length,1);assert.equal(workspace.permissions.length,0);
    assert.doesNotMatch(JSON.stringify(workspace),/private\/seller-documents/);
    const notices=await listNotifications(f.db,'maker-user',100,'seller');assert.equal(notices.length,1,'Only the current request update remains; old evidence/permission messages are suppressed.');
    f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[\"seller.application.review\"]' WHERE user_id='delegate'");
    f.sqlite.exec(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES
      ('registered-id','registered','representative_identity','private/registered-id','identity.png','image/png',20,'pending',1),
      ('registered-bank','registered','bank_verification','private/registered-bank','bank.png','image/png',20,'pending',1)`);
    assert.ok(await getSellerDocumentForStaff(f.db,'registered-id','delegate'));
    await assert.rejects(getSellerDocumentForStaff(f.db,'registered-bank','delegate'));
    assert.ok(await getSellerDocumentForStaff(f.db,'registered-bank','reviewer'));
  }finally{f.dispose();}
});

void test('browser retains a reason after an uncertain response and retries the exact saved request',async()=>{
  const f=await fixture();
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const bundle=await build({stdin:{sourcefile:'document-interface-fixture.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{DocumentChangeRequestForm}from'./components/seller/document-change-request-form';createRoot(document.getElementById('root')!).render(<DocumentChangeRequestForm accountId="maker-user" documentId=${JSON.stringify(f.documentId)}/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-router',setup(builder){builder.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/link'?'import React from '+JSON.stringify('react')+';export default function Link({children,...props}){return React.createElement('+JSON.stringify('a')+',props,children)}':'export function useRouter(){return{refresh(){}}}',loader:'js',resolveDir:process.cwd()}));}}]});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const api=await import('../app/api/seller-applications/document-change/route'),page=await browser.newPage({viewport:{width:390,height:844}});const commands:string[]=[];
    await page.route('**/*',async(route:{request():{url():string;postData():string|null};fulfill(response:unknown):Promise<void>;abort():Promise<void>})=>{
      const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
      if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
      if(url.pathname==='/api/seller-applications/document-change'){
        const payload=JSON.parse(request.postData()!) as {commandId:string};commands.push(payload.commandId);
        const response=await api.POST(jsonRequest(url.pathname,payload));
        return route.fulfill({status:commands.length===1?503:response.status,contentType:'application/json',body:commands.length===1?'{"error":"Fictional lost acknowledgement; keep your reason and retry."}':await response.text()});
      }return route.abort();
    });
    await page.goto(origin);await page.addScriptTag({content:bundle.outputFiles[0].text});
    const reason=page.getByLabel('Explain the document change');await reason.fill('A clearer scan is ready for independent review');
    await page.getByRole('button',{name:'Request a document change',exact:true}).click();await page.getByText(/Fictional lost acknowledgement/).waitFor();
    assert.equal(await reason.inputValue(),'A clearer scan is ready for independent review');
    await page.getByRole('button',{name:'Request a document change',exact:true}).click();await page.getByText(/Change request submitted\. Hastabazaar/).waitFor();
    assert.equal(commands.length,2);assert.equal(commands[0],commands[1]);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_document_change_requests').get()?.n,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='document_change'").get()?.n,1);
  }finally{await browser.close();f.dispose();}
});

void test('actual unverified correction upload has no protected-change grant and cannot bypass a verified file',async()=>{
  const f=await completeVersionFixture(Date.now()-60_000);
  try{
    f.sqlite.exec("UPDATE users SET auth_subject='maker-user' WHERE id='maker-user'");globalThis.documentTestDb=f.db;globalThis.documentTestIdentity={userId:'maker-user'};
    let uploads=0;globalThis.documentTestBucket={async put(){uploads++;return{};}} as unknown as R2Bucket;
    const documentId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id);
    const api=await import('../app/api/seller-applications/documents/[id]/replacement/route');
    const png=new PNG({width:2,height:2});png.data.fill(255);const bytes=new Uint8Array(PNG.sync.write(png)).buffer;
    const submit=(target:string,commandId:string)=>{const form=new FormData();form.set('document',new File([bytes],'corrected.png',{type:'image/png'}));form.set('commandId',commandId);
      return api.POST(new Request(origin+'/api/seller-applications/documents/'+target+'/replacement',{method:'POST',headers:{origin},body:form}),{params:Promise.resolve({id:target})});};
    const response=await submit(documentId,'unverified-upload');assert.equal(response.status,200,await response.clone().text());
    const corrected=(await response.json() as {documentId:string}).documentId;
    assert.equal((await submit(documentId,'unverified-upload')).status,200);assert.equal(uploads,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_document_change_requests').get()?.n,0);
    await verifySellerDocument(f.db,{sellerId:'maker',documentId:corrected,actorId:'reviewer',reason:'Fictional corrected evidence independently verified',now:Date.now()});
    assert.equal((await submit(corrected,'forbidden-direct-replacement')).status,409);assert.equal(uploads,1);
  }finally{f.dispose();}
});

void test('focused review renders exact evidence, deadline and history while hiding personal-conflict decisions',async()=>{
  const f=await fixture();
  try{
    const requestId=await requestDocumentChange(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'A clearer copy is available for scoped review',now:f.now+1});
    const workspace=await sellerDocumentWorkspace(f.db,'maker','reviewer','staff');
    const {DocumentReviewWorkspace}=await import('../components/admin/document-review-workspace');
    const {SellerDocumentHistory}=await import('../components/seller/document-history');
    const html=renderToStaticMarkup(React.createElement(DocumentReviewWorkspace,{workspace,sellerId:'maker',requestId,viewerId:'reviewer'}));
    assert.match(html,/Current effective values/);assert.match(html,/Permit this document replacement/);assert.match(html,/First triage due/);
    assert.ok(html.includes(`/api/admin/seller-documents/${f.documentId}`));assert.match(html,/Document verification|Protected document change/);
    const conflict=renderToStaticMarkup(React.createElement(DocumentReviewWorkspace,{workspace,sellerId:'maker',requestId,viewerId:'maker-user'}));
    assert.match(conflict,/cannot review your own seller evidence/);assert.doesNotMatch(conflict,/Record decision/);
    const owned=renderToStaticMarkup(React.createElement(SellerDocumentHistory,{workspace}));
    assert.ok(owned.includes(`id="request-${requestId}"`));assert.match(owned,/Request awaiting review/);assert.doesNotMatch(owned,/private\/seller-documents/);
  }finally{f.dispose();}
});

void test('actual bank APIs bind account, exact upload and explicit ownership review without leaking private details',async()=>{
  const f=await fixture();try{
    const api=await import('../app/api/seller/bank-details/route'),review=await import('../app/api/admin/seller-applications/[id]/bank-details/route');
    const initial=await (await api.GET()).json() as {revision:string;userId:string};
    const png=new PNG({width:2,height:2});png.data.fill(255);const bytes=new Uint8Array(PNG.sync.write(png)).buffer;
    const upload=()=>{const data=new FormData();for(const [key,value] of Object.entries({revision:initial.revision,accountId:initial.userId,commandId:'bank-api-upload',
      payoutBeneficiary:'Fictional Maker',bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'876543210'}))data.set(key,value);
      data.set('bankVerification',new File([bytes],'bank.png',{type:'image/png'}));return new Request(origin+'/api/seller/bank-details',{method:'POST',headers:{origin},body:data});};
    globalThis.documentTestIdentity={userId:'registered-owner'};assert.equal((await api.POST(upload())).status,409);assert.equal(f.objects.size,0);
    globalThis.documentTestIdentity={userId:'maker-user'};
    const saved=await api.POST(upload());assert.equal(saved.status,200,await saved.clone().text());assert.equal((await api.POST(upload())).status,200);assert.equal(f.objects.size,1);
    const pending=await (await api.GET()).json() as {revision:string;caseId:string};assert.doesNotMatch(JSON.stringify(pending),/876543210|Fictional Bank/);
    const decision={revision:pending.revision,reference:'FICTIONAL-OWNERSHIP-EVIDENCE',reason:'Actual current identity and same-person account inspected',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'bank-api-review'};
    const context={params:Promise.resolve({id:'maker'})};
    globalThis.documentTestStaff={id:'delegate',role:'admin'};assert.equal((await review.POST(jsonRequest('/bank-review',decision),context)).status,403);
    await assert.rejects(privateBankWorkspace(f.db,'maker','delegate','staff',f.now));
    await assert.rejects(privateBankWorkspace(f.db,'maker','foreign','owner',f.now));
    globalThis.documentTestStaff={id:'reviewer',role:'super_admin',authSubject:'reviewer'};
    assert.equal((await review.POST(jsonRequest('/bank-review',{...decision,identityEvidenceConfirmed:false}),context)).status,400);
    const confirmed=await review.POST(jsonRequest('/bank-review',decision),context);assert.equal(confirmed.status,200,await confirmed.clone().text());
    assert.equal((await review.POST(jsonRequest('/bank-review',decision),context)).status,200);
    assert.equal((await privateBankWorkspace(f.db,'maker','reviewer','staff',f.now)).current?.details.bankAccountNumber,'876543210');
    const notices=await listNotifications(f.db,'maker-user',100,'seller');assert.equal(notices.filter(notice=>notice.relatedType==='seller_protected_change').length,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_beneficiary_versions WHERE seller_id='maker'").get()!.n,1);
  }finally{f.dispose();}
});

void test('actual material identity receivers keep proposed facts private, reject stale scope and commit one verified version',async()=>{
  const f=await fixture();try{
    const requestApi=await import('../app/api/seller/protected-changes/route'),permissionApi=await import('../app/api/admin/seller-protected-changes/[id]/permission/route');
    const uploadApi=await import('../app/api/seller/protected-changes/[id]/identity/route'),verifyApi=await import('../app/api/admin/seller-protected-changes/[id]/verify-identity/route');
    const revision=f.sqlite.prepare("SELECT identity_revision,bank_revision FROM seller_protected_revisions WHERE seller_id='maker'").get()!;
    const requestBody={kind:'identity',fields:['legalName','representative_identity'],reason:'Correct this same legal person name from actual evidence',identityRevision:Number(revision.identity_revision),bankRevision:Number(revision.bank_revision),currentUnusable:false,accountId:'maker-user',commandId:'api-identity-request'};
    const requested=await requestApi.POST(jsonRequest('/identity-request',requestBody));assert.equal(requested.status,200,await requested.clone().text());
    const {caseId}=await requested.json() as {caseId:string},context={params:Promise.resolve({id:caseId})};
    const permission={decision:'permit',reason:'Permit the exact name and matching identity document',version:0,identityRevision:requestBody.identityRevision,bankRevision:requestBody.bankRevision,commandId:'api-identity-permission'};
    const permitted=await permissionApi.POST(jsonRequest('/identity-permission',permission),context);assert.equal(permitted.status,200,await permitted.clone().text());
    const {permissionId}=await permitted.json() as {permissionId:string};
    const png=new PNG({width:2,height:2});png.data.fill(255);const bytes=new Uint8Array(PNG.sync.write(png)).buffer;
    const upload=(accountId='maker-user',values:Record<string,string>={legalName:'Fictional Corrected Maker'})=>{const data=new FormData();
      data.set('accountId',accountId);data.set('commandId','api-identity-upload');data.set('permissionId',permissionId);data.set('values',JSON.stringify(values));
      data.set('representative_identity',new File([bytes],'identity.png',{type:'image/png'}));return new Request(origin+'/identity-upload',{method:'POST',headers:{origin},body:data});};
    assert.equal((await uploadApi.POST(upload('foreign'),context)).status,409);assert.equal(f.objects.size,0);
    assert.equal((await uploadApi.POST(upload('maker-user',{legalName:'Fictional Corrected Maker',bankAccountNumber:'ILLEGAL-SCOPE'}),context)).status,400);assert.equal(f.objects.size,0);
    const saved=await uploadApi.POST(upload(),context);assert.equal(saved.status,200,await saved.clone().text());assert.equal((await uploadApi.POST(upload(),context)).status,200);assert.equal(f.objects.size,1);
    assert.equal((await uploadApi.POST(upload('maker-user',{legalName:'Different content after permission consumption'}),context)).status,409);assert.equal(f.objects.size,1);
    assert.equal(f.sqlite.prepare("SELECT legal_name FROM seller_profiles WHERE id='maker'").get()!.legal_name,'Fictional Maker');
    const decision={version:2,identityRevision:requestBody.identityRevision,bankRevision:requestBody.bankRevision,sameLegalPersonConfirmed:true,evidenceReference:'ACTUAL-FICTIONAL-IDENTITY-REVIEW',reason:'Actual evidence confirms the corrected spelling for the same person',commandId:'api-identity-verification'};
    globalThis.documentTestStaff={id:'delegate',role:'admin'};assert.equal((await verifyApi.POST(jsonRequest('/identity-verification',decision),context)).status,403);
    globalThis.documentTestStaff={id:'reviewer',role:'super_admin',authSubject:'reviewer'};
    assert.equal((await verifyApi.POST(jsonRequest('/identity-verification',{...decision,sameLegalPersonConfirmed:false}),context)).status,400);
    const verified=await verifyApi.POST(jsonRequest('/identity-verification',decision),context);assert.equal(verified.status,200,await verified.clone().text());
    assert.equal((await verifyApi.POST(jsonRequest('/identity-verification',decision),context)).status,200);
    assert.equal(f.sqlite.prepare("SELECT legal_name FROM seller_profiles WHERE id='maker'").get()!.legal_name,'Fictional Corrected Maker');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_identity_fact_versions').get()!.n,1);
    const notices=(await listNotifications(f.db,'maker-user',100,'seller')).filter(row=>row.relatedType==='seller_protected_change');assert.equal(notices.length,1);
    assert.doesNotMatch(JSON.stringify(notices),/Fictional Corrected Maker|PRIVATE-GOVERNMENT|private\/seller-documents/);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_capability_holds WHERE case_id=? AND released_at IS NULL').get(caseId)!.n,2);
  }finally{f.dispose();}
});

void test('actual withdrawal and disposition APIs preserve holds, current authority and one shared notice',async()=>{
  const f=await fixture();try{
    const caseId=await requestDocumentChange(f.db,{sellerId:'maker',documentId:f.documentId,actorId:'maker-user',reason:'Request this exact proof correction for review',now:f.now});
    const context={params:Promise.resolve({id:caseId})},withdraw=await import('../app/api/seller/protected-changes/[id]/withdraw/route'),disposition=await import('../app/api/admin/seller-protected-changes/[id]/disposition/route');
    const owned={accountId:'maker-user',version:0,reason:'Withdraw this proposed correction while current validity is reviewed',commandId:'api-withdraw-once'};
    assert.equal((await withdraw.POST(jsonRequest('/withdraw',owned,'https://foreign.test'),context)).status,403);
    globalThis.documentTestIdentity={userId:'registered-owner'};assert.equal((await withdraw.POST(jsonRequest('/withdraw',owned),context)).status,409);
    globalThis.documentTestIdentity={userId:'maker-user'};
    assert.equal((await withdraw.POST(jsonRequest('/withdraw',owned),context)).status,200);assert.equal((await withdraw.POST(jsonRequest('/withdraw',owned),context)).status,200);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_capability_holds WHERE case_id=? AND released_at IS NULL').get(caseId)?.n,2);
    const bank=await sellerBankState(f.db,'maker'),decision={action:'retain_holds',version:1,identityRevision:bank.identityRevision,bankRevision:bank.bankRevision,capabilities:['new_orders','payouts'],evidenceReference:'FIX-API-NEXT-REVIEW',reason:'Retain the exact holds pending current bank ownership and readiness review',commandId:'api-retain-once'};
    globalThis.documentTestStaff={id:'delegate',role:'admin'};assert.equal((await disposition.POST(jsonRequest('/disposition',decision),context)).status,403);
    globalThis.documentTestStaff={id:'reviewer',role:'super_admin',authSubject:'reviewer'};
    const result=await disposition.POST(jsonRequest('/disposition',decision),context);assert.equal(result.status,200,await result.clone().text());
    assert.equal((await disposition.POST(jsonRequest('/disposition',decision),context)).status,200);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_protected_change_events WHERE case_id=? AND action='holds_retained'").get(caseId)?.n,1);
    assert.equal((await listNotifications(f.db,'maker-user',100,'seller')).filter(row=>row.relatedId===caseId).length,1);
    const permission=await import('../app/api/admin/seller-protected-changes/[id]/permission/route');
    assert.equal((await permission.POST(new Request(origin+'/permission',{method:'POST',headers:{origin},body:'{invalid'}),context)).status,400);
    assert.equal((await permission.POST(new Request(origin+'/permission',{method:'POST',headers:{origin},body:'x'.repeat(270000)}),context)).status,413);
  }finally{f.dispose();}
});

void test('bank review browser retains the exact uncertain decision and clears stale attestations without losing notes',async()=>{
  const f=await fixture();
  const initial=await sellerBankState(f.db,'maker');
  await submitSellerBankDetails(f.db,{sellerId:'maker',actorId:'maker-user',revision:initial.revision,commandId:'browser-bank-proposal',now:f.now+1,
    details:{payoutBeneficiary:'Fictional Maker',bankName:'Fictional Bank',bankBranch:'Fictional Branch',bankAccountNumber:'123456789'},
    document:{id:'browser-bank',kind:'bank_verification',objectKey:'private/seller-documents/maker/browser-bank',originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
  const pending=await sellerBankState(f.db,'maker');
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const bundle=await build({stdin:{sourcefile:'bank-review-fixture.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SellerBankReview}from'./components/admin/seller-bank-review';const root=createRoot(document.getElementById('root')!);window.revise=(revision)=>root.render(<SellerBankReview actorId="reviewer" sellerId="maker" revision={revision}/>);window.revise(${JSON.stringify(pending.revision)});`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-router',setup(builder){builder.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/link'?'import React from '+JSON.stringify('react')+';export default function Link({children,...props}){return React.createElement('+JSON.stringify('a')+',props,children)}':'export function useRouter(){return{refresh(){}}}',loader:'js',resolveDir:process.cwd()}));}}]});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const api=await import('../app/api/admin/seller-applications/[id]/bank-details/route'),page=await browser.newPage({viewport:{width:390,height:844}}),bodies:string[]=[];
    await page.route('**/*',async(route:{request():{url():string;postData():string|null};fulfill(response:unknown):Promise<void>;abort():Promise<void>})=>{
      const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
      if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
      if(url.pathname==='/api/admin/seller-applications/maker/bank-details'){
        bodies.push(request.postData()!);const result=await api.POST(jsonRequest(url.pathname,JSON.parse(bodies.at(-1)!)),{params:Promise.resolve({id:'maker'})});
        return route.fulfill({status:bodies.length===1?503:result.status,contentType:'application/json',body:bodies.length===1?'{"error":"Fictional lost bank acknowledgement"}':await result.text()});
      }return route.abort();
    });
    await page.goto(origin);await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByLabel('Verified legal account owner').selectOption('same_person');await page.getByRole('checkbox').check();
    await page.getByLabel('Internal verification reference').fill('FIX-BROWSER-BANK');const note=page.getByLabel('Review reason');await note.fill('The fictional identity and actual bank ownership were inspected');
    await page.getByLabel("This bank case's payout hold").selectOption('keep');
    await page.getByRole('button',{name:'Confirm bank verification',exact:true}).click();await page.getByText('Fictional lost bank acknowledgement').waitFor();
    assert.equal(await note.isDisabled(),true);assert.match(await note.inputValue(),/fictional identity/);
    await page.getByRole('button',{name:'Retry exact original decision',exact:true}).click();await page.getByText(/The original decision is recorded/).waitFor();
    assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_beneficiary_versions').get()?.n,1);
    await page.evaluate("window.revise('fixture-source-changed')");await page.getByText(/your notes are retained/).waitFor();
    await page.getByRole('button',{name:'Use reviewed current evidence',exact:true}).click();
    assert.equal(await page.getByRole('checkbox').isChecked(),false);assert.equal(await page.getByLabel('Verified legal account owner').inputValue(),'same_person');assert.match(await note.inputValue(),/fictional identity/);
  }finally{await browser.close();f.dispose();}
});
