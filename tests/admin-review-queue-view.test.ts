import test from 'node:test';
import assert from 'node:assert/strict';
import {filterReviewQueue,readReviewQueueFilters,reviewPriority,reviewQueueParams,type NativeReviewTask as ReviewQueueTask} from '../lib/admin/review-queue-view';
const now=Date.parse('2026-11-03T12:00:00Z');
function row(id:string,patch:Partial<ReviewQueueTask>={}):ReviewQueueTask{return{id,sourceType:'seller_document',sourceId:id,sourceRevision:'original-version',startedAt:now-86400000,dueAt:now-1000,calendarVersion:'continuous-v1',hasDeadline:1,ownerId:null,revision:0,orderId:null,priority:false,backupId:null,status:'awaiting_review',sourceStatus:'submitted',triagedAt:null,nextActor:'Hastabazaar',sellerId:null,sellerName:null,nextUpdateAt:null,...patch};}
void test('actual urgency, overdue order actions and reviews precede oldest waiting staff with stable ties',()=>{
 const rows=[row('waiting',{priority:true,status:'waiting_on_customer',nextActor:'Customer'}),row('routine-b',{startedAt:now-9000,dueAt:null}),row('review'),row('routine-a',{startedAt:now-9000,dueAt:null}),row('order',{sourceType:'order_response'}),row('urgent',{sourceType:'payment_exception',priority:true})];
 const result=filterReviewQueue(rows,'reviewer',readReviewQueueFilters(new URLSearchParams('reviewView=all')),now);
 assert.deepEqual(result.map(item=>item.id),['urgent','order','review','routine-a','routine-b','waiting']);
 assert.equal(reviewPriority(rows[0],now).key,'routine');
 assert.equal(reviewPriority(row('answered',{triagedAt:now-500,nextUpdateAt:now+5000}),now).key,'routine');
 assert.equal(reviewPriority(row('follow-up',{triagedAt:now-500,nextUpdateAt:now-100}),now).key,'overdue');
 assert.equal(reviewPriority(row('done',{status:'completed',priority:true}),now).key,'routine');
});
void test('date filters use inclusive Nepal dates and preserve all-records, search and unrelated reporting context',()=>{
 const params=new URLSearchParams('period=month&reviewView=all&reviewQ=all&reviewFrom=2026-11-03&reviewTo=2026-11-03');
 const filters=readReviewQueueFilters(params),start=Date.parse('2026-11-02T18:15:00Z');
 const rows=[row('before-all',{startedAt:start-1}),row('start-all',{startedAt:start}),row('end-all',{startedAt:start+86400000-1}),row('after-all',{startedAt:start+86400000})];
 assert.deepEqual(filterReviewQueue(rows,'reviewer',filters,now).map(item=>item.id),['start-all','end-all']);
 const restored=reviewQueueParams(params,filters);assert.equal(restored.get('period'),'month');assert.equal(restored.get('reviewView'),'all');assert.equal(restored.get('reviewQ'),'all');
 assert.equal(readReviewQueueFilters(new URLSearchParams('reviewFrom=2026-02-30')).from,'');
});
void test('completed, waiting, own and unassigned views remain distinct',()=>{
 const rows=[row('own',{ownerId:'reviewer'}),row('waiting',{status:'waiting_on_seller',nextActor:'Seller'}),row('completed',{status:'completed'}),row('superseded',{status:'no_longer_needed'})];
 for(const [view,ids]of [['assigned',['own']],['unassigned',['waiting']],['waiting',['waiting']],['completed',['completed']]]as const)assert.deepEqual(filterReviewQueue(rows,'reviewer',readReviewQueueFilters(new URLSearchParams({reviewView:view})),now).map(item=>item.id),ids);
});

void test('a seller search finds completed tasks by default and keeps explicit status and date filters', () => {
 const rows = [row('other-open', { sellerName: 'Different shop' }),
  row('abc-completed', { sourceType: 'seller_application', sellerName: 'abc', status: 'completed', sourceStatus: 'approved' }),
  row('abc-waiting', { sellerName: 'abc workshop', status: 'waiting_on_seller' })];
 const ids = (params: URLSearchParams) => filterReviewQueue(rows, 'reviewer', readReviewQueueFilters(params), now).map(task => task.id);
 const search = new URLSearchParams({ period: 'month', reviewQ: '  AbC  ' });
 assert.deepEqual(ids(new URLSearchParams()), ['other-open']);
 assert.deepEqual(ids(search), ['abc-completed', 'abc-waiting']);
 const restored = reviewQueueParams(search, readReviewQueueFilters(search));
 assert.equal(restored.get('period'), 'month');
 assert.equal(restored.get('reviewView'), null);
 assert.deepEqual(ids(restored), ['abc-completed', 'abc-waiting']);
 assert.deepEqual(ids(new URLSearchParams({ reviewQ: 'abc', reviewView: 'attention' })), []);
 assert.deepEqual(ids(new URLSearchParams({ reviewQ: 'abc', reviewView: 'completed' })), ['abc-completed']);
 assert.deepEqual(ids(new URLSearchParams({ reviewQ: 'abc', reviewFrom: '2026-11-03' })), []);
 assert.deepEqual(ids(reviewQueueParams(restored, { ...readReviewQueueFilters(restored), query: '' })), ['other-open']);
});
