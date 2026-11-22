import assert from 'node:assert/strict';
import test from 'node:test';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {mutateCustomerFeeWaiver} from '../lib/db/repositories/customer-fee-waivers';
import {readCustomerWaiverHistory} from '../lib/admin/customer-waiver-history';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {quoteCustomerServiceFee,customerFeeCheckoutGuards,customerFeeEvidenceInsert} from '../lib/db/repositories/customer-service-fees';
void test('waiver history keeps original reasons/versions, bounded continuation and current authority',async()=>{
 const f=await payoutTransferFixture();try{
 const actor={id:'reviewer',authSubject:'reviewer'},ctx=(requestId:string,expectedRevision:number,reason:string)=>({actorId:actor.id,authSubject:actor.authSubject,requestId,expectedRevision,now:f.now,reason});
 const policy=await createBusinessSettingDraft(f.db,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:700},actorId:actor.id,reason:'Fictional original customer charge policy.',requestId:'history-policy-draft',now:f.now});await publishBusinessSettingDraft(f.db,{id:policy.id,actorId:actor.id,expectedRevision:policy.revision,effectiveFrom:f.now,reason:'Publish the original fictional policy.',requestId:'history-policy-publish',now:f.now});
 const draft=await mutateCustomerFeeWaiver(f.db,ctx('history-create',0,'Original reason for fictional draft.'),{type:'create',terms:{name:'Fictional history',description:'Native isolated history.',startsAt:f.now-1,endsAt:f.now+60000}});
 await mutateCustomerFeeWaiver(f.db,ctx('history-publish',1,'Original reason for fictional publication.'),{type:'publish',campaignId:draft.id});
 // An actual native quote/immutable receipt on one fictional original zero-fee order;
 // this tests the report adapter, and does not claim a checkout browser journey.
 const quote=await quoteCustomerServiceFee(f.db,f.now),order=f.sqlite.prepare('SELECT o.id FROM orders o WHERE o.buyer_platform_fee_paisa=0 AND NOT EXISTS(SELECT 1 FROM order_customer_service_fees s WHERE s.order_id=o.id) LIMIT 1').get()!;assert.ok(order);await f.db.batch([...customerFeeCheckoutGuards(f.db,quote,f.now),customerFeeEvidenceInsert(f.db,order.id as string,quote.snapshot,f.now)]);
 await mutateCustomerFeeWaiver(f.db,ctx('history-pause',2,'Original reason for fictional pause.'),{type:'pause',campaignId:draft.id});
 const original=JSON.stringify(f.sqlite.prepare('SELECT * FROM customer_fee_waiver_revisions').all()),first=await readCustomerWaiverHistory(f.db,actor,{limit:2});assert.equal(first.rows.length,2);assert.ok(first.nextCursor);assert.deepEqual(first.rows.map(r=>r.revision),[3,2]);assert.match(first.rows[0].reason??'',/Original reason.*pause/);assert.equal(first.rows[0].orders,0);assert.equal(first.rows[0].waivedPaisa,0);
 const next=await readCustomerWaiverHistory(f.db,actor,{limit:2,cursor:first.nextCursor!});assert.deepEqual(next.rows.map(r=>r.revision),[1]);assert.equal(next.nextCursor,null);assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM customer_fee_waiver_revisions').all()),original);
 assert.equal(first.rows[1].orders,1);assert.equal(first.rows[1].waivedPaisa,700);
 await assert.rejects(()=>readCustomerWaiverHistory(f.db,{id:'payout-owner',authSubject:'payout-owner'},{limit:2}));f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();await assert.rejects(()=>readCustomerWaiverHistory(f.db,actor,{limit:2}));
 }finally{f.dispose();}
});
