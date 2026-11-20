import test from 'node:test';
import assert from 'node:assert/strict';
import {completedReceiptReturnFixture} from './helpers/completed-receipt-return-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {getRecoveryReceiptReversalReview,reconcileRecoveryReceiptReversal} from '../lib/payments/recovery-receipt-disposition';
import {getRefundObligation} from '../lib/payments/refund-obligations';
import {recordReceiptReversal} from '../lib/payments/receipt-corrections';
import {reverifyFunding} from './helpers/funding-bank-reversal-fixture';

for(const complete of [false,true])void test(`native competing direct-bank return decisions consume the same original cap once (${complete?'fully bank-satisfied':'partial then actual remaining payment'})`,async()=>{
 const f=await completedReceiptReturnFixture('prepared');let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  await f.m.voidUnsentRefundPacket(f.db,f.ctx('native-bank-retire','0'),{packetId:f.returnPacketId,notSentConfirmed:true,evidenceReference:'FICTIONAL-NATIVE-UNSENT-RETURN',reason:'Prove the original return instruction was never sent before recognizing any actual bank satisfaction.'});
  const command=async(db:D1Database,reversalId:string,amountPaisa:number)=>{const review=await getRecoveryReceiptReversalReview(db,'reviewer',reversalId);return {revision:String(review.receiptRevision),input:{reversalId,reviewDigest:review.reviewDigest,unallocatedPaisa:0,allocations:[],reservedReturns:[{receiptUseId:f.receiptUseId,amountPaisa,originalPayerReturnedConfirmed:true}],evidenceReference:'FICTIONAL-NATIVE-EXACT-ORIGINAL-PAYER-RETURN',reason:'Independently verify this actual bank reversal returned the exact stated amount to its original payer.',publicMessage:'The bank returned the verified amount directly to the original payer; no duplicate company transfer was sent.'}};};
  let reversalId=f.reversalId,amountPaisa=4000;
  if(complete){const first=await command(f.db,reversalId,4000);await reconcileRecoveryReceiptReversal(f.db,f.ctx('native-first-bank-part',first.revision),first.input);const revision=String(f.sqlite.prepare('SELECT revision FROM company_receipt_controls WHERE receipt_id=?').get(f.receiptId)!.revision);const next=await recordReceiptReversal(f.db,f.ctx('native-second-bank-source',revision),{receiptId:f.receiptId,amountMinor:6000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-NATIVE-SECOND-PAYER-BANK-RETURN',evidenceReference:'FICTIONAL-NATIVE-SECOND-PAYER-BANK-EVIDENCE',reason:'Retain the independently verified bank return of the remaining original receipt to the exact original payer.'});reversalId=next.id;amountPaisa=6000;}
  target=await nativeFinanceClone(f.sqlite);const db=target.db;
  const review=await command(db,reversalId,amountPaisa),contexts=['a','b'].map(suffix=>f.ctx('native-direct-bank-race-'+suffix,review.revision));
  const results=await Promise.allSettled(contexts.map(ctx=>reconcileRecoveryReceiptReversal(db,ctx,review.input)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1,JSON.stringify(results.map(result=>result.status==='fulfilled'?result:{status:result.status,error:String(result.reason),cause:String(result.reason?.cause)})));
  const winner=results.findIndex(result=>result.status==='fulfilled');assert.deepEqual(await reconcileRecoveryReceiptReversal(db,contexts[winner],review.input),(results[winner] as PromiseFulfilledResult<unknown>).value);
  const row=(await getRefundObligation(db,f.returnObligationId))!;assert.equal(row.cashPaisa,complete?0:6000);assert.equal(row.bankSatisfiedPaisa,complete?10000:4000);assert.equal(row.originalCashPaisa,10000);
  assert.equal((await db.prepare('SELECT amount_paisa FROM manual_receipt_bank_backing WHERE receipt_use_id=?').bind(f.receiptUseId).first<{amount_paisa:number}>())!.amount_paisa,complete?0:6000);
  await assert.rejects(db.prepare('DELETE FROM receipt_return_bank_satisfactions WHERE obligation_id=?').bind(f.returnObligationId).run(),/retained/);
  await assert.rejects(db.prepare('UPDATE refund_obligations SET cash_paisa=0,revision=revision+1 WHERE id=?').bind(f.returnObligationId).run(),/retained/);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM outgoing_payment_packets WHERE obligation_id=? AND state='paid'").bind(f.returnObligationId).first<{n:number}>())!.n,0);
  if(!complete){
   const funding=await reverifyFunding({db,ctx:f.ctx},'native-bank-satisfied-fresh-remaining-funds',f.accountVersionId,20000);
   await assert.rejects(db.prepare("INSERT INTO outgoing_payment_packets(id,obligation_id,funding_statement_id,account_version_id,destination_version_id,amount_paisa,currency,state,prepared_by,prepared_at) SELECT 'fictional-overpay-attempt',obligation_id,?,account_version_id,destination_version_id,amount_paisa,currency,'prepared',prepared_by,prepared_at FROM outgoing_payment_packets WHERE id=?").bind(funding.id,f.returnPacketId).run(),/remaining_cash/);
   const destination=String(f.sqlite.prepare('SELECT destination_version_id id FROM outgoing_payment_packets WHERE id=?').get(f.returnPacketId)!.id);
   const packet=await f.m.prepareRefundPacket(db,f.ctx('native-remaining-prepare',String(row.revision)),{obligationId:f.returnObligationId,destinationVersionId:destination,fundingStatementId:funding.id,reason:'Prepare only the exact remaining original return after the actual direct bank satisfaction.'});
   assert.equal((await db.prepare('SELECT amount_paisa amount FROM outgoing_payment_packets WHERE id=?').bind(packet.id).first<{amount:number}>())!.amount,6000);
   await f.m.approveRefundPacket(db,f.ctx('native-remaining-approve','0'),{packetId:packet.id,reason:'Approve only the independently reviewed remaining original return amount.'});
   await f.m.startRefundPacket(db,f.ctx('native-remaining-start','1'),{packetId:packet.id,reason:'Record one instruction for only the exact original remaining return.'});
   await f.m.recordRefundPacketOutcome(db,f.ctx('native-remaining-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:6000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-NATIVE-ONLY-REMAINING-RETURN',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,evidenceReference:'FICTIONAL-NATIVE-ACTUAL-REMAINING-RETURN',reason:'Confirm the actual remaining outgoing transfer without repeating the direct bank return.'});
   assert.equal((await getRefundObligation(db,f.returnObligationId))!.state,'completed');
  }else assert.equal(row.state,'completed');
  assert.equal((await db.prepare('SELECT state FROM manual_receipt_uses WHERE id=?').bind(f.receiptUseId).first<{state:string}>())!.state,'returned');
 }finally{await target?.dispose();f.dispose();}
});
