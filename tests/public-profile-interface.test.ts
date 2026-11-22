import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {stubFixtureLink} from './helpers/browser-fixture-link';
import {readyMaker} from './helpers/company-store-lifecycle-fixture';
import {getPublicProfileWorkspace,savePublicProfileDraft,submitPublicProfileRevision} from '../lib/sellers/public-profile';
import {resolvePublishedForm} from '../lib/forms/runtime';
declare global{var profileTestDb:D1Database;var profileTestIdentity:{userId:string}|null;var profileTestStaff:{id:string;role:string};}
void test('reviewer preserves the exact approve-only decision across a lost acknowledgement',async()=>{
 const f=await readyMaker();try{
  globalThis.profileTestDb=f.db;globalThis.profileTestStaff={id:'reviewer',role:'super_admin'};
  const initial=await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now);
  const draft=await savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',expectedDraftRevision:null,baseVersion:0,values:{...initial.state.current,about:'A private story for review.'},requestId:'browser-review-draft',now:f.now});
  await submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',draftRevision:draft.revision,baseVersion:0,requestId:'browser-review-submit',now:f.now+1});
  const workspace=await getPublicProfileWorkspace(f.db,'maker','reviewer','staff',f.now+2);
  const bundle=await build({stdin:{sourcefile:'profile-review-fixture.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PublicProfileReview}from'./components/admin/public-profile-review';createRoot(document.getElementById('root')!).render(<PublicProfileReview actorId="reviewer" sellerId="maker" workspace={${JSON.stringify(workspace)}} canReview={true}/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-router',setup(builder){builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useRouter(){return{refresh(){}}}',loader:'js'}));}}]});
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const api=await import('../app/api/admin/sellers/[id]/public-profile/route'),page=await browser.newPage(),bodies:string[]=[];
   await page.route('**/*',async(route:{request():{url():string;postData():string|null};fulfill(response:unknown):Promise<void>;abort():Promise<void>})=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
    if(url.pathname==='/api/admin/sellers/maker/public-profile'){
     bodies.push(incoming.postData()!);const result=await api.POST(request(JSON.parse(incoming.postData()!)),{params:Promise.resolve({id:'maker'})});
     return route.fulfill({status:bodies.length===1?503:result.status,contentType:'application/json',body:bodies.length===1?'{"error":"Fictional lost review acknowledgement"}':await result.text()});
    }return route.abort();
   });
   await page.goto(origin);await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.getByRole('textbox',{name:'Reason shown to the seller',exact:true}).fill('Approve this exact reviewed proposal while leaving publication private.');
   await page.getByRole('checkbox',{name:'I reviewed the current version, exact proposed fields and selected media. This action is justified.',exact:true}).check();
   await page.getByRole('button',{name:'Record profile decision',exact:true}).click();
   await page.getByText('Fictional lost review acknowledgement',{exact:true}).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'Reason shown to the seller',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'Retry the same request',exact:true}).click();await page.getByText('Profile action recorded. Refreshing the current version.',{exact:true}).waitFor();
   assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.equal(JSON.parse(bodies[0]).action,'approve_only');
   const after=await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+3);assert.equal(after.candidate?.status,'approved');assert.deepEqual(after.state.current,initial.state.current);assert.equal(after.state.lastNormalPublicationAt,null);
  }finally{await browser.close();}
 }finally{f.dispose();}
});
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.profileTestDb}}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.profileTestIdentity};export async function requireAuthenticatedUser(){return globalThis.profileTestIdentity}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(url){throw new Error(url)};export function useRouter(){return{refresh(){}}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){return globalThis.profileTestStaff}',shortCircuit:true};
 return next(specifier,context);
}});
const origin='https://profile.test';
const request=(body:unknown,from=origin)=>new Request(origin+'/api/seller/public-profile',{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify({...(typeof body==='object'&&body!==null&&!('candidateId' in body)?{sellerId:'maker',ownerId:'maker-user'}:{}),...body as Record<string,unknown>})});
void test('actual profile API saves private drafts exactly once and rejects cross-site, foreign and stale publication commands',async()=>{
 const f=await readyMaker();try{
  globalThis.profileTestDb=f.db;globalThis.profileTestIdentity={userId:'maker-user'};globalThis.profileTestStaff={id:'reviewer',role:'super_admin'};
  f.sqlite.exec("UPDATE users SET auth_subject='maker-user' WHERE id='maker-user'");
  const api=await import('../app/api/seller/public-profile/route');
  const view=await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now);
  const body={action:'save_draft',requestId:'api-private-draft',expectedDraftRevision:null,baseVersion:0,values:{...view.state.current,about:'Private API story pending independent review.'}};
  assert.equal((await api.POST(request(body,'https://foreign.test'))).status,403);
  globalThis.profileTestIdentity=null;assert.equal((await api.POST(request(body))).status,401);globalThis.profileTestIdentity={userId:'maker-user'};
  const first=await api.POST(request(body));assert.equal(first.status,200,await first.clone().text());
  const saved=await first.json() as {result:{revision:string}};
  assert.deepEqual(await (await api.POST(request(body))).json(),{ok:true,result:saved.result});
  assert.equal((await api.POST(request({...body,values:{...body.values,about:'Changed payload reusing the same request'}}))).status,409);
  assert.equal((await api.POST(request({...body,requestId:'private-identity-bypass',values:{...body.values,payoutAccountReference:'PRIVATE'}}))).status,400);
  const config=await resolvePublishedForm(f.db,'seller.maker-profile');
  const sent=await api.POST(request({action:'submit',requestId:'api-profile-submit',draftRevision:saved.result.revision,baseVersion:0,formVersion:config.version,customAnswers:[]}));assert.equal(sent.status,200,await sent.clone().text());
  const candidate=(await sent.json() as {result:{candidateId:string}}).result.candidateId;
  const admin=await import('../app/api/admin/sellers/[id]/public-profile/route');
  const review={action:'approve_only',candidateId:candidate,expectedVersion:0,requestId:'api-review',reason:'Review the exact private content and retain explicit publication'};
  globalThis.profileTestStaff={id:'maker-user',role:'super_admin'};
  assert.equal((await admin.POST(request(review),{params:Promise.resolve({id:'maker'})})).status,403);
  globalThis.profileTestStaff={id:'reviewer',role:'super_admin'};
  assert.equal((await admin.POST(request(review),{params:Promise.resolve({id:'other-seller'})})).status,404);
  const approved=await admin.POST(request(review),{params:Promise.resolve({id:'maker'})});assert.equal(approved.status,200,await approved.clone().text());
  assert.equal((await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now)).state.current.about,view.state.current.about);
 }finally{f.dispose();}
});

