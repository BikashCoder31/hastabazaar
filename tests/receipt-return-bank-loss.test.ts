import test from 'node:test';
import assert from 'node:assert/strict';
import {completedReceiptReturnFixture} from './helpers/completed-receipt-return-fixture';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
import {actualManualReceiptUseSql} from '../lib/payments/receipt-use-accounting';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';
import {notificationDestination,canViewStaffNotification} from '../lib/operations/notification-links';
import {recordReceiptReversal} from '../lib/payments/receipt-corrections';
import {mixedReceiptReview} from './helpers/recovery-mixed-receipt-fixture';
import {prepareReceiptReturnBankLosses} from '../lib/payments/receipt-return-bank-loss';
void test('an actual incoming bank reversal after completed original-payer return has one company-loss disposition without new debt',async()=>{
 const f=await completedReceiptReturnFixture();try{
 const before=f.sqlite.prepare('SELECT id,type,amount_paisa FROM seller_ledger_entries ORDER BY id').all();
 const obligationsBefore=f.sqlite.prepare('SELECT id,source_kind,source_id,cash_paisa,wallet_paisa,state FROM refund_obligations ORDER BY id').all();
 const review=await getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId);
 const input={reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],completedReturns:[{receiptUseId:f.receiptUseId,packetId:f.returnPacketId,amountPaisa:4000}],companyLossApproved:true,evidenceReference:'FICTIONAL-COMPLETED-RETURN-BANK-LOSS',reason:'The company explicitly covers this actual reversed bank credit after the original payer return actually completed.',publicMessage:'Your completed original return remains paid. Finance reconciled the later bank reversal as a company cost; no new amount is due from you.'};
 const ctx=f.ctx('completed-return-loss-reviewed',String(review.receiptRevision)),saved=await reconcileRecoveryReceiptReversal(f.db,ctx,input);
 assert.deepEqual(await reconcileRecoveryReceiptReversal(f.db,ctx,input),saved);
 assert.equal(f.sqlite.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').get(f.returnPacketId)!.state,'paid');assert.equal(f.sqlite.prepare('SELECT state FROM manual_receipt_uses WHERE id=?').get(f.receiptUseId)!.state,'returned');assert.equal(f.sqlite.prepare('SELECT state FROM refund_obligations WHERE id=?').get(f.returnObligationId)!.state,'completed');
 assert.deepEqual(f.sqlite.prepare('SELECT id,type,amount_paisa FROM seller_ledger_entries ORDER BY id').all(),before);
 assert.deepEqual(f.sqlite.prepare('SELECT id,source_kind,source_id,cash_paisa,wallet_paisa,state FROM refund_obligations ORDER BY id').all(),obligationsBefore);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_losses').get()!.n,1);assert.equal(f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM receipt_return_bank_losses').get()!.n,4000);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE receipt_id=? AND kind='receipt_reversal' AND state<>'resolved'").get(f.receiptId)!.n,0);
 assert.equal(f.sqlite.prepare('SELECT '+actualManualReceiptUseSql('used')+' n FROM manual_receipt_uses used WHERE id=?').get(f.receiptUseId)!.n,6000);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM refund_obligation_events WHERE obligation_id=? AND action='receipt_return_bank_loss'").get(f.returnObligationId)!.n,1);
 const notices=(await f.db.prepare("SELECT id,template_key template,related_type relatedType,related_id relatedId,recipient_user_id userId,audience_role audience,channel,request_id requestId,body_en body FROM notification_messages WHERE related_type='receipt_return_bank_loss' AND recipient_user_id='customer' ORDER BY channel").all<{id:string;template:string;relatedType:string;relatedId:string;userId:string;audience:string;channel:string;requestId:string;body:string}>()).results;
 assert.deepEqual(notices.map(row=>row.channel),['email','in_app']);for(const notice of notices){assert.equal(await isCurrentOperationalNotice(f.db,notice),true);assert.match(notice.body,/no new amount is due/);assert.doesNotMatch(notice.body,/FICTIONAL-|account|seller|debt/);assert.equal(notificationDestination('customer','customer',notice.relatedType,notice.relatedId),'/account/refunds');assert.equal(notificationDestination('staff','staff',notice.relatedType,notice.relatedId),'/admin/payments/refunds?returnLoss='+encodeURIComponent(notice.relatedId));}
 assert.equal(canViewStaffNotification({role:'admin',permissions:['payment.receipt.verify']},'receipt_return_bank_loss'),false);assert.equal(canViewStaffNotification({role:'admin',permissions:['refund.approve.standard']},'receipt_return_bank_loss'),true);
 assert.throws(()=>f.sqlite.prepare('DELETE FROM receipt_return_bank_losses').run(),/history_retained/);
 // A later real reversal consumes only the remaining actual paid-return capacity.
 const receiptRevision=String(f.sqlite.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').get(f.receiptId)!.revision);
 const second=await recordReceiptReversal(f.db,f.ctx('completed-return-second-bank-reversal',receiptRevision),{receiptId:f.receiptId,amountMinor:6000,transactionIdentity:'FICTIONAL-SECOND-COMPLETED-RETURN-REVERSAL',bankAt:Date.now()-1,evidenceReference:'FICTIONAL-SECOND-RETURN-REVERSAL-PROOF',reason:'The bank actually reversed the remaining original incoming credit after the original payer return.'});
 const next=await getRecoveryReceiptReversalReview(f.db,'reviewer',second.id);
 await reconcileRecoveryReceiptReversal(f.db,f.ctx('completed-return-second-loss',String(next.receiptRevision)),{...input,reversalId:second.id,reviewDigest:next.reviewDigest,completedReturns:[{receiptUseId:f.receiptUseId,packetId:f.returnPacketId,amountPaisa:6000}]});
 assert.equal(f.sqlite.prepare('SELECT '+actualManualReceiptUseSql('used')+' n FROM manual_receipt_uses used WHERE id=?').get(f.receiptUseId)!.n,0);assert.equal(f.sqlite.prepare('SELECT used_paisa n FROM receipt_return_bank_loss_pools WHERE receipt_use_id=?').get(f.receiptUseId)!.n,10000);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE receipt_id=? AND kind='receipt_reversal' AND state<>'resolved'").get(f.receiptId)!.n,0);
 }finally{f.dispose();}
});

