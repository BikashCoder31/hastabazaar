import {getReturnHandling,recordReturnHandling} from '../lib/returns/handling';
import {advanceReturnAsAdmin} from '../lib/db/repositories/returns';
import {readRefundCurrentProgress} from '../lib/payments/refund-current-progress';
import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import * as reversal from '../lib/payments/customer-refund-reversal';
import * as recovery from '../lib/payments/seller-recovery';
import {saveCompanyAccountDraft} from '../lib/payments/company-accounts';
import {recordEarlierRefundDeadline} from '../lib/payments/refund-deadlines';
import {getCustomerRefundWorkspace,getRefundFinanceWorkspace} from '../lib/payments/refund-workspace';
import {uploadFinanceEvidence} from '../lib/payments/refund-evidence';
import {PNG} from 'pngjs';

async function fixture(){const f=await approvedSellerRecoveryFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const packet=f.sqlite.prepare("SELECT id,revision FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
 const receipt=await recordBankReceipt(f.db,f.ctx('reversal-bank-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CUSTOMER-REFUND-RETURNED',bankAt:Date.now()-1,amountMinor:f.cashPaisa,currency:'NPR',payerReference:'Original customer refund returned by the bank',payerUserId:'customer',evidenceReference:'FICTIONAL-CUSTOMER-REFUND-RETURN-PROOF',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify an actual bank credit returning the original outgoing customer refund.'});
 return {...f,packetId:String(packet.id),packetRevision:String(packet.revision),returnedReceiptId:receipt.id};
 }catch(error){f.dispose();throw error;}}

void test('a verified bank return retains the binding deadline and uses later earlier corrections',async()=>{
 const f=await fixture();try{
  const authorized=Number(f.sqlite.prepare('SELECT authorized_at FROM refund_obligations WHERE id=?').get(f.obligationId)!.authorized_at);
  const deadline=(id:string)=>f.sqlite.prepare('SELECT binding_due_at AS dueAt,revision,initiation_due_at AS initiation FROM refund_obligation_deadlines WHERE obligation_id=?').get(id)!;
  const change=(id:string,dueAt:number,requestId:string)=>recordEarlierRefundDeadline(f.db,f.ctx(requestId,String(deadline(id).revision)),{
   obligationId:id,dueAt,evidenceReference:'FICTIONAL-RETAINED-ORIGINAL-DUE-DATE',reason:'Keep the independently reviewed earlier deadline with its original evidence.'});
  const initialDue=authorized+3600000;
  const handling=(await getReturnHandling(f.db,f.caseId))!;
  await recordReturnHandling(f.db,f.ctx('deadline-original-no-return',String(handling.revision)),{
   caseId:f.caseId,action:'waive_return',quantity:1,occurredAt:handling.now,
   evidenceReference:'FICTIONAL-VERIFIED-UNSAFE-RETURN',privateNote:'Review confirmed the damaged item is unsafe to collect.',
   publicMessage:'No physical return is required for this refund.'});
  assert.ok(Number(deadline(f.obligationId).dueAt)>initialDue);
  await change(f.obligationId,initialDue,'bank-retry-original-due');
  const originalPacket=f.sqlite.prepare('SELECT * FROM outgoing_payment_packets WHERE id=?').get(f.packetId)!;
  await reversal.recordCustomerRefundReversal(f.db,f.ctx('deadline-reversal',f.packetRevision),{
   packetId:f.packetId,receiptId:f.returnedReceiptId,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,
   evidenceReference:'FICTIONAL-EXACT-RETURNED-PAYMENT',reason:'Record the verified returned transfer against the exact original paid obligation.'});
  const retry=await f.m.openRefundObligation(f.db,f.ctx('deadline-retry'),{kind:'receipt_return',sourceId:f.returnedReceiptId,
   reason:'Keep the verified returned credit tied to its original customer refund.'});
  assert.equal(deadline(retry.id).dueAt,initialDue);
  assert.equal(deadline(retry.id).initiation,null);
  const correctedDue=authorized+1800000;
  await change(f.obligationId,correctedDue,'bank-retry-original-earlier-due');
  const customer=(await getCustomerRefundWorkspace(f.db,'customer')).find(row=>row.id===retry.id);
  const finance=(await getRefundFinanceWorkspace(f.db,'reviewer',undefined,retry.id)).obligations.find(row=>row.id===retry.id);
  assert.equal(customer?.bindingDueAt,correctedDue);
  assert.equal(finance?.bindingDueAt,correctedDue);
  await assert.rejects(change(retry.id,correctedDue+1000,'retry-cannot-extend-effective-deadline'),/earlier binding deadline/);
  const retryDue=correctedDue-1000;
  await change(retry.id,retryDue,'retry-keeps-its-independently-earlier-deadline');
  assert.equal((await getCustomerRefundWorkspace(f.db,'customer')).find(row=>row.id===retry.id)?.bindingDueAt,retryDue);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM outgoing_payment_packets WHERE id=?').get(f.packetId),originalPacket);
  const unrelated=await recordBankReceipt(f.db,f.ctx('deadline-unrelated-credit'),{accountVersionId:f.accountVersionId,
   transactionIdentity:'FICTIONAL-DEADLINE-INDEPENDENT-CREDIT',bankAt:Date.now()-1,amountMinor:f.cashPaisa,currency:'NPR',
   payerReference:'Independent original customer bank credit',payerUserId:'customer',evidenceReference:'FICTIONAL-INDEPENDENT-CREDIT-PROOF',
   completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify a separate bank credit from the same customer without an outgoing reversal link.'});
  const separate=await f.m.openRefundObligation(f.db,f.ctx('deadline-unrelated-return'),{kind:'receipt_return',sourceId:unrelated.id,
   reason:'Return a separate verified bank credit to its identified original customer.'});
  assert.equal(deadline(separate.id).dueAt,null);
  assert.equal((await getCustomerRefundWorkspace(f.db,'customer')).find(row=>row.id===separate.id)?.bindingDueAt,null);
 }finally{f.dispose();}
});

void test('a reviewed legal trigger requires retained staff evidence for the exact refund',async()=>{
 const f=await fixture();try{
  const row=f.sqlite.prepare('SELECT o.authorized_at AS authorizedAt,d.revision,d.binding_due_at AS dueAt FROM refund_obligations o JOIN refund_obligation_deadlines d ON d.obligation_id=o.id WHERE o.id=?').get(f.obligationId)!;
  assert.equal(row.dueAt,null);
  const trigger={kind:'reviewed_legal_trigger' as const,occurredAt:Number(row.authorizedAt)-1000,authorityReference:'FICTIONAL-COUNSEL-REVIEW-V1'};
  const input={obligationId:f.obligationId,dueAt:Number(row.authorizedAt)+3600000,reason:'Record the earlier due date from the saved reviewed obligation evidence.',trigger};
  const context=(requestId:string)=>f.ctx(requestId,String(row.revision));
  await assert.rejects(recordEarlierRefundDeadline(f.db,context('missing-private-binding-trigger-proof'),{
   ...input,evidenceReference:'FICTIONAL-FREE-TEXT-LEGAL-REFERENCE'}),/retained private evidence/);
  const objects=new Map<string,ArrayBuffer>(),bucket={async get(key:string){const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes}:null;},
   async put(key:string,bytes:ArrayBuffer){objects.set(key,bytes);}} as unknown as R2Bucket;
  const proofImage=new PNG({width:2,height:2});proofImage.data.fill(255);
  const proof=new File([new Uint8Array(PNG.sync.write(proofImage))],'fixture-counsel-review.png',{type:'image/png'});
  const scope={kind:'obligation' as const,id:f.obligationId};
  const ownerFile=new File([await proof.arrayBuffer()],'fixture-customer-proof.png',{type:'image/png'});
  const {id:ownerProof}=await uploadFinanceEvidence(f.db,bucket,{...f.ctx('customer-binding-trigger-proof'),actorId:'customer'},scope,ownerFile,'customer');
  await assert.rejects(recordEarlierRefundDeadline(f.db,context('customer-proof-cannot-authorize-legal-trigger'),{
   ...input,evidenceReference:ownerProof}),/retained private evidence/);
  const {id:evidenceReference}=await uploadFinanceEvidence(f.db,bucket,f.ctx('staff-binding-trigger-proof'),scope,proof,'staff');
  await assert.rejects(recordEarlierRefundDeadline(f.db,context('future-legal-trigger'),{
   ...input,trigger:{...trigger,occurredAt:Date.now()+86400000},evidenceReference}),/trigger/);
  const approved=await recordEarlierRefundDeadline(f.db,context('earlier-reviewed-legal-trigger'),{...input,evidenceReference});
  assert.equal(approved.revision,Number(row.revision)+1);
  assert.equal((await getCustomerRefundWorkspace(f.db,'customer')).find(refund=>refund.id===f.obligationId)?.bindingDueAt,input.dueAt);
  const event=f.sqlite.prepare("SELECT private_details_json FROM refund_obligation_events WHERE obligation_id=? AND action='earlier_deadline_retained'").get(f.obligationId)!;
  assert.deepEqual(JSON.parse(String(event.private_details_json)).trigger,trigger);
  assert.doesNotMatch(JSON.stringify(await getCustomerRefundWorkspace(f.db,'customer')),/FICTIONAL-COUNSEL-REVIEW-V1|fixture-counsel-review\.png/);
 }finally{f.dispose();}
});

async function closeAfterCurrentSettlement(f:Awaited<ReturnType<typeof fixture>>,requestId:string){
 const handling=(await getReturnHandling(f.db,f.caseId))!;
 if(handling.inspectedQuantity+handling.waivedQuantity<handling.quantity)await recordReturnHandling(f.db,f.ctx(requestId+'-waiver',String(handling.revision)),{caseId:f.caseId,action:'waive_return',quantity:handling.quantity-handling.inspectedQuantity-handling.waivedQuantity,occurredAt:Date.now(),publicMessage:'Physical collection is waived after independent evidence review; the actual financial disposition is recorded separately.',privateNote:'Independently retained fictional evidence confirms these damaged goods are unsafe to collect. The eligible Super Admin authorizes the exact physical waiver.',evidenceReference:'FICTIONAL-CURRENT-SETTLED-PHYSICAL-WAIVER'});
 await advanceReturnAsAdmin(f.db,{returnRequestId:f.caseId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund',note:'Close only after the actual continuing refund or lawful recorded correction and required physical disposition.',publicMessageEn:'Physical handling and the recorded financial disposition are complete. Original payment and correction history remain available.',publicMessageNe:'भौतिक प्रक्रिया र अभिलेखमा भएको वित्तीय निर्णय पूरा भयो। मूल भुक्तानी र सच्याइएको विवरण सुरक्षित छन्।',requestId,now:Date.now()});
 assert.equal(f.sqlite.prepare('SELECT status FROM return_requests WHERE id=?').get(f.caseId)!.status,'resolved');
}

void test('actual customer refund reversal preserves paid facts and blocks collection until an explicit valid-obligation disposition',async()=>{
 const f=await fixture();try{
 const before=f.sqlite.prepare("SELECT id,type,amount_paisa FROM seller_ledger_entries WHERE refund_id=? ORDER BY id").all(f.refundId);
 const input={packetId:f.packetId,receiptId:f.returnedReceiptId,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-ORIGINAL-REFUND-REVERSAL',reason:'The bank returned the actual original customer transfer; review the continuing obligation.'};
 assert.equal(await readRefundCurrentProgress(f.db,f.refundId),null);
 const saved=await reversal.recordCustomerRefundReversal(f.db,f.ctx('record-customer-reversal',f.packetRevision),input);
 assert.equal((await readRefundCurrentProgress(f.db,f.refundId))!.status,'returned_for_review');
 assert.equal((await reversal.recordCustomerRefundReversal(f.db,f.ctx('record-customer-reversal',f.packetRevision),input)).id,saved.id);
 const recordEvent=f.sqlite.prepare("SELECT revision,request_id,details_json FROM seller_recovery_events WHERE case_id=? AND action='customer_refund_reversed'").all(f.recoveryId);
 assert.equal(recordEvent.length,1);assert.equal(recordEvent[0].request_id,'record-customer-reversal:'+f.recoveryId);assert.equal(recordEvent[0].revision,f.sqlite.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.revision);
 const recordNotices=f.sqlite.prepare("SELECT channel,status,body_en FROM notification_messages WHERE related_type='seller_recovery' AND related_id=? AND recipient_user_id='registered-owner' AND subject_en='Recovery statement: customer refund reversed' ORDER BY channel").all(f.recoveryId);
 assert.deepEqual(recordNotices.map(row=>row.channel),['email','in_app']);assert.ok(recordNotices.every(row=>row.status==='queued'&&String(row.body_en).includes('Collection is paused')));assert.doesNotMatch(JSON.stringify(recordNotices),/FICTIONAL-ORIGINAL-REFUND-REVERSAL|TEST-REFUND|accountNumber/);
 assert.equal(f.sqlite.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').get(f.packetId)!.state,'paid');
 assert.deepEqual(f.sqlite.prepare("SELECT id,type,amount_paisa FROM seller_ledger_entries WHERE refund_id=? ORDER BY id").all(f.refundId),before);
 assert.ok((await recovery.readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId})).blocker);
 const retry=await f.m.openRefundObligation(f.db,f.ctx('customer-retry-obligation'),{kind:'receipt_return',sourceId:f.returnedReceiptId,reason:'Return the actual received reversal to the original customer under the still-valid refund.'});
 assert.equal(f.sqlite.prepare('SELECT binding_due_at FROM refund_obligation_deadlines WHERE obligation_id=?').get(f.obligationId)!.binding_due_at,null);
 assert.equal(f.sqlite.prepare('SELECT binding_due_at FROM refund_obligation_deadlines WHERE obligation_id=?').get(retry.id)!.binding_due_at,null);
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 const retainInput={caseId:f.recoveryId,reversalId:saved.id,retryObligationId:retry.id,reviewDigest:review.reviewDigest,stillValidObligationConfirmed:true,evidenceReference:'FICTIONAL-STILL-VALID-REFUND-BASIS',reason:'The original customer refund remains fully due and seller responsibility remains valid.',publicMessage:'Your original responsibility remains valid while the returned customer transfer is reissued.'},retainContext=f.ctx('retain-customer-liability',String(review.case.revision));
 const retained=await reversal.retainCustomerRefundRecovery(f.db,retainContext,retainInput);assert.equal((await readRefundCurrentProgress(f.db,f.refundId))!.status,'retry_pending');assert.deepEqual(await reversal.retainCustomerRefundRecovery(f.db,retainContext,retainInput),retained);
 const retainEvents=f.sqlite.prepare("SELECT revision,request_id,details_json FROM seller_recovery_events WHERE case_id=? AND action='customer_reversal_retained'").all(f.recoveryId);assert.equal(retainEvents.length,1);assert.equal(retainEvents[0].request_id,retainContext.requestId);assert.equal(retainEvents[0].revision,f.sqlite.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.revision);assert.equal(JSON.parse(String(retainEvents[0].details_json)).publicMessage,retainInput.publicMessage);
 const retainNotices=f.sqlite.prepare("SELECT channel,status,body_en FROM notification_messages WHERE related_type='seller_recovery' AND related_id=? AND recipient_user_id='registered-owner' AND subject_en='Recovery statement: customer reversal retained' ORDER BY channel").all(f.recoveryId);assert.deepEqual(retainNotices.map(row=>row.channel),['email','in_app']);assert.ok(retainNotices.every(row=>row.status==='queued'&&row.body_en===retainInput.publicMessage));
 const statement=await(await import('../lib/payments/recovery-workspace')).getSellerRecoveryStatement(f.db,'registered-owner',f.recoveryId);
 assert.ok(statement.events.some(event=>event.action==='customer_refund_reversed'&&event.message?.includes('Collection is paused')));assert.ok(statement.events.some(event=>event.action==='customer_reversal_retained'&&event.message===retainInput.publicMessage));assert.doesNotMatch(JSON.stringify(statement.events),/FICTIONAL-STILL-VALID-REFUND-BASIS|FICTIONAL-ORIGINAL-REFUND-REVERSAL|TEST-REFUND/);
 assert.equal((await recovery.readSellerRecoverySource(f.db,{kind:'refund',id:f.refundId})).blocker,null);
 const destination=await f.m.submitRefundDestination(f.db,{...f.ctx('retry-destination'),actorId:'customer',sessionHash:'FICTIONAL-PACKET-SESSION'},{obligationId:retry.id,details:{holder:'Fictional Buyer',bank:'Fictional Bank',branch:'Fictional Branch',accountNumber:'TEST-REFUND-001',currency:'NPR'},relationship:'own_account',authorization:'I authorize reissue to this exact customer-owned bank account.',evidenceReference:'FICTIONAL-RETRY-BENEFICIARY',reason:'Authenticate the exact original customer before separately verifying the retry.'});
 await f.m.verifyRefundDestination(f.db,f.ctx('retry-destination-verified','0'),{versionId:destination.id,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-RETRY-OWNERSHIP',reason:'Verify the continuing customer beneficiary for the actual retry transfer.'});
 const fundingRevision=String(f.sqlite.prepare('SELECT revision FROM company_funding_accounts WHERE account_id=(SELECT account_id FROM company_payment_account_versions WHERE id=?)').get(f.accountVersionId)!.revision);
 const now=Number(f.sqlite.prepare("SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) n").get()!.n);
 const funds=await f.m.recordRefundFundingStatement(f.db,f.ctx('retry-funding',fundingRevision),{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-RETRY-ACTUAL-FUNDS',asOf:now,cashPaisa:200000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-RETRY-ACTUAL-FUNDS',restrictionsReference:'FICTIONAL-RETRY-RESTRICTED-FUNDS',availableFundsConfirmed:true,reason:'Verify actual company funding after receiving the returned customer credit.'});
 const packet=await f.m.prepareRefundPacket(f.db,f.ctx('retry-packet','0'),{obligationId:retry.id,destinationVersionId:destination.id,fundingStatementId:funds.id,reason:'Prepare only the separately reserved returned customer credit.'});
 await f.m.approveRefundPacket(f.db,f.ctx('retry-approved','0'),{packetId:packet.id,reason:'Approve the exact verified customer and actual available company money.'});
 await f.m.startRefundPacket(f.db,f.ctx('retry-started','1'),{packetId:packet.id,reason:'Record the actual reissue instruction once against its reserved credit.'});
 assert.equal((await readRefundCurrentProgress(f.db,f.refundId))!.status,'retry_processing');
 await f.m.recordRefundPacketOutcome(f.db,f.ctx('retry-outcome-uncertain','2'),{packetId:packet.id,outcome:'uncertain',evidenceReference:'FICTIONAL-RETRY-UNKNOWN-OUTCOME',reason:'Retain the actual uncertain reissue and its reservation until independently reconciled.'});
 assert.equal((await readRefundCurrentProgress(f.db,f.refundId))!.status,'retry_uncertain');
 assert.equal(f.sqlite.prepare('SELECT state FROM manual_receipt_uses WHERE target_id=?').get(retry.id)!.state,'reserved');
 const outcome={packetId:packet.id,outcome:'paid' as const,amountPaisa:f.cashPaisa,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-CUSTOMER-REISSUE',evidenceReference:'FICTIONAL-CUSTOMER-REISSUE-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm the actual completed reissue to the original customer beneficiary.'};
 await f.m.recordRefundPacketOutcome(f.db,f.ctx('retry-paid','3'),outcome);
 await f.m.recordRefundPacketOutcome(f.db,f.ctx('retry-paid','3'),outcome);
 assert.equal(f.sqlite.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').get(packet.id)!.state,'paid');
 assert.equal((await readRefundCurrentProgress(f.db,f.refundId))!.status,'retry_completed');
 await closeAfterCurrentSettlement(f,'close-actual-completed-continuation');
 assert.equal(f.sqlite.prepare('SELECT state FROM manual_receipt_uses WHERE target_id=?').get(retry.id)!.state,'returned');
 assert.deepEqual(f.sqlite.prepare("SELECT id,type,amount_paisa FROM seller_ledger_entries WHERE refund_id=? ORDER BY id").all(f.refundId),before);
 // A supported replacement adds a current account interest without rewriting retained history.
 const account=f.sqlite.prepare('SELECT v.account_id accountId,v.details_json details,a.revision FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.id=v.account_id WHERE v.id=?').get(f.accountVersionId)!;
 await saveCompanyAccountDraft(f.db,f.ctx('later-current-account-conflict',String(account.revision)),{accountId:String(account.accountId),basedOnVersionId:f.accountVersionId,details:JSON.parse(String(account.details)),evidenceReference:'FICTIONAL-LATER-ACCOUNT-INTEREST',conflictUserIds:['reviewer'],reason:'Record a newly declared personal interest on the same company account in a replacement version.'});
 assert.deepEqual(JSON.parse(String(f.sqlite.prepare('SELECT conflicts_json FROM company_payment_account_versions WHERE id=?').get(f.accountVersionId)!.conflicts_json)),[]);
 await assert.rejects(reversal.retainCustomerRefundRecovery(f.db,retainContext,retainInput),/company account interest/);
 await assert.rejects(reversal.authorizeCustomerRefundRecoveryHistory(f.db,'reviewer',saved.id,f.recoveryId),/company account interest/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_refund_reversal_dispositions').get()!.n,1);
 assert.equal(f.sqlite.prepare("SELECT state FROM outgoing_payment_packets WHERE id=?").get(f.packetId)!.state,'paid');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_recovery_events WHERE case_id=? AND action='customer_reversal_retained'").get(f.recoveryId)!.n,1);
 assert.deepEqual(f.sqlite.prepare("SELECT id,type,amount_paisa FROM seller_ledger_entries WHERE refund_id=? ORDER BY id").all(f.refundId),before);
 }finally{f.dispose();}
});

void test('native reversal proof rejects unmatched credits, duplicate receipt use, and rewritten history',async()=>{
 const f=await fixture();try{
 const insert=(id:string,amount:number,packet=f.packetId,actor='reviewer',receipt=f.returnedReceiptId)=>f.sqlite.prepare(`INSERT INTO customer_refund_reversals(id,packet_id,obligation_id,receipt_id,amount_paisa,actor_id,request_id,evidence_reference,reason,created_at) VALUES(?,?,?,?,?,?,?,'FICTIONAL-NATIVE-RETURN','Actual returned credit proof',?)`).run(id,packet,f.obligationId,receipt,amount,actor,id,Date.now());
 assert.throws(()=>insert('bad-amount',f.cashPaisa-1),/customer_refund_actual_return_required/);
 assert.throws(()=>insert('bad-packet',f.cashPaisa,'unknown'),/customer_refund_actual_return_required/);
 assert.throws(()=>insert('customer-conflict',f.cashPaisa,f.packetId,'customer'),/customer_refund_actual_return_required/);
 const oldCredit=await recordBankReceipt(f.db,f.ctx('old-customer-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-CREDIT-BEFORE-REFUND',bankAt:Date.now()-86400000,amountMinor:f.cashPaisa,currency:'NPR',payerReference:'Original customer earlier credit',payerUserId:'customer',evidenceReference:'FICTIONAL-EARLIER-CREDIT-PROOF',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify an earlier customer credit that cannot prove a later outgoing refund reversal.'});
 assert.throws(()=>insert('preexisting-credit',f.cashPaisa,f.packetId,'reviewer',oldCredit.id),/customer_refund_actual_return_required/);
 insert('native-valid',f.cashPaisa);
 assert.throws(()=>insert('duplicate',f.cashPaisa));
 assert.throws(()=>f.sqlite.prepare('UPDATE customer_refund_reversals SET reason=? WHERE id=?').run('Rewritten history','native-valid'),/customer_refund_reversal_history_retained/);
 assert.throws(()=>f.sqlite.prepare('DELETE FROM customer_refund_reversals WHERE id=?').run('native-valid'),/customer_refund_reversal_history_retained/);
 const receipt=await recordBankReceipt(f.db,f.ctx('unrelated-customer-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-UNRELATED-CUSTOMER-CREDIT',bankAt:Date.now()-1,amountMinor:f.cashPaisa,currency:'NPR',payerReference:'Customer unrelated credit',payerUserId:'customer',evidenceReference:'FICTIONAL-UNRELATED-CREDIT-PROOF',completedCreditConfirmed:true,conflictUserIds:[],reason:'Separate unrelated credit cannot stand in for the actual returned bank credit.'});
 const retry=await f.m.openRefundObligation(f.db,f.ctx('wrong-retry'),{kind:'receipt_return',sourceId:receipt.id,reason:'Return this unrelated verified bank credit to its authenticated original payer.'});
 const revision=Number(f.sqlite.prepare('SELECT revision FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.revision);
 assert.throws(()=>f.sqlite.prepare(`INSERT INTO customer_refund_reversal_dispositions(id,reversal_id,case_id,case_revision,kind,retry_obligation_id,actor_id,request_id,evidence_reference,reason,public_message,created_at) VALUES('wrong-link','native-valid',?,?,'retain',?,'reviewer','wrong-link','FICTIONAL-WRONG-LINK','Retain still valid liability','Customer transfer remains due',?)`).run(f.recoveryId,revision,retry.id,Date.now()),/customer_refund_disposition_link_required/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_refund_reversal_dispositions').get()!.n,0);
 }finally{f.dispose();}
});

void test('a customer reversal correction restores actual seller collection once and pays only that restored entitlement',async()=>{
 const f=await fixture();try{
 const repayment=await recordBankReceipt(f.db,f.ctx('reversal-restoration-repayment'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-REVERSAL-SELLER-REPAYMENT',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Original registered seller',payerUserId:'registered-owner',evidenceReference:'FICTIONAL-REVERSAL-SELLER-REPAYMENT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify actual seller collection before a later customer refund bank reversal.'});
 await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('reversal-restoration-collected','1'),{caseId:f.recoveryId,receiptId:repayment.id,receiptRevision:0,amountPaisa:20000,method:'cash',evidenceReference:'FICTIONAL-REVERSAL-SELLER-ALLOCATION',reason:'Apply the independently verified repayment to the approved original recovery once.'});
 const originalEntries=f.sqlite.prepare('SELECT id,type,amount_paisa FROM seller_ledger_entries WHERE refund_id=? ORDER BY id').all(f.refundId);
 const returned=await reversal.recordCustomerRefundReversal(f.db,f.ctx('reversal-before-correction',f.packetRevision),{packetId:f.packetId,receiptId:f.returnedReceiptId,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-REVERSAL-CORRECTION-CREDIT',reason:'The bank returned the original customer refund; review the underlying responsibility.'});
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 const input={caseId:f.recoveryId,customerRefundReversalId:returned.id,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-REVERSAL-OVERTURNED-RESPONSIBILITY',reason:'The reviewed original responsibility is overturned and the actual seller collection must be restored.',publicMessage:'Your original responsibility is removed; your actual NPR 200 repayment is restored.'};
 const ctx=f.ctx('reversal-correction',String(review.case.revision));
 const result=await recovery.correctSellerRecoveryLiability(f.db,ctx,input);
 assert.equal((await readRefundCurrentProgress(f.db,f.refundId))!.status,'corrected');
 await closeAfterCurrentSettlement(f,'close-lawfully-corrected-disposition');
 assert.deepEqual(await recovery.correctSellerRecoveryLiability(f.db,ctx,input),result);
 assert.equal(f.sqlite.prepare('SELECT kind FROM customer_refund_reversal_dispositions WHERE reversal_id=?').get(returned.id)!.kind,'restore');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_liability_corrections WHERE case_id=?').get(f.recoveryId)!.n,1);
 assert.equal(f.sqlite.prepare('SELECT restored_paisa FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.restored_paisa,20000);
 assert.deepEqual(f.sqlite.prepare('SELECT id,type,amount_paisa FROM seller_ledger_entries WHERE refund_id=? ORDER BY id').all(f.refundId),originalEntries);
 const {prepareSellerPayout}=await import('../lib/db/repositories/payouts');
 const transfer=await import('../lib/payments/payout-transfers');
 const payout=await prepareSellerPayout(f.db,{sellerId:'registered',actorId:'reviewer',actorRole:'super_admin',requestId:'reversal-restored-payout',note:'Pay only the actual restored seller collection after the linked responsibility correction.',now:Date.now()});
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)!.amount_paisa,20000);
 const fundingRevision=String(f.sqlite.prepare('SELECT revision FROM company_funding_accounts WHERE account_id=(SELECT account_id FROM company_payment_account_versions WHERE id=?)').get(f.accountVersionId)!.revision);
 const now=Number(f.sqlite.prepare("SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) n").get()!.n);
 await f.m.recordRefundFundingStatement(f.db,f.ctx('reversal-restored-funding',fundingRevision),{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-RESTORED-ACTUAL-CAPITAL',asOf:now,cashPaisa:200000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-RESTORED-ACTUAL-CAPITAL',restrictionsReference:'FICTIONAL-RESTORED-RESTRICTED-CAPITAL',availableFundsConfirmed:true,reason:'Verify actual company funding independently of the seller restoration entitlement.'});
 const packet=await transfer.preparePayoutTransfer(f.db,f.ctx('reversal-restored-packet'),{model:'registered',payoutId:payout.id,accountVersionId:f.accountVersionId,reason:'Bind only the restored entitlement to the verified original seller bank beneficiary.'});
 await transfer.approvePayoutTransfer(f.db,f.ctx('reversal-restored-approve','0'),{packetId:packet.id,reason:'Approve the independently verified actual seller restoration transfer.'});
 await transfer.startPayoutTransfer(f.db,f.ctx('reversal-restored-start','1'),{packetId:packet.id,reason:'Record the actual restored seller payout instruction once.'});
 const outcome={packetId:packet.id,outcome:'paid' as const,amountPaisa:20000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-REVERSAL-RESTORED-SELLER-PAID',evidenceReference:'FICTIONAL-REVERSAL-RESTORED-SELLER-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify actual payment of restored collection to the original seller beneficiary.'};
 await transfer.recordPayoutTransferOutcome(f.db,f.ctx('reversal-restored-paid','2'),outcome);
 await transfer.recordPayoutTransferOutcome(f.db,f.ctx('reversal-restored-paid','2'),outcome);
 assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(payout.id)!.status,'paid');
 assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.payoutId)!.status,'paid');
 }finally{f.dispose();}
});

void test('simultaneous incoming repayment and outgoing customer reversals resolve bank attribution first without inventing retained liability',async()=>{
 const f=await fixture();try{
 const receipt=await recordBankReceipt(f.db,f.ctx('simultaneous-repayment'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-SIMULTANEOUS-REPAYMENT',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Original registered seller',payerUserId:'registered-owner',evidenceReference:'FICTIONAL-SIMULTANEOUS-REPAYMENT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify actual seller collection before the two independent bank reversals.'});
 await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('simultaneous-collected','1'),{caseId:f.recoveryId,receiptId:receipt.id,receiptRevision:0,amountPaisa:20000,method:'cash',evidenceReference:'FICTIONAL-SIMULTANEOUS-ALLOCATION',reason:'Allocate the actual seller repayment once against the original approved cap.'});
 const customer=await reversal.recordCustomerRefundReversal(f.db,f.ctx('simultaneous-customer-return',f.packetRevision),{packetId:f.packetId,receiptId:f.returnedReceiptId,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-SIMULTANEOUS-CUSTOMER-RETURN',reason:'Record the actual returned original customer refund independently from seller repayment.'});
 const {recordReceiptReversal}=await import('../lib/payments/receipt-corrections');
 const incoming=await recordReceiptReversal(f.db,f.ctx('simultaneous-incoming-return','1'),{receiptId:receipt.id,amountMinor:10000,transactionIdentity:'FICTIONAL-SIMULTANEOUS-INCOMING-RETURN',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-SIMULTANEOUS-INCOMING-RETURN',reason:'The bank also reversed half the actual seller repayment; attribute that bank fact first.'});
 const before=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 const correction={caseId:f.recoveryId,customerRefundReversalId:customer.id,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:before.reviewDigest,evidenceReference:'FICTIONAL-SIMULTANEOUS-CORRECTION',reason:'The actual underlying seller responsibility is overturned after both bank facts are reconciled.',publicMessage:'Your responsibility is removed and only actual retained company collection is restored.'};
 await assert.rejects(recovery.correctSellerRecoveryLiability(f.db,f.ctx('simultaneous-too-early',String(before.case.revision)),correction),/current original liability/);
 const disposition=await import('../lib/payments/recovery-receipt-disposition');
 const review=await disposition.getRecoveryReceiptReversalReview(f.db,'reviewer',incoming.id);
 const allocationId=String(f.sqlite.prepare('SELECT id FROM seller_recovery_allocations WHERE receipt_id=?').get(receipt.id)!.id);
 const input={reversalId:incoming.id,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId,amountPaisa:10000}],evidenceReference:'FICTIONAL-SIMULTANEOUS-INCOMING-ATTRIBUTION',reason:'Attribute the actual reversed repayment without deciding that the underlying liability remains valid.',publicMessage:'The bank reversed part of the original repayment. The underlying responsibility remains under separate review.'};
 const ctx=f.ctx('simultaneous-bank-attribution',String(review.receiptRevision));
 const saved=await disposition.reconcileRecoveryReceiptReversal(f.db,ctx,input);assert.deepEqual(await disposition.reconcileRecoveryReceiptReversal(f.db,ctx,input),saved);
 const held=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(held.unreconciledReceiptPaisa,0);assert.equal(held.position.collectiblePaisa,0);assert.equal(held.source.blocker,reversal.CUSTOMER_REFUND_REVERSAL_BLOCKER);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_refund_reversal_dispositions').get()!.n,0);
 await recovery.correctSellerRecoveryLiability(f.db,f.ctx('simultaneous-corrected',String(held.case.revision)),{...correction,reviewDigest:held.reviewDigest});
 const after=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 assert.equal(after.case.confirmedPaisa,0);assert.equal(after.case.restoredPaisa,10000);assert.equal(after.position.remainingPaisa,0);assert.equal(after.position.recoveredPaisa,0);
 assert.equal(f.sqlite.prepare('SELECT kind FROM customer_refund_reversal_dispositions WHERE reversal_id=?').get(customer.id)!.kind,'restore');
 }finally{f.dispose();}
});

void test('one explicit grouped correction covers every partial returned credit and never duplicates native restoration',async()=>{
 const f=await fixture();try{
 const repayment=await recordBankReceipt(f.db,f.ctx('group-actual-repayment'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-GROUP-SELLER-REPAYMENT',bankAt:Date.now()-1,amountMinor:20000,currency:'NPR',payerReference:'Original registered seller',payerUserId:'registered-owner',evidenceReference:'FICTIONAL-GROUP-SELLER-REPAYMENT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify an actual seller repayment before the grouped partial customer bank returns.'});
 await recovery.allocateSellerRecoveryReceipt(f.db,f.ctx('group-original-collection','1'),{caseId:f.recoveryId,receiptId:repayment.id,receiptRevision:0,amountPaisa:20000,method:'cash',evidenceReference:'FICTIONAL-GROUP-ORIGINAL-COLLECTION',reason:'Allocate actual seller money once before reviewing the customer bank returns.'});
 const ids:string[]=[];
 for(const [index,amount] of [Math.floor(f.cashPaisa/2),f.cashPaisa-Math.floor(f.cashPaisa/2)].entries()){
 const receipt=await recordBankReceipt(f.db,f.ctx('group-credit-'+index),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-GROUP-CUSTOMER-RETURN-'+index,bankAt:Date.now()-1,amountMinor:amount,currency:'NPR',payerReference:'Original customer partial returned refund',payerUserId:'customer',evidenceReference:'FICTIONAL-GROUP-CUSTOMER-PROOF-'+index,completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify this separate actual partial bank credit returning the original paid customer refund.'});
 ids.push((await reversal.recordCustomerRefundReversal(f.db,f.ctx('group-record-'+index,f.packetRevision),{packetId:f.packetId,receiptId:receipt.id,receiptRevision:0,amountPaisa:amount,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-GROUP-ORIGINAL-RETURN-'+index,reason:'Record this actual partial returned customer credit against the same paid original.'})).id);
 }
 const review=await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId);
 const common={caseId:f.recoveryId,newConfirmedPaisa:0,resolveDisputedPaisa:0,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-GROUP-OVERTURNED-RESPONSIBILITY',reason:'Review all listed partial returned credits and overturn the original seller responsibility in one native correction.',publicMessage:'The original responsibility is removed and only actual seller money held by the company is restored.'};
 await assert.rejects(recovery.correctSellerRecoveryLiability(f.db,f.ctx('group-missing',String(review.case.revision)),{...common,customerRefundReversalIds:[ids[0]]}),/exact complete set/);
 await assert.rejects(recovery.correctSellerRecoveryLiability(f.db,f.ctx('group-duplicate',String(review.case.revision)),{...common,customerRefundReversalIds:[ids[0],ids[0]]}),/exactly once/);
 await assert.rejects(recovery.correctSellerRecoveryLiability(f.db,f.ctx('group-foreign',String(review.case.revision)),{...common,customerRefundReversalIds:[ids[0],'foreign-return']}),/exact complete set/);
 const ctx=f.ctx('group-all-approved',String(review.case.revision)),input={...common,customerRefundReversalIds:ids};
 const {runRecoveryCommand,recoverRecoveryCommand,parseRecoveryCommand}=await import('../lib/payments/recovery-commands');
 const body={sourceFormId:'system.recovery-finance',action:'correct',requestId:ctx.requestId,expectedRevision:ctx.expectedRevision,input};
 assert.throws(()=>parseRecoveryCommand({...body,input:{...input,customerRefundReversalIds:[ids[0],ids[0]]}},'staff'));
 assert.throws(()=>parseRecoveryCommand({...body,input:{...input,customerRefundReversalId:ids[0]}},'staff'));
 const saved=await runRecoveryCommand(f.db,'reviewer',body,'staff');assert.deepEqual(await runRecoveryCommand(f.db,'reviewer',body,'staff'),saved);assert.deepEqual(await recoverRecoveryCommand(f.db,'reviewer',ctx.requestId,'staff'),saved);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_liability_corrections').get()!.n,1);
 const rows=f.sqlite.prepare("SELECT correction_id,request_id FROM customer_refund_reversal_dispositions WHERE kind='restore'").all();assert.equal(rows.length,2);assert.equal(new Set(rows.map(row=>row.correction_id)).size,1);assert.equal(new Set(rows.map(row=>row.request_id)).size,1);
 assert.equal(f.sqlite.prepare('SELECT restored_paisa FROM seller_recovery_cases WHERE id=?').get(f.recoveryId)!.restored_paisa,20000);
 assert.equal((await recovery.getSellerRecoveryReview(f.db,'reviewer',f.recoveryId)).source.customerRefundReversalPending,false);
 }finally{f.dispose();}
});

void test('returned customer credit authority retains original parties after owner replacement and company-account conflicts',async()=>{
 const f=await fixture();try{
 const input={packetId:f.packetId,receiptId:f.returnedReceiptId,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-RETAINED-INTEREST-RETURN',reason:'Review the returned credit only with an operator free of all retained original financial interests.'};
 f.sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)").run();
 f.sqlite.prepare("UPDATE seller_profiles SET user_id='customer' WHERE id='registered'").run();
 await assert.rejects(reversal.recordCustomerRefundReversal(f.db,{...f.ctx('old-owner-denied',f.packetRevision),actorId:'registered-owner'},input),/retained original party/);
 const insert=(actor:string,request:string)=>f.sqlite.prepare(`INSERT INTO customer_refund_reversals(id,packet_id,obligation_id,receipt_id,amount_paisa,actor_id,request_id,evidence_reference,reason,created_at) VALUES(?,?,?,?,?,?,?,'FICTIONAL-NATIVE-PERSONAL-INTEREST','Reject retained personal financial interest',?)`).run(request,f.packetId,f.obligationId,f.returnedReceiptId,f.cashPaisa,actor,request,Date.now());
 assert.throws(()=>insert('registered-owner','native-old-owner'),/customer_refund_actual_return_required/);
 // Deliberately install an adverse historical account-conflict snapshot only in this inspected
 // memory fixture. Restore every native trigger before proving service/native INSERT denial.
 const guards=f.sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='company_payment_account_versions'").all() as {name:string;sql:string}[];
 try{for(const guard of guards)f.sqlite.exec('DROP TRIGGER "'+guard.name+'"');f.sqlite.prepare('UPDATE company_payment_account_versions SET conflicts_json=? WHERE id=?').run(JSON.stringify(['reviewer']),f.accountVersionId);}finally{for(const guard of guards)f.sqlite.exec(guard.sql);}
 await assert.rejects(reversal.recordCustomerRefundReversal(f.db,f.ctx('account-interest-denied',f.packetRevision),input),/company account interest/);
 assert.throws(()=>insert('reviewer','native-account-interest'),/customer_refund_actual_return_required/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_refund_reversals').get()!.n,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_refund_return_pools').get()!.n,0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_recovery_events WHERE action='customer_refund_reversed'").get()!.n,0);
 }finally{f.dispose();}
});
