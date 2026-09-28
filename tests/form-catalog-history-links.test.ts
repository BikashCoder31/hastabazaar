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

void test('completed cancellation reviews keep answer links after their decision control disappears', async () => {
 const hook = registerHooks({resolve(specifier,context,next){
  if(specifier==='./cancellation-review-control')return {url:"data:text/javascript,export function CancellationReviewControl(){return globalThis.historyLinkCreateElement('div',{'data-live-decision':true})}",shortCircuit:true};
  return next(specifier,context);
 }});
 try {
  const {CancellationReviewSection}=await import('../components/admin/cancellation-review-section');
  const db={prepare(){return {bind(){return {async all(){return {results:[
   {id:'review-approved',status:'approved',note:'Fictional note',reviewNote:'Done'},
   {id:'review-rejected',status:'rejected',note:'Fictional note',reviewNote:'Closed'},
  ]}}}}}}} as unknown as D1Database;
  const html=renderToStaticMarkup(await CancellationReviewSection({db,orderId:'order-one'}));
  assert.match(html,/kind=cancellation-approved&amp;id=review%3Areview-approved/);
  assert.match(html,/kind=cancellation-rejected&amp;id=review-rejected/);
  assert.doesNotMatch(html,/data-live-decision/);
 } finally { hook.deregister(); }
});
