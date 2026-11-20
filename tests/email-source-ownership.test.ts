import assert from 'node:assert/strict';
import test from 'node:test';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout} from '../lib/managed-commerce/live-payout-operations';
import {deliverBusinessEmails} from '../lib/operations/business-notifications';
void test('a source-authorized financial owner reaches capture without falling through legacy seller-id authorization',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  // The domain fixture has an ID-only reviewer; this delivery case includes a
  // fictional activated sign-in identity, as the actual sender requires.
  f.sqlite.prepare("UPDATE users SET auth_subject='fictional-reviewer-subject' WHERE id='reviewer'").run();
  f.sqlite.exec("UPDATE notification_messages SET status='cancelled' WHERE channel='email' AND status IN ('created','queued')");
  const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now());
  const payout=await prepareLiveManagedPayout(f.db,f.ctx('t29-owner-email-source'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'Capture the exact current owner notice without any real delivery or bank operation.'});
  const sent:string[]=[];
  const notice=f.sqlite.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE related_id=? AND recipient_user_id=? AND channel='email'").get(payout.id,f.ownerId)!;
  assert.equal(await(await import('../lib/operations/financial-notice-sources')).isCurrentFinancialNotice(f.db,notice as never),true,'The native source and original recipient must be current before attempting delivery.');
  const staff=f.sqlite.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE related_id=? AND audience_role='staff' AND channel='email'").get(payout.id)!;
  assert.equal(await(await import('../lib/operations/financial-notice-sources')).isCurrentFinancialNotice(f.db,staff as never),true,'The eligible actor-Super-Admin notice must be current.');
  const result=await deliverBusinessEmails(f.db,{transport:'capture',transportKey:'fictional-source-capture',handoffAware:true,send:async(message,context)=>{await context?.beforeHandoff?.();sent.push(message.to);return {outcome:'captured',transport:'capture',receipt:'fictional-only'};}},'http://localhost:3018',{limit:20});
  const owner=f.sqlite.prepare('SELECT email FROM users WHERE id=?').get(f.ownerId)!;
  assert.ok(sent.includes(String(owner.email)),JSON.stringify(result));
  assert.equal(result.accepted,2,'Both original owner and eligible actor-Super-Admin receive one capture.');
  assert.equal(f.sqlite.prepare("SELECT status FROM notification_messages WHERE related_id=? AND recipient_user_id=? AND channel='email'").get(payout.id,f.ownerId)!.status,'sent');
  await deliverBusinessEmails(f.db,{transport:'capture',send:async()=>{assert.fail('A captured current notice must never resend.');}},'http://localhost:3018');
 }finally{f.dispose();}
});
