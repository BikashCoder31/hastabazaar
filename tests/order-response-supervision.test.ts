import assert from 'node:assert/strict';
import test from 'node:test';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {reportPreparationIssue,recordPreparationFollowup} from '../lib/orders/response-cases';
import {processPreparationCaseSupervision} from '../lib/orders/response-supervision';
import {currentResponseNotice} from '../lib/orders/response-notifications';
const hour=3600000;
void test('delay cases retain first response, absolute checkpoint and overdue customer promises without invented extensions',async()=>{
 const f=await actionableOrderFixture();try{
  const ctx={actorId:'registered-owner',requestId:'supervision-delay',expectedRevision:null,now:f.releasedAt};
  const reported=await reportPreparationIssue(f.db,ctx,{portionId:String(f.rows[0].portionId),itemIds:[String(f.rows[0].id)],kind:'delay',detail:'Fictional preparation needs an actual material recovery decision.',proposedReadyAt:null});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM review_tasks WHERE source_type='order_response' AND source_id=?").get(reported.id)!.n,1);
  f.setClock(f.releasedAt+2*hour);assert.equal((await processPreparationCaseSupervision(f.db)).alerts,1);assert.equal((await processPreparationCaseSupervision(f.db)).alerts,0);
  await recordPreparationFollowup(f.db,{actorId:'reviewer',requestId:'actual-update-promise',expectedRevision:'0',now:f.releasedAt+2*hour},{caseId:reported.id,ownerId:'reviewer',backupId:null,state:'waiting',nextUpdateAt:f.releasedAt+3*hour,privateNote:'Privately check the original materials and supplier response.',customerMessage:'The affected item is delayed. Support will check the available recovery options.'});
  f.setClock(f.releasedAt+3*hour);assert.equal((await processPreparationCaseSupervision(f.db)).alerts,1);assert.equal((await processPreparationCaseSupervision(f.db)).alerts,0);
  const overdue=f.sqlite.prepare("SELECT id FROM order_response_events WHERE kind='customer_update' AND case_revision IS NOT NULL").get()!;assert.equal(await currentResponseNotice(f.db,String(overdue.id)),true);
  f.setClock(f.releasedAt+24*hour);assert.equal((await processPreparationCaseSupervision(f.db)).alerts,1);assert.equal(f.sqlite.prepare('SELECT next_update_at FROM order_response_cases WHERE id=?').get(reported.id)!.next_update_at,f.releasedAt+3*hour);
  f.setClock(f.releasedAt+27*hour);assert.equal((await processPreparationCaseSupervision(f.db)).alerts,1);assert.equal(await currentResponseNotice(f.db,String(overdue.id)),false);
  assert.equal(f.sqlite.prepare('SELECT created_at FROM order_response_cases WHERE id=?').get(reported.id)!.created_at,f.releasedAt);
  assert.equal(f.sqlite.prepare('SELECT fulfillment_status FROM order_items WHERE id=?').get(f.rows[0].id)!.fulfillment_status,'confirmed');
 }finally{f.dispose();}
});
