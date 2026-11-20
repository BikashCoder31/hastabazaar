import assert from 'node:assert/strict';
import test from 'node:test';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {recordCompanyCashReceipt} from '../lib/payments/cash-receipts';
import {triagePaymentException} from '../lib/payments/exception-review';
import {preparePaymentException} from '../lib/payments/payment-exceptions';
import {getCustomerManualPayment,reviewPaymentClaim,submitPaymentClaim} from '../lib/payments/manual-receipts';

void test('actual exception ownership and follow-up retain original age, protected history and exact retry while new evidence reopens the same case',async()=>{
 const f=await manualOrderFixture();try{
  const now=Date.now(),context={actorId:'reviewer',requestId:'cash-for-owned-case',expectedRevision:null,now};
  await recordCompanyCashReceipt(f.db,context,{handoverIdentity:'FICTIONAL-CASE-CASH',collectorName:'Fictional carrier',collectorUserId:null,custodyReference:'FICTIONAL-COUNTED-CUSTODY',amountPaisa:10000,occurredAt:now,evidenceReference:'FICTIONAL-SIGNED-CASH-RECEIPT',actualHandoverConfirmed:true,reason:'Verify actual fictional company cash before opening its allocation review.'});
  const original=f.sqlite.prepare('SELECT * FROM manual_payment_exceptions').get()!,id=String(original.id),input={exceptionId:id,ownerId:'reviewer',backupId:null,waiting:true,nextUpdateAt:now+3600000,note:'Waiting for independently confirmed payer instructions; Finance retains this follow-up.'},ctx={actorId:'reviewer',requestId:'triage-owned-case',expectedRevision:'0',now};
  await assert.rejects(triagePaymentException(f.db,{...ctx,actorId:'delegate'},input));
  await assert.rejects(triagePaymentException(f.db,ctx,{...input,backupId:'reviewer'}));
  const saved=await triagePaymentException(f.db,ctx,input);assert.deepEqual(await triagePaymentException(f.db,ctx,input),saved);
  const first=f.sqlite.prepare('SELECT * FROM manual_payment_exceptions WHERE id=?').get(id)!;assert.equal(first.created_at,original.created_at);assert.equal(first.owner_id,'reviewer');assert.equal(first.state,'waiting');assert.ok(first.triaged_at);
  await triagePaymentException(f.db,{...ctx,requestId:'next-owned-followup',expectedRevision:'1'},{...input,waiting:false,note:'Evidence arrived; the same eligible Finance owner is checking the supported allocation.'});
  assert.equal(f.sqlite.prepare('SELECT triaged_at FROM manual_payment_exceptions WHERE id=?').get(id)!.triaged_at,first.triaged_at);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_exception_events WHERE exception_id=?').get(id)!.n,2);
  assert.throws(()=>f.sqlite.prepare("UPDATE manual_payment_exception_events SET note='erased' WHERE exception_id=?").run(id),/immutable/);
  // Fixture-only resolved state represents a completed prior review; new evidence must not lose this retained identity.
  f.sqlite.prepare("UPDATE manual_payment_exceptions SET state='resolved' WHERE id=?").run(id);
  await f.db.batch(await preparePaymentException(f.db,{sourceKey:String(original.source_key),orderId:null,receiptId:String(original.receipt_id),kind:'unallocated_credit',ownerId:'reviewer',reason:'New actual payer evidence requires renewed review of this same source.',now:Date.now()}));
  const reopened=f.sqlite.prepare('SELECT * FROM manual_payment_exceptions WHERE id=?').get(id)!;assert.equal(reopened.state,'open');assert.equal(reopened.created_at,original.created_at);assert.equal(reopened.triaged_at,first.triaged_at);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM manual_payment_exceptions').get()!.n,1);
 }finally{f.dispose();}
});

void test('customer sees the current specific claim question without private receipt evidence or a new payment deadline',async()=>{
 const f=await manualOrderFixture();try{const now=Date.now();await submitPaymentClaim(f.db,{actorId:'customer',requestId:'claim-for-question',expectedRevision:null,now},{orderId:f.orderId,amountPaisa:10000,paymentDate:new Date(now).toISOString().slice(0,10),bankReference:null,note:'',evidenceIds:[]});
  const before=(await getCustomerManualPayment(f.db,'customer',f.orderId))!;await reviewPaymentClaim(f.db,{actorId:'reviewer',requestId:'specific-question',expectedRevision:'0',now},{orderId:f.orderId,action:'needs_information',reason:'Please confirm the payer name shown on the transfer you already sent.',expectedWindowRevision:1});
  const after=(await getCustomerManualPayment(f.db,'customer',f.orderId))!;assert.match(after.claim!.reviewReason!,/confirm the payer name/);assert.ok(after.claim!.nextUpdateAt);assert.equal(after.deadlineAt,before.deadlineAt);assert.equal(after.claim!.firstSubmittedAt,before.claim!.firstSubmittedAt);assert.equal(after.state,'under_review');assert.equal('evidenceReference' in after,false);
 }finally{f.dispose();}
});