void test('owner editor keeps entered presentation and retries the identical draft after a lost acknowledgement',async()=>{
 const f=await readyMaker();try{
  f.sqlite.exec("UPDATE users SET auth_subject='maker-user' WHERE id='maker-user'");globalThis.profileTestDb=f.db;globalThis.profileTestIdentity={userId:'maker-user'};
  const workspace=await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now),config=await resolvePublishedForm(f.db,'seller.maker-profile');
  const bundle=await build({stdin:{sourcefile:'profile-ui-fixture.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PublicProfileEditor}from'./components/seller/public-profile-editor';createRoot(document.getElementById('root')!).render(<PublicProfileEditor sellerId="maker" workspace={${JSON.stringify(workspace)}}/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-router',setup(builder){stubFixtureLink(builder);builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useRouter(){return{refresh(){}}}',loader:'js'}));}}]});
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
   const api=await import('../app/api/seller/public-profile/route'),page=await browser.newPage({viewport:{width:390,height:844}}),bodies:string[]=[];
   await page.route('**/*',async(route:{request():{url():string;postData():string|null};fulfill(response:unknown):Promise<void>;abort():Promise<void>})=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
    if(url.pathname.startsWith('/api/forms/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(config)});
    if(url.pathname==='/api/seller/public-profile'){
     bodies.push(incoming.postData()!);const result=await api.POST(request(JSON.parse(incoming.postData()!)));
     return route.fulfill({status:bodies.length===1?503:result.status,contentType:'application/json',body:bodies.length===1?'{"error":"Fictional lost draft acknowledgement"}':await result.text()});
    }return route.abort();
   });
   await page.goto(origin);await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.getByRole('textbox',{name:'About your craft',exact:true}).fill('Keep my private story after a lost acknowledgement.');
   await page.getByRole('button',{name:'Save private draft',exact:true}).click();await page.getByText('Fictional lost draft acknowledgement',{exact:true}).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'About your craft',exact:true}).inputValue(),'Keep my private story after a lost acknowledgement.');
   assert.equal(await page.getByRole('textbox',{name:'About your craft',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'Retry the same request',exact:true}).click();await page.getByText('Private draft saved.',{exact:true}).waitFor();
   assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
   assert.equal((await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now)).state.current.about,workspace.state.current.about);
  }finally{await browser.close();}
 }finally{f.dispose();}
});
