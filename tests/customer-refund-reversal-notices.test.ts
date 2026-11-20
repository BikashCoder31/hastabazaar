import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {recordCustomerRefundReversal,retainCustomerRefundRecovery} from '../lib/payments/customer-refund-reversal';
import {getSellerRecoveryReview,correctSellerRecoveryLiability} from '../lib/payments/seller-recovery';
import {isCurrentFinancialNotice,type CurrentOperationalNotice} from '../lib/operations/financial-notice-sources';
const projection="template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId";
for(const disposition of ['retain','correct'] as const)void test('actual refund bank return suppresses paid notice and emits safe '+disposition+' outcome once',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(r=>r.file===''));
  const packet=f.sqlite.prepare("SELECT id,revision FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
  const old=f.sqlite.prepare(`SELECT ${projection} FROM notification_messages WHERE template_key='business.finance.refund' AND related_id=? AND recipient_user_id='customer' AND channel='email' ORDER BY created_at DESC,rowid DESC LIMIT 1`).get(f.obligationId) as unknown as CurrentOperationalNotice;
  assert.ok(old);assert.equal(await isCurrentFinancialNotice(f.db,old),true);
  f.sqlite.exec("INSERT INTO users(id,email,auth_subject,display_name,status,created_at,updated_at) VALUES('notice-interested','notice-interested@local.hastabazaar.test','notice-interested','Fictional Interested Operator','active',1,1);INSERT INTO user_roles(user_id,role,assigned_at) VALUES('notice-interested','super_admin',1)");
  const receipt=await recordBankReceipt(f.db,f.ctx('notice-return-bank'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-NOTICE-REFUND-RETURN',bankAt:Date.now()-1,amountMinor:f.cashPaisa,currency:'NPR',payerReference:'Original customer bank return',payerUserId:'customer',evidenceReference:'FICTIONAL-PRIVATE-RETURN-EVIDENCE',completedCreditConfirmed:true,conflictUserIds:['notice-interested'],reason:'Independently record the actual original refund returned credit.'});
  const ctx=f.ctx('notice-return-record',String(packet.revision)),input={packetId:String(packet.id),receiptId:receipt.id,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-PRIVATE-RETURN-EVIDENCE',reason:'The bank actually returned the original customer refund; retain truthful current responsibility.'};
  const returned=await recordCustomerRefundReversal(f.db,ctx,input);await recordCustomerRefundReversal(f.db,ctx,input);
  assert.equal(await isCurrentFinancialNotice(f.db,old),false,'The queued paid announcement is obsolete after actual bank return.');
  async function assertCopies(status:string){
   const marker=f.sqlite.prepare("SELECT current_event_id eventId,current_status status FROM operational_notice_states WHERE family='finance.refund' AND source_id=?").get(f.obligationId)!;assert.equal(marker.status,status);
   const rows=f.sqlite.prepare(`SELECT ${projection},body_en body FROM notification_messages WHERE template_key='business.finance.refund' AND related_id=?`).all(f.obligationId) as unknown as (CurrentOperationalNotice&{body:string})[];
   const current=[];for(const row of rows)if(await isCurrentFinancialNotice(f.db,row))current.push(row);
   assert.deepEqual(current.map(r=>r.userId+':'+r.channel).sort(),['customer:email','customer:in_app','reviewer:email','reviewer:in_app']);assert.doesNotMatch(JSON.stringify(current),/FICTIONAL-PRIVATE|TEST-REFUND|accountNumber|Completed payment recorded/);
   return rows.length;
  }
  await assertCopies('customer_refund_reversed');
  const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId),decision=f.ctx('notice-return-'+disposition,String(review.case.revision));
  if(disposition==='retain'){
   const retry=await f.m.openRefundObligation(f.db,f.ctx('notice-return-retry'),{kind:'receipt_return',sourceId:receipt.id,reason:'Reserve the actual returned credit for separately verified original customer reissue.'});
   const retain={caseId:f.recoveryId,reversalId:returned.id,retryObligationId:retry.id,reviewDigest:review.reviewDigest,stillValidObligationConfirmed:true,evidenceReference:'FICTIONAL-PRIVATE-VALIDITY',reason:'The independently reviewed original obligation remains due for separate verified reissue.',publicMessage:'The original obligation remains valid while the returned credit awaits verified reissue.'};
   await retainCustomerRefundRecovery(f.db,decision,retain);const count=await assertCopies('customer_reversal_retained');await retainCustomerRefundRecovery(f.db,decision,retain);assert.equal(await assertCopies('customer_reversal_retained'),count);
  }else{
   const correction={caseId:f.recoveryId,customerRefundReversalId:returned.id,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-PRIVATE-CORRECTION',reason:'The independently reviewed original responsibility is corrected without claiming a new transfer.',publicMessage:'Finance recorded the corrected responsibility for the returned original refund.'};
   await correctSellerRecoveryLiability(f.db,decision,correction);const count=await assertCopies('customer_reversal_corrected');await correctSellerRecoveryLiability(f.db,decision,correction);assert.equal(await assertCopies('customer_reversal_corrected'),count);
  }
  assert.equal(f.sqlite.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').get(packet.id)!.state,'paid');
 }finally{f.dispose();}
});
