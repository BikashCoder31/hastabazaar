import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';

import {renderToStaticMarkup} from 'react-dom/server';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import {FEE_PROGRAM_VIEWS} from '../lib/admin/fee-program-workspace';
declare global{var feePageDb:D1Database;var feePageActor:string;var feePageAuthority:()=>Promise<{id:string;authSubject:string;role:string}>;}
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.feePageDb}}',shortCircuit:true};if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export async function requireStaffPage(){return globalThis.feePageAuthority()}',shortCircuit:true};if(specifier==='next/navigation')return{url:'data:text/javascript,export const useRouter=()=>({refresh(){}});export function notFound(){throw Object.assign(new Error("Unavailable source"),{status:404})}',shortCircuit:true};if(specifier==='next/link')return{url:'data:text/javascript,import React from '+JSON.stringify(import.meta.resolve('react'))+';export default function Link({children,...props}){return React.createElement("a",props,children)}',shortCircuit:true};return next(specifier,context);}});
void test('actual six-view page preserves native source destinations/filter return context and denies invalid/current unauthorized reads',async()=>{
 const f=await payoutTransferFixture();try{
  globalThis.feePageDb=f.db;globalThis.feePageActor='reviewer';globalThis.feePageAuthority=async()=>{const p=await staffMutationGuard(f.db,globalThis.feePageActor,'commercial_policy.manage',Error);return{id:globalThis.feePageActor,authSubject:globalThis.feePageActor,role:p.role};};
  const page=(await import('../app/admin/fees/page')).default;
  for(const view of FEE_PROGRAM_VIEWS){const element=await page({searchParams:Promise.resolve({view:view.id,returnTo:'/admin/workspace?filter=fees'})}),html=renderToStaticMarkup(element);assert.match(html,/Fees, programs &amp; promotions/);assert.match(html,/aria-label="Fees workspace views"/);assert.match(html,/aria-current="page"/);assert.match(html,/view=programs/);assert.match(html,/returnTo=/);assert.doesNotMatch(html,/accountNumber|verification_reference|source_snapshot_json/);}
  const unknown=renderToStaticMarkup(await page({searchParams:Promise.resolve({view:'overview',status:'unknown'})}));assert.match(unknown,/unavailable or unrecorded/);assert.match(unknown,/does not claim complete totals/);
  await assert.rejects(()=>page({searchParams:Promise.resolve({view:'invented-policy'})}),/Unavailable source/);
  await assert.rejects(()=>page({searchParams:Promise.resolve({status:['current','draft']})}),/Unavailable source/);
  globalThis.feePageActor='customer';await assert.rejects(()=>page());
 }finally{f.dispose();}
});
