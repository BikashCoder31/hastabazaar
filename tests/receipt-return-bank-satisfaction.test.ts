import test from 'node:test';
import assert from 'node:assert/strict';
import {completedReceiptReturnFixture} from './helpers/completed-receipt-return-fixture';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
import {recordReceiptReversal} from '../lib/payments/receipt-corrections';
import {getRefundObligation} from '../lib/payments/refund-obligations';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
import {recordBankReceipt} from '../lib/payments/manual-receipts';
import {recordCustomerRefundReversal} from '../lib/payments/customer-refund-reversal';
import {reverifyFunding} from './helpers/funding-bank-reversal-fixture';

async function ready(){const f=await completedReceiptReturnFixture('prepared');try{
 await f.m.voidUnsentRefundPacket(f.db,f.ctx('bank-satisfied-retire','0'),{packetId:f.returnPacketId,notSentConfirmed:true,evidenceReference:'FICTIONAL-UNSENT-ORIGINAL-RETURN',reason:'Verify this old return instruction was never sent before attributing an actual bank return.'});return f;
}catch(error){f.dispose();throw error;}}
async function input(f:Awaited<ReturnType<typeof ready>>,reversalId=f.reversalId,amountPaisa=4000){const review=await getRecoveryReceiptReversalReview(f.db,'reviewer',reversalId);return {revision:String(review.receiptRevision),payload:{reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],reservedReturns:[{receiptUseId:f.receiptUseId,amountPaisa,originalPayerReturnedConfirmed:true}],evidenceReference:'FICTIONAL-BANK-RETURNED-EXACT-ORIGINAL-PAYER',reason:'Independently verify the bank reversal returned this exact amount to the original payer without another company transfer.',publicMessage:'The bank returned this amount directly to the original payer. The remaining return balance is retained.'}};}

