import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {isValidElement,type ReactNode} from 'react';
import {approvedReplacement} from './helpers/return-handling-fixture';
import {commerceOrderFixture} from './helpers/commerce-order-fixture';
import {createCustomerComplaint,updateComplaintAsAdmin} from '../lib/db/repositories/complaints';
import {publishCareForm} from './helpers/published-care-form';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import type {StaffFormHistoryLinks} from '../components/admin/staff-form-history-links';
import {withAdminReturnTo} from '../lib/admin/return-context';

declare global{var careContextDb:D1Database;var careContextAuthority:(permission?:string)=>Promise<{id:string;role:string}>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.careContextDb},HASTABAZAAR_RUNTIME_ENV:"test",HASTABAZAAR_RELEASE_ID:"fictional-care-context"}',shortCircuit:true};
 if(specifier==='next/link'||specifier==='next/image')return{url:'data:text/javascript,export default function FrameworkElement(){return null}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function notFound(){throw new Error("Not found")};export function useRouter(){throw new Error("Client hook was unexpectedly invoked in navigation projection")};export function usePathname(){return "/admin"};export function useSearchParams(){return new URLSearchParams()}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{};export async function requireStaffPage(path,permission){return globalThis.careContextAuthority(permission)};export async function requireStaffApi(permission){return globalThis.careContextAuthority(permission)};export async function getStaffUser(){return globalThis.careContextAuthority()}',shortCircuit:true};
 return next(specifier,context);
}});
type NavigationProps={href?:string;returnTo?:string;children?:ReactNode;entries?:Parameters<typeof StaffFormHistoryLinks>[0]['entries']};
function nodes(value:ReactNode):NavigationProps[]{
 if(Array.isArray(value))return value.flatMap(nodes);if(!isValidElement<NavigationProps>(value))return[];
 const own=value.props,children=typeof value.type==='function'&&['StaffFormHistoryLinks','ReviewBackLink'].includes(value.type.name)?(value.type as (props:NavigationProps)=>ReactNode)(own):own.children;
 return[own,...nodes(children)];
}
const upstream='/admin?section=care&owner=me&due=overdue#my-work';
function bind(db:D1Database){globalThis.careContextDb=db;globalThis.careContextAuthority=async(permission='account.self.manage')=>{const proof=await staffMutationGuard(db,'owner',permission as never,Error);return{id:'owner',role:proof.role};};}

void test('actual return, order and preparation detail handoffs retain safe original work context',async()=>{
 const f=await approvedReplacement();try{bind(f.database);
  const returns=await import('../app/admin/cases/returns/[id]/page'),orders=await import('../app/admin/orders/[id]/page'),responses=await import('../app/admin/order-responses/[id]/page');
  const returnPage=nodes(await returns.default({params:Promise.resolve({id:f.caseId}),searchParams:Promise.resolve({returnTo:upstream,historyKind:'seller'})}));
  assert.ok(returnPage.some(p=>p.href===upstream),'return detail lost the original filtered work list');
  assert.ok(returnPage.some(p=>p.href?.startsWith('/admin/staff-form-history?')&&new URL(p.href,'https://fixture.test').searchParams.get('returnTo')?.includes('/admin/cases/returns/')),'staff history lost its exact case destination');
  const orderId=String(f.sqlite.prepare('SELECT order_id FROM order_items WHERE id=?').get(f.itemId)!.order_id),orderHref=withAdminReturnTo('/admin/orders/'+orderId,upstream);
  const orderPage=nodes(await orders.default({params:Promise.resolve({id:orderId}),searchParams:Promise.resolve({returnTo:upstream})}));
  assert.ok(orderPage.some(p=>p.href===upstream),'order detail lost the original work list');assert.ok(orderPage.some(p=>p.returnTo===orderHref),'parcel Incoming handoff lost the exact current order context');
  const preparation=nodes(await responses.default({params:Promise.resolve({id:orderId}),searchParams:Promise.resolve({returnTo:orderHref})}));assert.ok(preparation.some(p=>p.href===orderHref),'preparation detail lost its original order caller');
 }finally{await f.dispose();}
});
void test('actual complaint detail preserves its source handoff and rejects an external return target',async()=>{
 const f=await commerceOrderFixture();try{bind(f.database);const request=await createCustomerComplaint(f.database,{...f.access,receiptTokenHash:null,orderItemId:null,category:'other',subject:'Fictional retained original concern',detail:'Review the exact original concern without losing the filtered staff work list.',locale:'en-NP',requestId:'care-context-complaint',now:Date.now()}),page=await import('../app/admin/cases/complaints/[id]/page');
  const actual=nodes(await page.default({params:Promise.resolve({id:request.id}),searchParams:Promise.resolve({returnTo:upstream})}));assert.ok(actual.some(p=>p.href===upstream));
  const bad=nodes(await page.default({params:Promise.resolve({id:request.id}),searchParams:Promise.resolve({returnTo:'https://attacker.invalid/private'})}));assert.ok(bad.some(p=>p.href==='/admin/cases'));assert.ok(bad.every(p=>!p.href?.includes('attacker.invalid')));
 }finally{await f.dispose();}
});
void test('actual history landing and saved-answer detail consume the original case context through native recorded answers',async()=>{
 const f=await commerceOrderFixture();try{bind(f.database);const request=await createCustomerComplaint(f.database,{...f.access,receiptTokenHash:null,orderItemId:null,category:'other',subject:'Fictional source history concern',detail:'Retain actual original source context through list and saved-answer detail.',locale:'en-NP',requestId:'history-context-complaint',now:Date.now()}),form=await publishCareForm(f.database,'owner','staff.complaint-case-action');
  await updateComplaintAsAdmin(f.database,{complaintId:request.id,actorId:'owner',actorRole:'super_admin',action:'investigate',note:'Retain the actual original investigation reasoning.',publicMessageEn:'We are reviewing this original concern and will provide the next factual update.',publicMessageNe:'यो मूल गुनासोको समीक्षा भइरहेको छ। अर्को वास्तविक जानकारी दिनेछौँ।',requestId:'actual-history-investigation',now:Date.now(),form:{versionId:form.validated.versionId,answers:form.validated.answers}});
  const answer=f.sqlite.prepare('SELECT id FROM form_answer_sets WHERE subject_id=? AND request_id=?').get(request.id,'actual-history-investigation')!;assert.ok(answer);
  const page=await import('../app/admin/staff-form-history/page'),source=withAdminReturnTo('/admin/cases/complaints/'+request.id,upstream),params={kind:'complaint-case-action',id:request.id,returnTo:source};
  const landing=nodes(await page.default({searchParams:Promise.resolve(params)}));assert.ok(landing.some(p=>p.href===source),'history landing lost its native source Back link');
  const open=landing.find(p=>p.href?.includes('answer='+String(answer.id)))!.href!;assert.equal(new URL(open,'https://fixture.test').searchParams.get('returnTo'),source);
  const detail=nodes(await page.default({searchParams:Promise.resolve({...params,answer:String(answer.id)})}));assert.ok(detail.some(p=>p.href===source),'saved-answer detail lost its source Back link');assert.ok(detail.some(p=>p.href?.startsWith('/admin/staff-form-history?')&&!new URL(p.href,'https://fixture.test').searchParams.has('answer')&&new URL(p.href,'https://fixture.test').searchParams.get('id')===request.id),'saved-answer detail lacks Back to recorded entries');
 }finally{await f.dispose();}
});