for(const outcome of ['prepared','uncertain'] as const)void test(`${outcome} payer return cannot be declared a completed company bank loss`,async()=>{
 const f=await completedReceiptReturnFixture(outcome);try{
 const review=await getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId),input={reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],completedReturns:[{receiptUseId:f.receiptUseId,packetId:f.returnPacketId,amountPaisa:4000}],companyLossApproved:true,evidenceReference:'FICTIONAL-UNRESOLVED-RETURN-REVIEW',reason:'Review the actual outgoing bank outcome before classifying any company bank loss.',publicMessage:'The original bank outcome remains under review and no replacement transfer is authorized.'};
 await assert.rejects(reconcileRecoveryReceiptReversal(f.db,f.ctx('not-completed-loss',String(review.receiptRevision)),input),/actually completed original-payer return/);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_losses').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT state FROM manual_receipt_uses WHERE id=?').get(f.receiptUseId)!.state,'reserved');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM manual_payment_exceptions WHERE receipt_id=? AND kind='receipt_reversal' AND state<>'resolved'").get(f.receiptId)!.n,1);
 if(outcome==='uncertain'){
 const revision=String(f.sqlite.prepare('SELECT revision FROM outgoing_payment_packets WHERE id=?').get(f.returnPacketId)!.revision);
 await f.m.recordRefundPacketOutcome(f.db,f.ctx('late-actual-return-paid',revision),{packetId:f.returnPacketId,outcome:'paid',amountPaisa:10000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-LATE-ACTUAL-PAYER-RETURN-PAID',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,evidenceReference:'FICTIONAL-LATE-ACTUAL-PAYER-RETURN-PROOF',reason:'Reconcile the original uncertain instruction as actually paid without sending another transfer.'});
 const known=await getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId);
 await reconcileRecoveryReceiptReversal(f.db,f.ctx('late-actual-paid-bank-loss',String(known.receiptRevision)),{...input,reviewDigest:known.reviewDigest});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_losses').get()!.n,1);
 }
 }finally{f.dispose();}
});

