import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalCommissionDatabase} from './helpers/commission-database';
import {getCommonFeeState,publishCommonFeePolicy} from '../lib/commission/coordinated-policy';
import {reconcileSellerFeeCases,recordFeeTermsContact} from '../lib/commission/terms-followup';
import {deliverBusinessEmails} from '../lib/operations/business-notifications';
void test('an owner who is also Super Admin keeps mandatory oversight email without duplicating the shared in-app notice',async()=>{
 const f=await historicalCommissionDatabase(true);try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.exec("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('user-a','super_admin',1)");
  const now=Date.UTC(2026,10,1),day=86400000,state=await getCommonFeeState(f.database,now);
  await publishCommonFeePolicy(f.database,{actorId:'owner',requestId:'mandatory-owner-first',expectedRevision:null,now},{expectedContext:state.context,basisPoints:1200,effectiveAt:now+16*day,reason:'Publish a fictional scheduled policy for mandatory notice verification.',replacesId:null});
  await reconcileSellerFeeCases(f.database,'seller-a',now);
  const current=f.sqlite.prepare("SELECT id,revision FROM commission_terms_cases WHERE seller_id='seller-a' AND state='open'").get()!,reminderAt=now+9*day;
  await recordFeeTermsContact(f.database,{actorId:'owner',requestId:'mandatory-owner-contact',expectedRevision:String(current.revision),now:reminderAt-3600000},{caseId:String(current.id),action:'contact',outcome:'reached',note:'A fictional personal contact occurred without accepting any terms.',nextAction:'Owner will review exact scheduled terms.',nextUpdateAt:reminderAt+day});
  await reconcileSellerFeeCases(f.database,'seller-a',reminderAt);
  const rows=f.sqlite.prepare("SELECT n.id,n.channel,n.audience_role FROM notification_messages n JOIN commission_terms_cases c ON c.last_notice_event_id=n.related_id WHERE c.seller_id='seller-a' AND c.state='open' AND n.recipient_user_id='user-a' AND n.template_key='business.fee.terms'").all();
  assert.deepEqual(rows.map(row=>row.channel).sort((a,b)=>String(a)<String(b)?-1:String(a)>String(b)?1:0),['email','in_app']);
  const currentEmail=rows.find(row=>row.channel==='email')!;
  f.sqlite.prepare("UPDATE notification_messages SET status='cancelled' WHERE channel='email' AND status IN ('created','queued') AND id<>?").run(currentEmail.id);
  const sent:string[]=[];
  await deliverBusinessEmails(f.database,{transport:'capture',handoffAware:true,send:async(message,context)=>{await context?.beforeHandoff?.();sent.push(message.to);return {outcome:'captured',transport:'capture',receipt:'fictional-only'};}},'http://localhost:3018',{now:reminderAt});
  assert.deepEqual(sent,['user-a@example.test']);
 }finally{await f.dispose();}
});
