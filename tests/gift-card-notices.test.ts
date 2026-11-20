import test from 'node:test';
import assert from 'node:assert/strict';
import {giftCardWorkspaceFixture} from './helpers/gift-card-workspace-fixture';
import {redeemGiftCard} from '../lib/db/repositories/gift-cards';
import {validateSellerFormSubmission} from '../lib/forms/submission';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';
import {deliverBusinessEmails} from '../lib/operations/business-notifications';
void test('native gift outcomes notify the actual party and every eligible SA once per channel without bearer data',async()=>{
 const f=await giftCardWorkspaceFixture();try{const issued=await f.issue('gift-common-issued');assert.ok(issued.code);const read=()=>f.sqlite.prepare("SELECT recipient_user_id userId,channel,audience_role audience,template_key template,related_id relatedId,related_type relatedType,request_id requestId,subject_en subject,body_en body FROM notification_messages WHERE related_id=? ORDER BY userId,channel").all(issued.id);
  const issuedNotices=read();assert.deepEqual(issuedNotices.map(n=>[n.userId,n.channel]),[['reviewer','email'],['reviewer','in_app'],['second-staff','email'],['second-staff','in_app']]);assert.ok(issuedNotices.every(n=>n.template==='business.gift.issued'));assert.ok(issuedNotices.every(n=>!String(n.body).includes(issued.code!)&&!/hash|customAnswers/.test(String(n.body))));
  f.sqlite.prepare("UPDATE notification_messages SET status='read' WHERE related_id=? AND recipient_user_id='reviewer' AND channel='in_app'").run(issued.id);await f.issue('gift-common-issued');assert.equal(read().length,4);assert.equal(f.sqlite.prepare("SELECT status FROM notification_messages WHERE request_id=?").get('gift:'+issued.id+':issued')?.status,'read');
  const form=await validateSellerFormSubmission(f.db,'commerce.gift-card-redeem',f.redeemConfig.version,[],'gift-common-redeemed');await redeemGiftCard(f.db,{userId:'customer',code:issued.code,requestId:'gift-common-redeemed',now:Date.now(),form:{versionId:form.versionId,answers:form.answers}});
  const redeemed=read().filter(n=>n.template==='business.gift.redeemed');assert.deepEqual(redeemed.map(n=>[n.userId,n.channel]),[['customer','email'],['customer','in_app'],['reviewer','email'],['reviewer','in_app'],['second-staff','email'],['second-staff','in_app']]);
  const staff=redeemed.find(n=>n.userId==='second-staff');assert.ok(staff);assert.equal(await isCurrentOperationalNotice(f.db,staff as never),true);f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='second-staff'").run();assert.equal(await isCurrentOperationalNotice(f.db,staff as never),false);
 }finally{f.dispose();}
});

void test('gift fake capture rechecks original recipient/current SA before handoff and never resends accepted copies',async()=>{
 const f=await giftCardWorkspaceFixture();try{f.sqlite.prepare("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer'").run();f.sqlite.exec("UPDATE notification_messages SET status='cancelled' WHERE channel='email'");const issued=await f.issue('gift-capture-original');assert.ok(issued.code);const form=await validateSellerFormSubmission(f.db,'commerce.gift-card-redeem',f.redeemConfig.version,[],'gift-capture-redemption');await redeemGiftCard(f.db,{userId:'customer',code:issued.code,requestId:'gift-capture-redemption',now:Date.now(),form:{versionId:form.versionId,answers:form.answers}});
  // Revocation after enqueue must suppress both eligible-SA copies, not erase the gift facts.
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='second-staff'").run();const captured:{to:string;text:string}[]=[];
  const result=await deliverBusinessEmails(f.db,{transport:'capture',transportKey:'fictional-gift-only',handoffAware:true,send:async(message,ctx)=>{await ctx?.beforeHandoff?.();captured.push({to:message.to,text:JSON.stringify(message)});return{outcome:'captured',transport:'capture',receipt:'fictional-gift-capture'};}},'http://localhost:3018',{limit:20});
  assert.equal(result.accepted,3,JSON.stringify(result));assert.equal(captured.filter(row=>row.to==='reviewer@local.hastabazaar.test').length,2);assert.equal(captured.filter(row=>row.to==='customer@local.hastabazaar.test').length,1);assert.ok(captured.every(row=>!row.text.includes(issued.code!)&&!/code_hash|customAnswers/.test(row.text)));
  await deliverBusinessEmails(f.db,{transport:'capture',send:async()=>{assert.fail('The original captured gift outcome must not resend.');}},'http://localhost:3018');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM wallet_entries WHERE gift_card_id=?').get(issued.id)?.n,1);
 }finally{f.dispose();}
});