void test('completed payer bank loss needs explicit approval, exact sources, bounded amounts and current eligible authority',async()=>{
 const f=await completedReceiptReturnFixture();try{
 const review=await getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversalId),input={reversalId:f.reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],completedReturns:[{receiptUseId:f.receiptUseId,packetId:f.returnPacketId,amountPaisa:4000}],companyLossApproved:true,evidenceReference:'FICTIONAL-EXACT-RETURN-LOSS-REVIEW',reason:'Only the exact actual completed original payer return can support a company bank loss.',publicMessage:'The original completed payer return remains paid and no new amount is owed.'};
 await assert.rejects(reconcileRecoveryReceiptReversal(f.db,f.ctx('no-loss-approval',String(review.receiptRevision)),{...input,companyLossApproved:false}),/Explicitly approve/);
 await assert.rejects(reconcileRecoveryReceiptReversal(f.db,f.ctx('foreign-loss-packet',String(review.receiptRevision)),{...input,completedReturns:[{...input.completedReturns[0],packetId:'foreign'}]}),/actually completed/);
 await assert.rejects(reconcileRecoveryReceiptReversal(f.db,f.ctx('duplicate-loss-use',String(review.receiptRevision)),{...input,completedReturns:[input.completedReturns[0],input.completedReturns[0]]}),/once/);
 await assert.rejects(reconcileRecoveryReceiptReversal(f.db,f.ctx('excess-loss-cap',String(review.receiptRevision)),{...input,completedReturns:[{...input.completedReturns[0],amountPaisa:10001}]}),/remaining bank-loss capacity/);
 await assert.rejects(reconcileRecoveryReceiptReversal(f.db,{...f.ctx('personal-loss-review',String(review.receiptRevision)),actorId:'customer'},input));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_losses').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_loss_pools').get()!.n,0);
 }finally{f.dispose();}
});

void test('a current linked order customer appearing after review cannot approve a completed-return bank loss',async()=>{
 const f=await mixedReceiptReview('returned');try{
 const candidate=f.current.completedReturnCandidates[0];assert.ok(candidate);
 const ctx=f.ctx('current-linked-order-customer',String(f.current.receiptRevision));
 const planned=await prepareReceiptReturnBankLosses(f.db,ctx,{reviewId:'current-customer-native-review',reversalId:f.reversed.id,completedReturns:[{receiptUseId:candidate.receiptUseId,packetId:candidate.packetId,amountPaisa:1000}],companyLossApproved:true});
 f.sqlite.prepare("UPDATE orders SET customer_id='reviewer' WHERE id=?").run(f.orderId);
 // Insert the exact planned common header/control in an explicitly rolled-back memory
 // transaction: native child proof independently rejects the newly personal reviewer.
 f.sqlite.exec('BEGIN');try{
 f.sqlite.prepare(`INSERT INTO seller_recovery_receipt_reversal_reviews(id,reversal_id,receipt_id,receipt_revision,state,amount_paisa,unallocated_paisa,source_json,plan_json,actor_id,request_id,created_at,evidence_reference,reason,public_message) VALUES(?,?,?,?,'planned',5000,0,?,?,'reviewer',?,?,'FICTIONAL-CURRENT-ORDER-PARTY','Current linked order party must remain independent','The original completed payer return remains paid')`).run('current-customer-native-review',f.reversed.id,f.receipt.id,f.current.receiptRevision,JSON.stringify(f.current),JSON.stringify({parts:[],returnLosses:planned.parts,companyLossApproved:true}),ctx.requestId,Date.now());
 f.sqlite.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=?').run(f.receipt.id);
 await assert.rejects(planned.inserts[0].run(),/receipt_return_bank_loss_personal_interest/);
 }finally{f.sqlite.exec('ROLLBACK');}
 f.sqlite.prepare("UPDATE orders SET customer_id='customer' WHERE id=?").run(f.orderId);
 const current=await getRecoveryReceiptReversalReview(f.db,'reviewer',f.reversed.id);let raced=false;
 const boundary={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){if(!raced&&statements.length>10){raced=true;f.sqlite.prepare("UPDATE orders SET customer_id='reviewer' WHERE id=?").run(f.orderId);}return f.db.batch(statements);}} as D1Database;
 await assert.rejects(reconcileRecoveryReceiptReversal(boundary,f.ctx('current-customer-racing-write',String(current.receiptRevision)),{reversalId:f.reversed.id,reviewDigest:current.reviewDigest,unallocatedPaisa:0,allocations:[{allocationId:f.allocation,amountPaisa:4000}],completedReturns:[{receiptUseId:candidate.receiptUseId,packetId:candidate.packetId,amountPaisa:1000}],companyLossApproved:true,evidenceReference:'FICTIONAL-CURRENT-ORDER-CUSTOMER-RACE',reason:'The current original order customer must remain independent through the actual commit.',publicMessage:'Original paid facts remain retained while Finance reviews eligible responsibility.'}));
 assert.equal(raced,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_losses').get()!.n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_recovery_receipt_reversal_reviews').get()!.n,0);
 }finally{f.dispose();}
});