void test('partial actual bank return reduces the same original obligation and its receipt backing; only the remaining balance can be sent',async()=>{
 const f=await ready();try{
  const original=f.sqlite.prepare('SELECT cash_paisa,source_snapshot_json FROM refund_obligations WHERE id=?').get(f.returnObligationId)!;
  const before=await input(f),ctx=f.ctx('bank-satisfied-partial',before.revision);
  const result=await reconcileRecoveryReceiptReversal(f.db,ctx,before.payload);
  assert.deepEqual(await reconcileRecoveryReceiptReversal(f.db,ctx,before.payload),result);
  const notices=(await f.db.prepare("SELECT id,template_key template,related_type relatedType,related_id relatedId,recipient_user_id userId,audience_role audience,channel,request_id requestId,body_en body FROM notification_messages WHERE related_type='receipt_return_bank_satisfaction' AND recipient_user_id='customer' ORDER BY channel").all<{id:string;template:string;relatedType:string;relatedId:string;userId:string;audience:string;channel:string;requestId:string;body:string}>()).results;
  assert.deepEqual(notices.map(row=>row.channel),['email','in_app']);
  for(const notice of notices){assert.equal(await isCurrentOperationalNotice(f.db,notice),true);assert.equal(notice.body.includes(before.payload.evidenceReference),false);assert.equal(notice.body.includes(before.payload.reason),false);}
  const current=await getRefundObligation(f.db,f.returnObligationId);
  assert.equal(current!.cashPaisa,6000);assert.equal(current!.originalCashPaisa,10000);assert.equal(current!.bankSatisfiedPaisa,4000);assert.equal(current!.state,'open');
  assert.deepEqual(f.sqlite.prepare('SELECT cash_paisa,source_snapshot_json FROM refund_obligations WHERE id=?').get(f.returnObligationId),original);
  assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM manual_receipt_bank_backing WHERE receipt_use_id=?').get(f.receiptUseId)!.amount_paisa,6000);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.returnObligationId)!.n,0);
  const funding=await reverifyFunding(f,'bank-satisfied-fresh-remaining-funds',f.accountVersionId,20000);
  const packet=await f.m.prepareRefundPacket(f.db,f.ctx('bank-satisfied-remaining-packet',String(current!.revision)),{obligationId:f.returnObligationId,destinationVersionId:String(f.sqlite.prepare('SELECT destination_version_id id FROM outgoing_payment_packets WHERE id=?').get(f.returnPacketId)!.id),fundingStatementId:funding.id,reason:'Prepare only the remaining exact original return after the separately evidenced direct bank satisfaction.'});
  assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM outgoing_payment_packets WHERE id=?').get(packet.id)!.amount_paisa,6000);
  await f.m.approveRefundPacket(f.db,f.ctx('remaining-approved','0'),{packetId:packet.id,reason:'Approve only the remaining original cash with current independent evidence.'});
  await f.m.startRefundPacket(f.db,f.ctx('remaining-started','1'),{packetId:packet.id,reason:'Record one actual instruction for the exact remaining balance.'});
  await f.m.recordRefundPacketOutcome(f.db,f.ctx('remaining-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:6000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-ONLY-REMAINING-RETURN',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,evidenceReference:'FICTIONAL-REMAINING-RETURN-BANK-PROOF',reason:'Confirm actual payment of only the remaining original obligation.'});
  assert.equal((await getRefundObligation(f.db,f.returnObligationId))!.state,'completed');
  assert.equal(f.sqlite.prepare('SELECT state FROM manual_receipt_uses WHERE id=?').get(f.receiptUseId)!.state,'returned');
  const receiptRevision=String(f.sqlite.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').get(f.receiptId)!.revision);
  const later=await recordReceiptReversal(f.db,f.ctx('later-paid-backing-reversed',receiptRevision),{receiptId:f.receiptId,amountMinor:3000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-LATER-REMAINING-CREDIT-REVERSAL',evidenceReference:'FICTIONAL-LATER-ACTUAL-REMAINING-REVERSAL',reason:'Retain the actual later bank reversal after only the remaining six thousand paisa was paid separately.'});
  const laterReview=await getRecoveryReceiptReversalReview(f.db,'reviewer',later.id);
  await reconcileRecoveryReceiptReversal(f.db,f.ctx('later-actual-paid-company-loss',String(laterReview.receiptRevision)),{reversalId:later.id,reviewDigest:laterReview.reviewDigest,unallocatedPaisa:0,allocations:[],completedReturns:[{receiptUseId:f.receiptUseId,packetId:packet.id,amountPaisa:3000}],companyLossApproved:true,evidenceReference:'FICTIONAL-LATER-COMPLETED-REMAINDER-LOSS',reason:'Cover only the actual remaining outgoing payment backing as company loss without reusing the earlier direct bank satisfaction.',publicMessage:'Your actual completed remaining return stays paid. A later bank reversal is a company cost.'});
  assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM manual_receipt_bank_backing WHERE receipt_use_id=?').get(f.receiptUseId)!.amount_paisa,3000);
  assert.equal((await getRefundObligation(f.db,f.returnObligationId))!.bankSatisfiedPaisa,4000);
 }finally{f.dispose();}
});

void test('two actual bank reversals can fully satisfy the retained original return without fabricating a paid outgoing packet',async()=>{
 const f=await ready();try{
  const first=await input(f);await reconcileRecoveryReceiptReversal(f.db,f.ctx('bank-return-first',first.revision),first.payload);
  const revision=String(f.sqlite.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').get(f.receiptId)!.revision);
  const second=await recordReceiptReversal(f.db,f.ctx('bank-return-second-source',revision),{receiptId:f.receiptId,amountMinor:6000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-SECOND-ORIGINAL-PAYER-BANK-RETURN',evidenceReference:'FICTIONAL-SECOND-EXACT-PAYER-RETURN',reason:'Retain actual independently verified bank return of the remaining original credit to its original payer.'});
  const final=await input(f,second.id,6000);await reconcileRecoveryReceiptReversal(f.db,f.ctx('bank-return-final',final.revision),final.payload);
  const row=(await getRefundObligation(f.db,f.returnObligationId))!;assert.equal(row.cashPaisa,0);assert.equal(row.bankSatisfiedPaisa,10000);assert.equal(row.state,'completed');
  assert.equal(f.sqlite.prepare('SELECT state FROM manual_receipt_uses WHERE id=?').get(f.receiptUseId)!.state,'returned');
  assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM manual_receipt_bank_backing WHERE receipt_use_id=?').get(f.receiptUseId)!.amount_paisa,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.returnObligationId)!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_losses').get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_satisfactions').get()!.n,2);
 }finally{f.dispose();}
});

for(const outcome of ['prepared','uncertain','paid'] as const)void test(`an overlapping ${outcome} return cannot be reclassified as direct bank satisfaction`,async()=>{
 const f=await completedReceiptReturnFixture(outcome);try{const command=await input(f);await assert.rejects(reconcileRecoveryReceiptReversal(f.db,f.ctx('unsafe-'+outcome,command.revision),command.payload));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_satisfactions').get()!.n,0);}finally{f.dispose();}
});

void test('exact bank cap, explicit original-payer confirmation and current authority are mandatory',async()=>{
 const f=await ready();try{
  const command=await input(f);
  await assert.rejects(reconcileRecoveryReceiptReversal(f.db,f.ctx('unconfirmed-payer',command.revision),{...command.payload,reservedReturns:[{...command.payload.reservedReturns[0],originalPayerReturnedConfirmed:false}]}));
  await assert.rejects(reconcileRecoveryReceiptReversal(f.db,f.ctx('exceeds-bank-amount',command.revision),{...command.payload,reservedReturns:[{...command.payload.reservedReturns[0],amountPaisa:4001}]}));
  const db=Object.create(f.db) as D1Database;let injected=false;db.batch=async statements=>{if(!injected&&statements.length>10){injected=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();}return f.db.batch(statements);};
  await assert.rejects(reconcileRecoveryReceiptReversal(db,f.ctx('authority-at-bank-commit',command.revision),command.payload));assert.equal(injected,true);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_satisfactions').get()!.n,0);
  assert.equal(f.sqlite.prepare('SELECT state FROM manual_receipt_uses WHERE id=?').get(f.receiptUseId)!.state,'reserved');
 }finally{f.dispose();}
});

void test('a conclusively failed no-debit attempt permits direct bank satisfaction while payer and ordinary staff cannot decide',async()=>{
 const f=await completedReceiptReturnFixture('uncertain');try{
  const revision=String(f.sqlite.prepare('SELECT revision FROM outgoing_payment_packets WHERE id=?').get(f.returnPacketId)!.revision);
  await f.m.recordRefundPacketOutcome(f.db,f.ctx('confirmed-no-debit',revision),{packetId:f.returnPacketId,outcome:'failed',failureBasis:'no_debit',evidenceReference:'FICTIONAL-ACTUAL-NO-DEBIT-OUTCOME',reason:'Independently prove the original outgoing instruction produced no completed debit.'});
  const command=await input(f);
  await assert.rejects(reconcileRecoveryReceiptReversal(f.db,{...f.ctx('payer-cannot-decide',command.revision),actorId:'customer'},command.payload));
  await assert.rejects(reconcileRecoveryReceiptReversal(f.db,{...f.ctx('ordinary-staff-cannot-decide',command.revision),actorId:'delegate'},command.payload));
  await reconcileRecoveryReceiptReversal(f.db,f.ctx('no-debit-bank-return',command.revision),command.payload);
  assert.equal((await getRefundObligation(f.db,f.returnObligationId))!.cashPaisa,6000);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities WHERE packet_id=?').get(f.returnPacketId)!.n,0);
 }finally{f.dispose();}
});

void test('a new processing return that wins before commit prevents bank satisfaction and leaves the journal unchanged',async()=>{
 const f=await ready();try{
  const funding=await reverifyFunding(f,'bank-return-processing-race-fresh-funds',f.accountVersionId,20000);
  const command=await input(f),db=Object.create(f.db) as D1Database;let injected=false;
  db.batch=async statements=>{if(!injected&&statements.length>10){injected=true;
   const prior=f.sqlite.prepare('SELECT * FROM outgoing_payment_packets WHERE id=?').get(f.returnPacketId)!;
   const attempt={...prior,id:'fictional-racing-instruction',funding_statement_id:funding.id,state:'processing',revision:0,started_at:Date.now(),started_by:'reviewer'};
   f.sqlite.prepare(`INSERT INTO outgoing_payment_packets(${Object.keys(attempt).join(',')}) VALUES(${Object.keys(attempt).map(()=>'?').join(',')})`).run(...Object.values(attempt));
  }return f.db.batch(statements);};
  await assert.rejects(reconcileRecoveryReceiptReversal(db,f.ctx('processing-wins-first',command.revision),command.payload));assert.equal(injected,true);
  assert.equal(f.sqlite.prepare("SELECT state FROM outgoing_payment_packets WHERE id='fictional-racing-instruction'").get()!.state,'processing');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_satisfactions').get()!.n,0);
  assert.equal((await getRefundObligation(f.db,f.returnObligationId))!.cashPaisa,10000);
 }finally{f.dispose();}
});

void test('retained and current seller owners cannot satisfy their linked customer-refund reissue even without a recovery receipt allocation',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
  const packet=f.sqlite.prepare("SELECT id,revision FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").get(f.obligationId)!;
  const credit=await recordBankReceipt(f.db,f.ctx('linked-return-credit'),{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-LINKED-CUSTOMER-REFUND-RETURN',bankAt:Date.now()-1,amountMinor:f.cashPaisa,currency:'NPR',payerReference:'Original customer refund returned by bank',payerUserId:'customer',evidenceReference:'FICTIONAL-LINKED-ACTUAL-CUSTOMER-RETURN',completedCreditConfirmed:true,conflictUserIds:[],reason:'Verify an actual bank credit returning the original outgoing customer refund.'});
  await recordCustomerRefundReversal(f.db,f.ctx('linked-customer-reversal',String(packet.revision)),{packetId:String(packet.id),receiptId:credit.id,receiptRevision:0,amountPaisa:f.cashPaisa,actualReversalConfirmed:true,evidenceReference:'FICTIONAL-LINKED-ORIGINAL-REFUND-REVERSAL',reason:'Retain the actual returned original customer refund for explicit continuing-obligation review.'});
  const retry=await f.m.openRefundObligation(f.db,f.ctx('linked-retry-obligation'),{kind:'receipt_return',sourceId:credit.id,reason:'Reserve the returned original customer funds for its continuing refund obligation.'});
  const revision=String(f.sqlite.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').get(credit.id)!.revision);
  const source=await recordReceiptReversal(f.db,f.ctx('linked-direct-bank-source',revision),{receiptId:credit.id,amountMinor:4000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-LINKED-DIRECT-BANK-RETURN',evidenceReference:'FICTIONAL-LINKED-EXACT-PAYER-BANK-RETURN',reason:'Retain the actual direct bank return of part of the original customer credit.'});
  f.sqlite.prepare("UPDATE seller_profiles SET user_id='foreign' WHERE id='registered'").run();
  for(const actorId of ['registered-owner','foreign']){
   f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(actorId);
   await assert.rejects(async()=>{const review=await getRecoveryReceiptReversalReview(f.db,actorId,source.id),used=f.sqlite.prepare('SELECT receipt_use_id id FROM refund_obligations WHERE id=?').get(retry.id)!;
   await reconcileRecoveryReceiptReversal(f.db,{...f.ctx('linked-personal-'+actorId,String(review.receiptRevision)),actorId},{reversalId:source.id,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],reservedReturns:[{receiptUseId:String(used.id),amountPaisa:4000,originalPayerReturnedConfirmed:true}],evidenceReference:'FICTIONAL-LINKED-PERSONAL-REVIEW-DENIED',reason:'A personally interested original or current seller party cannot decide this bank disposition.',publicMessage:'The original return remains assigned for independent review.'});});
  }
  const fresh=await getRecoveryReceiptReversalReview(f.db,'reviewer',source.id),used=f.sqlite.prepare('SELECT receipt_use_id id FROM refund_obligations WHERE id=?').get(retry.id)!,db=Object.create(f.db) as D1Database;let injected=false;
  db.batch=async statements=>{if(!injected&&statements.length>10){injected=true;f.sqlite.prepare("UPDATE orders SET customer_id='reviewer' WHERE id=?").run(f.orderId);}return f.db.batch(statements);};
  await assert.rejects(reconcileRecoveryReceiptReversal(db,f.ctx('linked-current-customer-at-commit',String(fresh.receiptRevision)),{reversalId:source.id,reviewDigest:fresh.reviewDigest,unallocatedPaisa:0,allocations:[],reservedReturns:[{receiptUseId:String(used.id),amountPaisa:4000,originalPayerReturnedConfirmed:true}],evidenceReference:'FICTIONAL-LINKED-CURRENT-CUSTOMER-RACE',reason:'Recheck the current original order customer before committing any direct bank satisfaction.',publicMessage:'The original return remains assigned for independent review.'}));assert.equal(injected,true);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM receipt_return_bank_satisfactions').get()!.n,0);
 }finally{f.dispose();}
});
