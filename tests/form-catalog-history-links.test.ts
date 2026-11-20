import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
declare global { var historyLinkCreateElement: typeof createElement }
globalThis.historyLinkCreateElement=createElement;
registerHooks({resolve(specifier,context,next){if(specifier==='next/link')return{url:"data:text/javascript,export default function Link({children,...props}){return globalThis.historyLinkCreateElement('a',props,children)}",shortCircuit:true};return next(specifier,context)}});
void test('history navigation remains independent of mutation availability and encodes exact subjects',async()=>{
 const {StaffFormHistoryLinks}=await import('../components/admin/staff-form-history-links');
 const html=renderToStaticMarkup(createElement(StaffFormHistoryLinks,{entries:[
  {kind:'return-case-action',subjectId:'closed/case?one',label:'Staff decisions'},
  {kind:'business-settings',label:'Setting context'},
 ]}));
 assert.match(html,/aria-label="Recorded form context"/);
 assert.match(html,/kind=return-case-action&amp;id=closed%2Fcase%3Fone/);
 assert.match(html,/kind=business-settings/);
 assert.match(html,/Staff decisions/);
 assert.doesNotMatch(html,/<form|<button|disabled|requestId|receiptToken/);
});

void test('completed cancellation reviews keep answer links and original recovery without a new decision', async () => {
 const hook = registerHooks({resolve(specifier,context,next){
  if(specifier==='./cancellation-review-control')return {url:"data:text/javascript,export function CancellationReviewControl({reviewId,canDecide=true}){return globalThis.historyLinkCreateElement('div',{'data-original-recovery':reviewId,...(canDecide?{'data-live-decision':true}:{'data-decision-disabled':true})})}",shortCircuit:true};
  return next(specifier,context);
 }});
 try {
  const {CancellationReviewSection}=await import('../components/admin/cancellation-review-section');
  const db={prepare(){return {bind(){return {async all(){return {results:[
   {id:'review-approved',status:'approved',note:'Fictional note',reviewNote:'Done',createdAt:1,activeHolds:0},
   {id:'review-rejected',status:'rejected',note:'Fictional note',reviewNote:'Closed',createdAt:1,activeHolds:0},
  ]}}}}}}} as unknown as D1Database;
  const html=renderToStaticMarkup(await CancellationReviewSection({db,orderId:'order-one',actorId:'fixture-staff'}));
  assert.match(html,/kind=cancellation-approved&amp;id=review%3Areview-approved/);
  assert.match(html,/kind=cancellation-rejected&amp;id=review-rejected/);
  assert.match(html,/data-original-recovery="review-approved" data-decision-disabled="true"/);
  assert.match(html,/data-original-recovery="review-rejected" data-decision-disabled="true"/);
  assert.doesNotMatch(html,/data-live-decision/);
 } finally { hook.deregister(); }
});

void test('real closed cancellation control renders decision inputs inside a disabled fieldset', async () => {
 const hook = registerHooks({resolve(specifier,context,next){
  if(specifier==='next/navigation')return {url:'data:text/javascript,export function useRouter(){return {refresh(){}}}',shortCircuit:true};
  return next(specifier,context);
 }});
 try {
  const {CancellationReviewControl}=await import('../components/admin/cancellation-review-control');
  const html=renderToStaticMarkup(createElement(CancellationReviewControl,{
   reviewId:'review-approved',actorId:'fixture-staff',canDecide:false,
  }));
  assert.match(html,/<form[^>]*data-form-id="staff.cancellation-review"/);
  const decision=html.match(/<fieldset disabled=""[^>]*>([\s\S]*?)<\/fieldset>/)?.[1];
  assert.ok(decision,'the actual closed control disables its complete decision fieldset');
  assert.match(decision,/<textarea/);
  assert.match(decision,/Review current cancellation amounts/);
  assert.match(decision,/Reject with reason/);
  assert.doesNotMatch(html,/Approve reviewed cancellation|Continue original settlement|Check original saved outcome/,
   'SSR has no verified preview or retained browser reference from which to offer approval or continuation');
 } finally { hook.deregister(); }
});
