import test from 'node:test';
import assert from 'node:assert/strict';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../lib/payments/payout-transfers';
import {isCurrentFinancialNotice} from '../lib/operations/financial-notice-sources';
import {operationalNotificationRequestId} from '../lib/operations/event-catalog';

void test('retained registered owner becoming Super Admin never becomes an eligible staff recipient after ownership change',async()=>{
 const f=await payoutTransferFixture();try{
 const packet=await preparePayoutTransfer(f.db,f.ctx('t29-retained-party-prepare'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Retain the actual original owner and exact immutable native source before any ownership change.'});
 await approvePayoutTransfer(f.db,f.ctx('t29-retained-party-approve','0'),{packetId:packet.id,reason:'An independent eligible reviewer approves this exact original instruction.'});
 await startPayoutTransfer(f.db,f.ctx('t29-retained-party-start','1'),{packetId:packet.id,reason:'The original instruction starts before a later current ownership change.'});
 f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('payout-owner','super_admin',1); INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('new-notice-owner','new-notice-owner@local.hastabazaar.test','Fictional new owner','active',1,1); UPDATE seller_profiles SET user_id='new-notice-owner' WHERE id='payout-seller'");
 await recordPayoutTransferOutcome(f.db,f.ctx('t29-retained-party-uncertain','2'),{packetId:packet.id,outcome:'uncertain',evidenceReference:'FICTIONAL-PRIVATE-RETAINED-BANK-INQUIRY',reason:'Preserve the actual original instruction while its independent bank inquiry remains uncertain.'});
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.finance.payout' AND related_id=? AND recipient_user_id='payout-owner' AND audience_role='staff'").get(packet.id)!.n,0);
 const state=f.sqlite.prepare("SELECT current_event_id eventId FROM operational_notice_states WHERE family='finance.payout' AND source_id=?").get(packet.id)!;
 const notice={template:'business.finance.payout',relatedId:packet.id,relatedType:'payout_transfer',userId:'payout-owner',audience:'staff',channel:'email',requestId:await operationalNotificationRequestId('business.finance.payout',String(state.eventId),'payout-owner','email')};
 assert.equal(await isCurrentFinancialNotice(f.db,notice,Date.now()),false,'Previously queued staff copies must be denied from the retained native party.');
 }finally{f.dispose();}
});
