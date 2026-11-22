import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {recordCustomerRefundReversal} from '../lib/payments/customer-refund-reversal';
import {allocateSellerRecoveryReceipt,getSellerRecoveryReview,correctSellerRecoveryLiability} from '../lib/payments/seller-recovery';
void test('native competing returned credits share one retained original cash cap and grouped correction replays once',async()=>{
 const f=await approvedSellerRecoveryFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const packet=f.sqlite.prepare("SELECT id,revision FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
 const repayment=await recordBankReceipt(f.db,f.ctx('native-return-original-repayment'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-NATIVE-RETURN-REPAYMENT',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Original registered seller',payerUserId:'registered-owner',evidenceReference:'FICTIONAL-NATIVE-RETURN-REPAYMENT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify an actual seller collection before racing independently verified customer returned credits.'});
 await allocateSellerRecoveryReceipt(f.db,f.ctx('native-return-original-allocation','1'),{caseId:f.recoveryId,receiptId:repayment.id,receiptRevision:0,amountPaisa:20000,method:'cash',evidenceReference:'FICTIONAL-NATIVE-RETURN-ALLOCATION',reason:'Apply actual seller collection once against the retained original recovery.'});
 assert.equal(f.cashPaisa%2,0);const amount=f.cashPaisa/2;
 const receipts=[];
 for(let index=0;index<3;index++)receipts.push(await recordBankReceipt(f.db,f.ctx('native-return-credit-'+index),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-NATIVE-PARTIAL-CUSTOMER-RETURN-'+index,bankAt:Date.now()-1,amountMinor:amount,currency:'NPR',payerReference:'Original customer partial refund return',payerUserId:'customer',evidenceReference:'FICTIONAL-NATIVE-CUSTOMER-CREDIT-'+index,completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify this distinct actual partial returned credit before the original paid cash cap race.'}));
 f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)").run();
 f.sqlite.prepare("UPDATE seller_profiles SET user_id='customer' WHERE id='registered'").run();
 native=await nativeFinanceClone(f.sqlite);const db=native.db;
 const inputs=receipts.map(receipt=>({packetId:String(packet.id),receiptId:receipt.id,receiptRevision:0,amountPaisa:amount,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-NATIVE-EXACT-CUSTOMER-RETURN',reason:'Record the exact partial returned credit only within the original paid customer cash cap.'}));
 await assert.rejects(recordCustomerRefundReversal(db,{...f.ctx('native-old-owner-service',String(packet.revision)),actorId:'registered-owner'},inputs[0]),/retained original party/);
 await assert.rejects(db.prepare(`INSERT INTO customer_refund_reversals(id,packet_id,obligation_id,receipt_id,amount_paisa,actor_id,request_id,evidence_reference,reason,created_at) VALUES('native-retained-owner',?,?,?,?,'registered-owner','native-retained-owner','FICTIONAL-NATIVE-OLD-OWNER','Reject retained personal interest',?)`).bind(packet.id,f.obligationId,receipts[0].id,amount,Date.now()).run(),/customer_refund_actual_return_required/);
 await db.prepare("UPDATE seller_profiles SET user_id='registered-owner' WHERE id='registered'").run();
 const results=await Promise.allSettled(inputs.map((input,index)=>recordCustomerRefundReversal(db,f.ctx('native-return-race-'+index,String(packet.revision)),input)));
 assert.ok(results.some(result=>result.status==='fulfilled'));
 // Independent actual credits can lose the affected-case revision race. Retry only
 // uncommitted attempts with fresh case reads; the original bank cash cap still wins.
 for(const [index,result] of results.entries())if(result.status==='rejected'){
  try{results[index]={status:'fulfilled',value:await recordCustomerRefundReversal(db,f.ctx('native-return-race-'+index,String(packet.revision)),inputs[index])};}catch(error){results[index]={status:'rejected',reason:error};}
 }
 assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
 assert.equal(results.filter(result=>result.status==='rejected').length,1);
 const rows=(await db.prepare('SELECT id,receipt_id receiptId FROM customer_refund_reversals ORDER BY id').all<{id:string;receiptId:string}>()).results;
 assert.equal(rows.length,2);
 assert.equal((await db.prepare('SELECT used_paisa n FROM customer_refund_return_pools WHERE packet_id=?').bind(packet.id).first<{n:number}>())!.n,f.cashPaisa);
 assert.equal((await db.prepare('SELECT SUM(amount_paisa) n FROM customer_refund_reversals WHERE packet_id=?').bind(packet.id).first<{n:number}>())!.n,f.cashPaisa);
 for(const [index,result] of results.entries())if(result.status==='fulfilled')assert.deepEqual(await recordCustomerRefundReversal(db,f.ctx('native-return-race-'+index,String(packet.revision)),inputs[index]),result.value);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM seller_recovery_events WHERE case_id=? AND action='customer_refund_reversed'").bind(f.recoveryId).first<{n:number}>())!.n,2);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM notification_messages WHERE related_id=? AND related_type='seller_recovery' AND recipient_user_id='registered-owner' AND subject_en='Recovery statement: customer refund reversed'").bind(f.recoveryId).first<{n:number}>())!.n,4);
 const review=await getSellerRecoveryReview(db,'reviewer',f.recoveryId),ctx=f.ctx('native-group-correction',String(review.case.revision));
 const input={caseId:f.recoveryId,customerRefundReversalIds:rows.map(row=>row.id),newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-NATIVE-GROUP-CORRECTION',reason:'All listed pending returned credits are explicitly reviewed in one original responsibility correction.',publicMessage:'Your original responsibility is removed and actual retained seller money is restored once.'};
 const saved=await correctSellerRecoveryLiability(db,ctx,input);assert.deepEqual(await correctSellerRecoveryLiability(db,ctx,input),saved);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM seller_recovery_liability_corrections').first<{n:number}>())!.n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM customer_refund_reversal_dispositions').first<{n:number}>())!.n,2);
 assert.equal((await db.prepare('SELECT restored_paisa n FROM seller_recovery_cases WHERE id=?').bind(f.recoveryId).first<{n:number}>())!.n,20000);
 assert.equal((await db.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').bind(packet.id).first<{state:string}>())!.state,'paid');
 }finally{if(native)await native.dispose();f.dispose();}
});

