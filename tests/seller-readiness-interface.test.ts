import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readyMaker} from './helpers/company-store-lifecycle-fixture';
import {getSellerReadiness} from '../lib/sellers/readiness';
import {listProductsForReview} from '../lib/db/repositories/products';
void test('eligible Super Admin detail and directory share capability states and retain the return filter',async()=>{
 const f=await readyMaker();try{
  globalThis.readinessTestDb=f.db;globalThis.readinessStaff={id:'reviewer',role:'super_admin'};
  f.sqlite.prepare(`INSERT INTO product_intake_drafts(id,owner_id,seller_id,revision,answers_json,created_at,updated_at)
    VALUES('private-unsubmitted-draft','maker-user','maker',1,'{}',1,1)`).run();
  const detail=await import('../app/admin/sellers/[id]/page');
  const html=renderToStaticMarkup(await detail.default({params:Promise.resolve({id:'maker'}),searchParams:Promise.resolve({returnTo:'/admin/sellers?reviewView=waiting&reviewQ=Fictional'})}));
  assert.match(html,/Shared review queue/);assert.match(html,/Product submission/);assert.match(html,/reviewView=waiting/);assert.match(html,/approved for activation/);
  assert.match(html, /Seller onboarding checklist/);
  assert.match(html, /Next step:[^<]*Publish the first product/);
  assert.match(html, /href="\/admin\/products\/cup[^"]*"[^>]*>Open publication review/);
  assert.doesNotMatch(html, /private-unsubmitted-draft|Continue saved draft/);
  const directory=await import('../app/admin/sellers/page');
  const rows=renderToStaticMarkup(await directory.default({searchParams:Promise.resolve({workspace:'directory'})}));
  assert.match(rows,/Submission: <!-- -->available|Submission: available/);assert.match(rows,/New orders: <!-- -->held|New orders: held/);assert.match(rows,/returnTo=/);
  assert.match(rows, /Approved for activation/);
  assert.equal((await listProductsForReview(f.db,1,false,'maker')).length,1);assert.equal((await listProductsForReview(f.db,1,false,'absent-seller')).length,0);
  f.sqlite.prepare("UPDATE products SET status='draft' WHERE id='cup'").run();
  const waiting = renderToStaticMarkup(await detail.default({params:Promise.resolve({id:'maker'})}));
  assert.match(waiting, /Next step:[^<]*Seller sends the first product for review/);
  assert.match(waiting, /Who acts: <strong>Seller<\/strong>/);
  assert.doesNotMatch(waiting, /private-unsubmitted-draft|Continue saved draft|Open product review/);
 }finally{f.dispose();}
});
declare global{var readinessTestDb:D1Database;var readinessStaff:{id:string;role:'admin'|'super_admin'};var readinessElement:typeof createElement;}
globalThis.readinessElement=createElement;
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.readinessTestDb},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3018"}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export async function requireStaffPage(){return globalThis.readinessStaff};export class StaffAuthorizationError extends Error{}',shortCircuit:true};
 if(specifier==='next/link'||specifier==='next/image')return{url:`data:text/javascript,export default function Element(props){return globalThis.readinessElement(${JSON.stringify(specifier==='next/link'?'a':'img')},props)}`,shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function useRouter(){return{refresh(){}}};export function usePathname(){return "/admin/sellers/maker"};export function useSearchParams(){return new URLSearchParams()};export function redirect(url){throw new Error(url)};export function notFound(){throw new Error("not-found")}',shortCircuit:true};
 return next(specifier,context);
}});
void test('owner and staff readiness use the same states and real resolution routes with honest unavailable rendering',async()=>{
 const f=await readyMaker();try{
  const {SellerReadinessSummary}=await import('../components/seller/readiness-summary');const readiness=await getSellerReadiness(f.db,'maker',f.now+3);
  const owner=renderToStaticMarkup(createElement(SellerReadinessSummary,{readiness})),staff=renderToStaticMarkup(createElement(SellerReadinessSummary,{readiness,audience:'staff'}));
  for(const html of [owner,staff]){assert.match(html,/approved for activation/);assert.match(html,/Product submission/);assert.match(html,/Live order acceptance/);assert.match(html,/Not currently available/);assert.doesNotMatch(html,/PRIVATE-GOVERNMENT-IDENTITY-QA-ONLY/);}
  assert.match(owner,/href="\/seller\/finance"/);assert.match(staff,/href="\/admin\/sellers\/maker#seller-bank"/);
  const unavailable=renderToStaticMarkup(createElement(SellerReadinessSummary,{readiness:null}));assert.match(unavailable,/Readiness unavailable/);assert.doesNotMatch(unavailable,/0 pending|All ready/);
 }finally{f.dispose();}
});
void test('Seller Operations can open a managed seller operational workspace without government or bank evidence',async()=>{
 const f=await readyMaker();try{
  f.sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('seller-ops','seller-ops@local.hastabazaar.test','Fictional Seller Operations','active',1,1);
   INSERT INTO user_roles(user_id,role,assigned_at) VALUES('seller-ops','admin',1);
   INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('seller-ops','["seller.application.review"]',0,'reviewer',1);`);
  globalThis.readinessTestDb=f.db;globalThis.readinessStaff={id:'seller-ops',role:'admin'};
  const page=await import('../app/admin/sellers/[id]/page');
  const html=renderToStaticMarkup(await page.default({params:Promise.resolve({id:'maker'})}));
  assert.match(html,/Operational summary/);assert.match(html,/Seller readiness/);assert.match(html,/Public profile review/);
  assert.doesNotMatch(html,/PRIVATE-GOVERNMENT-IDENTITY-QA-ONLY|Submitted bank details|Record profile decision|Verify document/);
 }finally{f.dispose();}
});
