import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {listReviewTasks} from '../lib/workflows/review-tasks';
type Task=Awaited<ReturnType<typeof listReviewTasks>>[number];
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {readFinanceWorkItems} from '../lib/admin/finance-work-items';
import {financeQueueItem} from '../lib/admin/review-queue-view';
import {resolveRuntimeEnvironment} from '../lib/staging/environment';
declare global{var queueReturnElement:typeof createElement;var queueReturnParams:string;}
globalThis.queueReturnElement=createElement;
globalThis.queueReturnParams='reviewView=all&reviewDepartment=all&reviewPriority=overdue';
registerHooks({resolve(specifier,context,next){
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function usePathname(){return "/admin"};export function useSearchParams(){return new URLSearchParams(globalThis.queueReturnParams)};export function useRouter(){return{refresh(){}}}',shortCircuit:true};
 if(specifier==='next/link')return{url:'data:text/javascript,export default function Link({children,...props}){return globalThis.queueReturnElement("a",props,children)}',shortCircuit:true};
 return next(specifier,context);
}});

void test('every permitted queue family carries its original filters to its exact record destination',async()=>{
 const {SharedReviewQueue}=await import('../components/admin/shared-review-queue');
 const types:Task['sourceType'][]=['system_incident','team_governance','return_request','complaint','order_response','payment_exception','payment_claim','recovery_claim','commission_terms','company_account','product_review'];
 const tasks=types.map((sourceType,index):Task=>({id:'task-'+index,sourceType,sourceId:'source-'+index,sourceRevision:'v1',startedAt:1000+index,dueAt:900000,calendarVersion:'continuous-v1',hasDeadline:1,ownerId:null,revision:0,orderId:'order-'+index,priority:false,backupId:null,status:'awaiting_review',sourceStatus:'submitted',triagedAt:null,nextActor:'Hastabazaar',sellerId:'seller-'+index,sellerName:'Fictional shop '+index,nextUpdateAt:null}));
 const html=renderToStaticMarkup(createElement(SharedReviewQueue,{tasks,actorId:'reviewer'}));
 const links=[...html.matchAll(/href="([^"]+)"[^>]*>Open review/g)].map(match=>new URL(match[1].replaceAll('&amp;','&'),'https://fixture.invalid'));
 assert.equal(links.length,types.length);
 const payment=links.find(url=>url.hash==='#source-6');assert.ok(payment);assert.equal(payment.searchParams.get('order'),'order-6','The claim must select its actual authorized order workspace.');
 for(const url of links){
  const context=url.searchParams.get('returnTo');assert.ok(context,'Missing return context at '+url.pathname);
  const back=new URL(context,'https://fixture.invalid');assert.equal(back.pathname,'/admin');
  assert.equal(back.searchParams.get('reviewView'),'all');assert.equal(back.searchParams.get('reviewDepartment')??'all','all');assert.equal(back.searchParams.get('reviewPriority'),'overdue');
 }
});

void test('the actual queue applies approved department, owner and overdue views and exposes all five required views',async()=>{
 const {SharedReviewQueue}=await import('../components/admin/shared-review-queue');
 const base:Task={id:'task',sourceType:'complaint',sourceId:'Original complaint',sourceRevision:'v1',startedAt:1000,dueAt:2000,calendarVersion:'continuous-v1',hasDeadline:1,ownerId:null,revision:0,orderId:'order',priority:false,backupId:null,status:'awaiting_review',sourceStatus:'submitted',triagedAt:null,nextActor:'Hastabazaar',sellerId:null,sellerName:null,nextUpdateAt:null};
 const tasks:Task[]=[base,{...base,id:'other',sourceId:'Different department',sourceType:'seller_document'},{...base,id:'waiting',sourceId:'Customer owns next step',status:'waiting_on_customer',nextActor:'Customer'},{...base,id:'owned',sourceId:'Other reviewer owns this',ownerId:'other-reviewer'}];
 globalThis.queueReturnParams='reviewView=unassigned&reviewDepartment=orders&reviewPriority=overdue';
 const html=renderToStaticMarkup(createElement(SharedReviewQueue,{tasks,actorId:'reviewer'}));
 assert.match(html,/Original complaint/);assert.doesNotMatch(html,/Different department|Customer owns next step|Other reviewer owns this/);
 for(const label of ['Needs attention','Assigned to me','Unassigned','Waiting','Completed','Department','Owner','Priority','Opened from','Opened through'])assert.ok(html.includes(label),'Missing approved view/filter: '+label);
 assert.match(html,/1 matching tasks/);
});

