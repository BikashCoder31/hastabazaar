import {operationalNotificationRequestId} from '../lib/operations/event-catalog';
import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredLiveFinancialFixture,refundActualLiveOrder} from './helpers/live-financial-lifecycle-fixture';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout} from '../lib/managed-commerce/live-payout-operations';
import * as transfers from '../lib/payments/payout-transfers';
import {deliverBusinessEmails} from '../lib/operations/business-notifications';
import type {DeliveryContext} from '../lib/email/delivery-attempts';

async function sources(){const path='../lib/operations/financial-notice-sources';const loadedFixtureModule=await import(path).catch(()=>null);assert.equal(typeof loadedFixtureModule?.isCurrentFinancialNotice,'function','Committed finance events need exact current-source notice adapters.');return loadedFixtureModule!;}

void test('actual payout preparation creates one safe owner and mandatory actor-SA copy per channel, replay creates none',async()=>{
 await sources();const f=await deliveredLiveFinancialFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.prepare("UPDATE users SET auth_subject=id WHERE id='reviewer' AND auth_subject IS NULL").run();
 const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now()),ctx=f.ctx('t29-original-payout-notice'),input={sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'An independently reviewed actual source creates an attributable safe operational event.'};
 const payout=await prepareLiveManagedPayout(f.db,ctx,input);assert.deepEqual(await prepareLiveManagedPayout(f.db,ctx,input),payout);
 const rows=f.sqlite.prepare("SELECT recipient_user_id userId,channel,body_en body FROM notification_messages WHERE template_key='business.finance.payout' AND related_id=?").all(payout.id);
 assert.deepEqual(rows.map(row=>row.userId+':'+row.channel).sort(),[f.ownerId+':email',f.ownerId+':in_app','reviewer:email','reviewer:in_app'].sort());
 assert.doesNotMatch(JSON.stringify(rows),/PRIVATE|TEST-ACTUAL|verification_reference|accountNumber|evidenceReference/);
 const currentNotice=f.sqlite.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE template_key='business.finance.payout' AND related_id=? AND recipient_user_id='reviewer' AND channel='email'").get(payout.id)!;
 assert.equal(await (await sources()).isCurrentFinancialNotice(f.db,currentNotice,Date.now()),true,'The exact eligible actor-SA notice is current before sending.');
 const captured:{to:string;subject:string;text:string;html:string}[]=[],mail={transport:'capture' as const,handoffAware:true,async send(message:{to:string;subject:string;text:string;html:string},context?:DeliveryContext){assert.ok(context);await context.beforeHandoff();captured.push(message);return {outcome:'captured' as const,transport:'capture' as const,receipt:'fictional-capture-'+context.attemptId};}};
 for(let pass=0;pass<5;pass++){const result=await deliverBusinessEmails(f.db,mail,'http://localhost:3018',{limit:40,now:Date.now()});if(result.accepted+result.failed+result.cancelled===0)break;}
 const delivered=f.sqlite.prepare("SELECT recipient_user_id userId,delivery_transport transport,status,failure_reason reason FROM notification_messages WHERE template_key='business.finance.payout' AND related_id=? AND channel='email'").all(payout.id);
 assert.equal(delivered.length,2);assert.ok(delivered.every(row=>row.status==='sent'&&row.transport==='capture'),JSON.stringify(delivered));
 assert.equal(captured.filter(message=>message.subject.includes('Actual maker payout prepared')).length,2);
 }finally{f.dispose();}
});

void test('actual bank approval, processing and uncertain outcome retain distinct source events and suppress obsolete queued approvals',async()=>{
 const adapter=await sources(),f=await deliveredLiveFinancialFixture();try{
 const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now()),payout=await prepareLiveManagedPayout(f.db,f.ctx('t29-packet-native'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'Review this actual original native earning before its bank instruction.'});
 const packet=await transfers.preparePayoutTransfer(f.db,f.ctx('t29-packet-prepared'),{model:'managed',payoutId:payout.id,accountVersionId:f.sources.accountVersionId,reason:'Prepare one instruction without implying an approved or completed transfer.'});
 await transfers.approvePayoutTransfer(f.db,f.ctx('t29-packet-approved','0'),{packetId:packet.id,reason:'Approve the exact current original source without claiming the bank has paid.'});
 const marker=f.sqlite.prepare("SELECT current_event_id eventId FROM operational_notice_states WHERE family='finance.payout' AND source_id=?").get(packet.id)!;
 const noticeKey=await operationalNotificationRequestId('business.finance.payout',String(marker.eventId),'reviewer','email');
 const old=f.sqlite.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE template_key='business.finance.payout' AND related_id=? AND request_id=? AND recipient_user_id='reviewer' AND channel='email'").get(packet.id,noticeKey)!;
 assert.ok(await adapter.isCurrentFinancialNotice(f.db,old,Date.now()));
 await transfers.startPayoutTransfer(f.db,f.ctx('t29-packet-processing','1'),{packetId:packet.id,reason:'Record the original bank instruction as processing while the result is unknown.'});
 await transfers.recordPayoutTransferOutcome(f.db,f.ctx('t29-packet-uncertain','2'),{packetId:packet.id,outcome:'uncertain',evidenceReference:'FICTIONAL-PRIVATE-BANK-EVIDENCE',reason:'The original provider outcome is uncertain and requires reconciliation before any further instruction.'});
 assert.equal(f.sqlite.prepare("SELECT current_status FROM operational_notice_states WHERE family='finance.payout' AND source_id=?").get(packet.id)!.current_status,'packet_uncertain');
 assert.equal(await adapter.isCurrentFinancialNotice(f.db,old,Date.now()),false);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,0);
 }finally{f.dispose();}
});

void test('standalone actual refund bank completion reaches original customer and eligible Finance without private evidence',async()=>{
 await sources();const f=await deliveredLiveFinancialFixture();try{
 const refund=await refundActualLiveOrder(f,'t29-standalone-refund');
 assert.equal(f.sqlite.prepare("SELECT current_status FROM operational_notice_states WHERE family='finance.refund' AND source_id=?").get(refund.obligationId)!.current_status,'packet_paid');
 const rows=f.sqlite.prepare("SELECT recipient_user_id userId,channel,body_en body FROM notification_messages WHERE template_key='business.finance.refund' AND related_id=?").all(refund.obligationId);
 assert.ok(rows.some(row=>row.userId===f.buyerId&&row.channel==='email'));assert.ok(rows.some(row=>row.userId==='reviewer'&&row.channel==='in_app'));
 assert.doesNotMatch(JSON.stringify(rows),/FICTIONAL-COMPLETED|OWNERSHIP|accountNumber|TEST-ACTUAL-CUSTOMER/);
 }finally{f.dispose();}
});



