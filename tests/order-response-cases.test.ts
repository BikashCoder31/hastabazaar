import assert from 'node:assert/strict';
import test from 'node:test';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {reportPreparationIssue,recordPreparationFollowup} from '../lib/orders/response-cases';
import {processOrderResponseFollowup} from '../lib/orders/response-followup';
import {currentResponseNotice} from '../lib/orders/response-notifications';
const hour=3600000;
void test('a structured delay replaces only its affected response scope and retains an owned customer commitment without leaking private notes',async()=>{
 const f=await actionableOrderFixture({secondOffer:true});try{
  const now=f.releasedAt+5*hour;f.setClock(now);const [first,second]=f.rows,context={actorId:'registered-owner',requestId:'actual-delay-report',expectedRevision:null,now},input={portionId:String(first.portionId),itemIds:[String(second.id)],kind:'delay' as const,detail:'PRIVATE-REVIEW-CANARY: actual supplier material delay for this exact purchased offer.',proposedReadyAt:now+hour};
  await assert.rejects(reportPreparationIssue(f.db,{...context,actorId:'foreign'},input));const report=await reportPreparationIssue(f.db,context,input);assert.deepEqual(await reportPreparationIssue(f.db,context,input),report);
  assert.equal(f.sqlite.prepare('SELECT fulfillment_status FROM order_items WHERE id=?').get(second.id)!.fulfillment_status,'confirmed');assert.equal(f.sqlite.prepare('SELECT payment_status FROM orders WHERE id=?').get(f.orderId)!.payment_status,'paid');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_fulfillment_holds').get()!.n,0);
  f.setClock(f.releasedAt+6*hour);assert.equal((await processOrderResponseFollowup(f.db)).reminders,1);assert.deepEqual(JSON.parse(String(f.sqlite.prepare("SELECT scope_json FROM order_response_events WHERE kind='reminder'").get()!.scope_json)),[String(first.id)]);
  const follow={caseId:report.id,ownerId:'reviewer',backupId:null,state:'waiting' as const,nextUpdateAt:f.releasedAt+7*hour,privateNote:'PRIVATE-STAFF-CANARY: contact the original supplier and verify the actual recovery plan.',customerMessage:'We are checking the material delay affecting this item. No replacement has been agreed.'},review={actorId:'reviewer',requestId:'record-owned-followup',expectedRevision:'0',now:f.releasedAt+6*hour};
  await assert.rejects(recordPreparationFollowup(f.db,review,{...follow,state:'resolved',nextUpdateAt:null}));const saved=await recordPreparationFollowup(f.db,review,follow);assert.deepEqual(await recordPreparationFollowup(f.db,review,follow),saved);
  const row=f.sqlite.prepare('SELECT * FROM order_response_cases WHERE id=?').get(report.id)!;assert.equal(row.owner_id,'reviewer');assert.equal(row.created_at,now);assert.equal(row.commitment_missing,0);assert.equal(row.next_update_at,follow.nextUpdateAt);assert.match(String(row.public_message),/Next update by/);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE body_en LIKE '%PRIVATE-%'").get()!.n,0);const old=f.sqlite.prepare("SELECT id FROM order_response_events WHERE case_id=? AND kind='delay'").get(report.id)!;assert.equal(await currentResponseNotice(f.db,String(old.id)),false);
 }finally{f.dispose();}
});
void test('recovery after multiple missed milestones emits the current checkpoint without a stale reminder burst',async()=>{
 const f=await actionableOrderFixture();try{f.setClock(f.releasedAt+48*hour);const result=await processOrderResponseFollowup(f.db);assert.equal(result.checkpoints,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_response_events WHERE kind='checkpoint'").get()!.n,1);assert.equal(result.reminders,0);assert.equal(result.escalations,0);assert.equal(result.customerUpdates,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM order_response_events WHERE kind IN('reminder','escalation')").get()!.n,0);assert.deepEqual(await processOrderResponseFollowup(f.db),{reminders:0,escalations:0,checkpoints:0,customerUpdates:0});}finally{f.dispose();}
});