void test('native current same-account interest excludes recording and retaining without rewriting original evidence',async()=>{
 const f=await approvedSellerRecoveryFixture();let native:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const {saveCompanyAccountDraft}=await import('../lib/payments/company-accounts');
 const {retainCustomerRefundRecovery}=await import('../lib/payments/customer-refund-reversal');
 const packet=f.sqlite.prepare("SELECT id,revision FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;assert.equal(f.cashPaisa%2,0);const amount=f.cashPaisa/2,receipts=[];
 for(let index=0;index<2;index++)receipts.push(await recordBankReceipt(f.db,f.ctx('current-interest-credit-'+index),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CURRENT-INTEREST-CREDIT-'+index,bankAt:Date.now()-1,amountMinor:amount,currency:'NPR',payerReference:'Original customer refund returned',payerUserId:'customer',evidenceReference:'FICTIONAL-CURRENT-INTEREST-CREDIT-'+index,completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify an actual independent returned customer credit before an account eligibility change.'}));
 const recordInput={packetId:String(packet.id),receiptId:receipts[0].id,receiptRevision:0,amountPaisa:amount,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-CURRENT-INTEREST-ORIGINAL',reason:'Record the first returned half before a later declared current account interest.'};
 const original=await recordCustomerRefundReversal(f.db,f.ctx('current-interest-original',String(packet.revision)),recordInput);
 const retry=await f.m.openRefundObligation(f.db,f.ctx('current-interest-retry'),{kind:'receipt_return',sourceId:receipts[0].id,reason:'Reserve the actual first returned half for its original customer while the obligation remains valid.'});
 const review=await getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 const account=f.sqlite.prepare('SELECT v.account_id accountId,v.details_json details,a.revision FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id WHERE v.id=?').get(f.accountVersionId)!;
 await saveCompanyAccountDraft(f.db,f.ctx('current-interest-replacement',String(account.revision)),{accountId:String(account.accountId),basedOnVersionId:f.accountVersionId,details:JSON.parse(String(account.details)),evidenceReference:'FICTIONAL-CURRENT-INTEREST-REPLACEMENT',conflictUserIds:['reviewer'],reason:'Record the operator newly declared personal company account interest through its supported replacement.'});
 assert.deepEqual(JSON.parse(String(f.sqlite.prepare('SELECT conflicts_json FROM company_payment_account_versions WHERE id=?').get(f.accountVersionId)!.conflicts_json)),[]);
 native=await nativeFinanceClone(f.sqlite);const db=native.db;
 await assert.rejects(recordCustomerRefundReversal(db,f.ctx('current-interest-new-record',String(packet.revision)),{...recordInput,receiptId:receipts[1].id}),/company account interest/);
 await assert.rejects(retainCustomerRefundRecovery(db,f.ctx('current-interest-retain',String(review.case.revision)),{caseId:f.recoveryId,reversalId:original.id,retryObligationId:retry.id,reviewDigest:review.reviewDigest,stillValidObligationConfirmed:true,evidenceReference:'FICTIONAL-CURRENT-INTEREST-RETAIN',reason:'Attempt the original valid obligation review after the operator became personally conflicted.',publicMessage:'The original obligation remains due pending its separately verified reissue.'}),/company account interest/);
 await assert.rejects(db.prepare(`INSERT INTO customer_refund_reversals(id,packet_id,obligation_id,receipt_id,amount_paisa,actor_id,request_id,evidence_reference,reason,created_at) VALUES('current-interest-forged-record',?,?,?,?,'reviewer','current-interest-forged-record','FICTIONAL-CURRENT-INTEREST-NATIVE','Reject current company account personal interest',?)`).bind(packet.id,f.obligationId,receipts[1].id,amount,Date.now()).run(),/customer_refund_actual_return_required/);
 await assert.rejects(db.prepare(`INSERT INTO customer_refund_reversal_dispositions(id,reversal_id,case_id,case_revision,kind,retry_obligation_id,correction_id,actor_id,request_id,evidence_reference,reason,public_message,created_at) VALUES('current-interest-forged-retain',?,?,?,'retain',?,NULL,'reviewer','current-interest-forged-retain','FICTIONAL-CURRENT-INTEREST-NATIVE','Reject current company account personal interest','The original obligation remains due pending review.',?)`).bind(original.id,f.recoveryId,review.case.revision,retry.id,Date.now()).run(),/customer_refund_disposition_link_required/);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM customer_refund_reversals').first<{n:number}>())!.n,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM customer_refund_reversal_dispositions').first<{n:number}>())!.n,0);
 assert.equal((await db.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').bind(packet.id).first<{state:string}>())!.state,'paid');
 }finally{if(native)await native.dispose();f.dispose();}
});