void test('a filtered seller search offers its other-status match and an authorized directory shortcut', async () => {
 const { SharedReviewQueue } = await import('../components/admin/shared-review-queue');
 const task: Task = { id: 'abc-review', sourceType: 'seller_application', sourceId: 'seller-abc', sourceRevision: 'v1',
  startedAt: 1000, dueAt: null, calendarVersion: 'continuous-v1', hasDeadline: 0, ownerId: null, revision: 0,
  orderId: null, priority: false, backupId: null, status: 'completed', sourceStatus: 'approved', triagedAt: null,
  nextActor: 'Seller', sellerId: 'seller-abc', sellerName: 'abc', nextUpdateAt: null };
 const original = globalThis.queueReturnParams;
 try {
  globalThis.queueReturnParams = 'reviewView=attention&reviewQ=abc';
  const props = { tasks: [task], actorId: 'reviewer' };
  const filtered = renderToStaticMarkup(createElement(SharedReviewQueue, { ...props, sellerDirectoryAvailable: true }));
  assert.match(filtered, /Show 1 match in All records/);
  assert.match(filtered, /href="\/admin\/sellers\?workspace=directory&amp;q=abc#seller-directory"[^>]*>Search seller directory/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(SharedReviewQueue, props)), /Search seller directory/);
  globalThis.queueReturnParams = 'reviewQ=abc';
  const all = renderToStaticMarkup(createElement(SharedReviewQueue, props));
  assert.match(all, /Application · abc/);
  assert.match(all, /aria-pressed="true"[^>]*>All records/);
 } finally { globalThis.queueReturnParams = original; }
});

void test('actual native Finance rows retain their selectors without synthetic assignment controls or complete-count claims',async()=>{
 const f=await payoutTransferFixture();try{
  const {SharedReviewQueue}=await import('../components/admin/shared-review-queue'),environment=resolveRuntimeEnvironment({runtimeEnvironment:'test',nodeEnvironment:'test'});
  const projection=await readFinanceWorkItems(f.db,'reviewer',environment,{limit:100}),tasks=projection.items.map(financeQueueItem);
  assert.ok(tasks.some(task=>task.sourceType==='payout_candidate'));assert.ok(tasks.some(task=>task.sourceType==='refund_obligation'));
  globalThis.queueReturnParams='period=month&reviewView=all&reviewDepartment=finance';
  const html=renderToStaticMarkup(createElement(SharedReviewQueue,{tasks,actorId:'reviewer',partialSources:['Refund sources partial']}));
  assert.match(html,/Incomplete source coverage/);assert.doesNotMatch(html,/Manage ownership|Assignment history|\/api\/admin\/review-tasks/);
  const links=[...html.matchAll(/href="([^"]+)"[^>]*>Open review/g)].map(match=>new URL(match[1].replaceAll('&amp;','&'),'https://fixture.invalid'));
  assert.equal(links.length,tasks.length);
  const candidate=links.find(url=>url.searchParams.get('payout')===f.payoutId);assert.ok(candidate);assert.equal(candidate.searchParams.get('model'),'registered');assert.equal(new URL(candidate.searchParams.get('returnTo')!,'https://fixture.invalid').searchParams.get('period'),'month');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_transfer_packets').get()!.n,0,'Rendering cannot prepare an instruction.');
  for(const task of tasks){assert.equal('revision'in task,false);assert.equal('sourceRevision'in task,false);}
 }finally{f.dispose();}
});
