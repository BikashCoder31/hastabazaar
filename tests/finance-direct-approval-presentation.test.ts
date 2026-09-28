import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='next/link')return {url:'data:text/javascript,export default function Link(){return null}',shortCircuit:true};
  if(specifier==='next/navigation')return {url:'data:text/javascript,export function useRouter(){return {refresh(){}}}',shortCircuit:true};
  return nextResolve(specifier,context);
}});
void test('SuperAdmin payout preparation presents direct approval while Admin preparation remains pending',async()=>{
  const {PreparePayoutButton}=await import('../components/admin/payout-actions');
  const direct=renderToStaticMarkup(createElement(PreparePayoutButton,{sellerId:'seller',sellerName:'Fictional Seller',amount:'NPR 50',role:'super_admin'}));
  const pending=renderToStaticMarkup(createElement(PreparePayoutButton,{sellerId:'seller',sellerName:'Fictional Seller',amount:'NPR 50',role:'admin'}));
  assert.match(direct,/Create approved payout/);
  assert.doesNotMatch(direct,/Prepare for approval|Super Admin approval.*required/);
  assert.match(pending,/Prepare payout/);
});
void test('SuperAdmin payout request preparation offers direct approval and Admin retains preparation',async()=>{
  const {PayoutRequestActions}=await import('../components/admin/payout-request-actions');
  const direct=renderToStaticMarkup(createElement(PayoutRequestActions,{id:'request',role:'super_admin'}));
  const pending=renderToStaticMarkup(createElement(PayoutRequestActions,{id:'request',role:'admin'}));
  assert.match(direct,/Create approved payout/);assert.match(pending,/Prepare for Super Admin approval/);
});
